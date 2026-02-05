import type { CalendarEvent } from '../types';

/**
 * Video conferencing platform configuration
 */
export interface VideoConferencingPlatform {
  name: string;
  urlPattern: RegExp;
  iconName?: string;
}

/**
 * Supported video conferencing platforms with their URL patterns
 * This array can be easily extended to support additional platforms
 */
export const VIDEO_CONFERENCING_PLATFORMS: VideoConferencingPlatform[] = [
  {
    name: 'Zoom',
    urlPattern: /https:\/\/[\w-]*\.?zoom\.us\/\S+/i,
  },
  {
    name: 'Google Meet',
    urlPattern: /https:\/\/meet\.google\.com\/\S+/i,
  },
  {
    name: 'Microsoft Teams',
    urlPattern: /https:\/\/teams\.microsoft\.com\/\S+/i,
  },
  {
    name: 'Webex',
    urlPattern: /https:\/\/[\w-]*\.?webex\.com\/\S+/i,
  },
];

/**
 * Extract video conferencing meeting link from a calendar event
 * Checks event.url, event.location, and event.notes for video links
 *
 * @param event - Calendar event to extract link from
 * @returns Meeting link URL if found, null otherwise
 */
export function extractMeetingLink(event: CalendarEvent): string | null {
  // Check explicit URL field first
  if (event.url) {
    return event.url;
  }

  // Check location field for video links
  if (event.location) {
    for (const platform of VIDEO_CONFERENCING_PLATFORMS) {
      const match = event.location.match(platform.urlPattern);
      if (match) {
        return match[0];
      }
    }
  }

  // Check notes for video links
  if (event.notes) {
    for (const platform of VIDEO_CONFERENCING_PLATFORMS) {
      const match = event.notes.match(platform.urlPattern);
      if (match) {
        return match[0];
      }
    }
  }

  return null;
}

/**
 * Remove video conferencing URLs from a text string
 * Useful for cleaning up location or description fields
 *
 * @param text - Text to remove video URLs from
 * @returns Text with video URLs removed and trimmed
 */
export function removeVideoConferencingUrls(text: string): string {
  let cleanedText = text;

  for (const platform of VIDEO_CONFERENCING_PLATFORMS) {
    cleanedText = cleanedText.replace(platform.urlPattern, '');
  }

  // Clean up extra whitespace
  return cleanedText.trim();
}

/**
 * Check if text contains a video conferencing URL
 *
 * @param text - Text to check
 * @returns true if text contains a video conferencing URL
 */
export function containsVideoConferencingUrl(text: string): boolean {
  for (const platform of VIDEO_CONFERENCING_PLATFORMS) {
    if (platform.urlPattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Format attendees for display
 * Extracts display names from email addresses and limits to specified count
 *
 * @param attendees - Array of attendee strings (names or emails)
 * @param maxDisplay - Maximum number of attendees to display (default: 3)
 * @returns Object with display string and whether there are more attendees
 */
export function formatAttendees(
  attendees: string[],
  maxDisplay: number = 3
): { displayText: string; hasMore: boolean; totalCount: number } {
  if (!attendees || attendees.length === 0) {
    return { displayText: '', hasMore: false, totalCount: 0 };
  }

  const totalCount = attendees.length;

  // Extract display names from emails if needed
  const displayNames = attendees.map(attendee => {
    // If it's an email address, try to extract the name part
    if (attendee.includes('@')) {
      // Check if there's a display name in format "Name <email@domain.com>"
      const nameMatch = attendee.match(/^(.+?)\s*<.+@.+>$/);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
      // Otherwise just use the part before @
      return attendee.split('@')[0].replace(/[._]/g, ' ').trim();
    }
    return attendee;
  });

  if (totalCount <= maxDisplay) {
    return {
      displayText: displayNames.join(', '),
      hasMore: false,
      totalCount,
    };
  }

  // Show first few and count the rest
  return {
    displayText: `${totalCount} attendees`,
    hasMore: true,
    totalCount,
  };
}
