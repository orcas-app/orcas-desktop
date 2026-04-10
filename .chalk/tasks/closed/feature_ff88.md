---
id: feature_ff88
title: Agent self-updating system prompt component
type: feature
status: closed
priority: 2
labels: []
blocked_by: []
parent: epic_81fd
created_at: 2026-03-22T02:54:46Z
updated_at: 2026-04-10T08:36:30Z
---
Background task where the CoS agent updates a component of its own system prompt based on learnings from conversations. Uses the background task framework to run after conversations and extract patterns about what works well, what the user prefers, and how to improve future interactions. The agent should only update a designated section of its prompt, not the full prompt.

## Plan

### Phase 1: Database & Storage
- [x] Add `updatable_prompt_section` column to agents table (new migration)
  - Created migration 026_add_updatable_prompt_section.sql
  - Registered in lib.rs migrations vector
- [x] Define delimiter pattern for updatable section (e.g., `<!-- UPDATABLE_START --> ... <!-- UPDATABLE_END -->`)
  - Used HTML comment delimiters: `<!-- UPDATABLE_SECTION_START -->` and `<!-- UPDATABLE_SECTION_END -->`
- [x] Update migration 024 to include delimiter markers in CoS agent prompt
  - Added "Learned Preferences" section with delimiters to Chief of Staff prompt

### Phase 2: API & Tool Implementation
- [x] Add `updateAgentPromptSection(agentId, newSection)` function in api.ts
  - Simple SQL UPDATE to agents table
- [x] Create `agentPromptSelfUpdateTask.ts` based on `contextSupplementationTask.ts`
  - Gathers task chat messages and notes
  - Tool: `update_agent_prompt_section` (validates 500-word limit)
  - System prompt instructs CoS to update its "Learned Preferences" section

### Phase 3: Trigger Integration
- [x] Modify TaskDetail.tsx cleanup useEffect to trigger agentPromptSelfUpdateTask
  - Added import for agentPromptSelfUpdateTask
  - Updated cleanup function to call executeBackgroundTask with agent prompt update
  - Added selectedAgent?.id to dependency array and context

### Phase 4: Testing & Validation
- [ ] Verify prompt section extraction/replacement works correctly
- [ ] Test word count limits on updatable section
- [ ] Verify CoS agent is updated after task conversation
- [ ] Check database state with `sqlite3`

## Implementation Summary

**Architecture:**
- Chief of Staff agent now has an updatable "Learned Preferences" section in its prompt
- After task conversations, a background task extracts learnings and updates this section
- The agent autonomously refines its own behavior patterns based on observed interactions
- Uses the existing background task framework (debouncing, concurrency guards, change detection)
- Maximum 500-word limit on the updatable section to prevent prompt bloat

**Files Created:**
- `src-tauri/migrations/026_add_updatable_prompt_section.sql` - Adds column to agents table
- `src/utils/agentPromptSelfUpdateTask.ts` - Background task definition (169 lines)
  - Gathers chat messages and task notes from localStorage
  - Instructs CoS to analyze patterns and update its learned preferences
  - Enforces 500-word limit via `update_agent_prompt_section` tool
  - Uses CoS agent (system_role='chief_of_staff')

**Files Modified:**
- `src-tauri/migrations/024_add_chief_of_staff_agent.sql` - Added delimiters:
  ```sql
  <!-- UPDATABLE_SECTION_START -->
  ## Learned Preferences
  (This section is automatically updated based on learnings from conversations.)
  <!-- UPDATABLE_SECTION_END -->
  ```
- `src-tauri/src/lib.rs` - Registered migration 26 in migrations vector (line 503-507)
- `src/api.ts` - Added `updateAgentPromptSection(agentId, newSection)` function
- `src/components/TaskDetail.tsx` - Integrated trigger on unmount (imports + useEffect)
- `src/types.ts` - Added `updatable_prompt_section?: string | null` to Agent interface

**Build Status:** ✓ TypeScript compiles without errors ✓ Rust compiles successfully

## Testing Checklist

- [ ] Deploy app with migration (database schema updates)
- [ ] Have a task conversation with an agent
- [ ] Navigate away from TaskDetail (should trigger background task)
- [ ] Check that CoS agent's updatable_prompt_section is updated:
  ```bash
  sqlite3 ~/Library/Application\ Support/com.orcas.dev/orcascore.db \
    "SELECT id, name, updatable_prompt_section FROM agents WHERE system_role='chief_of_staff';"
  ```
- [ ] Verify debounce: rapid navigation should skip second update (wait 5 min for next)
- [ ] Test word limit: have very long conversation, verify error handling if exceeded
- [ ] Check background_task_runs table for execution records:
  ```bash
  sqlite3 ~/Library/Application\ Support/com.orcas.dev/orcascore.db \
    "SELECT * FROM background_task_runs WHERE task_type='agent_prompt_self_update';"
  ```
- [ ] Subsequent conversations should reference updated preferences in CoS prompts

## Progress

Implementation complete. Ready for Phase 4 testing and validation.
