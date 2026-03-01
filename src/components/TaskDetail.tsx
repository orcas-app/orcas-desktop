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
import AgentSelector from "./AgentSelector";
import ChatInterface from "./ChatInterface";
import { getLastUsedAgentForTask } from "../api";

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

  // Load the last used agent for this task when the component mounts
  useEffect(() => {
    const loadLastUsedAgent = async () => {
      try {
        const lastAgent = await getLastUsedAgentForTask(task.id);
        if (lastAgent) {
          setSelectedAgent(lastAgent);
        }
      } catch (error) {
        console.error("Failed to load last used agent:", error);
      }
    };

    loadLastUsedAgent();
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
        console.log("[agent-edit-lock-changed] Event received:", event.payload);
        if (event.payload.taskId === task.id) {
          if (event.payload.locked && event.payload.lockedBy) {
            console.log("[agent-edit-lock-changed] Lock acquired by:", event.payload.lockedBy);
            setEditLock(event.payload.lockedBy as 'agent' | 'user');

            // When agent acquires lock, fetch and store the original content
            if (event.payload.lockedBy === 'agent') {
              try {
                const original = await invoke<string | null>("get_original_content", {
                  taskId: task.id,
                });
                console.log("[agent-edit-lock-changed] Original content fetched:", original?.substring(0, 100));
                if (original !== null) {
                  setOriginalContent(original);
                }
              } catch (error) {
                console.error("Failed to get original content:", error);
              }
            }
          } else {
            // Lock released - check for pending changes
            console.log("[agent-edit-lock-changed] Lock released, checking for pending review");
            console.log("[agent-edit-lock-changed] Original content from event:", event.payload.originalContent?.substring(0, 100));
            // Use original content from event payload (since lock is already deleted from DB)
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
      // Clean up any locks when component unmounts (user navigates away)
      if (editLock) {
        invoke("release_edit_lock", { taskId: task.id }).catch((error) => {
          console.error("Failed to release lock on unmount:", error);
        });
      }
    };
  }, [task.id, editLock]);

  // Check if there are changes pending review after agent finishes
  const checkForPendingReview = async (originalFromEvent?: string) => {
    try {
      const currentContent = await invoke<string>("read_task_notes", {
        taskId: task.id,
      });

      console.log("[checkForPendingReview] currentContent from DB:", currentContent?.substring(0, 100));
      console.log("[checkForPendingReview] originalFromEvent:", originalFromEvent?.substring(0, 100));

      // Use original content from event, or fall back to state
      const compareOriginal = originalFromEvent || originalContent;

      // Verify we have original content to compare against
      if (!compareOriginal) {
        console.warn("No original content available for comparison");
        return;
      }

      console.log("[checkForPendingReview] compareOriginal:", compareOriginal?.substring(0, 100));
      console.log("[checkForPendingReview] content differs:", currentContent !== compareOriginal);

      // If content differs from original, show review UI
      if (currentContent !== compareOriginal) {
        console.log("[checkForPendingReview] Setting new content, length:", currentContent?.length);
        setOriginalContent(compareOriginal);
        setDocumentContent(currentContent);
        setPendingReview(true);
        setViewMode('diff');
        // Force editor remount to apply new viewMode
        setEditorKey(prev => prev + 1);
        // Also explicitly set the editor content after a short delay to ensure remount completes
        setTimeout(() => {
          console.log("[checkForPendingReview] Setting editor markdown via ref");
          editorRef.current?.setMarkdown(currentContent);
        }, 50);
      } else {
        // No changes detected, just clear the lock
        try {
          await invoke("release_edit_lock", { taskId: task.id });
        } catch (lockError) {
          console.error("Failed to release lock after no changes detected:", lockError);
        }
      }
    } catch (error) {
      console.error("Failed to check for pending changes:", error);
      // On error, try to release the lock anyway
      try {
        await invoke("release_edit_lock", { taskId: task.id });
      } catch (lockError) {
        console.error("Failed to release lock after error:", lockError);
      }
    }
  };

  // Save document content
  const saveDocument = async (content: string) => {
    try {
      await invoke("write_task_notes", {
        taskId: task.id,
        content: content,
      });
      // Notify other components (e.g. ChatInterface) that task notes changed
      await emit("task-notes-changed", { taskId: task.id });
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  };

  // Accept agent changes
  const acceptChanges = async () => {
    try {
      // Keep current content, update original
      setOriginalContent(documentContent);
      setPendingReview(false);
      setViewMode('rich-text');
      // Force editor remount to apply new viewMode
      setEditorKey(prev => prev + 1);

      // Clear lock from database
      await invoke("release_edit_lock", { taskId: task.id });
    } catch (error) {
      console.error("Failed to accept changes:", error);
    }
  };

  // Revert agent changes
  const rejectChanges = async () => {
    try {
      // Restore original content
      setDocumentContent(originalContent);
      await saveDocument(originalContent);
      setPendingReview(false);
      setViewMode('rich-text');
      // Force editor remount to apply new viewMode
      setEditorKey(prev => prev + 1);

      // Clear lock from database
      await invoke("release_edit_lock", { taskId: task.id });
    } catch (error) {
      console.error("Failed to revert changes:", error);
    }
  };

  // Force unlock (for stuck locks)
  const forceUnlock = async () => {
    try {
      await invoke("release_edit_lock", { taskId: task.id });
      setEditLock(null);
      setPendingReview(false);
      setViewMode('rich-text');
      // Force editor remount to apply new viewMode
      setEditorKey(prev => prev + 1);

      // Emit event to notify other components
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

  const handleAgentSelected = (agent: Agent) => {
    setSelectedAgent(agent);
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
            <>
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
            </>
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
            <AgentSelector
              onAgentSelected={handleAgentSelected}
              selectedAgent={selectedAgent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;
