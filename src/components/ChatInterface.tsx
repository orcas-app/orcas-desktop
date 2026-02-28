import { useState, useEffect, useRef } from "react";
import { Textarea, Button, Spinner, ActionMenu, ActionList } from "@primer/react";
import { PaperAirplaneIcon, ChevronDownIcon } from "@primer/octicons-react";
import ReactMarkdown from "react-markdown";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { Agent, ChatMessage } from "../types";
import { recordTaskAgentSession, getSetting, getAllAgents, getSpaceContext, checkModelSupportsTools, getTasksBySpace, readAgentNotes, getCalendarList, getEventsForDate } from "../api";
import { withRetry } from "../utils/retry";
import { compactMessages } from "../utils/tokenEstimation";

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
    loadApiKey();
    loadAgents();
    loadSpaceContext();
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

        case "get_task_details": {
          const detailTaskId = args.task_id || taskId;
          try {
            // Get all tasks in the space to find this task and its space info
            const allTasks = await getTasksBySpace(spaceId);
            const task = allTasks.find(t => t.id === detailTaskId);

            if (!task) {
              return {
                content: [{ type: "text", text: `Task ${detailTaskId} not found in the current space.` }],
              };
            }

            // Get task notes
            const notes = await readAgentNotes(detailTaskId);

            // Get space info
            const { getAllSpaces } = await import("../api");
            const spaces = await getAllSpaces();
            const space = spaces.find(s => s.id === task.space_id);

            const result = {
              task: {
                id: task.id,
                title: task.title,
                description: task.description || null,
                status: task.status,
                priority: task.priority,
                due_date: task.due_date || null,
                scheduled_date: task.scheduled_date || null,
                created_at: task.created_at,
                updated_at: task.updated_at,
              },
              space: space ? { id: space.id, title: space.title, description: space.description || null } : null,
              subtasks: task.subtasks.map(st => ({
                id: st.id,
                title: st.title,
                description: st.description || null,
                completed: st.completed,
                agent_id: st.agent_id || null,
              })),
              notes: notes || null,
            };

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          } catch (error) {
            console.error("Error in get_task_details:", error);
            throw new Error(
              `Failed to get task details: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        case "list_space_tasks": {
          const listSpaceId = args.space_id || spaceId;
          try {
            let tasks = await getTasksBySpace(listSpaceId);

            // Apply status filter if provided
            if (args.status) {
              tasks = tasks.filter(t => t.status === args.status);
            }

            // Get space info
            const { getAllSpaces } = await import("../api");
            const spaces = await getAllSpaces();
            const space = spaces.find(s => s.id === listSpaceId);

            const result = {
              space: space ? { id: space.id, title: space.title } : null,
              tasks: tasks.map(t => ({
                id: t.id,
                title: t.title,
                description: t.description || null,
                status: t.status,
                priority: t.priority,
                due_date: t.due_date || null,
                scheduled_date: t.scheduled_date || null,
                subtask_count: t.subtasks.length,
                subtasks_completed: t.subtasks.filter(st => st.completed).length,
              })),
            };

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          } catch (error) {
            console.error("Error in list_space_tasks:", error);
            throw new Error(
              `Failed to list tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        case "read_space_context": {
          const readCtxSpaceId = args.space_id || spaceId;
          try {
            const context = await getSpaceContext(readCtxSpaceId);
            return {
              content: [{
                type: "text",
                text: context && context.length > 0
                  ? context
                  : `No space context has been set for space ${readCtxSpaceId}.`,
              }],
            };
          } catch (error) {
            console.error("Error in read_space_context:", error);
            throw new Error(
              `Failed to read space context: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        case "get_calendar_events": {
          const { date: eventDate } = args;
          try {
            // Get user's selected calendars from localStorage
            const savedCalendarIds = localStorage.getItem("selected_calendar_ids");
            let calendarIds: string[] = [];
            if (savedCalendarIds) {
              calendarIds = JSON.parse(savedCalendarIds);
            } else {
              // Fall back to all calendars
              const calendars = await getCalendarList();
              calendarIds = calendars.map(c => c.id);
            }

            if (calendarIds.length === 0) {
              return {
                content: [{ type: "text", text: "No calendars configured. The user needs to select calendars in Settings." }],
              };
            }

            const events = await getEventsForDate(calendarIds, eventDate);

            const result = events.map(e => ({
              title: e.title,
              start_date: e.start_date,
              end_date: e.end_date,
              is_all_day: e.is_all_day,
              location: e.location || null,
              notes: e.notes || null,
              attendees: e.attendees,
            }));

            return {
              content: [{
                type: "text",
                text: result.length > 0
                  ? JSON.stringify(result, null, 2)
                  : `No calendar events found for ${eventDate}.`,
              }],
            };
          } catch (error) {
            console.error("Error in get_calendar_events:", error);
            // Calendar may not be authorized on this platform
            return {
              content: [{ type: "text", text: `Calendar access unavailable: ${error instanceof Error ? error.message : "Unknown error"}` }],
            };
          }
        }

        case "list_agents": {
          try {
            const agents = await getAllAgents();
            const userAgents = agents.filter(a => !a.system_role);

            const result = userAgents.map(a => ({
              id: a.id,
              name: a.name,
              model: a.model_name,
              description: a.agent_prompt,
              web_search_enabled: a.web_search_enabled,
            }));

            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          } catch (error) {
            console.error("Error in list_agents:", error);
            throw new Error(
              `Failed to list agents: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
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
    {
      name: "get_task_details",
      description:
        "Get full details of a task including its properties, subtasks, notes, and parent space information.",
      input_schema: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "The ID of the task to get details for. Defaults to the current task.",
          },
        },
        required: [],
      },
    },
    {
      name: "list_space_tasks",
      description:
        "List all tasks in a space with their subtasks. Optionally filter by status.",
      input_schema: {
        type: "object",
        properties: {
          space_id: {
            type: "number",
            description: "The ID of the space. Defaults to the current space.",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "for_review", "done"],
            description: "Optional status filter to only return tasks with this status.",
          },
        },
        required: [],
      },
    },
    {
      name: "read_space_context",
      description:
        "Read the shared space context markdown. Contains architectural decisions, milestones, and space-wide context shared across all tasks.",
      input_schema: {
        type: "object",
        properties: {
          space_id: {
            type: "number",
            description: "The ID of the space. Defaults to the current space.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_calendar_events",
      description:
        "Get calendar events for a specific date. Returns event titles, times, locations, and attendees from the user's configured calendars.",
      input_schema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "The date to get events for in YYYY-MM-DD format.",
          },
        },
        required: ["date"],
      },
    },
    {
      name: "list_agents",
      description:
        "List all available agents with their names, models, and descriptions.",
      input_schema: {
        type: "object",
        properties: {},
        required: [],
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

      // Compact conversation history to stay within token budget.
      // This only affects what is sent to the API -- the full history
      // remains visible in the UI via the `messages` state.
      const compactedMessages = compactMessages(conversationMessages);

      // Prepare the system message with information about the current task and available tools
      const spaceContextSection = spaceContext
        ? `\n\n# Space Context\n\n${spaceContext}\n\n---\n`
        : "";

      const enhancedSystemMessage = `${agentPrompt || `You are ${agent.name}, a helpful AI assistant.`}${spaceContextSection}

You are currently working on Task ID: ${taskId} in Space ID: ${spaceId}. You have access to the following tools:

**Notes & Context:**
- read_task_notes: Read notes from previous sessions for a task
- write_task_notes: Write or append new insights, findings, or progress to task notes
- check_task_notes_exists: Check if notes already exist for a task
- read_space_context: Read the shared space context (architectural decisions, milestones)
- update_space_context: Update the shared space context with important insights

**Tasks & Spaces:**
- get_task_details: Get full details of a task including subtasks, notes, and space info
- list_space_tasks: List all tasks in a space with subtask progress, optionally filtered by status

**Calendar & Scheduling:**
- get_calendar_events: Get the user's calendar events for a specific date

**Agents:**
- list_agents: List all available agents with their capabilities

Use these tools to:
- Check for existing notes at the start of conversations to maintain continuity
- Save important insights, decisions, or findings to task notes
- Review task details and subtask progress
- Understand the broader space context and other tasks in the space
- Check the user's calendar to understand their schedule
- Update the space context when you make significant decisions or complete major milestones`;

      // Get response from Claude API via Tauri backend
      const modelName = agent.model_name || "claude-sonnet-4-5";
      const maxTokens = getMaxTokensForModel(modelName);

      // Check if the model supports tool use before passing tools
      const modelToolSupport = await checkModelSupportsTools(modelName);
      let toolsToSend: any[] | undefined = modelToolSupport ? [...mcpTools] : undefined;

      if (!modelToolSupport) {
        console.warn(`Model '${modelName}' does not support tool use. Tools will not be sent.`);
      }

      // Add web search tool if enabled for this agent
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

      let responseText: string = await withRetry(
        () => invoke<string>("send_chat_message", {
          model: modelName,
          messages: compactedMessages,
          system: enhancedSystemMessage,
          maxTokens: maxTokens,
          tools: toolsToSend,
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
      let fullConversation = [...compactedMessages];

      while (response.stop_reason === "tool_use" || response.stop_reason === "pause_turn") {
        // Handle pause_turn: the API paused a long-running turn (e.g., web search)
        // Send the response content back to continue the turn
        if (response.stop_reason === "pause_turn") {
          const pauseText = response.content
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join("");
          if (pauseText) {
            accumulatedContent += pauseText;
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null;
              return { ...prev, content: accumulatedContent };
            });
          }

          fullConversation.push({
            role: "assistant" as const,
            content: response.content,
          });

          responseText = await withRetry(
            () => invoke<string>("send_chat_message", {
              model: modelName,
              messages: fullConversation,
              system: enhancedSystemMessage,
              maxTokens: maxTokens,
              tools: toolsToSend,
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
          totalInputTokens += response.usage?.input_tokens || 0;
          totalOutputTokens += response.usage?.output_tokens || 0;
          continue;
        }

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
            tools: toolsToSend,
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

      // Extract citations from text blocks (web search results)
      const citations: { url: string; title: string }[] = [];
      for (const block of response.content) {
        if (block.type === "text" && block.citations) {
          for (const cite of block.citations) {
            if (cite.url && !citations.some((c) => c.url === cite.url)) {
              citations.push({ url: cite.url, title: cite.title || cite.url });
            }
          }
        }
      }
      if (citations.length > 0) {
        accumulatedContent += "\n\n**Sources:**\n" +
          citations.map((c) => `- [${c.title}](${c.url})`).join("\n");
      }

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
                variant="default"
                size="small"
                trailingVisual={ChevronDownIcon}
                style={{
                  padding: "2px 8px",
                  fontSize: "12px",
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
