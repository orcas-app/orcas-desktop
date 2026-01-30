-- Create task_notes table for shared user-agent collaborative notes workspace
-- This replaces the agent-specific agent_notes table with a shared document model
CREATE TABLE IF NOT EXISTS task_notes (
    task_id INTEGER PRIMARY KEY,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);
