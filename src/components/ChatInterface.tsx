import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import ChatMessageList from "./ChatMessageList";
import ChatInputBar from "./ChatInputBar";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Agent, ChatMessage } from "../types";
import { recordTaskAgentSession, getSetting, getAllAgents, getSpaceContext, checkModelSupportsTools } from "../api";
import { sendChatTurn } from "../utils/chatEngine";
import { getAgentToolSchemas, createToolExecutor } from "../utils/agentTools";
import { buildSystemPrompt } from "../utils/promptFactory";

interface ChatInterfaceProps {
  agent: Agent;
  taskId: number;
  spaceId: number;
  onBack: () => void;
}

function ChatInterface({ agent, taskId, spaceId, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] =
    useState<ChatMessage | null>(null);
  const [agentPrompt, setAgentPrompt] = useState<string>("");
  const [expandedMessages, setExpandedMessages] = useState<
    Record<string, boolean>
  >({});

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [spaceContext, setSpaceContext] = useState<string>("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track whether task notes were changed by the user between agent turns.
  const [taskNotesChangedSinceLastRead, setTaskNotesChangedSinceLastRead] = useState(false);
  const lastAgentReadContentRef = useRef<string | null>(null);

  const MAX_DISPLAY_LENGTH = 5000;

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingMessage]);

  useEffect(() => {
    loadAgentPrompt();
    loadPersistedMessages();
    loadApiKey();
    loadAgents();
    loadSpaceContext();
  }, [agent, taskId]);

  // Listen for task notes changes made by the user (emitted from TaskDetail)
  useEffect(() => {
    const unlisten = listen<{ taskId: number }>("task-notes-changed", (event) => {
      if (event.payload.taskId === taskId && !isStreaming) {
        setTaskNotesChangedSinceLastRead(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [taskId, isStreaming]);

  const loadApiKey = async () => {
    try {
      const savedApiKey = await getSetting("anthropic_api_key");
      setApiKey(savedApiKey);
    } catch (error) {
      console.error("Failed to load API key from settings:", error);
    }
  };

  const loadAgents = async () => {
    try {
      const agents = await getAllAgents();
      const userAgents = agents.filter(a => !a.system_role);
      setAvailableAgents(userAgents);
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  };

  const loadSpaceContext = async () => {
    try {
      const context = await getSpaceContext(spaceId);
      setSpaceContext(context || "");
    } catch (error) {
      console.error("Failed to load space context:", error);
    }
  };

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(
        `chat-task-${taskId}-agent-${agent.id}`,
        JSON.stringify(messages),
      );
    }
  }, [messages, taskId, agent.id]);

  const loadPersistedMessages = () => {
    try {
      const saved = localStorage.getItem(
        `chat-task-${taskId}-agent-${agent.id}`,
      );
      if (saved) {
        const parsedMessages = JSON.parse(saved).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(parsedMessages);
      }
    } catch (error) {
      console.error("Failed to load persisted messages:", error);
    }
  };

  const toggleExpanded = (messageId: string) => {
    setExpandedMessages((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const loadAgentPrompt = async () => {
    try {
      setAgentPrompt(agent.agent_prompt);
    } catch (error) {
      console.error("Failed to load agent prompt:", error);
      setAgentPrompt("You are a helpful AI assistant.");
    }
  };

  const generateId = () => Math.random().toString(36).substring(7);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const trimmedInput = input.trim();
    if (trimmedInput.length === 0) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Acquire edit lock before agent starts working
    try {
      const currentContent = await invoke<string>("read_task_notes", {
        taskId: taskId,
      });
      const lockAcquired = await invoke<boolean>("acquire_edit_lock", {
        taskId: taskId,
        lockedBy: "agent",
        originalContent: currentContent,
      });
      await emit("agent-edit-lock-changed", {
        taskId: taskId,
        locked: true,
        lockedBy: "agent",
      });
      if (!lockAcquired) {
        console.warn("Failed to acquire edit lock, but continuing anyway");
      }
    } catch (error) {
      console.error("Failed to acquire edit lock:", error);
    }

    setIsStreaming(true);

    try {
      await recordTaskAgentSession(taskId, agent.id);
    } catch (error) {
      console.error("Failed to record task-agent session:", error);
    }

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      streaming: true,
    };

    setCurrentStreamingMessage(assistantMessage);
    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history — extract text only
      const conversationMessages = messages
        .map((msg) => {
          const textContent = typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((block: any) => block.type === "text")
                  .map((block: any) => block.text)
                  .join("")
              : "";
          return {
            role: msg.role === "user" ? "user" : "assistant",
            content: textContent,
          };
        })
        .filter((msg) => msg.content.trim().length > 0);

      // Prepend change notice if task notes were modified
      let userMessageContent = trimmedInput;
      if (taskNotesChangedSinceLastRead && lastAgentReadContentRef.current !== null) {
        userMessageContent = `[System notice: The task document has been modified by the user since you last read it. Use read_task_notes to get the current content before making any edits or assumptions about the document.]\n\n${trimmedInput}`;
        setTaskNotesChangedSinceLastRead(false);
      }

      conversationMessages.push({
        role: "user",
        content: userMessageContent,
      });

      // Build system prompt via factory
      const systemPrompt = buildSystemPrompt({
        kind: "task",
        agentPrompt: agentPrompt,
        agentName: agent.name,
        taskId,
        spaceId,
        spaceContext: spaceContext || undefined,
      });

      // Resolve tools
      const modelName = agent.model_name || "claude-sonnet-4-5";
      const modelToolSupport = await checkModelSupportsTools(modelName);
      let toolsToSend: any[] | undefined = modelToolSupport ? getAgentToolSchemas() : undefined;

      if (agent.web_search_enabled) {
        const webSearchTool = {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        };
        if (toolsToSend) {
          toolsToSend.push(webSearchTool);
        } else {
          toolsToSend = [webSearchTool];
        }
      }

      // Create tool executor with task context
      const executeTool = createToolExecutor({
        taskId,
        spaceId,
        onTaskNotesRead: (content) => {
          lastAgentReadContentRef.current = content;
          setTaskNotesChangedSinceLastRead(false);
        },
        onSpaceContextUpdated: (content) => setSpaceContext(content),
      });

      const result = await sendChatTurn(
        {
          modelName,
          systemPrompt,
          tools: toolsToSend,
          apiKey: apiKey || undefined,
        },
        conversationMessages,
        {
          onContentUpdate: (content) => {
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null;
              return { ...prev, content };
            });
          },
          executeTool,
        },
      );

      const finalMessage = {
        ...assistantMessage,
        content: result.content,
        streaming: false,
      };

      setMessages((prev) => [...prev, finalMessage]);
      setCurrentStreamingMessage(null);
      setIsStreaming(false);

      // Release edit lock after agent finishes
      try {
        const originalContent = await invoke<string | null>("get_original_content", {
          taskId: taskId,
        });
        await invoke("release_edit_lock", { taskId: taskId });
        await emit("agent-edit-lock-changed", {
          taskId: taskId,
          locked: false,
          lockedBy: null,
          originalContent: originalContent,
        });
      } catch (error) {
        console.error("Failed to release edit lock:", error);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setCurrentStreamingMessage(null);
      setIsStreaming(false);

      // Release edit lock on error
      try {
        const originalContent = await invoke<string | null>("get_original_content", {
          taskId: taskId,
        });
        await invoke("release_edit_lock", { taskId: taskId });
        await emit("agent-edit-lock-changed", {
          taskId: taskId,
          locked: false,
          lockedBy: null,
          originalContent: originalContent,
        });
      } catch (lockError) {
        console.error("Failed to release edit lock:", lockError);
      }

      let errorContent = "Sorry, I encountered an error.";
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes("anthropic_api_key") || errorMessage.includes("not configured") || errorMessage.includes("api key")) {
          errorContent = "Authentication failed. Please configure your Anthropic API key in Settings.";
        } else if (errorMessage.includes("401")) {
          errorContent = "Authentication failed. Please check your API key configuration in Settings.";
        } else if (errorMessage.includes("429")) {
          errorContent = "Rate limit exceeded. Please wait a moment and try again.";
        } else if (errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503")) {
          errorContent = "Anthropic's API is experiencing issues. Please try again later.";
        } else if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("connection")) {
          errorContent = "Network error. Please check your internet connection.";
        } else if (errorMessage.includes("timeout") || errorMessage.includes("timeout exceeded")) {
          errorContent = "Request timed out. Please check your connection and try again.";
        } else {
          errorContent = `Error: ${error.message}`;
        }
      } else if (typeof error === "object" && error !== null && "message" in error) {
        errorContent = `Error: ${(error as any).message}`;
      }

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === "Escape" && isStreaming) {
      handleCancel();
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();

      if (currentStreamingMessage) {
        const canceledMessage = {
          ...currentStreamingMessage,
          content:
            currentStreamingMessage.content + "\n\n[Response canceled by user]",
          streaming: false,
        };
        setMessages((prev) => [...prev, canceledMessage]);
      }

      setCurrentStreamingMessage(null);
      setIsStreaming(false);
    }
  };

  const renderMessageContent = (content: string, messageId: string) => {
    if (content.length <= MAX_DISPLAY_LENGTH) {
      return <ReactMarkdown>{content}</ReactMarkdown>;
    }

    const isExpanded = expandedMessages[messageId];
    const displayContent = isExpanded
      ? content
      : content.substring(0, MAX_DISPLAY_LENGTH) + "...";

    return (
      <>
        <ReactMarkdown>{displayContent}</ReactMarkdown>
        <button
          className="chat-show-more-btn"
          onClick={() => toggleExpanded(messageId)}
        >
          {isExpanded ? "Show Less" : "Show More"}
        </button>
      </>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <ChatMessageList
        messages={messages}
        currentStreamingMessage={currentStreamingMessage}
        agentName={agent.name}
        renderMessageContent={renderMessageContent}
        containerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
      />
      <ChatInputBar
        value={input}
        onChange={(val) => setInput(val)}
        onSend={sendMessage}
        onKeyDown={handleKeyDown}
        isStreaming={isStreaming}
        placeholder={`Message ${agent.name}...`}
        agents={availableAgents}
        selectedAgent={agent}
        onAgentChange={() => onBack()}
        hasConversationAbove={true}
        textareaRef={textareaRef}
      />
    </div>
  );
}

export default ChatInterface;
