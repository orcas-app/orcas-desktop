# Conversation Look and Feel Improvements

## 1. Text Input Width (Debug)

**File:** `src/components/ChatInterface.tsx` (lines 786-815)

**Current behavior:** The text input uses `flex={1}` but may not be expanding to full width.

**Expected behavior:** The text input should span the full width of the chat window.

**Action:** Debug why the current `flex={1}` implementation isn't achieving full width. Keep the send button to the right of the input.

---

## 2. Agent Selection Relocation

**File:** `src/components/ChatInterface.tsx`

**Current state:**
- Agent name and "Change Agent" button are in a header above the messages (lines 712-721)
- "Press Cmd/Ctrl+Enter to send" hint is below the input (lines 812-814)

**Changes required:**
1. **Remove** the entire chat header (`.chat-header` section)
2. **Replace** the "Press Cmd/Ctrl+Enter to send" hint with agent selection UI
3. **New agent selector UI:**
   - Low emphasis font styling
   - Show current agent name with chevron dropdown icon
   - Dropdown lists all user-created agents
   - Include "Add new" option at bottom of dropdown
   - Clicking an agent switches to that agent (existing navigation behavior - `onBack()`)
   - Clicking "Add new" navigates to agent creation

**Layout:** `[Agent name ▼]` positioned where the hint text currently is

**"Add new" behavior:** Navigate to the agents page (not a modal)

---

## 3. Plan Card Empty State

**File:** `src/components/PlanCard.tsx` (lines 148-179)

**Current empty state:**
```
┌─────────────────────────────────┐
│ Plan (semibold title)           │
│ No subtasks yet. Let AI...      │
│ [    Plan task (full width)   ] │
└─────────────────────────────────┘
```

**New empty state (match collapsed header style from lines 279-322):**
```
┌─────────────────────────────────┐
│ Plan                    [Plan]  │
└─────────────────────────────────┘
```

**Changes required:**
1. **Remove** the subtitle "No subtasks yet. Let AI analyze this task and create a plan."
2. **Change** layout to single horizontal row (flexbox, space-between)
3. **Move** button to right side
4. **Change** button text from "Plan task" to "Plan"
5. **Change** button style from `variant="primary"` to `variant="secondary"`
6. **Match** the visual style of the collapsed header (padding, alignment, hover state)
7. **Keep** error message display in same location (below the row, inside the card)

---

## Technical Notes

- The `Box` component from Primer React is deprecated - avoid introducing new usages
- Agent list should come from existing agent fetching logic
- Preserve existing agent switching behavior (chat history is per task+agent combo)