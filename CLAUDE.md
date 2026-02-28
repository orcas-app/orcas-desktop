# Orcas Agent Manager - Guide for AI Assistants

## What is Orcas?

A macOS desktop app for managing AI agent workflows. Users organize work in Spaces > Tasks > Subtasks, delegate to AI agents, and collaborate on shared documents with review workflows.

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite 7
- **Backend**: Tauri 2 (Rust)
- **Database**: SQLite (21 migrations in `src-tauri/src/lib.rs`)
- **AI Integration**: Anthropic SDK, LiteLLM support
- **UI Framework**: Primer React (GitHub's design system)
- **Agent Tools**: Model Context Protocol (MCP)
- **Platform Features**: macOS calendar integration (EventKit)

IMPORTANT: The `<Box>` element is deprecated. NEVER INTRODUCE IT IN NEW CODE.

## Project Structure

```
orcas-desktop/
├── src/                        # Frontend React application
│   ├── App.tsx                 # Main app component, routing
│   ├── api.ts                  # Tauri command wrappers
│   ├── types.ts                # TypeScript interfaces
│   ├── providers.ts            # Provider configuration
│   ├── components/             # React components
│   │   ├── ChatInterface.tsx   # AI chat with streaming + MCP tools
│   │   ├── AgentsManager.tsx   # Agent CRUD
│   │   ├── TaskDetail.tsx      # Task view with subtasks
│   │   ├── PlanCard.tsx        # Task planning display
│   │   ├── SpaceHome.tsx       # Space overview
│   │   ├── AgendaView.tsx      # Calendar agenda
│   │   ├── CalendarSettings.tsx
│   │   ├── Settings.tsx        # App settings (API keys, provider)
│   │   ├── TodayPage.tsx       # Today/agenda page
│   │   ├── TodayTaskList.tsx
│   │   ├── AgentSelector.tsx
│   │   ├── EventPopover.tsx
│   │   ├── StatusChip.tsx
│   │   └── UpdateNotification.tsx
│   ├── utils/                  # Utilities
│   │   ├── retry.ts            # Exponential backoff
│   │   ├── tokenEstimation.ts  # Token counting
│   │   └── videoConferencing.ts
│   └── mcp-servers/            # In-process MCP server
│       ├── agent-notes-server.ts
│       └── database-utils.ts
├── src-tauri/                  # Tauri Rust backend
│   └── src/
│       ├── main.rs             # Entry point
│       ├── lib.rs              # Tauri commands, migrations, MCP lifecycle
│       ├── chat.rs             # Chat message handling + provider routing
│       ├── planning_agent.rs   # Autonomous task planning
│       ├── edit_locks.rs       # Document concurrency control
│       ├── task_notes.rs       # Task document persistence
│       ├── database.rs         # Data model structs
│       ├── settings.rs         # Settings CRUD (global DB pool)
│       ├── space_context.rs    # Space-level context for AI
│       ├── calendar.rs         # macOS EventKit integration
│       └── providers/
│           └── mod.rs          # Provider trait, Anthropic + LiteLLM configs
├── docs/                       # Documentation
│   ├── USER_FLOWS.md           # Visual workflow diagrams (best overview)
│   ├── README_MCP.md           # MCP setup and tools
│   └── CHAT_INTERFACE_REVIEW.md
└── .beads/                     # Issue tracking (bd command)
```

## Core Concepts

### Data Hierarchy
```
Space (container, formerly "Project")
  └─ Task (work unit requiring review)
      └─ Subtask (executable step, can be delegated to agents)
```

### Task Status Flow
`todo` → `in_progress` → `for_review` → `done`

### Document Collaboration
- Tasks have shared markdown documents (`task_notes` table)
- Edit locks prevent concurrent modifications (`agent_edit_locks` table)
- Locks store original content for diff view
- Users review and approve/reject agent changes

### Agent System
- Agents have custom prompts, model selection, and optional web search
- System agents (Planning Agent with `system_role='planning'`) handle specific workflows
- Agents interact via chat and use MCP tools to read/write documents
- Agent-task associations tracked in `task_agent_sessions` table

### Database Tables
`spaces`, `tasks`, `subtasks`, `agents`, `task_agent_sessions`, `agent_notes`, `task_notes`, `settings`, `agent_edit_locks`

## Common Development Tasks

### Adding a New Tauri Command
1. Define command in `src-tauri/src/lib.rs`
2. Add wrapper function in `src/api.ts`
3. Use from React components via `invoke()`

### Adding a New React Component
1. Create component in `src/components/`
2. Import in appropriate parent component or `App.tsx`

### Database Schema Changes
1. Add migration in `src-tauri/src/lib.rs` (migrations array, currently 21)
2. Update relevant query functions
3. Test migration path from previous version

### Adding MCP Tools
1. Update `src/mcp-servers/agent-notes-server.ts` with new tool definition
2. Tools are: `read_task_notes`, `write_task_notes`, `manage_subtasks`, `read_space_context`, `get_task_details`

## Development Workflow

```bash
npm install          # Install dependencies
npm run tauri dev    # Development mode
npm run tauri build  # Production build
```

### Database
- macOS location: `~/Library/Application Support/com.orcas.dev/`
- Schema defined in `src-tauri/src/lib.rs` migrations
- Debug: `sqlite3 <path-to-db>`

## Architectural Patterns

### Event-Driven UI Updates
- `task-planning-progress` - Planning agent progress
- `task-planning-complete` - Planning finished
- `task-planning-cancelled` - Planning cancelled
- `agent-edit-lock-changed` - Document lock state changed
- `calendar-permission-changed` - Calendar access changed

### Provider Abstraction
`src-tauri/src/providers/mod.rs` defines the `Provider` enum (Anthropic, LiteLLM) with:
- Model listing and snapshot resolution (e.g., `claude-sonnet-4` → `claude-sonnet-4-20250514`)
- Tool capability detection per model
- Extensible trait-based design

### Concurrency Control
- Only one actor (user or agent) can edit task notes at a time
- Stale locks auto-cleaned (60s background task)
- Review workflow ensures user approval of agent changes

## Common Pitfalls

1. **Don't skip edit lock checks** - Always verify lock status before modifying task_notes
2. **Handle async properly** - Planning agent runs in background, use events for updates
3. **Validate provider config** - Check API keys are set before AI calls
4. **Clean up MCP server** - Stop server process on app exit
5. **Preserve message history** - ChatInterface uses localStorage, don't clear without user action

## Issue Tracking

Use `bd` (beads) for all issue tracking:

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Session Completion

Work is NOT complete until `git push` succeeds.

1. File issues for remaining work (`bd create`)
2. Run quality gates if code changed
3. Close finished issues (`bd close`)
4. Push:
   ```bash
   git pull --rebase && bd sync && git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds


