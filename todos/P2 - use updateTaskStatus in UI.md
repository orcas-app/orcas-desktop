# Use updateTaskStatus in the UI

The `updateTaskStatus` function exists in `src/api.ts` but is not currently called from any component. Wire it up in the UI wherever task status changes are needed (e.g., quick status toggle buttons, drag-and-drop status changes on kanban boards, etc.).

## Location
- `src/api.ts` — `updateTaskStatus(id, status)` wraps `updateTask(id, { status })`

## Notes
- Currently status changes go through `updateTask` directly with a full partial update
- `updateTaskStatus` provides a cleaner API for status-only changes
