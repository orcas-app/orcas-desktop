# Settings Should Use Markdown Editor

## Issue
The Settings component (`src/components/Settings.tsx`) doesn't use the markdown editor component. It should use the same MDXEditor used elsewhere in the app for consistency.

## Current Implementation
- File: `src/components/Settings.tsx`
- Currently uses: Standard form inputs (TextInput from Primer React)
- Issue: Settings content that could be markdown (like help text or descriptions) is plain text

## Question to Clarify
What content in Settings needs markdown editing?
- Provider configuration fields? (Currently just API keys and URLs)
- Help text/instructions?
- A new settings notes/documentation section?

## Potential Implementation

If adding a notes/documentation section to Settings:
```tsx
<Box mb={4}>
  <Heading sx={{ fontSize: 2, mb: 2 }}>Notes</Heading>
  <div style={{
    border: "1px solid var(--borderColor-default)",
    borderRadius: "6px",
    padding: "16px",
    minHeight: "200px",
    maxHeight: "400px",
    overflow: "auto"
  }}>
    <MDXEditor
      markdown={settingsNotes}
      onChange={handleNotesChange}
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
      ]}
      contentEditableClassName="mdx-editor-content"
    />
  </div>
</Box>
```

## Implementation Tasks
- [ ] Determine what content needs markdown editing
- [ ] Import MDXEditor and required plugins
- [ ] Add state for markdown content
- [ ] Add persistence (localStorage or settings DB)
- [ ] Style editor container to match app design
- [ ] Add label/heading for the markdown section

## Acceptance Criteria
- [ ] Settings uses MDXEditor for appropriate content
- [ ] Editor styling is consistent with other editors in the app
- [ ] Content persists when navigating away and back
- [ ] Editor has appropriate height and scroll behavior
