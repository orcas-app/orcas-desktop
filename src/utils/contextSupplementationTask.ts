/**
 * Context supplementation background task.
 *
 * Runs after the user leaves a TaskDetail view. The Chief of Staff agent
 * analyses recent chat messages and task notes, then updates the Space
 * context with relevant insights — keeping it under 1 000 words.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  getSpaceContext,
  updateSpaceContext,
  getTaskById,
} from "../api";
import type { BackgroundTaskDefinition } from "./backgroundTasks";
import type { ToolResult } from "./agentTools";

// ── Trigger context ──────────────────────────────────────────────────────

export interface ContextSupplementationContext {
  taskId: number;
  spaceId: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Collect all chat localStorage entries for a given task (across agents). */
function gatherChatMessages(taskId: number): { role: string; content: string; agentKey: string }[] {
  const messages: { role: string; content: string; agentKey: string }[] = [];
  const prefix = `chat-task-${taskId}-agent-`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    try {
      const parsed = JSON.parse(localStorage.getItem(key)!);
      if (!Array.isArray(parsed)) continue;
      for (const msg of parsed) {
        if (msg.role && typeof msg.content === "string") {
          messages.push({ role: msg.role, content: msg.content, agentKey: key });
        }
      }
    } catch {
      // Skip malformed entries
    }
  }
  return messages;
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

// ── Task definition ─────────────────────────────────────────────────────

export const contextSupplementationTask: BackgroundTaskDefinition<ContextSupplementationContext> = {
  taskType: "cos_space_context",
  scopeType: "task",

  getScopeId: (ctx) => ctx.taskId,

  debounceMins: 5,

  getAgentSystemRole: () => "chief_of_staff",

  async gatherContext(ctx) {
    const chatMessages = gatherChatMessages(ctx.taskId);
    if (chatMessages.length === 0) return null;

    const taskNotes = await invoke<string>("read_task_notes", { taskId: ctx.taskId }).catch(() => "");
    const task = await getTaskById(ctx.taskId);
    const spaceContext = await getSpaceContext(ctx.spaceId);

    // Build a hash-friendly summary string
    const lastMsg = chatMessages[chatMessages.length - 1];
    const hashInput = `${chatMessages.length}|${lastMsg?.content?.slice(-100) ?? ""}|${taskNotes.length}`;

    // Build the full context payload that getUserMessage will receive
    const taskMeta = task
      ? `Task: "${task.title}" (status: ${task.status}, priority: ${task.priority})${task.description ? `\nDescription: ${task.description}` : ""}`
      : `Task ID: ${ctx.taskId}`;

    const chatSummary = chatMessages
      .slice(-40) // last 40 messages to stay within token budget
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");

    const parts = [
      `--- TASK METADATA ---\n${taskMeta}`,
      `--- CURRENT SPACE CONTEXT ---\n${spaceContext || "(empty)"}`,
      `--- TASK NOTES ---\n${taskNotes || "(none)"}`,
      `--- RECENT CONVERSATION ---\n${chatSummary}`,
      `--- HASH ---\n${hashInput}`,
    ];

    return parts.join("\n\n");
  },

  getSystemPrompt(_ctx, agent) {
    return `${agent.agent_prompt}

You are running as a background task after the user finished working on a task.
Your job: analyse the conversation and task notes, then update the Space context
with any new insights, decisions, goals, or preferences that are relevant across
all tasks in this Space.

Rules:
- The Space context MUST stay under 1 000 words. If it currently exceeds that,
  condense it before adding new information.
- Preserve existing context that is still relevant. Remove outdated information.
- Be concise and structured (use headings, bullets).
- Do NOT include ephemeral details (e.g. "the user asked about X just now").
  Focus on durable knowledge: decisions made, goals clarified, preferences stated.
- Use the read_space_context tool first to see the current state, then
  update_space_context to write the new version.
- If there is nothing meaningful to add, do NOT update the context — just respond
  saying no update was needed.`;
  },

  getUserMessage(_ctx, gatheredContext) {
    return `Please review the following task conversation and notes, then update the Space context if there are meaningful new insights.\n\n${gatheredContext}`;
  },

  getTools() {
    return [
      {
        name: "read_space_context",
        description: "Read the current Space context markdown.",
        input_schema: {
          type: "object",
          properties: {
            space_id: {
              type: "number",
              description: "The ID of the space.",
            },
          },
          required: [],
        },
      },
      {
        name: "update_space_context",
        description:
          "Update the Space context markdown. Must stay under 1 000 words.",
        input_schema: {
          type: "object",
          properties: {
            space_id: {
              type: "number",
              description: "The ID of the space.",
            },
            content: {
              type: "string",
              description: "The full markdown content for the space context.",
            },
          },
          required: ["content"],
        },
      },
    ];
  },

  createToolExecutor(ctx) {
    return async (toolName: string, args: any): Promise<ToolResult> => {
      const spaceId = args.space_id || ctx.spaceId;

      switch (toolName) {
        case "read_space_context": {
          const context = await getSpaceContext(spaceId);
          return textResult(
            context && context.length > 0
              ? context
              : `No space context has been set for space ${spaceId}.`,
          );
        }

        case "update_space_context": {
          const wordCount = args.content
            .split(/\s+/)
            .filter(Boolean).length;
          if (wordCount > 1000) {
            return textResult(
              `Space context exceeds the 1000-word limit (currently ${wordCount} words). Please condense and retry.`,
            );
          }
          await updateSpaceContext(spaceId, args.content);
          return textResult(
            `Successfully updated space context for space ${spaceId} (${wordCount} words).`,
          );
        }

        default:
          return textResult(`Unknown tool: ${toolName}`);
      }
    };
  },
};
