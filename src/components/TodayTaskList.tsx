import { useState } from 'react';
import type { Task, Space } from '../types';
import { updateTaskStatus, createTask } from '../api';

interface TodayTaskListProps {
  tasks: Task[];
  spaces: Space[];
  onRefresh: () => void;
  onTaskClick?: (taskId: number) => void;
}

export default function TodayTaskList({ tasks, spaces, onRefresh, onTaskClick }: TodayTaskListProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Group tasks by space
  const spaceMap = new Map<number, Space>();
  for (const space of spaces) {
    spaceMap.set(space.id, space);
  }

  const tasksBySpace = new Map<number, Task[]>();
  for (const task of tasks) {
    const existing = tasksBySpace.get(task.space_id) || [];
    existing.push(task);
    tasksBySpace.set(task.space_id, existing);
  }

  const handleToggleTask = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await updateTaskStatus(task.id, newStatus);
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    // Use the first space if available, otherwise we can't create
    const targetSpaceId = spaces.length > 0 ? spaces[0].id : null;
    if (!targetSpaceId) return;

    try {
      await createTask({
        space_id: targetSpaceId,
        title: newTaskTitle.trim(),
        status: 'todo',
        priority: 'medium',
      });
      setNewTaskTitle('');
      setIsAddingTask(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleNewTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddTask();
    } else if (e.key === 'Escape') {
      setNewTaskTitle('');
      setIsAddingTask(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Add New Task Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '32px',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
        onClick={() => {
          if (!isAddingTask) setIsAddingTask(true);
        }}
      >
        {/* Plus icon */}
        <div style={{
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="#828282" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {isAddingTask ? (
          <input
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={handleNewTaskKeyDown}
            onBlur={() => {
              if (!newTaskTitle.trim()) {
                setIsAddingTask(false);
              } else {
                handleAddTask();
              }
            }}
            placeholder="Task title..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              fontFamily: 'Inter, sans-serif',
              color: '#333',
              backgroundColor: 'transparent',
            }}
          />
        ) : (
          <span style={{
            flex: 1,
            fontSize: '16px',
            color: '#828282',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            Add a new task
          </span>
        )}
      </div>

      {/* Tasks Grouped by Space */}
      {Array.from(tasksBySpace.entries()).map(([spaceId, spaceTasks]) => {
        const space = spaceMap.get(spaceId);
        const spaceName = space?.title || 'Unknown Space';

        return (
          <div key={spaceId} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '4px 0',
          }}>
            {/* Space Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              height: '32px',
              justifyContent: 'center',
              padding: '2px 0',
            }}>
              <div style={{ padding: '4px 12px' }}>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#333',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {spaceName}
                </span>
              </div>
              <div style={{
                height: '2px',
                backgroundColor: space?.color || '#bdbdbd',
                width: '100%',
                borderRadius: '1px',
              }} />
            </div>

            {/* Tasks */}
            {spaceTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onTaskClick?.(task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  height: '32px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f2f2f2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => handleToggleTask(e, task)}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: task.status === 'done' ? '1px solid #333' : '1px solid #bdbdbd',
                    backgroundColor: task.status === 'done' ? '#333' : 'transparent',
                    cursor: 'pointer',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  {task.status === 'done' && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span style={{
                  flex: 1,
                  fontSize: '16px',
                  color: task.status === 'done' ? '#828282' : '#333',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '48px 0',
          color: '#828282',
        }}>
          <div style={{ marginBottom: '8px', fontSize: '16px' }}>
            No tasks for today
          </div>
          <div style={{ fontSize: '14px' }}>
            Schedule a task or start working on something!
          </div>
        </div>
      )}
    </div>
  );
}
