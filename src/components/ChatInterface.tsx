import { useState, useEffect, useRef } from "react";
import { Textarea, Button, Spinner, ActionMenu, ActionList } from "@primer/react";
import { PaperAirplaneIcon, ChevronDownIcon } from "@primer/octicons-react";
import ReactMarkdown from "react-markdown";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { Agent, ChatMessage } from "../types";
import { recordTaskAgentSession, startMCPServer, stopMCPServer, getSetting, getAllAgents, getSpaceContext } from "../api";
import { withRetry } from "../utils/retry";

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
  const [mcpServerRunning, setMcpServerRunning] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [spaceContext, setSpaceContext] = useState<string>("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Response length constants
  const MAX_RESPONSE_LENGTH = 10000;
  const MAX_DISPLAY_LENGTH = 5000;

  const scrollToBottom = () => {
    // Scroll the messages container directly instead of using scrollIntoView
    // which can scroll the entire window hierarchy
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
    initializeMCPServer();
    loadApiKey();
    loadAgents();
    loadSpaceContext();

    // Cleanup: stop MCP server when component unmounts
    return () => {
      if (mcpServerRunning) {
        stopMCPServer().catch(console.error);
      }
    };
  }, [agent, taskId]);

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
      // Filter out system agents (those with system_role)
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

  const initializeMCPServer = async () => {
    try {
      await startMCPServer();
      setMcpServerRunning(true);
      console.log("MCP server started successfully");
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      setMcpServerRunning(false);
    }
  };

  const generateId = () => Math.random().toString(36).substring(7);

  // Helper function to get max tokens for different models
  const getMaxTokensForModel = (modelName: string): number => {
    const limits: Record<string, number> = {
      "claude-sonnet-4-5": 8192,
      "claude-opus-4-5": 16384,
    };
    return limits[modelName] || 8192;
  };

  // Handle MCP tool calls by communicating with the MCP server process
  const executeMCPTool = async (toolName: string, args: any) => {
    try {
      // For now, we'll use the existing API functions to interact with notes
      // In a full implementation, this would communicate directly with the MCP server process
      switch (toolName) {
        case "read_task_notes":
          const { task_id } = args;
          // Use the current task ID if not specified
          const readTaskId = task_id || taskId;
          // Read from database using Tauri command
          const content = await invoke<string>("read_task_notes", { taskId: readTaskId });
          return {
            content: [
              {
                type: "text",
                text:
                  content && content.length > 0
                    ? content
                    : `No notes exist for task ${readTaskId}. Use write_task_notes to create one.`,
              },
            ],
          };

        case "write_task_notes":
          const {
            task_id: writeTaskId,
            content: writeContent,
            operation = "append",
          } = args;
          const actualTaskId = writeTaskId || taskId;

          try {
            let finalContent = writeContent;
            if (operation === "append") {
              // Read existing content from database
              const existingContent = await invoke<string>("read_task_notes", { taskId: actualTaskId });
              if (existingContent && existingContent.length > 0) {
                finalContent = existingContent + "\n\n" + writeContent;
              }
            }

            // Write to database using Tauri command
            await invoke("write_task_notes", { taskId: actualTaskId, content: finalContent });
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully ${operation === "append" ? "appended to" : "wrote"} notes for task ${actualTaskId}`,
                },
              ],
            };
          } catch (error) {
            console.error("Error in write_task_notes:", error);
            throw new Error(
              `Failed to write notes: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }

        case "check_task_notes_exists":
          const { task_id: checkTaskId } = args;
          const checkActualTaskId = checkTaskId || taskId;
          const { checkAgentNotesExists } = await import("../api");
          const exists = await checkAgentNotesExists(checkActualTaskId);
          return {
            content: [
              {
                type: "text",
                text: exists
                  ? `Notes file exists for task ${checkActualTaskId}`
                  : `No notes file exists for task ${checkActualTaskId}`,
              },
            ],
          };

        case "update_space_context":
          const { space_id: ctxSpaceId, content: ctxContent, summary: ctxSummary } = args;
          const actualSpaceId = ctxSpaceId || spaceId;
          try {
            const { updateSpaceContext } = await import("../api");
            await updateSpaceContext(actualSpaceId, ctxContent);
            // Refresh local space context state
            setSpaceContext(ctxContent);
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully updated space context for space ${actualSpaceId}${ctxSummary ? `: ${ctxSummary}` : ""}`,
                },
              ],
            };
          } catch (error) {
            console.error("Error in update_space_context:", error);
            throw new Error(
              `Failed to update space context: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "An unexpected error occurred"}`,
          },
        ],
      };
    }
  };

  // Define MCP tools for Anthropic API
  const mcpTools = [
    {
      name: "read_task_notes",
      description: "Read the Agent_Notes.md file for a specific task",
      input_schema: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to read notes for",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "write_task_notes",
      description:
        "Write or append content to the Agent_Notes.md file for a specific task",
      input_schema: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to write notes for",
          },
          content: {
            type: "string",
            description: "The content to write to the notes file",
          },
          operation: {
            type: "string",
            enum: ["append", "replace"],
            description:
              "Whether to append to existing content or replace it entirely",
          },
        },
        required: ["task_id", "content"],
      },
    },
    {
      name: "check_task_notes_exists",
      description: "Check if Agent_Notes.md file exists for a specific task",
      input_schema: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to check notes for",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "update_space_context",
      description:
        "Update the shared space context markdown. Use this to record architectural decisions, completed milestones, and space-wide insights that are relevant to all tasks.",
      input_schema: {
        type: "object",
        properties: {
          space_id: {
            type: "number",
            description: "The ID of the space to update context for",
          },
          content: {
            type: "string",
            description:
              "The full markdown content for the space context. This replaces the entire context.",
          },
          summary: {
            type: "string",
            description: "Brief summary of what was changed in the context",
          },
        },
        required: ["space_id", "content"],
      },
    },
  ];

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
      // Get current document content to save as original
      const currentContent = await invoke<string>("read_task_notes", {
        taskId: taskId,
      });

      // Acquire lock with original content
      const lockAcquired = await invoke<boolean>("acquire_edit_lock", {
        taskId: taskId,
        lockedBy: "agent",
        originalContent: currentContent,
      });

      // Emit event to notify UI of lock change
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
      // Don't block the chat flow if this fails
    }

    setIsStreaming(true);

    // Record that this agent is being used with this task
    try {
      await recordTaskAgentSession(taskId, agent.id);
    } catch (error) {
      console.error("Failed to record task-agent session:", error);
      // Don't block the chat flow if this fails
    }

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      streaming: true,
    };

    setCurrentStreamingMessage(assistantMessage);

    // Create abort controller for this request
    // NOTE: Abort signal handling is currently limited because the Tauri backend
    // command (send_chat_message) does not support passing abort signals.
    // To fully implement cancellation, the Rust backend would need to:
    // 1. Accept a cancellation token parameter
    // 2. Check the token periodically during the request
    // 3. Cancel the ongoing HTTP request if the token is triggered
    // For now, pressing Esc will stop UI updates but the API request continues in the background.
    abortControllerRef.current = new AbortController();

    // Track the accumulated content to avoid race conditions
    let accumulatedContent = "";

    try {
      // Build conversation history for Claude API, filtering out empty messages
      // IMPORTANT: Extract only text content from messages to avoid sending orphaned
      // tool_use blocks without corresponding tool_result blocks. The tool use loop
      // below handles tool calls for the CURRENT conversation; persisted messages
      // should only contain the final text content.
      const conversationMessages = messages
        .map((msg) => {
          // Convert array content to string, extracting only text blocks
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

      // Add the new user message (use trimmedInput directly since it's guaranteed to be a string)
      conversationMessages.push({
        role: "user",
        content: trimmedInput,
      });

      // Prepare the system message with information about the current task and available tools
      const spaceContextSection = spaceContext
        ? `\n\n# Space Context\n\n${spaceContext}\n\n---\n`
        : "";

      const enhancedSystemMessage = `${agentPrompt || `You are ${agent.name}, a helpful AI assistant.`}${spaceContextSection}

You are currently working on Task ID: ${taskId}. You have access to note-taking tools that allow you to:
1. Read notes from previous sessions for this task
2. Write or append new insights, findings, or progress to task notes
3. Check if notes already exist for a task
4. Update the shared space context with important insights

These tools help you maintain context and continuity across conversations. Use them to:
- Check for existing notes at the start of conversations
- Save important insights, decisions, or findings
- Track progress and next steps
- Maintain continuity across different chat sessions
- Update the space context when you make significant architectural decisions or complete major milestones

The notes are stored in Markdown format and are task-specific.
The space context is shared across all tasks in the space.`;

      // Get response from Claude API via Tauri backend
      const modelName = agent.model_name || "claude-sonnet-4-5";
      const maxTokens = getMaxTokensForModel(modelName);

      let responseText: string = await withRetry(
        () => invoke<string>("send_chat_message", {
          model: modelName,
          messages: conversationMessages,
          system: enhancedSystemMessage,
          maxTokens: maxTokens,
          tools: mcpServerRunning ? mcpTools : undefined,
          apiKey: apiKey || undefined,
        }),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt, error) => {
            console.log(`Retry attempt ${attempt} after error:`, error.message);
          },
        }
      );

      let response: any = JSON.parse(responseText);

      // Track cumulative token usage across all API calls
      let totalInputTokens = response.usage?.input_tokens || 0;
      let totalOutputTokens = response.usage?.output_tokens || 0;

      // Handle tool calls in a loop until we get a final text response
      // Track the full conversation history including tool use/result exchanges
      let fullConversation = [...conversationMessages];

      while (response.stop_reason === "tool_use") {
        // Extract all content blocks
        const textContent = response.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("");

        const toolCalls = response.content.filter(
          (block: any) => block.type === "tool_use"
        );

        // Display text content if any
        if (textContent) {
          accumulatedContent += textContent;
          setCurrentStreamingMessage((prev) => {
            if (!prev) return null;
            return { ...prev, content: accumulatedContent };
          });
        }

        // Execute tool calls and collect results
        const toolResults = [];
        for (const toolCall of toolCalls) {
          accumulatedContent += `\n\n*Using tool: ${toolCall.name}*\n`;
          setCurrentStreamingMessage((prev) => {
            if (!prev) return null;
            return { ...prev, content: accumulatedContent };
          });

          try {
            const result = await executeMCPTool(toolCall.name, toolCall.input);
            const resultText = result.content.map((c: any) => c.text).join("\n");

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: resultText,
            });

            accumulatedContent += `*Tool result:* ${resultText}\n`;
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null;
              return { ...prev, content: accumulatedContent };
            });
          } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              is_error: true,
              content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            });

            accumulatedContent += `*Tool error:* Failed to execute ${toolCall.name}\n`;
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null;
              return { ...prev, content: accumulatedContent };
            });
          }
        }

        // Add the assistant's tool_use response to conversation history
        fullConversation.push({
          role: "assistant" as const,
          content: response.content,
        });

        // Add the tool results as a user message
        fullConversation.push({
          role: "user" as const,
          content: toolResults as any,
        });

        // Get follow-up response from Claude with tool results
        responseText = await withRetry(
          () => invoke<string>("send_chat_message", {
            model: modelName,
            messages: fullConversation,
            system: enhancedSystemMessage,
            maxTokens: maxTokens,
            tools: mcpServerRunning ? mcpTools : undefined,
            apiKey: apiKey || undefined,
          }),
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt, error) => {
              console.log(`Retry attempt ${attempt} after error:`, error.message);
            },
          }
        ) as string;

        response = JSON.parse(responseText) as any;

        // Add token usage from follow-up response
        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;
      }

      // Extract final text content from response
      const finalContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      accumulatedContent += finalContent;

      // Check for length limits
      if (accumulatedContent.length > MAX_RESPONSE_LENGTH) {
        accumulatedContent =
          accumulatedContent.substring(0, MAX_RESPONSE_LENGTH) +
          "\n\n[Response truncated due to length]";
      }

      // Use the accumulated content to avoid race conditions
      const finalMessage = {
        ...assistantMessage,
        content: accumulatedContent,
        streaming: false,
      };

      setMessages((prev) => [...prev, finalMessage]);
      setCurrentStreamingMessage(null);
      setIsStreaming(false);

      // Release edit lock after agent finishes
      try {
        // Get original content BEFORE releasing the lock (since release deletes the row)
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
        // Get original content BEFORE releasing the lock (since release deletes the row)
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

      // Provide specific error messages based on error type and details
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Check for API key configuration issues
        if (errorMessage.includes("anthropic_api_key") || errorMessage.includes("not configured") || errorMessage.includes("api key")) {
          errorContent = "Authentication failed. Please configure your Anthropic API key in Settings.";
        }
        // Check for status code errors in the message
        else if (errorMessage.includes("401")) {
          errorContent = "Authentication failed. Please check your API key configuration in Settings.";
        } else if (errorMessage.includes("429")) {
          errorContent = "Rate limit exceeded. Please wait a moment and try again.";
        } else if (errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503")) {
          errorContent = "Anthropic's API is experiencing issues. Please try again later.";
        }
        // Check for network errors
        else if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("connection")) {
          errorContent = "Network error. Please check your internet connection.";
        }
        // Check for timeout errors
        else if (errorMessage.includes("timeout") || errorMessage.includes("timeout exceeded")) {
          errorContent = "Request timed out. Please check your connection and try again.";
        }
        // Generic error fallback with message
        else {
          errorContent = `Error: ${error.message}`;
        }
      } else if (typeof error === "object" && error !== null && "message" in error) {
        // Handle errors that might not be Error instances
        errorContent = `Error: ${(error as any).message}`;
      }

      const errorMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Auto-expand textarea height based on content
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = newHeight + "px";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === "Escape" && isStreaming) {
      handleCancel();
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();

      // Finalize current streaming message with cancellation notice
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
        <Button
          size="small"
          variant="invisible"
          onClick={() => toggleExpanded(messageId)}
          sx={{ mt: 1, fontSize: 0 }}
        >
          {isExpanded ? "Show Less" : "Show More"}
        </Button>
      </>
    );
  };

  return (
    <div className="full-height">
      {/* Messages */}
      <div ref={messagesContainerRef} className="chat-messages-container">
        {messages.length === 0 && !currentStreamingMessage && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">💬</div>
            <h4 className="chat-empty-title">
              Start a conversation with {agent.name}
            </h4>
            <p className="chat-empty-description">
              Ask questions, get feedback, or discuss your tasks. I'm here to
              help!
            </p>
          </div>
        )}

        {messages.map((message) => {
          const contentText = typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                  .filter((block) => block.type === "text")
                  .map((block: any) => block.text)
                  .join("")
              : "";

          return (
            <div className="message-content" key={message.id}>
              <div className={message.role === "user" ? "mcu" : "mca"}>
                {message.role === "user"
                  ? contentText
                  : renderMessageContent(contentText, message.id)}
              </div>
            </div>
          );
        })}

        {currentStreamingMessage && (
          <div className="message-content">
            <div className="mca">
              <ReactMarkdown>
                {typeof currentStreamingMessage.content === "string"
                  ? currentStreamingMessage.content || " "
                  : Array.isArray(currentStreamingMessage.content)
                    ? currentStreamingMessage.content
                        .filter((block) => block.type === "text")
                        .map((block: any) => block.text)
                        .join("")
                    : " "}
              </ReactMarkdown>
              {currentStreamingMessage.streaming && (
                <div className="streaming-indicator">
                  <Spinner size="small" />
                  <span>{agent.name} is thinking...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input">
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name}...`}
              resize="none"
              disabled={isStreaming}
              style={{
                width: "100%",
                minHeight: 44,
                maxHeight: 120,
                overflow: "auto",
              }}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            leadingVisual={isStreaming ? Spinner : PaperAirplaneIcon}
            size="medium"
            variant="primary"
            style={{ minWidth: 80 }}
          ></Button>
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#57606a" }}>
          <ActionMenu>
            <ActionMenu.Anchor>
              <Button
                variant="invisible"
                size="small"
                trailingVisual={ChevronDownIcon}
                style={{
                  padding: "2px 8px",
                  fontSize: "12px",
                  color: "#57606a",
                  fontWeight: "normal"
                }}
              >
                {agent.name}
              </Button>
            </ActionMenu.Anchor>
            <ActionMenu.Overlay>
              <ActionList>
                {availableAgents.map((a) => (
                  <ActionList.Item
                    key={a.id}
                    onSelect={() => onBack()}
                  >
                    {a.name}
                  </ActionList.Item>
                ))}
                {availableAgents.length > 0 && <ActionList.Divider />}
                <ActionList.Item onSelect={() => onBack()}>
                  Add new agent
                </ActionList.Item>
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
          {isStreaming && (
            <span style={{ marginLeft: "8px" }}>• Press Esc to cancel</span>
          )}
        </div>
      </div>

    </div>
  );
}

export default ChatInterface;
