import { useState } from 'react';
import { Box, Text, Heading, Button } from '@primer/react';
import { CalendarIcon, SyncIcon } from '@primer/octicons-react';
import type { CalendarEvent } from '../types';
import EventPopover from './EventPopover';

interface AgendaViewProps {
  events: CalendarEvent[];
  onRefresh: () => void;
}

export default function AgendaView({ events, onRefresh }: AgendaViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  // Separate all-day and timed events
  const allDayEvents = events.filter(e => e.is_all_day);
  const timedEvents = events.filter(e => !e.is_all_day).sort((a, b) => {
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
  });

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleEventClick = (event: CalendarEvent, target: HTMLElement) => {
    setSelectedEvent(event);
    setPopoverAnchor(target);
  };

  const handleClosePopover = () => {
    setSelectedEvent(null);
    setPopoverAnchor(null);
  };

  return (
    <Box
      sx={{
        borderRight: '1px solid',
        borderColor: 'border.default',
        height: '100%',
        overflowY: 'auto',
        bg: 'canvas.subtle',
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          bg: 'canvas.default',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Heading sx={{ fontSize: 2, fontWeight: 'semibold', display: 'flex', alignItems: 'center', gap: 2 }}>
            <CalendarIcon size={18} />
            Today's Agenda
          </Heading>
          <Button size="small" onClick={onRefresh} leadingVisual={SyncIcon}>
            Refresh
          </Button>
        </Box>
        <Text sx={{ fontSize: 1, color: 'fg.muted', mt: 1 }}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </Box>

      <Box sx={{ p: 2 }}>
        {events.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              color: 'fg.muted',
            }}
          >
            <Box sx={{ mb: 2, opacity: 0.3 }}>
              <CalendarIcon size={48} />
            </Box>
            <Text sx={{ display: 'block', fontSize: 2 }}>
              No events scheduled for today
            </Text>
            <Text sx={{ display: 'block', fontSize: 1, mt: 2 }}>
              Configure calendars in Settings to see your events
            </Text>
          </Box>
        ) : (
          <>
            {/* All-day events section */}
            {allDayEvents.length > 0 && (
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
                  All Day
                </Text>
                {allDayEvents.map((event) => (
                  <Box
                    key={event.id}
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => handleEventClick(event, e.currentTarget)}
                    sx={{
                      p: '10px',
                      mb: '10px',
                      bg: 'canvas.default',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                      cursor: 'pointer',
                      '&:hover': {
                        bg: 'canvas.inset',
                        borderColor: 'accent.emphasis',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box
                        sx={{
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          bg: 'accent.emphasis',
                          flexShrink: 0,
                        }}
                      />
                      <Text sx={{ fontWeight: 'semibold' }}>{event.title}</Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {/* Timed events section */}
            {timedEvents.length > 0 && (
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
                  Schedule
                </Text>
                {timedEvents.map((event) => (
                  <Box
                    key={event.id}
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => handleEventClick(event, e.currentTarget)}
                    sx={{
                      p: '10px',
                      mb: '10px',
                      bg: 'canvas.default',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                      cursor: 'pointer',
                      '&:hover': {
                        bg: 'canvas.inset',
                        borderColor: 'accent.emphasis',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Text
                        sx={{
                          fontSize: 1,
                          color: 'fg.muted',
                          minWidth: '70px',
                          flexShrink: 0,
                        }}
                      >
                        {formatTime(event.start_date)}
                      </Text>
                      <Box sx={{ flex: 1 }}>
                        <Text sx={{ fontWeight: 'semibold', display: 'block' }}>
                          {event.title}
                        </Text>
                        {event.location && (
                          <Text sx={{ fontSize: 1, color: 'fg.muted', mt: 1 }}>
                            {event.location}
                          </Text>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      {selectedEvent && popoverAnchor && (
        <EventPopover
          event={selectedEvent}
          anchorElement={popoverAnchor}
          onClose={handleClosePopover}
        />
      )}
    </Box>
  );
}
