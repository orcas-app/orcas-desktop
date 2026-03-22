---
id: feature_ff88
title: Agent self-updating system prompt component
type: feature
status: open
priority: 2
labels: []
blocked_by: []
parent: epic_81fd
created_at: 2026-03-22T02:54:46Z
updated_at: 2026-03-22T02:54:46Z
---
Background task where the CoS agent updates a component of its own system prompt based on learnings from conversations. Uses the background task framework to run after conversations and extract patterns about what works well, what the user prefers, and how to improve future interactions. The agent should only update a designated section of its prompt, not the full prompt.
