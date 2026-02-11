# Fix Space Context Rendering

## Issue
The Space Context panel doesn't render correctly - it doesn't update when changing spaces and sometimes appears blank.

## Location
- File: `src/components/SpaceHome.tsx`
- Component: SpaceHome
- Lines: ~85-93 (loadContext function) and ~276-297 (MDXEditor rendering)

## Expected Behavior
- Space context should load and display correctly when a space is selected
- Content should update when switching between spaces
- MDXEditor should render the markdown content properly

## Potential Causes
- State not updating correctly when space changes
- MDXEditor key prop missing (needed to force re-render on space change)
- Async loading issues with getSpaceContext API call
- MDXEditor initialization problems

## Acceptance Criteria
- [ ] Space context loads and displays when selecting a space
- [ ] Context updates correctly when switching between spaces
- [ ] No blank screens when context is empty or loading
- [ ] MDXEditor renders markdown content properly
