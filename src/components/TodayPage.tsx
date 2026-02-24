import { useState, useEffect, useCallback, useRef } from 'react';
import AgendaView from './AgendaView';
import TodayTaskList from './TodayTaskList';
import type { CalendarEvent, Task, Space, Agent, EventSpaceTagWithSpace } from '../types';
import { getEventsForDate, getTasksScheduledForDate, getRecentlyEditedTasks, getAllSpaces, getEventSpaceTags, tagEventToSpace, untagEventFromSpace, getAllAgents } from '../api';

interface TodayPageProps {
  onTaskClick?: (taskId: number) => void;
  onStartChat?: (agentId: number, message: string) => void;
}

export default function TodayPage({ onTaskClick, onStartChat }: TodayPageProps) {
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

  const getTodayDate = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  const handleSendChat = () => {
    if (!chatInput.trim() || !selectedAgent || !onStartChat) return;
    onStartChat(selectedAgent.id, chatInput.trim());
    setChatInput('');
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

      {/* Chat Input Bar */}
      <div style={{
        border: '1.5px solid black',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: 0,
        boxShadow: '0px 4px 8px 2px rgba(0,0,0,0.1)',
      }}>
        <textarea
          ref={textareaRef}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Help me organise my day"
          rows={1}
          style={{
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: '18px',
            fontFamily: 'Inter, sans-serif',
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
                fontFamily: 'Inter, sans-serif',
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
                      fontFamily: 'Inter, sans-serif',
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
            disabled={!chatInput.trim() || !selectedAgent}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: chatInput.trim() && selectedAgent ? 'black' : '#bdbdbd',
              border: 'none',
              cursor: chatInput.trim() && selectedAgent ? 'pointer' : 'default',
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
  );
}
