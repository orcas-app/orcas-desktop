import { useState, useEffect, useCallback, useRef } from "react";
import { Heading, Button, Text, TextInput } from "@primer/react";
import { PencilIcon } from "@primer/octicons-react";
import { getTasksBySpace, getSpaceContext, updateSpaceContext, createTask, getSpaceEvents, getEventsForDate, getSetting, untagEventFromSpace, updateTaskStatus } from "../api";
import type { Space, TaskWithSubTasks, CalendarEvent, EventSpaceAssociation } from "../types";
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

const SPACE_COLORS = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7",
  "#EC4899", "#EF4444", "#F97316", "#F59E0B",
  "#EAB308", "#84CC16", "#22C55E", "#10B981",
  "#14B8A6", "#06B6D4", "#6B7280", "#1F2937",
];

interface SpaceHomeProps {
  selectedSpace: Space | null;
  onTaskClick: (taskId: number) => void;
  onShowNewTaskDialog: () => void;
  onShowNewSpaceDialog: () => void;
  onTaskCreated?: (task: TaskWithSubTasks) => void;
  refreshTrigger?: number;
  onUpdateSpaceTitle: (spaceId: number, newTitle: string) => Promise<void>;
  onUpdateSpaceColor: (spaceId: number, color: string) => Promise<void>;
  shouldEditSpaceTitle?: boolean;
}

