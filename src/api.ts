import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type {
  Space,
  NewSpace,
  Task,
  NewTask,
  SubTask,
  NewSubTask,
  TaskWithSubTasks,
  Agent,
  ModelInfo,
  Calendar,
  CalendarEvent,
  PermissionStatus,
} from "./types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    console.log("Initializing database connection...");
    db = await Database.load("sqlite:orcascore.db");
    console.log("Database connection established");
  }
  return db;
}

// Space operations
export async function getAllSpaces(): Promise<Space[]> {
  const database = await getDb();
  const result = await database.select<Space[]>(
    "SELECT * FROM spaces ORDER BY created_at DESC",
  );
  return result;
}

export async function createSpace(space: NewSpace): Promise<Space> {
  const database = await getDb();
  const color = space.color || "#3B82F6";

  const result = await database.execute(
    "INSERT INTO spaces (title, description, color) VALUES ($1, $2, $3)",
    [space.title, space.description || null, color],
  );

  const createdSpace = await database.select<Space[]>(
    "SELECT * FROM spaces WHERE id = $1",
    [result.lastInsertId],
  );

  if (createdSpace.length === 0) {
    throw new Error("Failed to retrieve created space");
  }

  return createdSpace[0];
}

export async function updateSpace(
  id: number,
  space: NewSpace,
): Promise<Space> {
  const database = await getDb();
  const color = space.color || "#3B82F6";

  await database.execute(
    "UPDATE spaces SET title = $1, description = $2, color = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4",
    [space.title, space.description || null, color, id],
  );

  const updatedSpace = await database.select<Space[]>(
    "SELECT * FROM spaces WHERE id = $1",
    [id],
  );

  if (updatedSpace.length === 0) {
    throw new Error("Failed to retrieve updated space");
  }

  return updatedSpace[0];
}

export async function deleteSpace(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM spaces WHERE id = $1", [id]);
}

// Space context operations
export async function getSpaceContext(spaceId: number): Promise<string> {
  try {
    return await invoke<string>("read_space_context", { spaceId });
  } catch (error) {
    console.error("Failed to read space context:", error);
    return "";
  }
}

export async function updateSpaceContext(
  spaceId: number,
  content: string,
): Promise<void> {
  try {
    await invoke("write_space_context", { spaceId, content });
  } catch (error) {
    console.error("Failed to update space context:", error);
    throw error;
  }
}

// Task operations
export async function getTasksBySpace(
  spaceId: number,
): Promise<TaskWithSubTasks[]> {
  const database = await getDb();

  const tasks = await database.select<Task[]>(
    "SELECT * FROM tasks WHERE space_id = $1 ORDER BY created_at DESC",
    [spaceId],
  );

  const tasksWithSubTasks: TaskWithSubTasks[] = [];

  for (const task of tasks) {
    const subtasks = await database.select<SubTask[]>(
      "SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC",
      [task.id],
    );

    tasksWithSubTasks.push({ ...task, subtasks });
  }

  return tasksWithSubTasks;
}

export async function createTask(task: NewTask): Promise<Task> {
  const database = await getDb();
  const status = task.status || "todo";
  const priority = task.priority || "medium";

  const result = await database.execute(
    "INSERT INTO tasks (space_id, title, description, status, priority, due_date) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      task.space_id,
      task.title,
      task.description || null,
      status,
      priority,
      task.due_date || null,
    ],
  );

  const createdTask = await database.select<Task[]>(
    "SELECT * FROM tasks WHERE id = $1",
    [result.lastInsertId],
  );

  if (createdTask.length === 0) {
    throw new Error("Failed to retrieve created task");
  }

  return createdTask[0];
}

