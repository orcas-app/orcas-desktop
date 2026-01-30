-- Initial schema for kanban project tracker
-- Three-level hierarchy: Project -> Task -> Sub-task

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6', -- Default blue color
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo', -- 'todo', 'in_progress', 'done'
    priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
    due_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- Sub-tasks table
CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_completed ON subtasks(completed);

-- Sample data for development
INSERT OR IGNORE INTO projects (id, title, description, color) VALUES 
(1, 'Sample Project', 'A sample project to demonstrate the kanban board', '#3B82F6');

INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, priority) VALUES 
(1, 1, 'Setup Database', 'Configure SQLite database with Tauri', 'done', 'high'),
(2, 1, 'Create UI Components', 'Build React components for kanban board', 'in_progress', 'medium'),
(3, 1, 'Add Drag & Drop', 'Implement drag and drop functionality', 'todo', 'low');

INSERT OR IGNORE INTO subtasks (task_id, title, completed) VALUES 
(1, 'Install Tauri SQL plugin', TRUE),
(1, 'Create database schema', TRUE),
(2, 'Create ProjectCard component', FALSE),
(2, 'Create TaskCard component', FALSE),
(3, 'Research drag and drop libraries', FALSE);