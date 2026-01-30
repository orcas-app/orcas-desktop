import { useState, useEffect } from 'react';
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { Button } from '@primer/react';
import { ArrowLeftIcon } from '@primer/octicons-react';
import { invoke } from '@tauri-apps/api/core';

interface MarkdownEditorProps {
  taskId: number;
  onClose: () => void;
}

export default function MarkdownEditor({ taskId, onClose }: MarkdownEditorProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAgentNotes();
  }, [taskId]);

  const loadAgentNotes = async () => {
    try {
      setIsLoading(true);
      const notesContent = await invoke<string>('read_task_notes', { taskId });
      setContent(notesContent);
    } catch (error) {
      console.error('Failed to load agent notes:', error);
      setContent('# Agent Notes\n\nError loading notes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveAgentNotes = async (newContent: string) => {
    try {
      await invoke('write_task_notes', { taskId, content: newContent });
      console.log('Agent notes saved successfully for task', taskId);
    } catch (error) {
      console.error('Failed to save agent notes:', error);
    }
  };

  if (isLoading) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: 'var(--bgColor-default)', 
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Loading agent notes...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'var(--bgColor-default)', 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--borderColor-default)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Button
          variant="invisible"
          onClick={onClose}
          leadingVisual={ArrowLeftIcon}
        >
          Back to Task
        </Button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            Agent Notes - Task {taskId}
          </h2>
        </div>
      </div>

      {/* Editor */}
      <div style={{ 
        flex: 1, 
        padding: '24px',
        overflow: 'auto'
      }}>
        <MDXEditor
          markdown={content}
          onChange={(newContent) => {
            setContent(newContent);
            saveAgentNotes(newContent);
          }}
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
    </div>
  );
}