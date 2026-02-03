import { useState, useEffect } from 'react';
import AgendaView from './AgendaView';
import TodayTaskList from './TodayTaskList';
import type { CalendarEvent, Task } from '../types';
import { getEventsForDate, getTasksScheduledForDate, getRecentlyEditedTasks } from '../api';

interface TodayPageProps {
  onTaskClick?: (taskId: number) => void;
}

export default function TodayPage({ onTaskClick }: TodayPageProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = (): string => {
    const today = new Date();
    return today.toISOString().split('T')[0];
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
    } catch (err) {
      console.error('Error loading today data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load today data');
    } finally {
      setLoading(false);
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
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 1fr) minmax(400px, 2fr)',
        height: '100vh',
        overflow: 'hidden',
        gap: '0',
      }}
    >
      <AgendaView events={events} onRefresh={loadTodayData} />
      <TodayTaskList tasks={tasks} onRefresh={loadTodayData} onTaskClick={onTaskClick} />
    </div>
  );
}
