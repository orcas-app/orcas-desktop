/**
 * Token estimation and message compaction utilities.
 *
 * Used to keep the conversation history sent to the API within a token budget
 * so that long chats don't blow past context limits or rack up unnecessary cost.
 */

export interface SimpleMessage {
  role: string;
  content: string;
}

/** Rough token estimate: ~4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const DEFAULT_MAX_TOKENS = 80_000;
const KEEP_LAST_N = 5;

/**
 * Compact a list of messages so the total estimated token count stays within
 * `maxTokens`.
 *
 * Strategy (rolling window, newest-first):
 *  1. Always keep the last `KEEP_LAST_N` messages.
 *  2. Walk older messages from newest to oldest, adding each one while the
 *     cumulative token count stays under `maxTokens`.
 *  3. If any older messages were dropped, prepend a system-style notice so the
 *     model knows context was truncated.
 */
export function compactMessages(
  messages: SimpleMessage[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
): SimpleMessage[] {
  if (messages.length === 0) return messages;

  // Split into "recent" (always kept) and "older" pools.
  const splitIndex = Math.max(0, messages.length - KEEP_LAST_N);
  const recentMessages = messages.slice(splitIndex);
  const olderMessages = messages.slice(0, splitIndex);

  // Tokens consumed by the recent tail.
  let usedTokens = 0;
  for (const msg of recentMessages) {
    usedTokens += estimateTokens(msg.content);
  }

  // If even the recent messages exceed the budget, just return them as-is.
  // (We never drop the last N messages.)
  if (usedTokens >= maxTokens || olderMessages.length === 0) {
    return recentMessages;
  }

  // Fill from the older pool, newest-first, until the budget is spent.
  const remainingBudget = maxTokens - usedTokens;
  const keptOlder: SimpleMessage[] = [];
  let olderTokens = 0;

  for (let i = olderMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(olderMessages[i].content);
    if (olderTokens + msgTokens > remainingBudget) break;
    olderTokens += msgTokens;
    keptOlder.unshift(olderMessages[i]);
  }

  const droppedCount = olderMessages.length - keptOlder.length;

  if (droppedCount > 0) {
    const notice: SimpleMessage = {
      role: "user",
      content: `[Note: ${droppedCount} earlier message${droppedCount === 1 ? " was" : "s were"} omitted to stay within the context window.]`,
    };
    return [notice, ...keptOlder, ...recentMessages];
  }

  return [...keptOlder, ...recentMessages];
}
