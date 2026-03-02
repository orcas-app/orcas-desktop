import { useRef, useEffect } from "react";
import { Spinner } from "@primer/react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, ContentBlock } from "../types";

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentStreamingMessage: ChatMessage | null;
  agentName: string;
  renderMessageContent?: (content: string, messageId: string) => React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  messagesEndRef?: React.RefObject<HTMLDivElement | null>;
  emptyState?: React.ReactNode;
}

function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");
  }
  return "";
}

function ChatMessageList({
  messages,
  currentStreamingMessage,
  agentName,
  renderMessageContent,
  containerRef,
  messagesEndRef,
  emptyState,
}: ChatMessageListProps) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const internalEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = containerRef || internalContainerRef;
  const endRef = messagesEndRef || internalEndRef;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentStreamingMessage]);

  const defaultEmptyState = (
    <div className="chat-conversation-empty">
      <div className="chat-conversation-empty-icon">💬</div>
      <h4>Start a conversation with {agentName}</h4>
      <p>Ask questions, get feedback, or discuss your tasks. I&apos;m here to help!</p>
    </div>
  );

  const isEmpty = messages.length === 0 && !currentStreamingMessage;

  return (
    <div className="chat-conversation-area">
      {isEmpty ? (
        emptyState || defaultEmptyState
      ) : (
        <div ref={scrollRef} className="chat-conversation-messages">
          {messages.map((message) => {
            const contentText = extractTextContent(message.content);

            return message.role === "user" ? (
              <div key={message.id} className="chat-msg-user">
                {contentText}
              </div>
            ) : (
              <div key={message.id} className="chat-msg-agent">
                {renderMessageContent
                  ? renderMessageContent(contentText, message.id)
                  : <ReactMarkdown>{contentText}</ReactMarkdown>}
              </div>
            );
          })}

          {currentStreamingMessage && (
            <div className="chat-msg-agent">
              <ReactMarkdown>
                {extractTextContent(currentStreamingMessage.content) || " "}
              </ReactMarkdown>
              {currentStreamingMessage.streaming && (
                <div className="chat-streaming-indicator">
                  <Spinner size="small" />
                  <span>{agentName} is thinking...</span>
                </div>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

export default ChatMessageList;
export { extractTextContent };