export async function updateTask(
  id: number,
  updates: Partial<Task>,
): Promise<Task> {
  const database = await getDb();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push("title = $" + (fields.length + 1));
    values.push(updates.title);
  }

  if (updates.description !== undefined) {
    fields.push("description = $" + (fields.length + 1));
    values.push(updates.description || null);
  }

  if (updates.status !== undefined) {
    fields.push("status = $" + (fields.length + 1));
    values.push(updates.status);
  }

  if (updates.priority !== undefined) {
    fields.push("priority = $" + (fields.length + 1));
    values.push(updates.priority);
  }

  if (updates.due_date !== undefined) {
    fields.push("due_date = $" + (fields.length + 1));
    values.push(updates.due_date || null);
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${values.length}`;

  await database.execute(sql, values);

  const updatedTask = await database.select<Task[]>(
    "SELECT * FROM tasks WHERE id = $1",
    [id],
  );

  if (updatedTask.length === 0) {
    throw new Error("Failed to retrieve updated task");
  }

  return updatedTask[0];
}

export async function updateTaskStatus(
  id: number,
  status: "todo" | "in_progress" | "for_review" | "done",
): Promise<Task> {
  return updateTask(id, { status });
}

export async function deleteTask(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

// SubTask operations
export async function createSubTask(subtask: NewSubTask): Promise<SubTask> {
  const database = await getDb();

  const result = await database.execute(
    "INSERT INTO subtasks (task_id, title, description, agent_id) VALUES ($1, $2, $3, $4)",
    [
      subtask.task_id,
      subtask.title,
      subtask.description || null,
      subtask.agent_id || null,
    ],
  );

  const createdSubTask = await database.select<SubTask[]>(
    "SELECT * FROM subtasks WHERE id = $1",
    [result.lastInsertId],
  );

  if (createdSubTask.length === 0) {
    throw new Error("Failed to retrieve created subtask");
  }

  return createdSubTask[0];
}

export async function toggleSubTaskCompletion(id: number): Promise<SubTask> {
  const database = await getDb();

  await database.execute(
    "UPDATE subtasks SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id],
  );

  const updatedSubTask = await database.select<SubTask[]>(
    "SELECT * FROM subtasks WHERE id = $1",
    [id],
  );

  if (updatedSubTask.length === 0) {
    throw new Error("Failed to retrieve updated subtask");
  }

  return updatedSubTask[0];
}

export async function deleteSubTask(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM subtasks WHERE id = $1", [id]);
}

// Agent operations
export async function getAllAgents(): Promise<Agent[]> {
  const database = await getDb();
  const result = await database.select<Agent[]>(
    "SELECT * FROM agents ORDER BY name ASC",
  );
  return result;
}

export async function createAgent(
  name: string,
  modelName: string,
  agentPrompt: string,
): Promise<Agent> {
  const database = await getDb();

  const result = await database.execute(
    "INSERT INTO agents (name, model_name, agent_prompt) VALUES ($1, $2, $3)",
    [name, modelName, agentPrompt],
  );

  const createdAgent = await database.select<Agent[]>(
    "SELECT * FROM agents WHERE id = $1",
    [result.lastInsertId],
  );

  if (createdAgent.length === 0) {
    throw new Error("Failed to retrieve created agent");
  }

  return createdAgent[0];
}

export async function updateAgent(
  id: number,
  updates: Partial<{ name: string; model_name: string; agent_prompt: string }>,
): Promise<Agent> {
  const database = await getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = $" + (fields.length + 1));
    values.push(updates.name);
  }

  if (updates.model_name !== undefined) {
    fields.push("model_name = $" + (fields.length + 1));
    values.push(updates.model_name);
  }

  if (updates.agent_prompt !== undefined) {
    fields.push("agent_prompt = $" + (fields.length + 1));
    values.push(updates.agent_prompt);
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE agents SET ${fields.join(", ")} WHERE id = $${values.length}`;

  await database.execute(sql, values);

  const updatedAgent = await database.select<Agent[]>(
    "SELECT * FROM agents WHERE id = $1",
    [id],
  );

  if (updatedAgent.length === 0) {
    throw new Error("Failed to retrieve updated agent");
  }

  return updatedAgent[0];
}

export async function deleteAgent(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM agents WHERE id = $1", [id]);
}

// Task-Agent Session operations
export async function recordTaskAgentSession(
  taskId: number,
  agentId: number,
): Promise<void> {
  const database = await getDb();

  await database.execute(
    `INSERT INTO task_agent_sessions (task_id, agent_id, last_used_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(task_id, agent_id) DO UPDATE SET last_used_at = CURRENT_TIMESTAMP`,
    [taskId, agentId],
  );
}

export async function getLastUsedAgentForTask(
  taskId: number,
): Promise<Agent | null> {
  const database = await getDb();

  const result = await database.select<Agent[]>(
    `SELECT a.* FROM agents a
     JOIN task_agent_sessions tas ON a.id = tas.agent_id
     WHERE tas.task_id = $1
     ORDER BY tas.last_used_at DESC
     LIMIT 1`,
    [taskId],
  );

  return result.length > 0 ? result[0] : null;
}

// Agent Notes MCP Server operations
export async function startMCPServer(): Promise<string> {
  try {
    return await invoke<string>("start_mcp_server");
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    throw error;
  }
}

export async function stopMCPServer(): Promise<string> {
  try {
    return await invoke<string>("stop_mcp_server");
  } catch (error) {
    console.error("Failed to stop MCP server:", error);
    throw error;
  }
}

export async function updateTaskNotesPath(taskId: number): Promise<string> {
  try {
    const notesPath = await invoke<string>("update_task_notes_path", {
      taskId,
    });

    // Update the database with the notes path
    const database = await getDb();
    await database.execute(
      "UPDATE tasks SET notes_file_path = $1 WHERE id = $2",
      [notesPath, taskId],
    );

    return notesPath;
  } catch (error) {
    console.error("Failed to update task notes path:", error);
    throw error;
  }
}

export async function getTaskNotesPath(taskId: number): Promise<string | null> {
  try {
    // Query the database for the actual notes path
    const database = await getDb();
    const result = await database.select<{ notes_file_path: string | null }[]>(
      "SELECT notes_file_path FROM tasks WHERE id = $1",
      [taskId],
    );

    if (result.length > 0) {
      return result[0].notes_file_path;
    }

    return null;
  } catch (error) {
    console.error("Failed to get task notes path:", error);
    throw error;
  }
}

