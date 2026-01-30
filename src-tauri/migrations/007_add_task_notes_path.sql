-- Add notes file path to tasks table for agent notes functionality
ALTER TABLE tasks ADD COLUMN notes_file_path TEXT;

-- Index for notes file path lookups
CREATE INDEX IF NOT EXISTS idx_tasks_notes_file_path ON tasks(notes_file_path);