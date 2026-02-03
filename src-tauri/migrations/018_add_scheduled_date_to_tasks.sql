-- Add scheduled_date column to tasks table
-- This represents the date when the user plans to work on the task
ALTER TABLE tasks ADD COLUMN scheduled_date DATE;

-- Create index for better query performance on scheduled_date
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date ON tasks(scheduled_date);
