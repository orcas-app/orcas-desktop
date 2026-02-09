import { useState, useEffect, useCallback } from 'react';
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { Button } from '@primer/react';
import { ArrowLeftIcon } from '@primer/octicons-react';
import { getProjectContext, updateProjectContext } from '../api';

interface ProjectContextEditorProps {
  projectId: number;
  projectTitle: string;
  onClose: () => void;
}

// Rough token estimate: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getTokenColor(tokens: number): string {
  if (tokens < 1500) return '#2da44e'; // green
  if (tokens <= 2000) return '#bf8700'; // yellow
  return '#cf222e'; // red
}

export default function ProjectContextEditor({ projectId, projectTitle, onClose }: ProjectContextEditorProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadContext();
  }, [projectId]);

  const loadContext = async () => {
    try {
      setIsLoading(true);
      const contextContent = await getProjectContext(projectId);
      setContent(contextContent || '');
    } catch (error) {
      console.error('Failed to load project context:', error);
      setContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const saveContext = useCallback(async (newContent: string) => {
    try {
      await updateProjectContext(projectId, newContent);
    } catch (error) {
      console.error('Failed to save project context:', error);
    }
  }, [projectId]);

  const tokenCount = estimateTokens(content);
  const tokenColor = getTokenColor(tokenCount);

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
        <div>Loading project context...</div>
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
          Back to Project
        </Button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            Project Context - {projectTitle}
          </h2>
        </div>
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: tokenColor,
          padding: '4px 10px',
          borderRadius: '12px',
          backgroundColor: `${tokenColor}15`,
          border: `1px solid ${tokenColor}40`,
        }}>
          ~{tokenCount} tokens
          {tokenCount > 2000 && ' (large context may affect performance)'}
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
            saveContext(newContent);
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
