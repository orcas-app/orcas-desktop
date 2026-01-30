-- Add agent_id field to subtasks table
-- This allows subtasks to be associated with specific AI agents

ALTER TABLE subtasks ADD COLUMN agent_id INTEGER;

-- Add foreign key constraint to reference agents table
-- Note: SQLite doesn't support adding foreign key constraints to existing tables directly
-- So we'll create the constraint when the migration runs, but it won't be enforced on existing data

-- Add index for better performance when querying subtasks by agent
CREATE INDEX IF NOT EXISTS idx_subtasks_agent_id ON subtasks(agent_id);