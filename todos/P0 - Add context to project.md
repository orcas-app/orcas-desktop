# Add Project Context

## Overview
Projects should have a shared context file (markdown) that functions like a CLAUDE.md file. This context provides agents with project-level knowledge including goals, architectural decisions, and summaries of completed work.

## Data Model

### Database Schema
Add new field to `projects` table:
- `context_markdown` (TEXT, nullable) - Stores the project context markdown content
- Initialize as NULL/empty string on project creation

### Storage
- Context stored directly in the database (like task_notes)
- No separate file system storage required initially
- Consider token count tracking for warnings

## User Flows

### 1. Project Creation
- When a new project is created, `context_markdown` is initialized as empty string
- No template or prompts - user adds content when needed

### 2. Manual Editing by User
- User clicks on context excerpt/preview on Project page
- Modal editor opens (similar to task notes editor)
- **Edit lock pattern applies** (prevent concurrent edits)
- **No review workflow** - changes save immediately
- Show warning if content exceeds ~2000 tokens

### 3. Agent Updates
Agents update context at significant milestones:
- **Task completion** - Summarize what was accomplished
- **Architectural decisions** - Document design choices made
- **Learning moments** - Record project-specific insights

**Update behavior:**
- Agents **rewrite sections** rather than append
- Agent should mention in response: "I've updated the project context with..."
- No user review required - updates save immediately
- Agent must acquire edit lock before updating

## Agent Integration

### Context Injection
Project context is injected into the **system prompt** at the start of each agent conversation:

```
# Project: {project_name}

{project_context_markdown}

---

{agent_prompt}
{current_task_context}
{tool_instructions}
```

**Implementation location:** [ChatInterface.tsx:398](src/components/ChatInterface.tsx#L398)

### Context Availability
When an agent is working on a task, it sees:
- ✅ Project context (from `projects.context_markdown`)
- ✅ Task notes (from `task_notes` table)
- ✅ Agent's custom prompt
- No deduplication initially

### New MCP Tool Required
Add tool for agents to update project context:

```typescript
{
  name: "update_project_context",
  description: "Update the shared project context markdown",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "number" },
      content: { type: "string" },
      summary: { type: "string", description: "Brief summary of changes" }
    },
    required: ["project_id", "content"]
  }
}
```

## UI/UX Specifications

### Project Page - Context Display

**Location:** Right side of Project page (existing layout)

**Collapsed State:**
- Show excerpt (first 2-3 lines or ~150 characters)
- Visual indicator it's clickable
- Display: "Project Context" header + preview
- If empty: Show placeholder "No project context yet. Click to add..."

**Interaction:**
- Click anywhere on excerpt → Opens modal editor
- Modal editor similar to task notes editor

**Modal Editor:**
- Full-screen or large modal
- Markdown editor with preview
- Save/Cancel buttons
- **Show warning badge if >2000 tokens**
- Edit lock indication (like task notes)

### Context Indicator
Consider showing token count or size indicator:
- Green: < 1500 tokens
- Yellow: 1500-2000 tokens
- Red: > 2000 tokens (with warning)

## Technical Implementation

### Backend (Rust/Tauri)

1. **Database Migration:**
   ```sql
   ALTER TABLE projects ADD COLUMN context_markdown TEXT;
   ```

2. **New Tauri Commands:**
   - `get_project_context(project_id) -> Result<String>`
   - `update_project_context(project_id, content) -> Result<()>`
   - `get_project_context_token_count(project_id) -> Result<usize>`

3. **Edit Lock Integration:**
   - Extend existing edit_locks system
   - Lock type: `project_context`
   - Lock key: `project_{id}_context`

### Frontend (React/TypeScript)

1. **API Wrappers** (`src/api.ts`):
   - `getProjectContext(projectId: number): Promise<string>`
   - `updateProjectContext(projectId: number, content: string): Promise<void>`
   - `getProjectContextTokenCount(projectId: number): Promise<number>`

2. **New Component:** `ProjectContextEditor`
   - Modal-based markdown editor
   - Token count display/warning
   - Edit lock handling
   - Save/cancel actions

3. **Update ChatInterface:**
   - Fetch project context when initializing chat
   - Inject into system prompt before agent prompt
   - Format: Clear markdown section with delimiter

### MCP Server (TypeScript)

Add `update_project_context` tool to `mcp-server/index.ts`:
- Call Tauri command to update context
- Handle edit locks
- Return success/error response

## Edge Cases & Considerations

### Token Limits
- Warn at 2000 tokens (leaves room for agent prompt + task context)
- Consider auto-summarization if exceeds limits (future enhancement)
- No hard limit initially - let users manage

### Concurrency
- Edit locks prevent race conditions
- Agent must acquire lock before updating
- Low risk since updates are infrequent

### Content Management
- No version history initially (can add later)
- No automatic cleanup/summarization (can add later)
- Agents should rewrite sections to keep concise, not just append

### Context Freshness
- Agent-driven updates keep context current
- User can manually refine/reorganize as needed
- No automatic staleness detection initially

## Best Practices (for agents)

When agents update context, they should:
- **Keep it concise** (<300 lines, ideally 50-100)
- **Focus on universal info** relevant to all/most tasks
- **Use references** (file:line) not code snippets
- **Structure clearly** with markdown headers
- **Avoid duplication** of what's in task notes

Suggested sections:
```markdown
# Project Goals
[High-level objectives]

# Architecture Decisions
[Key technical choices and rationale]

# Completed Work
[Summary of major milestones]

# Important Patterns
[Project-specific conventions to follow]
```

## Testing Checklist

- [ ] Create new project → context is empty
- [ ] User can open modal and edit context
- [ ] Edit locks prevent concurrent edits
- [ ] Changes save immediately (no review)
- [ ] Warning shows when >2000 tokens
- [ ] Agent receives context in system prompt
- [ ] Agent can update context via MCP tool
- [ ] Agent updates acquire edit lock properly
- [ ] Context persists across sessions
- [ ] Multiple tasks in same project see same context

## References
- [CLAUDE.md Best Practices](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [ChatInterface Implementation](src/components/ChatInterface.tsx)
- [Edit Locks System](src-tauri/src/edit_locks.rs)
- [MCP Server](mcp-server/index.ts) 