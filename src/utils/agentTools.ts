/**
 * Agent tool definitions and executor.
 *
 * Extracted from ChatInterface.tsx so both Task-chat and Today-chat contexts
 * can share the same 9 tools. When `taskId` / `spaceId` are provided in
 * the context they act as defaults; when omitted the caller must pass
 * explicit IDs (Today-chat context).
 */

import { invoke } from "@tauri-apps/api/core";
import {
  getTasksBySpace,
  readAgentNotes,
  getAllAgents,
  getAllSpaces,
  getSpaceContext,
  getCalendarList,
  getEventsForDate,
  checkAgentNotesExists,
  updateSpaceContext,
} from "../api";

export interface ToolContext {
  /** Current task ID — undefined in Today context. */
  taskId?: number;
  /** Current space ID — undefined in Today context. */
  spaceId?: number;
  /** Called when task notes are read for the current task (change-tracking). */
  onTaskNotesRead?: (content: string) => void;
  /** Called when space context is updated. */
  onSpaceContextUpdated?: (content: string) => void;
}

export interface ToolResult {
  content: { type: string; text: string }[];
}

// ── Tool schemas ────────────────────────────────────────────────────────

export function getAgentToolSchemas() {
  return [
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
            description:
              "The ID of the task to get details for. Defaults to the current task.",
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
            description:
              "Optional status filter to only return tasks with this status.",
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
}

// ── Tool executor ───────────────────────────────────────────────────────

export function createToolExecutor(ctx: ToolContext) {
  return async (toolName: string, args: any): Promise<ToolResult> => {
    try {
      switch (toolName) {
        case "read_task_notes": {
          const readTaskId = args.task_id || ctx.taskId;
          if (!readTaskId) {
            return textResult("Error: task_id is required (no default task context).");
          }
          const content = await invoke<string>("read_task_notes", { taskId: readTaskId });
          if (readTaskId === ctx.taskId) {
            ctx.onTaskNotesRead?.(content || "");
          }
          return textResult(
            content && content.length > 0
              ? content
              : `No notes exist for task ${readTaskId}. Use write_task_notes to create one.`,
          );
        }

        case "write_task_notes": {
          const { content: writeContent, operation = "append" } = args;
          const actualTaskId = args.task_id || ctx.taskId;
          if (!actualTaskId) {
            return textResult("Error: task_id is required (no default task context).");
          }
          let finalContent = writeContent;
          if (operation === "append") {
            const existing = await invoke<string>("read_task_notes", { taskId: actualTaskId });
            if (existing && existing.length > 0) {
              finalContent = existing + "\n\n" + writeContent;
            }
          }
          await invoke("write_task_notes", { taskId: actualTaskId, content: finalContent });
          return textResult(
            `Successfully ${operation === "append" ? "appended to" : "wrote"} notes for task ${actualTaskId}`,
          );
        }

        case "check_task_notes_exists": {
          const checkTaskId = args.task_id || ctx.taskId;
          if (!checkTaskId) {
            return textResult("Error: task_id is required (no default task context).");
          }
          const exists = await checkAgentNotesExists(checkTaskId);
          return textResult(
            exists
              ? `Notes file exists for task ${checkTaskId}`
              : `No notes file exists for task ${checkTaskId}`,
          );
        }

        case "update_space_context": {
          const { content: ctxContent, summary: ctxSummary } = args;
          const actualSpaceId = args.space_id || ctx.spaceId;
          if (!actualSpaceId) {
            return textResult("Error: space_id is required (no default space context).");
          }
          await updateSpaceContext(actualSpaceId, ctxContent);
          ctx.onSpaceContextUpdated?.(ctxContent);
          return textResult(
            `Successfully updated space context for space ${actualSpaceId}${ctxSummary ? `: ${ctxSummary}` : ""}`,
          );
        }

        case "get_task_details": {
          const detailTaskId = args.task_id || ctx.taskId;
          if (!detailTaskId) {
            return textResult("Error: task_id is required (no default task context).");
          }
          // We need a spaceId to look up tasks — fall back to querying all spaces
          const spaceIdForLookup = ctx.spaceId;
          if (!spaceIdForLookup) {
            // No default space — look across all spaces
            const spaces = await getAllSpaces();
            for (const space of spaces) {
              const tasks = await getTasksBySpace(space.id);
              const task = tasks.find((t) => t.id === detailTaskId);
              if (task) {
                const notes = await readAgentNotes(detailTaskId);
                return textResult(JSON.stringify({
                  task: {
                    id: task.id, title: task.title, description: task.description || null,
                    status: task.status, priority: task.priority, due_date: task.due_date || null,
                    scheduled_date: task.scheduled_date || null, created_at: task.created_at, updated_at: task.updated_at,
                  },
                  space: { id: space.id, title: space.title, description: space.description || null },
                  subtasks: task.subtasks.map((st) => ({
                    id: st.id, title: st.title, description: st.description || null,
                    completed: st.completed, agent_id: st.agent_id || null,
                  })),
                  notes: notes || null,
                }, null, 2));
              }
            }
            return textResult(`Task ${detailTaskId} not found.`);
          }
          const allTasks = await getTasksBySpace(spaceIdForLookup);
          const task = allTasks.find((t) => t.id === detailTaskId);
          if (!task) {
            return textResult(`Task ${detailTaskId} not found in the current space.`);
          }
          const notes = await readAgentNotes(detailTaskId);
          const spaces = await getAllSpaces();
          const space = spaces.find((s) => s.id === task.space_id);
          return textResult(JSON.stringify({
            task: {
              id: task.id, title: task.title, description: task.description || null,
              status: task.status, priority: task.priority, due_date: task.due_date || null,
              scheduled_date: task.scheduled_date || null, created_at: task.created_at, updated_at: task.updated_at,
            },
            space: space ? { id: space.id, title: space.title, description: space.description || null } : null,
            subtasks: task.subtasks.map((st) => ({
              id: st.id, title: st.title, description: st.description || null,
              completed: st.completed, agent_id: st.agent_id || null,
            })),
            notes: notes || null,
          }, null, 2));
        }

        case "list_space_tasks": {
          const listSpaceId = args.space_id || ctx.spaceId;
          if (!listSpaceId) {
            return textResult("Error: space_id is required (no default space context).");
          }
          let tasks = await getTasksBySpace(listSpaceId);
          if (args.status) {
            tasks = tasks.filter((t) => t.status === args.status);
          }
          const spaces = await getAllSpaces();
          const space = spaces.find((s) => s.id === listSpaceId);
          return textResult(JSON.stringify({
            space: space ? { id: space.id, title: space.title } : null,
            tasks: tasks.map((t) => ({
              id: t.id, title: t.title, description: t.description || null,
              status: t.status, priority: t.priority, due_date: t.due_date || null,
              scheduled_date: t.scheduled_date || null,
              subtask_count: t.subtasks.length,
              subtasks_completed: t.subtasks.filter((st) => st.completed).length,
            })),
          }, null, 2));
        }

        case "read_space_context": {
          const readCtxSpaceId = args.space_id || ctx.spaceId;
          if (!readCtxSpaceId) {
            return textResult("Error: space_id is required (no default space context).");
          }
          const context = await getSpaceContext(readCtxSpaceId);
          return textResult(
            context && context.length > 0
              ? context
              : `No space context has been set for space ${readCtxSpaceId}.`,
          );
        }

        case "get_calendar_events": {
          const { date: eventDate } = args;
          try {
            const savedCalendarIds = localStorage.getItem("selected_calendar_ids");
            let calendarIds: string[] = [];
            if (savedCalendarIds) {
              calendarIds = JSON.parse(savedCalendarIds);
            } else {
              const calendars = await getCalendarList();
              calendarIds = calendars.map((c) => c.id);
            }
            if (calendarIds.length === 0) {
              return textResult("No calendars configured. The user needs to select calendars in Settings.");
            }
            const events = await getEventsForDate(calendarIds, eventDate);
            const result = events.map((e) => ({
              title: e.title, start_date: e.start_date, end_date: e.end_date,
              is_all_day: e.is_all_day, location: e.location || null,
              notes: e.notes || null, attendees: e.attendees,
            }));
            return textResult(
              result.length > 0
                ? JSON.stringify(result, null, 2)
                : `No calendar events found for ${eventDate}.`,
            );
          } catch (error) {
            return textResult(
              `Calendar access unavailable: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }

        case "list_agents": {
          const agents = await getAllAgents();
          const userAgents = agents.filter((a) => !a.system_role);
          return textResult(JSON.stringify(
            userAgents.map((a) => ({
              id: a.id, name: a.name, model: a.model_name,
              description: a.agent_prompt, web_search_enabled: a.web_search_enabled,
            })),
            null, 2,
          ));
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return textResult(
        `Error: ${error instanceof Error ? error.message : "An unexpected error occurred"}`,
      );
    }
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
