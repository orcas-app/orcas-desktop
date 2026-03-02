import { useState, useRef, useEffect } from "react";
import type { Agent } from "../types";

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  placeholder?: string;
  agents: Agent[];
  selectedAgent: Agent | null;
  onAgentChange: (agent: Agent) => void;
  hasConversationAbove?: boolean;
  elevated?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

function ChatInputBar({
  value,
  onChange,
  onSend,
  onKeyDown,
  isStreaming,
  placeholder = "Message agent...",
  agents,
  selectedAgent,
  onAgentChange,
  hasConversationAbove = false,
  elevated = false,
  textareaRef: externalTextareaRef,
}: ChatInputBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef || internalTextareaRef;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [value]);

  const className = [
    "chat-input-bar",
    elevated && "chat-input-bar--elevated",
    hasConversationAbove && "chat-input-bar--attached",
  ]
    .filter(Boolean)
    .join(" ");

  const canSend = value.trim() && selectedAgent && !isStreaming;

  return (
    <div className={className}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isStreaming}
      />
      <div className="chat-input-bar-bottom">
        {/* Agent Selector */}
        <div className="chat-agent-selector" ref={dropdownRef}>
          <button
            className="chat-agent-selector-btn"
            onClick={() => setShowDropdown(!showDropdown)}
            type="button"
          >
            {selectedAgent?.name || "Select agent"}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 8L10 13L15 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {showDropdown && agents.length > 0 && (
            <div className="chat-agent-dropdown">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={selectedAgent?.id === agent.id ? "active" : ""}
                  onClick={() => {
                    onAgentChange(agent);
                    setShowDropdown(false);
                  }}
                  type="button"
                >
                  {agent.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          className="chat-send-btn"
          onClick={onSend}
          disabled={!canSend}
          type="button"
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 12L3 21L21 12L3 3L6 12ZM6 12H13"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ChatInputBar;
