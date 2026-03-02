import { useState, useEffect, useCallback, useRef } from 'react';
import ChatConversationPanel from './ChatConversationPanel';
import ChatInputBar from './ChatInputBar';
import AgendaView from './AgendaView';
import TodayTaskList from './TodayTaskList';
import type { CalendarEvent, Task, Space, Agent, EventSpaceTagWithSpace, ChatMessage } from '../types';
import { getEventsForDate, getTasksScheduledForDate, getRecentlyEditedTasks, getAllSpaces, getEventSpaceTags, tagEventToSpace, untagEventFromSpace, getAllAgents, getSetting, checkModelSupportsTools } from '../api';
import { extractMeetingLink, formatAttendees } from '../utils/videoConferencing';
import { sendChatTurn } from '../utils/chatEngine';
import { getAgentToolSchemas, createToolExecutor } from '../utils/agentTools';
import { buildSystemPrompt } from '../utils/promptFactory';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<ChatMessage | null>(null);
  const [chatPanelState, setChatPanelState] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [apiKey, setApiKey] = useState<string | null>(null);
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

    const now = new Date();
    parts.push(`Current time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);

    if (events.length > 0) {
      parts.push('\n## Today\'s Calendar Events');
      for (const event of events) {
        const start = new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const end = new Date(event.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let line = `- **${event.title}** (${event.is_all_day ? 'All day' : `${start} - ${end}`})`;
        if (event.location) line += `\n  Location: ${event.location}`;

        if (event.attendees && event.attendees.length > 0) {
          const { displayText } = formatAttendees(event.attendees, 5);
          if (displayText) {
            line += `\n  Attendees: ${displayText}`;
          }
        }

        const meetingLink = extractMeetingLink(event);
        if (meetingLink) {
          line += `\n  Meeting link: ${meetingLink}`;
        }

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

      const agendaContext = buildAgendaContext();
      const systemPrompt = buildSystemPrompt({
        kind: 'today',
        agentPrompt: selectedAgent.agent_prompt || '',
        agentName: selectedAgent.name,
        agendaContext,
      });

      const modelName = selectedAgent.model_name || 'claude-sonnet-4-5';

      // Resolve tools — all 9 agent tools + web search
      const modelToolSupport = await checkModelSupportsTools(modelName);
      let toolsToSend: any[] | undefined = modelToolSupport ? getAgentToolSchemas() : undefined;

      if (selectedAgent.web_search_enabled) {
        const webSearchTool = {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        };
        if (toolsToSend) {
          toolsToSend.push(webSearchTool);
        } else {
          toolsToSend = [webSearchTool];
        }
      }

      // Create tool executor with no default taskId/spaceId (Today context)
      const executeTool = createToolExecutor({});

      const result = await sendChatTurn(
        {
          modelName,
          systemPrompt,
          tools: toolsToSend,
          apiKey: apiKey || undefined,
        },
        conversationMessages,
        {
          onContentUpdate: (content) => {
            setCurrentStreamingMessage(prev => {
              if (!prev) return null;
              return { ...prev, content };
            });
          },
          executeTool,
        },
      );

      const finalMessage = {
        ...assistantMessage,
        content: result.content,
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

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

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
          }}>
            <ChatConversationPanel
              messages={messages}
              currentStreamingMessage={currentStreamingMessage}
              agentName={selectedAgent?.name || 'Agent'}
              panelState={chatPanelState}
              onToggleExpand={() => {
                setChatPanelState(chatPanelState === 'expanded' ? 'collapsed' : 'expanded');
              }}
            />
          </div>
        )}

        {/* Chat Input Bar */}
        <ChatInputBar
          value={chatInput}
          onChange={setChatInput}
          onSend={handleSendChat}
          onKeyDown={handleKeyDown}
          isStreaming={isStreaming}
          placeholder="Help me organise my day"
          agents={agents}
          selectedAgent={selectedAgent}
          onAgentChange={setSelectedAgent}
          hasConversationAbove={hasConversation && chatPanelState !== 'hidden'}
          elevated={true}
          textareaRef={textareaRef}
        />
      </div>
    </div>
  );
}
