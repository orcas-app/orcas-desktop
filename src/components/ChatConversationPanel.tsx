import { useRef } from "react";
import type { ChatMessage } from "../types";

interface ChatConversationPanelProps {
  messages: ChatMessage[];
  currentStreamingMessage: ChatMessage | null;
  agentName: string;
  panelState: "hidden" | "collapsed" | "expanded";
  onToggleExpand: () => void;
}

function ChatConversationPanel({
  messages,
  currentStreamingMessage,
  agentName,
  panelState,
  onToggleExpand,
}: ChatConversationPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (panelState === "hidden") return null;

  const maxHeight = panelState === "expanded" ? 600 : 194;

  return (
    <div
      className="chat-conversation-area"
      style={{ maxHeight, transition: "max-height 0.3s ease" }}
    >
      {/* Toggle button */}
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <button className="chat-panel-toggle" onClick={onToggleExpand} type="button">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              transform: panelState === "expanded" ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <path
              d="M4 10L8 6L12 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="chat-conversation-messages"
      >
        {messages.map((message) => {
          const contentText =
            typeof message.content === "string"
              ? message.content
              : Array.isArray(message.content)
                ? message.content
                    .filter((block: any) => block.type === "text")
                    .map((block: any) => block.text)
                    .join("")
                : "";

          return message.role === "user" ? (
            <div key={message.id} className="chat-msg-user">
              {contentText}
            </div>
          ) : (
            <div key={message.id} className="chat-msg-agent">
              <AgentMessageContent content={contentText} />
            </div>
          );
        })}

        {currentStreamingMessage && (
          <div className="chat-msg-agent">
            <AgentMessageContent
              content={
                typeof currentStreamingMessage.content === "string"
                  ? currentStreamingMessage.content || " "
                  : " "
              }
            />
            {currentStreamingMessage.streaming && (
              <div className="chat-streaming-indicator">
                <span>{agentName} is thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Small helper to avoid importing ReactMarkdown in the panel
// TodayPage already imports it, so this component will be used by TodayPage
import ReactMarkdown from "react-markdown";

function AgentMessageContent({ content }: { content: string }) {
  return <ReactMarkdown>{content}</ReactMarkdown>;
}

export default ChatConversationPanel;
