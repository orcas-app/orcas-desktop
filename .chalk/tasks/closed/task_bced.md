---
id: task_bced
title: Task note agent access
type: task
status: closed
priority: 0
labels: []
blocked_by: []
parent: null
created_at: 2026-03-22T02:54:33Z
updated_at: 2026-04-10T00:43:15Z
---
When the user adds content to the task note, it is not immediately available to the agent. In fact reloading the task also doesn't make the new note content. Update the implementation, so each time a message is sent to the agent, it includes the latest version of the note.
