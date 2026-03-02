/**
 * Shared chat engine: send-and-loop logic for AI conversations.
 *
 * Encapsulates message compaction, API call with retry, tool-use loop
 * (tool_use + pause_turn), citation extraction, token usage accumulation,
 * and response length limits.
 */

import { invoke } from "@tauri-apps/api/core";
import { withRetry } from "./retry";
import { compactMessages } from "./tokenEstimation";
import type { ToolResult } from "./agentTools";

// ── Constants ───────────────────────────────────────────────────────────

const MAX_RESPONSE_LENGTH = 10_000;

// ── Types ───────────────────────────────────────────────────────────────

export interface ChatTurnConfig {
  modelName: string;
  systemPrompt: string;
  tools?: any[];
  apiKey?: string;
  maxTokens?: number;
}

export interface ChatTurnCallbacks {
  /** Called when accumulated text content changes. */
  onContentUpdate?: (content: string) => void;
  /** Execute a tool call; return the result. */
  executeTool?: (toolName: string, toolInput: any) => Promise<ToolResult>;
}

export interface ChatTurnResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function getMaxTokensForModel(modelName: string): number {
  const limits: Record<string, number> = {
    "claude-sonnet-4-5": 8192,
    "claude-opus-4-5": 16384,
  };
  return limits[modelName] || 8192;
}

function extractTextFromBlocks(blocks: any[]): string {
  return blocks
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

function extractCitations(blocks: any[]): { url: string; title: string }[] {
  const citations: { url: string; title: string }[] = [];
  for (const block of blocks) {
    if (block.type === "text" && block.citations) {
      for (const cite of block.citations) {
        if (cite.url && !citations.some((c) => c.url === cite.url)) {
          citations.push({ url: cite.url, title: cite.title || cite.url });
        }
      }
    }
  }
  return citations;
}

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Send a full chat turn: compacts history, calls the API, handles the
 * tool-use / pause_turn loop, and returns the final accumulated text.
 */
export async function sendChatTurn(
  config: ChatTurnConfig,
  conversationMessages: { role: string; content: any }[],
  callbacks: ChatTurnCallbacks = {},
): Promise<ChatTurnResult> {
  const maxTokens = config.maxTokens ?? getMaxTokensForModel(config.modelName);
  // compactMessages expects SimpleMessage[] (string content). The caller's
  // conversationMessages are all string-content at this point; the tool-result
  // array-content messages are only added to fullConversation below.
  const compactedMessages = compactMessages(
    conversationMessages as { role: string; content: string }[],
  );

  let accumulatedContent = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const callApi = (messages: any[]) =>
    withRetry(
      () =>
        invoke<string>("send_chat_message", {
          model: config.modelName,
          messages,
          system: config.systemPrompt,
          maxTokens,
          tools: config.tools,
          apiKey: config.apiKey,
        }),
      {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          console.log(`Retry attempt ${attempt} after error:`, error.message);
        },
      },
    );

  let responseText = await callApi(compactedMessages);
  let response: any = JSON.parse(responseText);
  totalInputTokens += response.usage?.input_tokens || 0;
  totalOutputTokens += response.usage?.output_tokens || 0;

  let fullConversation: { role: string; content: any }[] = [...compactedMessages];

  while (response.stop_reason === "tool_use" || response.stop_reason === "pause_turn") {
    // ── pause_turn (web search continuation) ──
    if (response.stop_reason === "pause_turn") {
      const pauseText = extractTextFromBlocks(response.content);
      if (pauseText) {
        accumulatedContent += pauseText;
        callbacks.onContentUpdate?.(accumulatedContent);
      }

      fullConversation.push({ role: "assistant", content: response.content });

      responseText = (await callApi(fullConversation)) as string;
      response = JSON.parse(responseText);
      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
      continue;
    }

    // ── tool_use ──
    const textContent = extractTextFromBlocks(response.content);
    const toolCalls = response.content.filter((b: any) => b.type === "tool_use");

    if (textContent) {
      accumulatedContent += textContent;
      callbacks.onContentUpdate?.(accumulatedContent);
    }

    const toolResults: any[] = [];
    for (const toolCall of toolCalls) {
      accumulatedContent += `\n\n*Using tool: ${toolCall.name}*\n`;
      callbacks.onContentUpdate?.(accumulatedContent);

      if (callbacks.executeTool) {
        try {
          const result = await callbacks.executeTool(toolCall.name, toolCall.input);
          const resultText = result.content.map((c: any) => c.text).join("\n");
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: resultText,
          });
          accumulatedContent += `*Tool result:* ${resultText}\n`;
        } catch (error) {
          console.error(`Error executing tool ${toolCall.name}:`, error);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            is_error: true,
            content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
          accumulatedContent += `*Tool error:* Failed to execute ${toolCall.name}\n`;
        }
      } else {
        // No executor provided — return error to the model
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          is_error: true,
          content: "Tool execution not available in this context.",
        });
      }

      callbacks.onContentUpdate?.(accumulatedContent);
    }

    fullConversation.push({ role: "assistant", content: response.content });
    fullConversation.push({ role: "user", content: toolResults });

    responseText = (await callApi(fullConversation)) as string;
    response = JSON.parse(responseText);
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;
  }

  // ── Final text ──
  const finalText = extractTextFromBlocks(response.content);
  accumulatedContent += finalText;

  // Citations
  const citations = extractCitations(response.content);
  if (citations.length > 0) {
    accumulatedContent +=
      "\n\n**Sources:**\n" +
      citations.map((c) => `- [${c.title}](${c.url})`).join("\n");
  }

  // Truncation guard
  if (accumulatedContent.length > MAX_RESPONSE_LENGTH) {
    accumulatedContent =
      accumulatedContent.substring(0, MAX_RESPONSE_LENGTH) +
      "\n\n[Response truncated due to length]";
  }

  callbacks.onContentUpdate?.(accumulatedContent);

  return {
    content: accumulatedContent,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
