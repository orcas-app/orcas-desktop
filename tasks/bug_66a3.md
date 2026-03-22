---
id: bug_66a3
title: Fix calendar loading
type: bug
status: open
priority: 0
labels: []
blocked_by: []
parent: null
created_at: 2026-03-22T02:54:34Z
updated_at: 2026-03-22T02:54:34Z
---
There is an issue with the app loading yesterday's calendar in the 'Today's agenda' section of the app, instead of todays. It does not occur when the app is first installed. I cannot tell from testing whether it is because the calendar never reloads after install, or if there is just an issue with the timing of that reload. Start by investigating potential causes and then implement fixes to the logic
