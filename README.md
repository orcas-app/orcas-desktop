# Orcas

This project is an app to manage the delegation of work to AI agents. It is a work in progress and is available, as is, for feedback and experimentation.

## Workflow

### Structure

The task hierarchy has three levels:
- **Space** - a group of tasks that share common context. The space concept is used to help both the user and agents understand context within a limited scope. Each space has a shared context document (similar to CLAUDE.md) visible to all agents working within it.
- **Task** - Discrete pieces of work that the user will review the output from
- **Subtask** - Steps to complete the task. The agent managing the task will execute the subtasks autonomously (or delegate them to other agents)

### Views

The app opens to the **Today** page by default, which shows:
- Today's calendar events (via macOS EventKit integration)
- Tasks scheduled for today or recently edited
- A built-in chat interface for discussing your agenda with an AI agent

From the sidebar, you can navigate to:
- **Today** - Agenda view with calendar events and tasks for the day
- **Spaces** - Each space shows its tasks; select a task to view details, collaborate with agents via chat, and review agent-authored documents
- **Agents** - Manage AI agents (custom prompts, model selection, web search)
- **Settings** - Configure API keys and provider selection

## Documentation

For detailed visual documentation of the application's architecture and user flows, see:
- **[User Flows & Architecture](docs/USER_FLOWS.md)** - Comprehensive mermaid diagrams covering all core user workflows, data models, and system architecture

Additional technical documentation:
- [MCP Integration](docs/README_MCP.md) - Model Context Protocol setup and agent tools
