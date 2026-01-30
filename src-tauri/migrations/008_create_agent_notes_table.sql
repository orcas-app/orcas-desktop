-- Create agent_notes table to store agent notes in database instead of files
CREATE TABLE IF NOT EXISTS agent_notes (
    task_id INTEGER PRIMARY KEY,
    agent_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_notes_task_id ON agent_notes(task_id);