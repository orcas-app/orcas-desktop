/**
 * Background task framework for automatic context supplementation.
 *
 * Provides a reusable pattern for running AI agent tasks in the background
 * with debouncing, input-hash change detection, and concurrency guards.
 */

import {
  getAllAgents,
  getLastBackgroundTaskRun,
  insertBackgroundTaskRun,
  updateBackgroundTaskRunStatus,
} from "../api";
import { sendChatTurn } from "./chatEngine";
import type { ToolResult } from "./agentTools";
import type { Agent } from "../types";

// ── Types ───────────────────────────────────────────────────────────────

export interface BackgroundTaskDefinition<TContext = unknown> {
  /** Unique identifier for this task type (e.g. "cos_space_context"). */
  taskType: string;

  /** The scope this task operates on (e.g. "space", "task"). */
  scopeType: string;

  /** Extract the scope ID from the trigger context. */
  getScopeId: (ctx: TContext) => number;

  /** Minimum minutes between runs for the same scope. Default: 5. */
  debounceMins?: number;

  /** The system_role value used to look up the agent in the database. */
  getAgentSystemRole: () => string;

  /**
   * Gather input data and return it as a string for hashing.
   * Return null to skip the run (e.g. no data available).
   */
  gatherContext: (ctx: TContext) => Promise<string | null>;

  /**
   * Optional additional check on whether to run.
   * Called after debounce and hash checks pass.
   * Return false to skip.
   */
  shouldRun?: (ctx: TContext) => Promise<boolean>;

  /** Build the system prompt for the AI call. */
  getSystemPrompt: (ctx: TContext, agent: Agent) => string;

  /** Build the user message for the AI call. */
  getUserMessage: (ctx: TContext, gatheredContext: string) => string;

  /** Tool schemas to provide to the model. */
  getTools: () => any[];

  /** Create a tool executor for this task. */
  createToolExecutor: (ctx: TContext) => (toolName: string, args: any) => Promise<ToolResult>;
}

export interface BackgroundTaskResult {
  ran: boolean;
  skippedReason?: string;
  content?: string;
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Simple string hash for change detection. */
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

function minutesAgo(isoDateString: string): number {
  const then = new Date(isoDateString).getTime();
  const now = Date.now();
  return (now - then) / 60_000;
}

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Execute a background task if conditions are met (debounce, hash check,
 * concurrency guard).
 */
export async function executeBackgroundTask<TContext>(
  definition: BackgroundTaskDefinition<TContext>,
  triggerContext: TContext,
): Promise<BackgroundTaskResult> {
  const {
    taskType,
    scopeType,
    getScopeId,
    debounceMins = 5,
    getAgentSystemRole,
    gatherContext,
    shouldRun,
    getSystemPrompt,
    getUserMessage,
    getTools,
    createToolExecutor,
  } = definition;

  const scopeId = getScopeId(triggerContext);

  // 1. Look up the agent by system_role
  const agents = await getAllAgents();
  const systemRole = getAgentSystemRole();
  const agent = agents.find((a) => a.system_role === systemRole);
  if (!agent) {
    return { ran: false, skippedReason: `No agent with system_role="${systemRole}" found.` };
  }

  // 2. Check for concurrent runs (skip if a running entry is < 10 min old)
  const lastRun = await getLastBackgroundTaskRun(taskType, scopeType, scopeId);
  if (lastRun) {
    if (lastRun.status === "running" && minutesAgo(lastRun.created_at) < 10) {
      return { ran: false, skippedReason: "Another run is still in progress." };
    }

    // 3. Debounce: skip if last completed run is too recent
    if (
      lastRun.status === "completed" &&
      minutesAgo(lastRun.completed_at || lastRun.created_at) < debounceMins
    ) {
      return { ran: false, skippedReason: `Debounced (last run < ${debounceMins} min ago).` };
    }
  }

  // 4. Gather context and compute hash
  const gathered = await gatherContext(triggerContext);
  if (gathered === null) {
    return { ran: false, skippedReason: "gatherContext returned null — nothing to process." };
  }

  const inputHash = hashString(gathered);

  // 5. Check if input has changed since last run
  if (lastRun && lastRun.status === "completed" && lastRun.input_hash === inputHash) {
    return { ran: false, skippedReason: "Input unchanged since last run." };
  }

  // 6. Optional shouldRun check
  if (shouldRun) {
    const proceed = await shouldRun(triggerContext);
    if (!proceed) {
      return { ran: false, skippedReason: "shouldRun() returned false." };
    }
  }

  // 7. Insert run record
  const runId = await insertBackgroundTaskRun(
    taskType,
    scopeType,
    scopeId,
    "automatic",
    inputHash,
  );

  // 8. Execute the AI chat turn
  try {
    const systemPrompt = getSystemPrompt(triggerContext, agent);
    const userMessage = getUserMessage(triggerContext, gathered);
    const tools = getTools();
    const executeTool = createToolExecutor(triggerContext);

    const result = await sendChatTurn(
      {
        modelName: agent.model_name,
        systemPrompt,
        tools,
      },
      [{ role: "user", content: userMessage }],
      { executeTool },
    );

    // 9. Mark completed
    await updateBackgroundTaskRunStatus(runId, "completed");

    return { ran: true, content: result.content };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateBackgroundTaskRunStatus(runId, "failed", errorMessage);
    return { ran: true, error: errorMessage };
  }
}
