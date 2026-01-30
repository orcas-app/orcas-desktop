# Orcas Agent Manager - Guide for AI Assistants

This document provides essential context for AI assistants (like Claude) working on the Orcas Agent Manager codebase.

## What is Orcas?

Orcas is a desktop application for managing AI agent workflows. It enables users to:
- Organize work in a hierarchical structure (Projects → Tasks → Subtasks)
- Delegate tasks to AI agents (powered by Claude or other LLMs)
- Collaborate with AI on shared documents with review workflows
- Manage multiple specialized agents with custom prompts

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Tauri 2 (Rust)
- **Database**: SQLite
- **AI Integration**: Anthropic SDK, LiteLLM support
- **UI Framework**: Primer React (GitHub's design system)
- **Agent Tools**: Model Context Protocol (MCP)

## Key Documentation

### User Flows and Architecture
📊 **[User Flows Documentation](docs/USER_FLOWS.md)** - Comprehensive visual diagrams showing:
- Application architecture overview
- Task management workflows
- AI agent planning and interaction flows
- Document edit lock and review mechanisms
- Agent and provider configuration flows
- Data model and state management

This is the best resource for understanding how the application works from a user's perspective.

### Technical Documentation
- [MCP Integration](docs/README_MCP.md) - Model Context Protocol setup and agent tools
- [Chat Interface Review](docs/CHAT_INTERFACE_REVIEW.md) - Chat implementation details
- [Development Todo](docs/todo.md) - Current development tasks and priorities

## Project Structure

```
agent-manager/
├── src/                    # Frontend React application
│   ├── components/         # React components (TaskDetail, ChatInterface, etc.)
│   ├── api.ts             # Tauri command wrappers
│   └── App.tsx            # Main application component
├── src-tauri/             # Tauri Rust backend
│   └── src/
│       ├── lib.rs         # Tauri commands and setup
│       ├── chat.rs        # AI provider integration
│       ├── planning_agent.rs  # Task planning logic
│       ├── edit_locks.rs  # Document concurrency control
│       ├── task_notes.rs  # Document persistence
│       └── providers/     # AI provider implementations
├── mcp-server/            # Model Context Protocol server (TypeScript)
└── docs/                  # Documentation
```

## Core Concepts

### Data Hierarchy
```
Project (container)
  └─ Task (work unit requiring review)
      └─ Subtask (executable step, can be delegated to agents)
```

### Task Status Flow
`todo` → `in_progress` → `for_review` → `done`

### Document Collaboration
- Tasks have a shared markdown document (task_notes)
- Users and agents can edit the document
- Edit locks prevent concurrent modifications
- Users review and approve/reject agent changes via diff view

### Agent System
- Agents are AI assistants with custom prompts and models
- System agents (like Planning Agent) handle specific workflows
- User-created agents can be specialized for different tasks
- Agents interact via chat and can use MCP tools to read/write documents

## Common Development Tasks

### Adding a New Tauri Command
1. Define command in `src-tauri/src/lib.rs`
2. Add wrapper function in `src/api.ts`
3. Use from React components via `invoke()`

### Adding a New React Component
1. Create component in `src/components/`
2. Import in appropriate parent component or App.tsx
3. Add routing if needed in App.tsx

### Database Schema Changes
1. Add migration in `src-tauri/src/lib.rs` (migrations array)
2. Update relevant query functions
3. Test migration path from previous version

### Adding MCP Tools
1. Update `mcp-server/index.ts` with new tool definition
2. Agents automatically get access to new tools
3. Tools should be task-context aware (use task_id)

## Development Workflow

### Running the Application
```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Working with the Database
- SQLite database location: `~/.local/share/com.orcas.dev/` (Linux)
- Schema defined in `src-tauri/src/lib.rs` migrations
- Direct DB access for debugging: `sqlite3 <path-to-db>`

### Testing AI Features
- Requires valid API key (Anthropic or LiteLLM)
- Configure in Settings → Select Provider → Enter Credentials
- MCP server starts automatically when needed

## Important Architectural Patterns

### Event-Driven UI Updates
The application uses Tauri events for real-time updates:
- `task-planning-progress` - Planning agent progress
- `task-planning-complete` - Planning finished
- `task-planning-cancelled` - Planning cancelled
- `agent-edit-lock-changed` - Document lock state changed

Components listen for these events and update UI accordingly.

### Provider Abstraction
The `src-tauri/src/providers/` directory contains provider implementations:
- `anthropic.rs` - Direct Anthropic API
- `litellm.rs` - LiteLLM gateway
- `mod.rs` - Provider trait and factory

This allows easy addition of new AI providers.

### Concurrency Control
Edit locks prevent race conditions:
- Only one actor (user or agent) can edit at a time
- Locks store original content for diff view
- Stale locks automatically cleaned up (60s background task)
- Review workflow ensures user approval of agent changes

## Common Pitfalls

1. **Don't skip edit lock checks** - Always verify lock status before modifying task_notes
2. **Handle async properly** - Planning agent runs in background, use events for updates
3. **Validate provider config** - Check that API keys are set before making AI calls
4. **Clean up MCP server** - Stop server process on app exit
5. **Preserve message history** - ChatInterface uses localStorage, don't clear without user action

## Getting Help

- Check the [User Flows documentation](docs/USER_FLOWS.md) for visual workflow diagrams
- Review existing components for patterns and conventions
- Database schema is in `src-tauri/src/lib.rs` migrations
- MCP tools are defined in `mcp-server/index.ts`

## Contributing Guidelines

When making changes:
1. Follow existing code style and patterns
2. Update documentation if adding new features
3. Test database migrations thoroughly
4. Ensure edit locks work correctly for any document-modifying features
5. Add event listeners for any new async operations
6. Update this guide if adding new architectural patterns

---

Last updated: 2026-01-27
