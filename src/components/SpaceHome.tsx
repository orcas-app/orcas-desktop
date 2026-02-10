import { useState, useEffect, useCallback } from "react";
import { Heading, Button, Text } from "@primer/react";
import { getTasksBySpace, getSpaceContext, updateSpaceContext } from "../api";
import type { Space, TaskWithSubTasks } from "../types";
import StatusChip from "./StatusChip";
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

interface SpaceHomeProps {
  selectedSpace: Space | null;
  onTaskClick: (taskId: number) => void;
  onShowNewTaskDialog: () => void;
  onShowNewSpaceDialog: () => void;
  refreshTrigger?: number; // Add optional prop to trigger refresh
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

function SpaceHome({
  selectedSpace,
  onTaskClick,
  onShowNewTaskDialog,
  onShowNewSpaceDialog,
  refreshTrigger,
}: SpaceHomeProps) {
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);
  const [contextContent, setContextContent] = useState("");

  // Show non-done tasks first, then done tasks at the end
  const sortedTasks = [
    ...tasks.filter((task) => task.status !== "done"),
    ...tasks.filter((task) => task.status === "done"),
  ];

  useEffect(() => {
    if (selectedSpace) {
      loadTasks(selectedSpace.id);
      loadContext(selectedSpace.id);
    }
  }, [selectedSpace, refreshTrigger]); // Re-run when refreshTrigger changes

  async function loadTasks(spaceId: number) {
    try {
      const fetchedTasks = await getTasksBySpace(spaceId);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      alert("Failed to load tasks: " + (error as Error).message);
    }
  }

  async function loadContext(spaceId: number) {
    try {
      const context = await getSpaceContext(spaceId);
      setContextContent(context || "");
    } catch (error) {
      console.error("Failed to load space context:", error);
      setContextContent("");
    }
  }

  const saveContext = useCallback(async (newContent: string) => {
    if (selectedSpace) {
      try {
        await updateSpaceContext(selectedSpace.id, newContent);
      } catch (error) {
        console.error('Failed to save space context:', error);
      }
    }
  }, [selectedSpace]);

  const tokenCount = estimateTokens(contextContent);
  const tokenColor = getTokenColor(tokenCount);

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      {selectedSpace && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header with space title and Add Task button */}
          <div
            style={{
              padding: "24px 32px",
              borderBottom: "1px solid var(--borderColor-default, #d0d7de)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Heading sx={{ fontSize: 4, color: selectedSpace.color }}>
              {selectedSpace.title}
            </Heading>
            <Button variant="primary" onClick={onShowNewTaskDialog}>
              + Add Task
            </Button>
          </div>

          {/* Two-column layout */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            padding: "32px",
            flex: 1,
            overflow: "hidden"
          }}>
            {/* Left column: Space Context */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--borderColor-default, #d0d7de)",
              borderRadius: "6px",
              overflow: "hidden",
              backgroundColor: "var(--bgColor-default, #ffffff)",
            }}>
              {/* Context header */}
              <div style={{
                padding: "16px",
                borderBottom: "1px solid var(--borderColor-default, #d0d7de)",
                backgroundColor: "var(--bgColor-muted, #f6f8fa)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <Heading
                  sx={{
                    fontSize: 1,
                    color: "fg.default",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    margin: 0,
                  }}
                >
                  Space Context
                </Heading>
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
                </div>
              </div>

              {/* Context editor */}
              <div style={{
                flex: 1,
                overflow: "auto",
                padding: "16px",
              }}>
                <MDXEditor
                  markdown={contextContent}
                  onChange={(newContent) => {
                    setContextContent(newContent);
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

            {/* Right column: Tasks list */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
              gap: "12px",
            }}>
              {sortedTasks.length === 0 ? (
                <div
                  style={{
                    padding: "24px",
                    backgroundColor: "var(--bgColor-muted, #f6f8fa)",
                    border: "1px solid var(--borderColor-default, #d0d7de)",
                    borderRadius: "6px",
                    textAlign: "center",
                  }}
                >
                  <Text sx={{ fontSize: 1, color: "fg.muted" }}>
                    No tasks yet
                  </Text>
                </div>
              ) : (
                sortedTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      backgroundColor: "var(--bgColor-default, #ffffff)",
                      border: "1px solid var(--borderColor-default, #d0d7de)",
                      borderLeft: `4px solid ${selectedSpace.color}`,
                      borderRadius: "6px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "box-shadow 0.2s ease",
                    }}
                    onClick={() => onTaskClick(task.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow =
                        "0 3px 6px rgba(140, 149, 159, 0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: task.description ? "8px" : "0",
                      }}
                    >
                      <Heading
                        sx={{
                          fontSize: 2,
                          color: "fg.default",
                          fontWeight: 600,
                        }}
                      >
                        {task.title}
                      </Heading>
                      <StatusChip variant={task.status}>
                        {task.status.replace("_", " ").toUpperCase()}
                      </StatusChip>
                    </div>
                    {task.description && (
                      <Text
                        sx={{
                          fontSize: 1,
                          color: "fg.muted",
                          display: "block",
                          mt: 2,
                        }}
                      >
                        {task.description}
                      </Text>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedSpace && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "calc(100vh - 120px)",
            textAlign: "center",
          }}
        >
          <Heading sx={{ fontSize: 4, mb: 3, color: "fg.default" }}>
            Welcome to Orcas
          </Heading>
          <Text sx={{ fontSize: 2, color: "fg.muted", mb: 4 }}>
            Create your first space to get started!
          </Text>
          <Button
            variant="primary"
            size="large"
            onClick={onShowNewSpaceDialog}
          >
            Create First Space
          </Button>
        </div>
      )}
    </div>
  );
}

export default SpaceHome;
