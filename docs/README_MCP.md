# Agent Notes MCP Server

This implementation adds task-specific Agent Notes functionality to the Kanban app using a local MCP (Model Context Protocol) server.

## What's Implemented

### 1. Database Schema Changes
- Added `notes_file_path` column to the `tasks` table to track Agent_Notes.md file locations
- Migration `007_add_task_notes_path.sql` adds the necessary database schema

### 2. Agent Notes MCP Server (`src/mcp-servers/agent-notes-server.ts`)
A Node.js MCP server that provides three tools for agents/LLMs to manage task-specific notes:

- **`read_task_notes`**: Read the Agent_Notes.md file for a specific task
- **`write_task_notes`**: Write or append content to Agent_Notes.md (supports both replace and append operations)
- **`check_task_notes_exists`**: Check if an Agent_Notes.md file exists for a task

### 3. File Storage Structure
- Each task's notes are stored in: `agent-notes/{task_id}/Agent_Notes.md`
- This keeps notes organized per task and prevents conflicts

### 4. Tauri Backend Integration
- `start_mcp_server()`: Spawns the MCP server process using npx tsx
- `stop_mcp_server()`: Terminates the MCP server process
- `update_task_notes_path()`: Generates the notes file path for a task
- `get_task_notes_path()`: Retrieves the notes file path for a task

### 5. Frontend API Functions (`src/api.ts`)
- `startMCPServer()` / `stopMCPServer()`: Control MCP server lifecycle
- `updateTaskNotesPath()` / `getTaskNotesPath()`: Manage database notes paths
- `readAgentNotes()`: Read notes file content
- `checkAgentNotesExists()`: Check if notes file exists

### 6. UI Integration (`src/components/TaskDetail.tsx`)
- Agent Notes section appears in task detail view when notes exist
- Expandable/collapsible interface with file icon
- Renders markdown content using ReactMarkdown
- Shows loading states and handles empty states

## How It Works

1. **For LLMs/Agents**: When an agent is working on a task, it can use the MCP tools to:
   - Check if notes already exist for the task
   - Read existing notes to understand context
   - Write or append new insights, findings, or progress updates

2. **For Users**: In the task detail view:
   - If an agent has created notes for a task, a "Agent Notes" section appears
   - Click to expand and view the markdown-formatted notes
   - Notes provide insight into what the agent discovered or worked on

3. **File Management**:
   - Notes are automatically organized by task ID
   - Each task gets its own subdirectory under `agent-notes/`
   - Files use standard Markdown format for readability

## Usage Example

When an agent works on a task, it might:

```typescript
// Check if notes exist
const exists = await mcp.call("check_task_notes_exists", { task_id: 123 });

// Read existing context
const notes = await mcp.call("read_task_notes", { task_id: 123 });

// Add findings
await mcp.call("write_task_notes", {
  task_id: 123,
  content: "## Investigation Results\n\nFound issue in authentication module...",
  operation: "append"
});
```

## Dependencies Added
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `@types/node`: Node.js type definitions
- `tsx`: TypeScript execution for the MCP server
- `react-markdown`: Markdown rendering in the UI

## Development Notes
- The MCP server runs as a separate Node.js process managed by Tauri
- Database operations are handled in the frontend for simplicity
- File operations use Tauri's fs plugin for security
- All notes are stored locally within the app's data directory
