import { useState, useEffect, useRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  linkPlugin,
  linkDialogPlugin,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  type ViewMode,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import type { TaskWithSubTasks, Agent } from "../types";
import ChatInterface from "./ChatInterface";
import { getLastUsedAgentForTask, getAllAgents } from "../api";

interface TaskDetailProps {
  task: TaskWithSubTasks;
  spaceName: string;
  onBack: () => void;
  onUpdateTask?: (taskId: number, updates: Partial<TaskWithSubTasks>) => void;
}

function TaskDetail({ task, onBack }: TaskDetailProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [documentContent, setDocumentContent] = useState<string>("");
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);

  // Edit lock state
  const [editLock, setEditLock] = useState<'user' | 'agent' | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [pendingReview, setPendingReview] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('rich-text');
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<MDXEditorMethods>(null);

  // Load the last used agent (or first available) when the component mounts
  useEffect(() => {
    const loadAgent = async () => {
      try {
        const lastAgent = await getLastUsedAgentForTask(task.id);
        if (lastAgent) {
          setSelectedAgent(lastAgent);
          return;
        }
        // Fall back to first available agent
        const agents = await getAllAgents();
        if (agents.length > 0) {
          setSelectedAgent(agents[0]);
        }
      } catch (error) {
        console.error("Failed to load agent:", error);
      }
    };

    loadAgent();
  }, [task.id]);

  // Load the shared document content and check lock status
  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoadingDocument(true);
        const content = await invoke<string>("read_task_notes", {
          taskId: task.id,
        });
        setDocumentContent(content);

        // Check if there's an existing lock
        const lockStatus = await invoke<{ is_locked: boolean; locked_by: string | null }>(
          "check_edit_lock",
          { taskId: task.id }
        );

        if (lockStatus.is_locked && lockStatus.locked_by) {
          setEditLock(lockStatus.locked_by as 'agent' | 'user');

          // If agent has lock, get original content
          if (lockStatus.locked_by === 'agent') {
            const original = await invoke<string | null>("get_original_content", {
              taskId: task.id,
            });
            if (original) {
              setOriginalContent(original);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load document:", error);
        setDocumentContent("# Shared Document\n\nStart collaborating here...");
      } finally {
        setIsLoadingDocument(false);
      }
    };

    loadDocument();
  }, [task.id]);

  // Listen for lock state changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<{
        taskId: number;
        locked: boolean;
        lockedBy: string | null;
        originalContent?: string | null;
      }>("agent-edit-lock-changed", async (event) => {
        if (event.payload.taskId === task.id) {
          if (event.payload.locked && event.payload.lockedBy) {
            setEditLock(event.payload.lockedBy as 'agent' | 'user');

            if (event.payload.lockedBy === 'agent') {
              try {
                const original = await invoke<string | null>("get_original_content", {
                  taskId: task.id,
                });
                if (original !== null) {
                  setOriginalContent(original);
                }
              } catch (error) {
                console.error("Failed to get original content:", error);
              }
            }
          } else {
            const originalFromEvent = event.payload.originalContent;
            if (originalFromEvent) {
              setOriginalContent(originalFromEvent);
            }
            checkForPendingReview(originalFromEvent || undefined);
            setEditLock(null);
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
      if (editLock) {
        invoke("release_edit_lock", { taskId: task.id }).catch((error) => {
          console.error("Failed to release lock on unmount:", error);
        });
      }
    };
  }, [task.id, editLock]);

  const checkForPendingReview = async (originalFromEvent?: string) => {
    try {
      const currentContent = await invoke<string>("read_task_notes", {
        taskId: task.id,
      });

      const compareOriginal = originalFromEvent || originalContent;

      if (!compareOriginal) {
        console.warn("No original content available for comparison");
        return;
      }

      if (currentContent !== compareOriginal) {
        setOriginalContent(compareOriginal);
        setDocumentContent(currentContent);
        setPendingReview(true);
        setViewMode('diff');
        setEditorKey(prev => prev + 1);
        setTimeout(() => {
          editorRef.current?.setMarkdown(currentContent);
        }, 50);
      } else {
        try {
          await invoke("release_edit_lock", { taskId: task.id });
        } catch (lockError) {
          console.error("Failed to release lock after no changes detected:", lockError);
        }
      }
    } catch (error) {
      console.error("Failed to check for pending changes:", error);
      try {
        await invoke("release_edit_lock", { taskId: task.id });
      } catch (lockError) {
        console.error("Failed to release lock after error:", lockError);
      }
    }
  };

  const saveDocument = async (content: string) => {
    try {
      await invoke("write_task_notes", {
        taskId: task.id,
        content: content,
      });
      await emit("task-notes-changed", { taskId: task.id });
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  };

  const acceptChanges = async () => {
    try {
      setOriginalContent(documentContent);
      setPendingReview(false);
      setViewMode('rich-text');
      setEditorKey(prev => prev + 1);
      await invoke("release_edit_lock", { taskId: task.id });
    } catch (error) {
      console.error("Failed to accept changes:", error);
    }
  };

  const rejectChanges = async () => {
    try {
      setDocumentContent(originalContent);
      await saveDocument(originalContent);
      setPendingReview(false);
      setViewMode('rich-text');
      setEditorKey(prev => prev + 1);
      await invoke("release_edit_lock", { taskId: task.id });
    } catch (error) {
      console.error("Failed to revert changes:", error);
    }
  };

  const forceUnlock = async () => {
    try {
      await invoke("release_edit_lock", { taskId: task.id });
      setEditLock(null);
      setPendingReview(false);
      setViewMode('rich-text');
      setEditorKey(prev => prev + 1);
      await emit("agent-edit-lock-changed", {
        taskId: task.id,
        locked: false,
        lockedBy: null,
      });
    } catch (error) {
      console.error("Failed to force unlock:", error);
      alert("Failed to release lock. Please restart the application.");
    }
  };

  const handleBackToAgentSelection = () => {
    setSelectedAgent(null);
  };

  return (
    <div className="task-detail-page">
      {/* Header */}
      <header className="task-detail-header">
        <button className="task-detail-back-btn" onClick={onBack} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="task-detail-title">{task.title}</h1>
      </header>

      {/* Two-column layout */}
      <div className="task-detail-columns">
        {/* Left column - Shared Document */}
        <div className="document-pane">
          {editLock === 'agent' && (
            <div className="edit-lock-banner">
              <span style={{ flex: 1 }}>Agent is editing... (Read-only mode)</span>
              <button
                className="force-unlock-btn"
                onClick={forceUnlock}
                title="Force unlock if agent is stuck"
              >
                Force Unlock
              </button>
            </div>
          )}

          {isLoadingDocument ? (
            <div className="document-loading">Loading document...</div>
          ) : (
            <MDXEditor
              ref={editorRef}
              key={editorKey}
              markdown={documentContent}
              readOnly={editLock === 'agent'}
              onChange={(newContent) => {
                if (editLock !== 'agent') {
                  setDocumentContent(newContent);
                  saveDocument(newContent);
                }
              }}
              plugins={[
                diffSourcePlugin({
                  diffMarkdown: originalContent,
                  viewMode: viewMode,
                  readOnlyDiff: true,
                }),
                toolbarPlugin({
                  toolbarContents: () => (
                    <DiffSourceToggleWrapper>
                      <BlockTypeSelect />
                      <BoldItalicUnderlineToggles />
                      <ListsToggle />
                      <CreateLink />
                    </DiffSourceToggleWrapper>
                  ),
                }),
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                markdownShortcutPlugin(),
                linkPlugin(),
                linkDialogPlugin(),
              ]}
              contentEditableClassName={`mdx-editor-content ${
                editLock === 'agent' ? 'mdx-editor-readonly' : ''
              }`}
            />
          )}

          {pendingReview && (
            <div className="review-panel">
              <h3>Agent made changes</h3>
              <p>Review the changes in diff view above</p>
              <div className="review-actions">
                <button className="btn-accept" onClick={acceptChanges}>
                  ✓ Accept Changes
                </button>
                <button className="btn-reject" onClick={rejectChanges}>
                  ✗ Revert Changes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column - Chat */}
        <div className="task-detail-chat-pane">
          {selectedAgent ? (
            <ChatInterface
              agent={selectedAgent}
              taskId={task.id}
              spaceId={task.space_id}
              onBack={handleBackToAgentSelection}
            />
          ) : (
            <div className="chat-conversation-empty">
              <div className="chat-conversation-empty-icon">💬</div>
              <h4>No agent selected</h4>
              <p>Loading agents...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;
