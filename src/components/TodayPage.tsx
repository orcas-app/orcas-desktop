import { useState, useEffect, useCallback } from 'react';
import AgendaView from './AgendaView';
import TodayTaskList from './TodayTaskList';
import type { CalendarEvent, Task, Space, EventSpaceTagWithSpace } from '../types';
import { getEventsForDate, getTasksScheduledForDate, getRecentlyEditedTasks, getAllSpaces, getEventSpaceTags, tagEventToSpace, untagEventFromSpace } from '../api';

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

  // Get today's date in YYYY-MM-DD format (local timezone)
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

      // Load calendar events
      // Get selected calendar IDs from settings (for now, we'll fetch all)
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

      // Load tasks scheduled for today
      const scheduledTasks = await getTasksScheduledForDate(today);

      // Load recently edited tasks if no scheduled tasks
      let recentTasks: Task[] = [];
      if (scheduledTasks.length === 0) {
        // Try to find tasks edited in last 24 hours
        recentTasks = await getRecentlyEditedTasks(24);

        // Recursively look back if no tasks found
        let hoursBack = 24;
        while (recentTasks.length === 0 && hoursBack < 168) { // Max 1 week lookback
          hoursBack += 24;
          recentTasks = await getRecentlyEditedTasks(hoursBack);
        }
      }

      // Combine scheduled and recent tasks, removing duplicates
      const allTasks = [...scheduledTasks];
      const scheduledIds = new Set(scheduledTasks.map(t => t.id));
      for (const task of recentTasks) {
        if (!scheduledIds.has(task.id)) {
          allTasks.push(task);
        }
      }

      setTasks(allTasks);

      // Load spaces for event tagging
      try {
        const allSpaces = await getAllSpaces();
        setSpaces(allSpaces);
      } catch (spacesError) {
        console.warn('Failed to load spaces:', spacesError);
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

  // Reload tags when events change
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

  useEffect(() => {
    loadTodayData();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '14px',
          color: '#656d76',
        }}
      >
        Loading today's agenda...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '14px',
          color: '#d1242f',
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div style={{  flex: 1, overflow: 'hidden'  }}>
        <AgendaView
          events={events}
          onRefresh={loadTodayData}
          eventSpaceTags={eventSpaceTags}
          spaces={spaces}
          onTagSpace={handleTagSpace}
          onUntagSpace={handleUntagSpace}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <TodayTaskList tasks={tasks} onRefresh={loadTodayData} onTaskClick={onTaskClick} />
      </div>
    </div>
  );
}
