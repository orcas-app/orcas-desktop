# Implement Today page functionality

## Overview
Create a "Today" page with two main sections: an Agenda view (left) showing calendar events and a Tasks view (right) showing tasks scheduled or recently worked on today.

## Database Schema Changes

### Add scheduled_date to tasks
- Add `scheduled_date` column to tasks table (nullable DATE)
- Migration: existing tasks will have NULL scheduled_date
- Represents the date when the user plans to work on the task (not a due date)

## Left Side: Agenda View

### Calendar Event Display
- Fetch calendar events from local system using EventKit (macOS)
- Show events from user-selected calendars only (requires settings UI - see below)
- Time-based layout:
  - **All-day events**: Display in a section at the top
  - **Timed events**: Display below all-day events in chronological order
  - Show time, title for each event

### Event Details Popover
When user clicks on an event, show popover containing:
- Event title
- Start and end time
- Location
- Attendees list
- Meeting links (Zoom, Google Meet, etc.)
- Event notes/description

### Empty State
- When no events for today: Show "No events scheduled for today" message with calendar icon
- If no calendars selected: Show prompt to configure calendar settings

## Right Side: Tasks View

### Task List Logic
Display tasks in this priority order:
1. **Scheduled for today**: Tasks where `scheduled_date = TODAY`
2. **Recently edited**: Incomplete tasks edited in last 24 hours
   - If no tasks in last 24 hours, look back an additional 24 hours recursively until tasks are found
   - Only include tasks with status != 'done'

### Task Display
- Show task title
- Show scheduled date (if set)
- Show last edited time for recently edited tasks
- Visual indicator for task status (todo/in_progress/for_review)

### Task Interactions
- **Click task**: Navigate to TaskDetail view
- **Inline date editing**: Click on date field opens date picker to set/change scheduled_date
- Allow setting scheduled_date on previously unscheduled tasks

### Empty State
- When no tasks to show: "No tasks for today. Schedule a task or start working on something!"

## Settings Integration

### Calendar Selection UI
- Add new section in Settings for Calendar integration
- Request EventKit permissions on first access
- Show list of available calendars with checkboxes
- Save selected calendar IDs to local storage or database
- Handle permission denied state gracefully

## Technical Implementation Notes

### Tauri Backend (Rust)
- Create new commands for calendar access:
  - `get_calendar_list()` - Returns available calendars
  - `get_events_for_date(calendar_ids: Vec<String>, date: String)` - Fetch events
  - `request_calendar_permission()` - Request EventKit access
- Use macOS EventKit framework
- Handle permission states: not_determined, denied, authorized

### Frontend (React)
- Create new `TodayPage` component
- Create `AgendaView` component for calendar events
- Create `EventPopover` component for event details
- Create `TodayTaskList` component for tasks
- Add date picker component for inline editing (or use existing if available)
- Create route for `/today` in App.tsx

### Database Queries
- Add query to fetch tasks by scheduled_date
- Add query to fetch recently edited incomplete tasks with configurable time window
- Update task update functions to handle scheduled_date changes

### Styling Considerations
- Two-column layout with fixed/flexible widths
- Agenda view: 40% width, Tasks view: 60% width (or similar)
- Responsive: Consider mobile/narrow screen behavior
- Consistent with existing Primer React design system

## Testing Scenarios
1. No calendar permission granted
2. No calendars selected
3. Empty day (no events, no tasks)
4. Tasks with scheduled_date vs recently edited tasks
5. All-day events and timed events mix
6. Event popover with missing fields (no location, no attendees, etc.)
7. Date picker interaction and task updates
8. Recursive lookback when no recent edits in 24h

## Future Enhancements (Out of Scope for P0)
- Drag tasks to calendar events to schedule
- Create new tasks from Today page
- Mark tasks complete from Today page
- Week view or date navigation
- Recurring task support