// Read task notes from database
export async function readAgentNotes(taskId: number): Promise<string | null> {
  try {
    // Task notes are stored in the database, not as files
    const content = await invoke<string>("read_task_notes", { taskId });
    return content && content.length > 0 ? content : null;
  } catch (error) {
    console.error("Failed to read task notes:", error);
    return null;
  }
}

export async function checkAgentNotesExists(taskId: number): Promise<boolean> {
  try {
    // Task notes are stored in the database, not as files
    // Check if there's any content in the task_notes table
    const content = await invoke<string>("read_task_notes", { taskId });
    return content !== null && content.length > 0;
  } catch (error) {
    console.error("Failed to check if task notes exist:", error);
    return false;
  }
}

// Settings operations
export async function getSetting(key: string): Promise<string | null> {
  try {
    const database = await getDb();
    const result = await database.select<{value: string}[]>(
      "SELECT value FROM settings WHERE key = $1",
      [key]
    );

    return result.length > 0 ? result[0].value : null;
  } catch (error) {
    console.error("Failed to get setting:", error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const database = await getDb();
    await database.execute(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)",
      [key, value]
    );
  } catch (error) {
    console.error("Failed to set setting:", error);
    throw error;
  }
}

export async function deleteSetting(key: string): Promise<void> {
  try {
    const database = await getDb();
    await database.execute(
      "DELETE FROM settings WHERE key = $1",
      [key]
    );
  } catch (error) {
    console.error("Failed to delete setting:", error);
    throw error;
  }
}

// Task planning operations
export async function startTaskPlanning(
  taskId: number,
  taskTitle: string,
  taskDescription?: string,
): Promise<string> {
  try {
    // Get all agents to include in the planning context
    const agents = await getAllAgents();
    const agentsContext = agents
      .map(
        (agent) =>
          `- **${agent.name}** (ID: ${agent.id}, Model: ${agent.model_name}): ${agent.agent_prompt}`,
      )
      .join("\n");

    return await invoke<string>("start_task_planning", {
      taskId,
      taskTitle,
      taskDescription: taskDescription || null,
      agents: agentsContext,
    });
  } catch (error) {
    console.error("Failed to start task planning:", error);
    throw error;
  }
}

export async function cancelTaskPlanning(taskId: number): Promise<string> {
  try {
    return await invoke<string>("cancel_task_planning", { taskId });
  } catch (error) {
    console.error("Failed to cancel task planning:", error);
    throw error;
  }
}

// Legacy function for backward compatibility
export async function planTask(
  taskId: number,
  taskTitle: string,
  taskDescription?: string,
): Promise<string> {
  return startTaskPlanning(taskId, taskTitle, taskDescription);
}

// Model operations
export async function getAvailableModels(): Promise<ModelInfo[]> {
  try {
    return await invoke<ModelInfo[]>("get_available_models");
  } catch (error) {
    console.error("Failed to get available models:", error);
    throw error;
  }
}

export async function resolveModelId(friendlyName: string): Promise<string> {
  try {
    return await invoke<string>("resolve_model_id", { friendlyName });
  } catch (error) {
    console.error("Failed to resolve model ID:", error);
    throw error;
  }
}

// Calendar operations for Today page
export async function requestCalendarPermission(): Promise<PermissionStatus> {
  try {
    return await invoke<PermissionStatus>("request_calendar_permission");
  } catch (error) {
    console.error("Failed to request calendar permission:", error);
    throw error;
  }
}

export async function getCalendarList(): Promise<Calendar[]> {
  try {
    return await invoke<Calendar[]>("get_calendar_list");
  } catch (error) {
    console.error("Failed to get calendar list:", error);
    throw error;
  }
}

export async function getEventsForDate(
  calendarIds: string[],
  date: string,
): Promise<CalendarEvent[]> {
  try {
    return await invoke<CalendarEvent[]>("get_events_for_date", {
      calendarIds,
      date,
    });
  } catch (error) {
    console.error("Failed to get events for date:", error);
    throw error;
  }
}

export async function openCalendarSettings(): Promise<void> {
  try {
    await invoke<void>("open_calendar_settings");
  } catch (error) {
    console.error("Failed to open calendar settings:", error);
    throw error;
  }
}

// Today page task queries
export async function getTasksScheduledForDate(date: string): Promise<Task[]> {
  try {
    return await invoke<Task[]>("get_tasks_scheduled_for_date", { date });
  } catch (error) {
    console.error("Failed to get tasks scheduled for date:", error);
    throw error;
  }
}

export async function getRecentlyEditedTasks(hoursAgo: number): Promise<Task[]> {
  try {
    return await invoke<Task[]>("get_recently_edited_tasks", { hoursAgo });
  } catch (error) {
    console.error("Failed to get recently edited tasks:", error);
    throw error;
  }
}

// Update task scheduled date
export async function updateTaskScheduledDate(
  taskId: number,
  scheduledDate: string | null,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    "UPDATE tasks SET scheduled_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [scheduledDate, taskId],
  );
}
