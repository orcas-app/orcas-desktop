# Plan: Web Search — LiteLLM Support & Provider-Aware Tool Construction

## Research Findings

### Anthropic API Version
- `2023-06-01` is still the latest and only active version. **No update needed.**
- Web search (`web_search_20250305`) graduated to GA — no beta header required.

### LiteLLM Web Search
- **Model-agnostic approach**: Use `web_search_options` as a top-level request body parameter
  - `{ "search_context_size": "low" | "medium" | "high" }`
  - LiteLLM translates this into provider-native formats (Anthropic `max_uses`, Google `googleSearch`, OpenAI `web_search_preview`, etc.)
- LiteLLM uses `/v1/messages` (Anthropic format) in this codebase, but **also accepts `web_search_options`** and maps it internally.
- The Anthropic-native `web_search_20250305` tool type was historically rejected by LiteLLM for non-Anthropic providers.

## Current State

- DB has `web_search_enabled` column (migration 021) ✓
- TypeScript `Agent` type has `web_search_enabled` ✓
- Frontend UI toggle in AgentsManager ✓
- Frontend constructs `web_search_20250305` tool in ChatInterface.tsx:511-522 ✓
- Frontend handles `pause_turn` and citation rendering ✓
- **Gap**: Rust `Agent` struct in `database.rs:82-88` missing `web_search_enabled`
- **Gap**: Hardcoded to Anthropic tool format — fails for LiteLLM with non-Anthropic models
- **Gap**: No model compatibility check for web search

## Implementation Plan

### Step 1: Add `web_search_enabled` to Rust Agent struct
**File**: `src-tauri/src/database.rs:82-88`

Add `web_search_enabled: bool` field to the `Agent` struct. This doesn't affect the chat flow directly but fixes the data model gap for any Rust-side code that queries agents.

### Step 2: Add provider type to `ProviderConfig` trait
**File**: `src-tauri/src/providers/mod.rs`

Add a `fn provider_type(&self) -> Provider` method to the `ProviderConfig` trait so the chat layer can know which provider is active without re-querying settings.

- `AnthropicConfig::provider_type()` → `Provider::Anthropic`
- `LiteLLMConfig::provider_type()` → `Provider::LiteLLM`

### Step 3: Move web search logic to Rust backend
**File**: `src-tauri/src/chat.rs`

Add a `web_search_enabled: Option<bool>` parameter to `send_chat_message`. When `true`:

- **Anthropic provider**: Inject `{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}` into the `tools` array (same as current frontend behavior).
- **LiteLLM provider**: Add `"web_search_options": {"search_context_size": "medium"}` as a top-level field in the request body. This is LiteLLM's model-agnostic approach that gets translated to the correct native format.

### Step 4: Update frontend to pass flag instead of constructing tool
**File**: `src/components/ChatInterface.tsx`

- Remove the `web_search_20250305` tool construction block (lines 510-522).
- Instead, pass `webSearchEnabled: agent.web_search_enabled` to `send_chat_message`.
- Update the `invoke("send_chat_message", {...})` call signature to include the new param.
- Keep all existing `pause_turn` handling and citation rendering unchanged.

### Step 5: Update `api.ts` (if needed)
**File**: `src/api.ts`

If there's a wrapper around `send_chat_message` in api.ts, update it. (Currently the invoke call is made directly in ChatInterface.tsx, so this may just need the TypeScript types aligned.)

### Step 6: Register updated command in lib.rs
**File**: `src-tauri/src/lib.rs`

Ensure the updated `send_chat_message` command signature is properly registered. Since Tauri commands auto-derive from function signatures, this should work automatically, but verify the command registration.

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/database.rs` | Add `web_search_enabled` to `Agent` struct |
| `src-tauri/src/providers/mod.rs` | Add `provider_type()` to trait |
| `src-tauri/src/chat.rs` | Add `web_search_enabled` param, provider-aware tool injection |
| `src/components/ChatInterface.tsx` | Remove tool construction, pass flag to backend |

## Out of Scope (per user direction)
- Planning agent web search support
- Configurable `max_uses`
- API version update (not needed)
