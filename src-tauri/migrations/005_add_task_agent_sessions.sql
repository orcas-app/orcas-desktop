-- Add task_agent_sessions table to track which agents have been used with tasks
-- This enables restoring the last used agent when returning to a task

CREATE TABLE IF NOT EXISTS task_agent_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE,
    UNIQUE(task_id, agent_id) -- One session record per task-agent combination
);

-- Index for better performance when querying sessions
CREATE INDEX IF NOT EXISTS idx_task_agent_sessions_task_id ON task_agent_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_agent_sessions_last_used ON task_agent_sessions(last_used_at);