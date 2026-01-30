# Orcas

This project is an app to manage the delegation of work to AI agents. It is a work in progress and is availalbe, as is, for feedback and experimenation.

## Workflow

### Structure

The task heirarchy has three levels
- Project - a group of tasks that share common context. The project concept is used to help both the user and agents understand context within a limited scope
- Task - Descrete pieces of work that the user will review the output from
- Sub-task - Steps to complete the task. The agent managing the task will execute the sub-tasks autonomously (or delegate them to other agents)

### Views

There are two 'views' available of tasks
- A kanban style biew of each task within a specific project
- An aggregated view of tasks based on their status and next steps (seen in the Home, For Review and Next pages)

Both views lead to the same task-level view.

## Documentation

For detailed visual documentation of the application's architecture and user flows, see:
- **[User Flows & Architecture](docs/USER_FLOWS.md)** - Comprehensive mermaid diagrams covering all core user workflows, data models, and system architecture

Additional technical documentation:
- [MCP Integration](docs/README_MCP.md) - Model Context Protocol setup and agent tools
- [Development Todo](docs/todo.md) - Current development tasks and priorities
