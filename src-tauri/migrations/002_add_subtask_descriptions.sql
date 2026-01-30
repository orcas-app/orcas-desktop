-- Add descriptions to existing subtasks for testing expandable functionality

UPDATE subtasks SET description = 'Add the tauri-plugin-sql to the project dependencies and configure it in the Tauri app configuration. This enables SQLite database operations from the frontend.' WHERE id = 1;

UPDATE subtasks SET description = 'Design and implement the database schema with tables for projects, tasks, and subtasks. Include proper foreign key relationships and indexes for performance.' WHERE id = 2;

UPDATE subtasks SET description = 'Build a React component to display project information in a card format with title, description, and color indicator. Should be reusable across different views.' WHERE id = 3;

UPDATE subtasks SET description = 'Develop a card component for displaying individual tasks with status, priority, due date, and drag-and-drop capabilities for the kanban board.' WHERE id = 4;

UPDATE subtasks SET description = 'Evaluate different drag-and-drop libraries like react-beautiful-dnd, @dnd-kit, or native HTML5 drag API to determine the best solution for our kanban board.' WHERE id = 5;