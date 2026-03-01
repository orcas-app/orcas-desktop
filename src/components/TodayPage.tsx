import { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from '@primer/react';
import ReactMarkdown from 'react-markdown';
import { invoke } from '@tauri-apps/api/core';
import AgendaView from './AgendaView';
import TodayTaskList from './TodayTaskList';
import type { CalendarEvent, Task, Space, Agent, EventSpaceTagWithSpace, ChatMessage } from '../types';
import { getEventsForDate, getTasksScheduledForDate, getRecentlyEditedTasks, getAllSpaces, getEventSpaceTags, tagEventToSpace, untagEventFromSpace, getAllAgents, getSetting } from '../api';
import { withRetry } from '../utils/retry';
import { compactMessages } from '../utils/tokenEstimation';
import { extractMeetingLink, formatAttendees } from '../utils/videoConferencing';

interface TodayPageProps {
  onTaskClick?: (taskId: number) => void;
}

export default function TodayPage({ onTaskClick }: TodayPageProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [eventSpaceTags, setEventSpaceTags] = useState<Record<string, EventSpaceTagWithSpace[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<ChatMessage | null>(null);
  // Chat panel state: 'hidden' | 'collapsed' | 'expanded'
  //  hidden: no conversation panel shown (chat input not focused)
  //  collapsed: small panel showing recent messages (chat input focused)
  //  expanded: full overlay panel (user clicked expand chevron)
  const [chatPanelState, setChatPanelState] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChatAreaFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    if (chatPanelState === 'hidden') {
      setChatPanelState('collapsed');
    }
  };

  const handleChatAreaBlur = (e: React.FocusEvent) => {
    const chatArea = chatAreaRef.current;
    const relatedTarget = e.relatedTarget as Node | null;
    if (chatArea && relatedTarget && chatArea.contains(relatedTarget)) {
      return;
    }
    blurTimeoutRef.current = setTimeout(() => {
      if (!isStreaming) {
        setChatPanelState('hidden');
      }
    }, 150);
  };

  const generateId = () => Math.random().toString(36).substring(7);

  const getMaxTokensForModel = (modelName: string): number => {
    const limits: Record<string, number> = {
      'claude-sonnet-4-5': 8192,
      'claude-opus-4-5': 16384,
    };
    return limits[modelName] || 8192;
  };

  const getTodayDate = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingMessage]);

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0 && selectedAgent) {
      localStorage.setItem(
        `chat-today-agent-${selectedAgent.id}`,
        JSON.stringify(messages),
      );
    }
  }, [messages, selectedAgent]);

  const loadPersistedMessages = (agent: Agent) => {
    try {
      const saved = localStorage.getItem(`chat-today-agent-${agent.id}`);
      if (saved) {
        const parsedMessages = JSON.parse(saved).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(parsedMessages);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load persisted messages:', err);
      setMessages([]);
    }
  };

  // Load persisted messages when agent changes
  useEffect(() => {
    if (selectedAgent) {
      loadPersistedMessages(selectedAgent);
    }
  }, [selectedAgent?.id]);

  const loadTodayData = async () => {
    setLoading(true);
    setError(null);

    try {
      const today = getTodayDate();

      const selectedCalendarIds = localStorage.getItem('selected_calendar_ids');
      if (selectedCalendarIds) {
        try {
          const calendarIds = JSON.parse(selectedCalendarIds);
          const todayEvents = await getEventsForDate(calendarIds, today);
          setEvents(todayEvents);
        } catch (calError) {
          console.warn('Failed to load calendar events:', calError);
          setEvents([]);
        }
      } else {
        setEvents([]);
      }

      const scheduledTasks = await getTasksScheduledForDate(today);

      let recentTasks: Task[] = [];
      if (scheduledTasks.length === 0) {
        recentTasks = await getRecentlyEditedTasks(24);
        let hoursBack = 24;
        while (recentTasks.length === 0 && hoursBack < 168) {
          hoursBack += 24;
          recentTasks = await getRecentlyEditedTasks(hoursBack);
        }
      }

      const allTasks = [...scheduledTasks];
      const scheduledIds = new Set(scheduledTasks.map(t => t.id));
      for (const task of recentTasks) {
        if (!scheduledIds.has(task.id)) {
          allTasks.push(task);
        }
      }

      setTasks(allTasks);

      try {
        const allSpaces = await getAllSpaces();
        setSpaces(allSpaces);
      } catch (spacesError) {
        console.warn('Failed to load spaces:', spacesError);
      }

      try {
        const allAgents = await getAllAgents();
        setAgents(allAgents);
        if (allAgents.length > 0 && !selectedAgent) {
          setSelectedAgent(allAgents[0]);
        }
      } catch (agentsError) {
        console.warn('Failed to load agents:', agentsError);
      }

      try {
        const savedApiKey = await getSetting('anthropic_api_key');
        setApiKey(savedApiKey);
      } catch (err) {
        console.error('Failed to load API key:', err);
      }
    } catch (err) {
      console.error('Error loading today data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load today data');
    } finally {
      setLoading(false);
    }
  };

  const loadEventTags = useCallback(async (eventList: CalendarEvent[]) => {
    if (eventList.length === 0) return;
    try {
      const tagMap: Record<string, EventSpaceTagWithSpace[]> = {};
      const results = await Promise.all(
        eventList.map(e => getEventSpaceTags(e.id).then(tags => ({ id: e.id, tags })))
      );
      for (const { id, tags } of results) {
        if (tags.length > 0) tagMap[id] = tags;
      }
      setEventSpaceTags(tagMap);
    } catch (err) {
      console.warn('Failed to load event tags:', err);
    }
  }, []);

  useEffect(() => {
    loadEventTags(events);
  }, [events, loadEventTags]);

  const handleTagSpace = async (eventId: string, spaceId: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const today = getTodayDate();
    try {
      await tagEventToSpace(spaceId, eventId, event.title, today);
      await loadEventTags(events);
    } catch (err) {
      console.error('Failed to tag event:', err);
    }
  };

  const handleUntagSpace = async (eventId: string, spaceId: number) => {
    try {
      await untagEventFromSpace(spaceId, eventId);
      await loadEventTags(events);
    } catch (err) {
      console.error('Failed to untag event:', err);
    }
  };

  const buildAgendaContext = (): string => {
    const parts: string[] = [];

    // Current time so the agent knows what's upcoming vs. past
    const now = new Date();
    parts.push(`Current time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);

    if (events.length > 0) {
      parts.push('\n## Today\'s Calendar Events');
      for (const event of events) {
        const start = new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const end = new Date(event.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let line = `- **${event.title}** (${event.is_all_day ? 'All day' : `${start} - ${end}`})`;
        if (event.location) line += `\n  Location: ${event.location}`;

        // Attendees
        if (event.attendees && event.attendees.length > 0) {
          const { displayText } = formatAttendees(event.attendees, 5);
          if (displayText) {
            line += `\n  Attendees: ${displayText}`;
          }
        }

        // Meeting link
        const meetingLink = extractMeetingLink(event);
        if (meetingLink) {
          line += `\n  Meeting link: ${meetingLink}`;
        }

        // Space associations
        const tags = eventSpaceTags[event.id];
        if (tags && tags.length > 0) {
          line += `\n  Spaces: ${tags.map(t => t.space_title).join(', ')}`;
        }

        parts.push(line);
      }
    }

    if (tasks.length > 0) {
      parts.push('\n## Today\'s Tasks');
      for (const task of tasks) {
        const space = spaces.find(s => s.id === task.space_id);
        let line = `- [${task.status}] **${task.title}**`;
        if (space) line += ` (${space.title})`;
        if (task.priority) line += ` — ${task.priority} priority`;
        if (task.due_date) line += ` — due ${task.due_date}`;
        if (task.description) {
          const desc = task.description.length > 150
            ? task.description.substring(0, 150) + '...'
            : task.description;
          line += `\n  ${desc}`;
        }
        parts.push(line);
      }
    }

    return parts.join('\n');
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !selectedAgent || isStreaming) return;

    const trimmedInput = chatInput.trim();
    setChatInput('');

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    if (chatPanelState === 'hidden') {
      setChatPanelState('collapsed');
    }
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };

    setCurrentStreamingMessage(assistantMessage);

    let accumulatedContent = '';

    try {
      // Build conversation history for API
      const conversationMessages = messages
        .map(msg => {
          const textContent = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text)
                  .join('')
              : '';
          return {
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: textContent,
          };
        })
        .filter(msg => msg.content.trim().length > 0);

      conversationMessages.push({
        role: 'user',
        content: trimmedInput,
      });

      const compactedMessages = compactMessages(conversationMessages);

      const agendaContext = buildAgendaContext();
      const systemMessage = `${selectedAgent.agent_prompt || `You are ${selectedAgent.name}, a helpful AI assistant.`}

You are helping the user plan and organise their day. Here is the context for today:

${agendaContext}

Use this context to help the user manage their schedule, prioritise tasks, and plan their day effectively.`;

      const modelName = selectedAgent.model_name || 'claude-sonnet-4-5';
      const maxTokens = getMaxTokensForModel(modelName);

      // Build tools list (web search only, no MCP tools for today page)
      let toolsToSend: any[] | undefined = undefined;
      if (selectedAgent.web_search_enabled) {
        toolsToSend = [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        }];
      }

      let responseText: string = await withRetry(
        () => invoke<string>('send_chat_message', {
          model: modelName,
          messages: compactedMessages,
          system: systemMessage,
          maxTokens: maxTokens,
          tools: toolsToSend,
          apiKey: apiKey || undefined,
        }),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt, error) => {
            console.log(`Retry attempt ${attempt} after error:`, error.message);
          },
        }
      );

      let response: any = JSON.parse(responseText);
      let fullConversation = [...compactedMessages];

      // Handle pause_turn for web search
      while (response.stop_reason === 'pause_turn') {
        const pauseText = response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');
        if (pauseText) {
          accumulatedContent += pauseText;
          setCurrentStreamingMessage(prev => {
            if (!prev) return null;
            return { ...prev, content: accumulatedContent };
          });
        }

        fullConversation.push({
          role: 'assistant' as const,
          content: response.content,
        });

        responseText = await withRetry(
          () => invoke<string>('send_chat_message', {
            model: modelName,
            messages: fullConversation,
            system: systemMessage,
            maxTokens: maxTokens,
            tools: toolsToSend,
            apiKey: apiKey || undefined,
          }),
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt, error) => {
              console.log(`Retry attempt ${attempt} after error:`, error.message);
            },
          }
        ) as string;

        response = JSON.parse(responseText) as any;
      }

      // Extract final text content
      const finalContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      accumulatedContent += finalContent;

      // Extract citations from web search
      const citations: { url: string; title: string }[] = [];
      for (const block of response.content) {
        if (block.type === 'text' && block.citations) {
          for (const cite of block.citations) {
            if (cite.url && !citations.some((c: any) => c.url === cite.url)) {
              citations.push({ url: cite.url, title: cite.title || cite.url });
            }
          }
        }
      }
      if (citations.length > 0) {
        accumulatedContent += '\n\n**Sources:**\n' +
          citations.map(c => `- [${c.title}](${c.url})`).join('\n');
      }

      const finalMessage = {
        ...assistantMessage,
        content: accumulatedContent,
        streaming: false,
      };

      setMessages(prev => [...prev, finalMessage]);
      setCurrentStreamingMessage(null);
      setIsStreaming(false);
    } catch (err) {
      console.error('Error sending message:', err);
      setCurrentStreamingMessage(null);
      setIsStreaming(false);

      let errorContent = 'Sorry, I encountered an error.';
      if (err instanceof Error) {
        const errorMessage = err.message.toLowerCase();
        if (errorMessage.includes('anthropic_api_key') || errorMessage.includes('not configured') || errorMessage.includes('api key')) {
          errorContent = 'Authentication failed. Please configure your Anthropic API key in Settings.';
        } else if (errorMessage.includes('401')) {
          errorContent = 'Authentication failed. Please check your API key configuration in Settings.';
        } else if (errorMessage.includes('429')) {
          errorContent = 'Rate limit exceeded. Please wait a moment and try again.';
        } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
          errorContent = 'The API is experiencing issues. Please try again later.';
        } else if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('connection')) {
          errorContent = 'Network error. Please check your internet connection.';
        } else {
          errorContent = `Error: ${err.message}`;
        }
      }

      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAgentDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadTodayData();
  }, []);

  const hasConversation = messages.length > 0 || currentStreamingMessage !== null;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        fontSize: '14px',
        color: '#828282',
      }}>
        Loading today's agenda...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        fontSize: '14px',
        color: '#EB5757',
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      padding: '32px',
      gap: '32px',
      backgroundColor: 'white',
      position: 'relative',
    }}>
      {/* Page Header */}
      <h1 style={{
        fontSize: '24px',
        fontWeight: 600,
        color: '#333',
        margin: 0,
        flexShrink: 0,
      }}>
        Today
      </h1>

      {/* Page Contents - Two Columns */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '48px',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Agenda Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#333',
            margin: 0,
            flexShrink: 0,
          }}>
            Agenda
          </h2>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <AgendaView
              events={events}
              eventSpaceTags={eventSpaceTags}
              spaces={spaces}
              onTagSpace={handleTagSpace}
              onUntagSpace={handleUntagSpace}
            />
          </div>
        </div>

        {/* Priority Tasks Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#333',
            margin: 0,
            marginBottom: '12px',
            flexShrink: 0,
          }}>
            Priority Tasks
          </h2>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <TodayTaskList
              tasks={tasks}
              spaces={spaces}
              onRefresh={loadTodayData}
              onTaskClick={onTaskClick}
            />
          </div>
        </div>
      </div>

      {/* Chat Area: Conversation Panel + Input */}
      <div
        ref={chatAreaRef}
        onFocus={handleChatAreaFocus}
        onBlur={handleChatAreaBlur}
        style={{ flexShrink: 0, position: 'relative', zIndex: 6 }}
      >
        {/* Conversation Panel */}
        {hasConversation && chatPanelState !== 'hidden' && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            ...(chatPanelState === 'expanded'
              ? { height: 'calc(100vh - 200px)', maxHeight: '600px' }
              : { maxHeight: '194px' }),
            backgroundColor: '#F2F2F2',
            border: '1px solid #BDBDBD',
            borderBottom: 'none',
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Expand/collapse chevron */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setChatPanelState(chatPanelState === 'expanded' ? 'collapsed' : 'expanded');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#828282',
                flexShrink: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  transform: chatPanelState === 'expanded' ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              >
                <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Messages Area */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 24px 30px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                justifyContent: 'flex-end',
              }}
            >
              {messages.map(message => {
                const contentText = typeof message.content === 'string'
                  ? message.content
                  : Array.isArray(message.content)
                    ? message.content
                        .filter((block: any) => block.type === 'text')
                        .map((block: any) => block.text)
                        .join('')
                    : '';

                return message.role === 'user' ? (
                  <div
                    key={message.id}
                    style={{
                      backgroundColor: '#E0E0E0',
                      borderRadius: '5px',
                      padding: '8px',
                      width: '100%',
                    }}
                  >
                    <p style={{
                      margin: 0,
                      fontSize: '16px',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      color: '#333',
                      lineHeight: 'normal',
                    }}>
                      {contentText}
                    </p>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className="today-agent-message"
                    style={{
                      padding: '0 8px',
                      width: '100%',
                    }}
                  >
                    <div style={{
                      fontSize: '16px',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      color: '#828282',
                      lineHeight: 'normal',
                    }}>
                      <ReactMarkdown>{contentText}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}

              {currentStreamingMessage && (
                <div style={{ padding: '0 8px', width: '100%' }}>
                  <div style={{
                    fontSize: '16px',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    color: '#828282',
                    lineHeight: 'normal',
                  }}>
                    <ReactMarkdown>
                      {typeof currentStreamingMessage.content === 'string'
                        ? currentStreamingMessage.content || ' '
                        : ' '}
                    </ReactMarkdown>
                    {currentStreamingMessage.streaming && (
                      <div className="streaming-indicator">
                        <Spinner size="small" />
                        <span>{selectedAgent?.name || 'Agent'} is thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Chat Input Bar */}
        <div style={{
          border: '1.5px solid black',
          borderRadius: (hasConversation && chatPanelState !== 'hidden') ? '0 0 8px 8px' : '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0px 4px 8px 2px rgba(0,0,0,0.1)',
          backgroundColor: 'white',
        }}>
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Help me organise my day"
            rows={1}
            disabled={isStreaming}
            style={{
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '16px',
              fontFamily: "'IBM Plex Sans', sans-serif",
              color: '#333',
              padding: '4px',
              backgroundColor: 'transparent',
            }}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '27px',
          }}>
            {/* Agent Selector */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#333',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  padding: 0,
                }}
              >
                {selectedAgent?.name || 'Select agent'}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 8L10 13L15 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showAgentDropdown && agents.length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '4px',
                  backgroundColor: 'white',
                  border: '1px solid #bdbdbd',
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  minWidth: '160px',
                  zIndex: 10,
                }}>
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setShowAgentDropdown(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: 'none',
                        background: selectedAgent?.id === agent.id ? '#f2f2f2' : 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        color: '#333',
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#f2f2f2'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = selectedAgent?.id === agent.id ? '#f2f2f2' : 'transparent'; }}
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || !selectedAgent || isStreaming}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: chatInput.trim() && selectedAgent && !isStreaming ? 'black' : '#bdbdbd',
                border: 'none',
                cursor: chatInput.trim() && selectedAgent && !isStreaming ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 12L3 21L21 12L3 3L6 12ZM6 12H13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
