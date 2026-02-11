# Fix LiteLLM Tool Use

## Issue
Tool calling does not work when using LiteLLM provider. This prevents agents from using MCP tools (read_task_notes, write_task_notes, etc.) when connected through LiteLLM.

## Root Causes
1. **Missing model capability validation**: The app allows selecting any model from LiteLLM without checking if it supports function calling
2. **Potential bug in tool passing**: Tools may not be formatted correctly for LiteLLM's API expectations

## Location
- Backend: `src-tauri/src/chat.rs` (lines 46-48 - where tools are added to request)
- Backend: `src-tauri/src/providers/mod.rs` (model fetching and validation)
- Frontend: Agent creation/editing UI (model selection)

## Implementation Tasks

### 1. Add Model Capability Validation
- [ ] Add `supports_tools` field to `ModelInfo` struct in `src-tauri/src/providers/mod.rs`
- [ ] Implement capability detection:
  - For Anthropic: All Claude models support tools (return true)
  - For LiteLLM: Check model metadata or maintain a known list of tool-capable models
- [ ] Filter out non-tool-capable models in agent setup UI
- [ ] Show warning/tooltip for models without tool support

### 2. Fix Tool Passing Implementation
- [ ] Verify LiteLLM expects Anthropic-style tool format
- [ ] Test with known tool-capable models (e.g., Claude models via LiteLLM)
- [ ] Add logging to see actual tool use requests/responses
- [ ] Handle tool_use responses correctly for LiteLLM

### 3. Testing
- [ ] Test with LiteLLM proxy pointing to Claude
- [ ] Test with LiteLLM proxy pointing to other tool-capable models
- [ ] Verify error messages are clear when tools aren't supported
- [ ] Test agent chat with tool calls end-to-end

## Notes
- LiteLLM supports the Anthropic Messages API format, so tool format should be compatible
- Some models (older GPT-3.5, non-Claude models) may not support function calling
- Need to prevent user confusion by only showing compatible models for agent creation