function SpaceHome({
  selectedSpace,
  onTaskClick,
  onShowNewTaskDialog: _onShowNewTaskDialog,
  onShowNewSpaceDialog,
  onTaskCreated,
  refreshTrigger,
  onUpdateSpaceTitle,
  onUpdateSpaceColor,
  shouldEditSpaceTitle = false,
}: SpaceHomeProps) {
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);
  const [contextContent, setContextContent] = useState("");
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isColorTokenHovered, setIsColorTokenHovered] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const [upcomingEvents, setUpcomingEvents] = useState<{ association: EventSpaceAssociation; calendarEvent?: CalendarEvent }[]>([]);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  // Prevents onBlur from double-firing a creation when Enter/Escape already handled it
  const newTaskSubmittingRef = useRef(false);

  const sortedTasks = [
    ...tasks.filter((task) => task.status !== "done"),
    ...tasks.filter((task) => task.status === "done"),
  ];

  useEffect(() => {
    if (selectedSpace) {
      loadTasks(selectedSpace.id);
      loadContext(selectedSpace.id);
      loadUpcomingEvents(selectedSpace.id);
    }
  }, [selectedSpace, refreshTrigger]);

  useEffect(() => {
    if (shouldEditSpaceTitle && selectedSpace) {
      setIsEditingTitle(true);
      setEditedTitle(selectedSpace.title || "");
      setTitleError("");
    }
  }, [shouldEditSpaceTitle, selectedSpace]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!showColorPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColorPicker]);

  async function handleColorSelect(color: string) {
    if (!selectedSpace) return;
    setShowColorPicker(false);
    try {
      await onUpdateSpaceColor(selectedSpace.id, color);
    } catch (error) {
      console.error("Failed to update space color:", error);
    }
  }

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
    setIsContextLoading(true);
    try {
      const context = await getSpaceContext(spaceId);
      setContextContent(context || "");
    } catch (error) {
      console.error("Failed to load space context:", error);
      setContextContent("");
    } finally {
      setIsContextLoading(false);
    }
  }

  async function loadUpcomingEvents(spaceId: number) {
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7);

      const formatDate = (d: Date) => d.toISOString().split("T")[0];
      const startDateStr = formatDate(today);
      const endDateStr = formatDate(endDate);

      const associations = await getSpaceEvents(spaceId, startDateStr, endDateStr);
      if (associations.length === 0) {
        setUpcomingEvents([]);
        return;
      }

      // Try to enrich with EventKit data
      let calendarEvents: CalendarEvent[] = [];
      try {
        const calendarIdsJson = await getSetting("selected_calendar_ids");
        if (calendarIdsJson) {
          const calendarIds: string[] = JSON.parse(calendarIdsJson);
          if (calendarIds.length > 0) {
            // Fetch events for each day in the range
            const dateSet = new Set<string>();
            for (const assoc of associations) {
              dateSet.add(assoc.associated_date);
            }
            const fetches = Array.from(dateSet).map((date) =>
              getEventsForDate(calendarIds, date)
            );
            const results = await Promise.all(fetches);
            calendarEvents = results.flat();
          }
        }
      } catch (err) {
        console.error("Failed to enrich events from EventKit:", err);
      }

      // Build a map of external event ID to calendar event
      const eventMap = new Map<string, CalendarEvent>();
      for (const ev of calendarEvents) {
        eventMap.set(ev.id, ev);
      }

      const enriched = associations.map((assoc) => ({
        association: assoc,
        calendarEvent: eventMap.get(assoc.event_id_external),
      }));

      setUpcomingEvents(enriched);
    } catch (error) {
      console.error("Failed to load upcoming events:", error);
      setUpcomingEvents([]);
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

  useEffect(() => {
    if (isAddingTask && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [isAddingTask]);

  async function handleCreateInlineTask() {
    const title = newTaskTitle.trim();
    setIsAddingTask(false);
    setNewTaskTitle("");
    if (!title || !selectedSpace) return;
    try {
      const created = await createTask({ space_id: selectedSpace.id, title, status: "todo" });
      const taskWithSubtasks: TaskWithSubTasks = { ...created, subtasks: [] };
      setTasks((prev) => [taskWithSubtasks, ...prev]);
      onTaskCreated?.(taskWithSubtasks);
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to create task: " + (error as Error).message);
    }
  }

  function handleNewTaskKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      newTaskSubmittingRef.current = true;
      handleCreateInlineTask();
    } else if (e.key === "Escape") {
      e.preventDefault();
      newTaskSubmittingRef.current = true;
      setIsAddingTask(false);
      setNewTaskTitle("");
    }
  }

  function handleNewTaskBlur() {
    if (newTaskSubmittingRef.current) {
      newTaskSubmittingRef.current = false;
      return;
    }
    handleCreateInlineTask();
  }

  const handleTitleClick = () => {
    if (selectedSpace) {
      setIsEditingTitle(true);
      setEditedTitle(selectedSpace.title || "");
      setTitleError("");
    }
  };

  const handleTitleSave = async () => {
    if (!selectedSpace) return;
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      setTitleError("Name the space to get started");
      return;
    }
    try {
      await onUpdateSpaceTitle(selectedSpace.id, trimmedTitle);
      setIsEditingTitle(false);
      setTitleError("");
    } catch (error) {
      console.error("Failed to update space title:", error);
      setTitleError("Failed to update title");
    }
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditedTitle("");
    setTitleError("");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  async function handleUntagEvent(eventId: string) {
    if (!selectedSpace) return;
    try {
      await untagEventFromSpace(selectedSpace.id, eventId);
      await loadUpcomingEvents(selectedSpace.id);
    } catch (error) {
      console.error("Failed to untag event:", error);
    }
  }

  function formatEventDateTime(association: EventSpaceAssociation, calendarEvent?: CalendarEvent): string {
    const date = new Date(association.associated_date + "T00:00:00");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateStr = `${monthNames[date.getMonth()]} ${date.getDate()}`;

    if (calendarEvent && !calendarEvent.is_all_day) {
      const start = new Date(calendarEvent.start_date);
      const hours = start.getHours();
      const minutes = start.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const h = hours % 12 || 12;
      const m = minutes.toString().padStart(2, "0");
      return `${dateStr}, ${h}:${m} ${ampm}`;
    }

    return dateStr;
  }

  if (!selectedSpace) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "32px 24px",
      }}>
        <Heading sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "24px", fontWeight: 600, mb: 3, color: "fg.default" }}>
          Welcome to Orcas
        </Heading>
        <Text sx={{ fontSize: 2, color: "fg.muted", mb: 4 }}>
          Create your first space to get started!
        </Text>
        <Button variant="primary" size="large" onClick={onShowNewSpaceDialog}>
          Create First Space
        </Button>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "32px",
      gap: "32px",
      height: "100%",
      overflow: "hidden",
      backgroundColor: "white",
    }}>
      {/* Page title */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Color token */}
        <div style={{ position: "relative" }} ref={colorPickerRef}>
          <div
            className="space-color-token"
            onClick={() => setShowColorPicker(!showColorPicker)}
            onMouseEnter={() => setIsColorTokenHovered(true)}
            onMouseLeave={() => setIsColorTokenHovered(false)}
            style={{
              width: "20px",
              height: "20px",
              backgroundColor: selectedSpace.color,
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isColorTokenHovered && (
              <div style={{
                position: "absolute",
                inset: 0,
                borderRadius: "4px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <PencilIcon size={12} fill="white" />
              </div>
            )}
          </div>

          {showColorPicker && (
            <div className="space-color-picker">
              {SPACE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className="space-color-swatch"
                  style={{
                    backgroundColor: color,
                    outline: selectedSpace.color === color
                      ? "2px solid #333"
                      : "none",
                    outlineOffset: selectedSpace.color === color ? "1px" : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {isEditingTitle ? (
          <div>
            <TextInput
              ref={titleInputRef}
              value={editedTitle}
              onChange={(e) => {
                setEditedTitle(e.target.value);
                setTitleError("");
              }}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleSave}
              placeholder="Enter space name..."
              sx={{
                fontSize: "24px",
                fontWeight: 600,
                border: titleError
                  ? "2px solid #cf222e"
                  : "2px solid var(--borderColor-default, #d0d7de)",
                borderRadius: "6px",
                padding: "4px 8px",
                maxWidth: "500px",
              }}
            />
            {titleError && (
              <Text sx={{ fontSize: 1, color: "#cf222e", display: "block", mt: 1 }}>
                {titleError}
              </Text>
            )}
          </div>
        ) : (
          <Heading
            onClick={handleTitleClick}
            sx={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: "24px",
              fontWeight: 600,
              color: "#333",
              cursor: "pointer",
              lineHeight: "normal",
              "&:hover": { opacity: 0.75 },
            }}
          >
            {selectedSpace.title}
          </Heading>
        )}
      </div>

      {/* Two-column content */}
      <div style={{
        display: "flex",
        gap: "48px",
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
      }}>
        {/* Left column — Up Next */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          height: "100%",
          overflow: "auto",
          minWidth: 0,
        }}>
          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
              <Heading sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "20px", fontWeight: 600, color: "#333", lineHeight: "normal", marginBottom: "8px" }}>
                Upcoming Events
              </Heading>
              {upcomingEvents.map((item) => (
                <div
                  key={item.association.id}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    padding: "4px 12px",
                    height: "32px",
                    borderRadius: "6px",
                    backgroundColor: "white",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f6f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                >
                  <Text sx={{ fontSize: "13px", color: "#828282", whiteSpace: "nowrap", flexShrink: 0 }}>
                    [{formatEventDateTime(item.association, item.calendarEvent)}]
                  </Text>
                  <Text sx={{
                    fontSize: "16px",
                    color: "#333",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {item.association.event_title}
                  </Text>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUntagEvent(item.association.event_id_external);
                    }}
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#828282" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M1 1l8 8M9 1l-8 8" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section header */}
          <div style={{ flexShrink: 0 }}>
            <Heading sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "20px", fontWeight: 600, color: "#333", lineHeight: "normal" }}>
              Up Next
            </Heading>
          </div>

          {/* Task list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {/* Add a new task row */}
            {isAddingTask ? (
              <div style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                padding: "4px 12px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: "white",
              }}>
                <div style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#828282" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </div>
                <input
                  ref={newTaskInputRef}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={handleNewTaskKeyDown}
                  onBlur={handleNewTaskBlur}
                  style={{
                    flex: 1,
                    fontSize: "16px",
                    color: "#333",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    lineHeight: "normal",
                    fontFamily: "inherit",
                    minWidth: 0,
                  }}
                />
              </div>
            ) : (
              <div
                onClick={() => setIsAddingTask(true)}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  padding: "4px 12px",
                  height: "32px",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f6f6"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
              >
                <div style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#828282" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </div>
                <span style={{ fontSize: "16px", color: "#828282", lineHeight: "normal" }}>
                  Add a new task
                </span>
              </div>
            )}

            {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    padding: "4px 12px",
                    height: "32px",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f6f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newStatus = task.status === "done" ? "todo" : "done";
                      updateTaskStatus(task.id, newStatus).then(() => {
                        if (selectedSpace) loadTasks(selectedSpace.id);
                      }).catch((err) => {
                        console.error("Failed to toggle task status:", err);
                      });
                    }}
                    style={{
                      width: "16px",
                      height: "16px",
                      border: "1px solid #bdbdbd",
                      borderRadius: "4px",
                      flexShrink: 0,
                      backgroundColor: task.status === "done" ? "#2f80ed" : "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {task.status === "done" && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span style={{
                    fontSize: "16px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: task.status === "done" ? "#828282" : "#333",
                    textDecoration: task.status === "done" ? "line-through" : "none",
                    lineHeight: "normal",
                  }}>
                    {task.title}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Right column — Context + Documents */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          height: "100%",
          overflow: "auto",
          minWidth: 0,
        }}>
          {/* Context section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 }}>
            <Heading sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "20px", fontWeight: 600, color: "#333", lineHeight: "normal", flexShrink: 0 }}>
              Context
            </Heading>
            {isContextLoading ? (
              <Text sx={{ fontSize: 2, color: "fg.muted" }}>Loading context...</Text>
            ) : (
              <div className="context-editor-pane" style={{ flex: 1 }}>
                <MDXEditor
                  key={selectedSpace.id}
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
            )}
          </div>

          {/* Documents section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", flexShrink: 0 }}>
            <Heading sx={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "20px", fontWeight: 600, color: "#333", lineHeight: "normal" }}>
              Documents
            </Heading>
            <Text sx={{ fontSize: 2, color: "fg.muted" }}>No documents yet</Text>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpaceHome;
