import { useEffect, useRef } from 'react';
import { Box, Text, Heading, IconButton } from '@primer/react';
import { XIcon, ClockIcon, LocationIcon, PeopleIcon, LinkIcon } from '@primer/octicons-react';
import type { CalendarEvent } from '../types';

interface EventPopoverProps {
  event: CalendarEvent;
  anchorElement: HTMLElement;
  onClose: () => void;
}

export default function EventPopover({ event, anchorElement, onClose }: EventPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorElement.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [anchorElement, onClose]);

  useEffect(() => {
    // Position the popover next to the anchor element
    if (popoverRef.current && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const popover = popoverRef.current;

      // Position to the right of the anchor element
      popover.style.position = 'fixed';
      popover.style.left = `${rect.right + 10}px`;
      popover.style.top = `${rect.top}px`;

      // Adjust if it goes off screen
      const popoverRect = popover.getBoundingClientRect();
      if (popoverRect.right > window.innerWidth) {
        popover.style.left = `${rect.left - popoverRect.width - 10}px`;
      }
      if (popoverRect.bottom > window.innerHeight) {
        popover.style.top = `${window.innerHeight - popoverRect.height - 10}px`;
      }
    }
  }, [anchorElement]);

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDateRange = (): string => {
    if (event.is_all_day) {
      return 'All day';
    }
    return `${formatTime(event.start_date)} - ${formatTime(event.end_date)}`;
  };

  const extractMeetingLink = (): string | null => {
    // Check if there's a URL
    if (event.url) {
      return event.url;
    }

    // Check notes for common meeting links
    if (event.notes) {
      const zoomMatch = event.notes.match(/https:\/\/[\w-]*\.?zoom\.us\/\S+/i);
      if (zoomMatch) return zoomMatch[0];

      const meetMatch = event.notes.match(/https:\/\/meet\.google\.com\/\S+/i);
      if (meetMatch) return meetMatch[0];

      const teamsMatch = event.notes.match(/https:\/\/teams\.microsoft\.com\/\S+/i);
      if (teamsMatch) return teamsMatch[0];
    }

    return null;
  };

  const meetingLink = extractMeetingLink();

  return (
    <>
      {/* Backdrop */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bg: 'rgba(0, 0, 0, 0.1)',
          zIndex: 999,
        }}
      />

      {/* Popover */}
      <Box
        ref={popoverRef}
        sx={{
          position: 'fixed',
          bg: 'canvas.default',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          boxShadow: 'shadow.large',
          p: 3,
          minWidth: '320px',
          maxWidth: '480px',
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 3 }}>
          <Heading sx={{ fontSize: 2, fontWeight: 'semibold', pr: 2 }}>
            {event.title}
          </Heading>
          <IconButton
            icon={XIcon}
            variant="invisible"
            aria-label="Close"
            onClick={onClose}
            size="small"
          />
        </Box>

        {/* Time */}
        <Box sx={{ display: 'flex', alignItems: 'start', gap: 2, mb: 2 }}>
          <ClockIcon size={16} />
          <Text sx={{ fontSize: 1 }}>{formatDateRange()}</Text>
        </Box>

        {/* Location */}
        {event.location && (
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 2, mb: 2 }}>
            <LocationIcon size={16} />
            <Text sx={{ fontSize: 1 }}>{event.location}</Text>
          </Box>
        )}

        {/* Meeting Link */}
        {meetingLink && (
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 2, mb: 2 }}>
            <LinkIcon size={16} />
            <a
              href={meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '14px', color: '#0969da' }}
            >
              Join Meeting
            </a>
          </Box>
        )}

        {/* Attendees */}
        {event.attendees && event.attendees.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 2, mb: 2 }}>
            <PeopleIcon size={16} />
            <Box>
              <Text sx={{ fontSize: 1, fontWeight: 'semibold', display: 'block', mb: 1 }}>
                Attendees ({event.attendees.length})
              </Text>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {event.attendees.slice(0, 5).map((attendee, index) => (
                  <Text key={index} sx={{ fontSize: 1, color: 'fg.muted' }}>
                    {attendee}
                  </Text>
                ))}
                {event.attendees.length > 5 && (
                  <Text sx={{ fontSize: 1, color: 'fg.muted', fontStyle: 'italic' }}>
                    +{event.attendees.length - 5} more
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* Notes/Description */}
        {event.notes && (
          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'border.default' }}>
            <Text sx={{ fontSize: 1, fontWeight: 'semibold', display: 'block', mb: 2 }}>
              Notes
            </Text>
            <Text
              sx={{
                fontSize: 1,
                color: 'fg.muted',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {event.notes}
            </Text>
          </Box>
        )}
      </Box>
    </>
  );
}
