# Simplify Space Context

## Issue
The Space Context section should just display "Overview" as the title instead of "Space Context", and the token count should be removed.

## Changes Needed

### 1. Change Title from "Space Context" to "Overview"
- File: `src/components/SpaceHome.tsx`
- Line: ~261
- Change: Update the Heading text from "Space Context" to "Overview"

### 2. Remove Token Count Display
- File: `src/components/SpaceHome.tsx`
- Lines to remove: ~19-28 (estimateTokens and getTokenColor functions)
- Lines to remove: ~149-150 (tokenCount and tokenColor calculation)
- Lines to remove: ~263-273 (token count badge display in header)

## Acceptance Criteria
- [ ] Space context panel displays "Overview" as the title
- [ ] Token count badge is completely removed
- [ ] No token estimation functions remain in the component
- [ ] Layout still looks clean without the token badge
