-- Rename projects table to spaces
ALTER TABLE projects RENAME TO spaces;

-- Rename project_id column to space_id in tasks table
ALTER TABLE tasks RENAME COLUMN project_id TO space_id;

-- Drop old index and create new one
DROP INDEX IF EXISTS idx_tasks_project_id;
CREATE INDEX IF NOT EXISTS idx_tasks_space_id ON tasks(space_id);
