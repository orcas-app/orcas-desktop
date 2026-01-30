-- Create table for tracking edit locks on agent notes
CREATE TABLE IF NOT EXISTS agent_edit_locks (
  task_id INTEGER PRIMARY KEY,
  locked_by TEXT NOT NULL CHECK(locked_by IN ('agent', 'user')),
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_content TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_edit_locks_task_id ON agent_edit_locks(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_edit_locks_locked_by ON agent_edit_locks(locked_by);
