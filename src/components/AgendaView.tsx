import { useState } from 'react';
import type { CalendarEvent, EventSpaceTagWithSpace, Space } from '../types';
import EventPopover from './EventPopover';
import { extractMeetingLink, formatAttendees } from '../utils/videoConferencing';

interface AgendaViewProps {
  events: CalendarEvent[];
  eventSpaceTags?: Record<string, EventSpaceTagWithSpace[]>;
  spaces?: Space[];
  onTagSpace?: (eventId: string, spaceId: number) => void;
  onUntagSpace?: (eventId: string, spaceId: number) => void;
}

export default function AgendaView({ events, eventSpaceTags, spaces, onTagSpace, onUntagSpace }: AgendaViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

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
    }).toLowerCase();
  };

  const handleEventClick = (event: CalendarEvent, target: HTMLElement) => {
    setSelectedEvent(event);
    setPopoverAnchor(target);
  };

  const handleClosePopover = () => {
    setSelectedEvent(null);
    setPopoverAnchor(null);
  };

  const renderEventCard = (event: CalendarEvent) => {
    const meetingLink = extractMeetingLink(event);
    const { displayText: attendeesText } = formatAttendees(event.attendees);

    return (
      <div
        key={event.id}
        onClick={(e) => handleEventClick(event, e.currentTarget)}
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
          padding: '12px',
          border: '1px solid #bdbdbd',
          borderRadius: '6px',
          backgroundColor: 'white',
          cursor: 'pointer',
          minHeight: '60px',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#828282'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#bdbdbd'; }}
      >
        {/* Time */}
        {!event.is_all_day && (
          <div style={{
            width: '64px',
            flexShrink: 0,
            fontSize: '16px',
            lineHeight: '18px',
            color: '#828282',
          }}>
            {formatTime(event.start_date)}
          </div>
        )}
        {event.is_all_day && (
          <div style={{
            width: '64px',
            flexShrink: 0,
            fontSize: '16px',
            lineHeight: '18px',
            color: '#828282',
          }}>
            All day
          </div>
        )}

        {/* Event Details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '16px',
            lineHeight: '18px',
            color: '#4f4f4f',
          }}>
            {event.title}
          </div>
          {attendeesText && (
            <div style={{
              fontSize: '14px',
              lineHeight: '18px',
              color: '#828282',
              marginTop: '4px',
            }}>
              {attendeesText}
            </div>
          )}
          {eventSpaceTags?.[event.id]?.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              {eventSpaceTags[event.id].map((tag) => (
                <span
                  key={tag.space_id}
                  title={tag.space_title}
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: tag.space_color || '#6e7781',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Video Button */}
        {meetingLink && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(meetingLink, '_blank');
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              color: '#828282',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
            }}
            aria-label="Join video meeting"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  if (events.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 0',
        color: '#828282',
      }}>
        <div style={{ marginBottom: '8px', fontSize: '16px' }}>
          No events scheduled for today
        </div>
        <div style={{ fontSize: '14px' }}>
          Configure calendars in Settings to see your events
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {allDayEvents.map(renderEventCard)}
      {timedEvents.map(renderEventCard)}

      {selectedEvent && popoverAnchor && (
        <EventPopover
          event={selectedEvent}
          anchorElement={popoverAnchor}
          onClose={handleClosePopover}
          spaces={spaces}
          taggedSpaces={eventSpaceTags?.[selectedEvent.id]}
          onTagSpace={onTagSpace ? (spaceId) => onTagSpace(selectedEvent.id, spaceId) : undefined}
          onUntagSpace={onUntagSpace ? (spaceId) => onUntagSpace(selectedEvent.id, spaceId) : undefined}
        />
      )}
    </div>
  );
}
