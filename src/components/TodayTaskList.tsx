import { useState } from 'react';
import { Box, Text, Heading, Button } from '@primer/react';
import { ChecklistIcon, SyncIcon, CalendarIcon } from '@primer/octicons-react';
import type { Task } from '../types';
import { updateTaskScheduledDate } from '../api';
import StatusChip from './StatusChip';

interface TodayTaskListProps {
  tasks: Task[];
  onRefresh: () => void;
  onTaskClick?: (taskId: number) => void;
}

export default function TodayTaskList({ tasks, onRefresh, onTaskClick }: TodayTaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);

  const getTodayDate = (): string => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const today = getTodayDate();

  // Separate scheduled and recently edited tasks
  const scheduledTasks = tasks.filter(t => t.scheduled_date === today);
  const recentTasks = tasks.filter(t => t.scheduled_date !== today);

  const handleTaskClick = (taskId: number) => {
    if (onTaskClick) {
      onTaskClick(taskId);
    }
  };

  const handleDateClick = (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    setEditingTaskId(taskId);
  };

  const handleDateChange = async (taskId: number, newDate: string | null) => {
    try {
      await updateTaskScheduledDate(taskId, newDate);
      setEditingTaskId(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to update scheduled date:', error);
    }
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'just now' : `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderTask = (task: Task, showScheduledDate: boolean = false) => {
    const isEditing = editingTaskId === task.id;

    return (
      <Box
        key={task.id}
        onClick={() => !isEditing && handleTaskClick(task.id)}
        sx={{
          p: '12px',
          mb: '10px',
          bg: 'canvas.default',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
          cursor: isEditing ? 'default' : 'pointer',
          '&:hover': isEditing ? {} : {
            bg: 'canvas.subtle',
            borderColor: 'accent.emphasis',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 2, flex: 1 }}>
            {task.title}
          </Text>
          <StatusChip variant={task.status}>{task.status.replace('_', ' ')}</StatusChip>
        </Box>

        {task.description && (
          <Text
            sx={{
              fontSize: 1,
              color: 'fg.muted',
              mb: 2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {task.description}
          </Text>
        )}

        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {/* Scheduled Date */}
          {isEditing ? (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <input
                type="date"
                value={task.scheduled_date || ''}
                onChange={(e) => handleDateChange(task.id, e.target.value || null)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #d0d7de',
                  fontSize: '14px',
                }}
              />
              <Button
                size="small"
                variant="invisible"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTaskId(null);
                }}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Box
              onClick={(e: React.MouseEvent<HTMLDivElement>) => handleDateClick(e, task.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 1,
                color: task.scheduled_date === today ? 'accent.fg' : 'fg.muted',
                cursor: 'pointer',
                '&:hover': {
                  color: 'accent.emphasis',
                },
              }}
            >
              <CalendarIcon size={14} />
              <Text>
                {task.scheduled_date
                  ? task.scheduled_date === today
                    ? 'Today'
                    : new Date(task.scheduled_date).toLocaleDateString()
                  : 'Schedule'}
              </Text>
            </Box>
          )}

          {/* Last edited time for recent tasks */}
          {!showScheduledDate && task.updated_at && (
            <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
              Edited {formatRelativeTime(task.updated_at)}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        bg: 'canvas.default',
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          position: 'sticky',
          top: 0,
          bg: 'canvas.default',
          zIndex: 1,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Heading sx={{ fontSize: 2, fontWeight: 'semibold', display: 'flex', alignItems: 'center', gap: 2 }}>
            <ChecklistIcon size={18} />
            Tasks
          </Heading>
          <Button size="small" onClick={onRefresh} leadingVisual={SyncIcon}>
            Refresh
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: 2 }}>
        {tasks.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              color: 'fg.muted',
            }}
          >
            <Box sx={{ mb: 2, opacity: 0.3 }}>
              <ChecklistIcon size={48} />
            </Box>
            <Text sx={{ display: 'block', fontSize: 2 }}>
              No tasks for today
            </Text>
            <Text sx={{ display: 'block', fontSize: 1, mt: 2 }}>
              Schedule a task or start working on something!
            </Text>
          </Box>
        ) : (
          <>
            {/* Scheduled Tasks */}
            {scheduledTasks.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Text
                  sx={{
                    fontSize: 1,
                    fontWeight: 'semibold',
                    color: 'fg.muted',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 2,
                    display: 'block',
                  }}
                >
                  Scheduled for Today
                </Text>
                {scheduledTasks.map(task => renderTask(task, true))}
              </Box>
            )}

            {/* Recently Edited Tasks */}
            {recentTasks.length > 0 && (
              <Box>
                <Text
                  sx={{
                    fontSize: 1,
                    fontWeight: 'semibold',
                    color: 'fg.muted',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 2,
                    display: 'block',
                  }}
                >
                  Recently Edited
                </Text>
                {recentTasks.map(task => renderTask(task, false))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
