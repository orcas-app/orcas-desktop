/**
 * System prompt construction for chat contexts.
 *
 * Replaces inline prompt building in ChatInterface.tsx and TodayPage.tsx.
 */

export interface TaskPromptContext {
  kind: "task";
  agentPrompt: string;
  agentName: string;
  taskId: number;
  spaceId: number;
  spaceContext?: string;
}

export interface TodayPromptContext {
  kind: "today";
  agentPrompt: string;
  agentName: string;
  agendaContext: string;
}

export type PromptContext = TaskPromptContext | TodayPromptContext;

const TOOL_DOCS = `
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
- list_agents: List all available agents with their capabilities`;

const TOOL_USAGE_GUIDE = `Use these tools to:
- Check for existing notes at the start of conversations and after receiving a document change notification to maintain continuity
- Save important insights, decisions, or findings to task notes
- Review task details and subtask progress
- Understand the broader space context and other tasks in the space
- Check the user's calendar to understand their schedule
- Update the space context when you make significant decisions or complete major milestones`;

export function buildSystemPrompt(ctx: PromptContext): string {
  const base = ctx.agentPrompt || `You are ${ctx.agentName}, a helpful AI assistant.`;

  if (ctx.kind === "task") {
    const spaceSection = ctx.spaceContext
      ? `\n\n# Space Context\n\n${ctx.spaceContext}\n\n---\n`
      : "";

    return `${base}${spaceSection}

You are currently working on Task ID: ${ctx.taskId} in Space ID: ${ctx.spaceId}. You have access to the following tools:
${TOOL_DOCS}

${TOOL_USAGE_GUIDE}`;
  }

  // Today context
  return `${base}

You are helping the user plan and organise their day. You have access to the following tools:
${TOOL_DOCS}

${TOOL_USAGE_GUIDE}

Here is the context for today:

${ctx.agendaContext}

Use this context to help the user manage their schedule, prioritise tasks, and plan their day effectively.`;
}
