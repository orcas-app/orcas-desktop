# Implement Message History Compacting

## Issue
Chat message history grows indefinitely, consuming increasing tokens with each API call. Implement compaction to summarize old messages and reduce token usage.

## Context
- Location: `src/components/ChatInterface.tsx`
- Current: All messages are sent in every API call (lines ~445-467)
- Problem: Long conversations lead to high token costs and potential context limit issues

## Solution Approaches

### Option 1: Rolling Window
Keep only the last N messages:
```tsx
const KEEP_LAST_N_MESSAGES = 20;
const recentMessages = messages.slice(-KEEP_LAST_N_MESSAGES);
```

### Option 2: Intelligent Summarization
- Keep first message (context setting)
- Keep last N messages (recent context)
- Summarize middle messages using AI

### Option 3: Token-Based Limit
- Estimate tokens for each message
- Keep adding messages from newest to oldest until token limit
- Optionally summarize dropped messages

## Recommended Approach
Hybrid: Token-based with optional summarization

```tsx
const MAX_HISTORY_TOKENS = 4000; // Reserve tokens for history
const SUMMARIZATION_THRESHOLD = 10; // Messages to summarize at once

async function compactMessageHistory(
  messages: ChatMessage[],
  maxTokens: number
): Promise<ChatMessage[]> {
  // Always keep system context and last 5 messages
  const keepLast = 5;
  const recentMessages = messages.slice(-keepLast);
  const olderMessages = messages.slice(0, -keepLast);

  // Estimate tokens for recent messages
  const recentTokens = estimateMessageTokens(recentMessages);

  if (recentTokens > maxTokens) {
    // Even recent messages exceed limit, just use last 3
    return messages.slice(-3);
  }

  // Try to fit older messages
  const availableTokens = maxTokens - recentTokens;
  const fittingOlderMessages = selectMessagesUnderTokenLimit(
    olderMessages,
    availableTokens
  );

  // If we're dropping messages, add a summary
  if (fittingOlderMessages.length < olderMessages.length) {
    const droppedMessages = olderMessages.slice(
      0,
      olderMessages.length - fittingOlderMessages.length
    );
    const summary = await summarizeMessages(droppedMessages);
    return [summary, ...fittingOlderMessages, ...recentMessages];
  }

  return messages;
}
```

## Implementation Tasks

### Phase 1: Basic Token Limiting
- [ ] Add token estimation utility function
- [ ] Implement rolling window based on token count
- [ ] Add configuration for max history tokens
- [ ] Test with long conversations

### Phase 2: Smart Compaction
- [ ] Identify important messages (user questions, key decisions)
- [ ] Implement message summarization (optional AI call)
- [ ] Add "conversation summary" message type
- [ ] Show indicator in UI when history is compacted

### Phase 3: User Controls (Optional)
- [ ] Add setting for max history tokens
- [ ] Add button to "compact history now"
- [ ] Show token count in chat UI
- [ ] Allow pinning important messages

## Acceptance Criteria
- [ ] Message history stays under token limit
- [ ] Recent context is always preserved
- [ ] Long conversations don't cause API errors
- [ ] Compaction is transparent to user or clearly indicated
- [ ] Performance impact is minimal (compaction is fast)

## Notes
- Start with simple rolling window (Phase 1 only)
- Add summarization later if needed
- Consider adding this to agent system message instead of losing messages entirely
- Monitor token usage before/after to measure savings
