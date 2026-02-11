# Fix Markdown Editor Toolbar Height

## Issue
The markdown editor toolbar doesn't have sufficient height, making it look cramped or cut off when the text is long. This does not apply in the default state.

## Location
The MDXEditor component is used in multiple places:
- `src/components/SpaceHome.tsx` (Space context)
- Task notes components
- Potentially Settings (see related todo)

## Current Styling
The editor is imported with default styles:
```tsx
import '@mdxeditor/editor/style.css';
```

## Solution
Add custom CSS to override MDXEditor toolbar height:

### Option 1: Global CSS Override
Add to global styles or a dedicated CSS file:
```css
.mdx-editor .mdx-toolbar {
  min-height: 48px;
  padding: 8px 12px;
}

.mdx-editor .mdx-toolbar button {
  height: 32px;
  min-width: 32px;
}
```

### Option 2: Inline Styles via sx Prop
If MDXEditor supports style customization:
```tsx
<MDXEditor
  className="custom-mdx-editor"
  // ... other props
/>
```

Then add CSS:
```css
.custom-mdx-editor .mdx-toolbar {
  min-height: 48px;
}
```

## Implementation Tasks
- [ ] Inspect current toolbar rendering in browser dev tools
- [ ] Identify the exact toolbar height issue (too small, clipped icons, etc.)
- [ ] Determine best approach (global CSS vs component-specific)
- [ ] Add CSS overrides for toolbar height and button sizing
- [ ] Test across all MDXEditor instances
- [ ] Ensure toolbar is responsive on different screen sizes

## Acceptance Criteria
- [ ] Toolbar has comfortable height (minimum 40-48px)
- [ ] All toolbar buttons are fully visible
- [ ] Icons and text are not clipped
- [ ] Styling is consistent across all editor instances
- [ ] No layout issues on different screen sizes
