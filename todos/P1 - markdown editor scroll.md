# Add Internal Scroll to Markdown Editor

## Issue
The markdown editor (MDXEditor) doesn't have an internal scroll, causing layout issues when content is long.

## Locations Affected
Multiple components use MDXEditor:
1. `src/components/SpaceHome.tsx` - Space context editor (lines ~276-297)
2. Task notes editors (wherever MDXEditor is used)

## Solution
Add scroll container styling to the MDXEditor wrapper or the editor itself.

### Approach 1: Wrapper Div Scroll
```tsx
<div style={{
  flex: 1,
  overflow: "auto",
  padding: "16px",
  maxHeight: "500px", // or "100%" depending on layout
}}>
  <MDXEditor ... />
</div>
```

### Approach 2: MDXEditor contentEditable Styling
Add CSS class with scroll:
```css
.mdx-editor-content {
  max-height: 500px;
  overflow-y: auto;
}
```

## Implementation Tasks
- [ ] Identify all MDXEditor instances in the codebase
- [ ] Add scroll container or CSS class to each instance
- [ ] Test with long markdown content (100+ lines)
- [ ] Ensure scroll works smoothly without layout jumps
- [ ] Verify editor height is appropriate for each context (space overview, task notes, settings)

## Acceptance Criteria
- [ ] Long markdown content scrolls within the editor container
- [ ] Editor doesn't expand parent container infinitely
- [ ] Scroll is smooth and doesn't interfere with editing
- [ ] Works consistently across all editor instances
