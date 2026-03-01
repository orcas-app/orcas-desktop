import { useState, useEffect } from "react";
import "./App.css";
import {
  Button,
  Spinner,
  ButtonGroup,
  Dialog,
  TextInput,
} from "@primer/react";
import {
  getAllSpaces,
  getTasksBySpace,
  createSpace,
  createTask,
  updateTask,
  updateTaskStatus,
  updateSpace,
} from "./api";
import type { Space, TaskWithSubTasks, NewSpace, NewTask } from "./types";
import TaskDetail from "./components/TaskDetail";
import Settings from "./components/Settings";
import AgentsManager from "./components/AgentsManager";
import SpaceHome from "./components/SpaceHome";
import TodayPage from "./components/TodayPage";
import UpdateNotification from "./components/UpdateNotification";

// Heroicons outline SVGs to match Figma design
function IconStar() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function IconQueueList() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

const sidebarRowBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 8px",
  borderRadius: "4px",
  border: "none",
  backgroundColor: "transparent",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
  color: "#f2f2f2",
  fontFamily: "inherit",
};

function App() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showToday, setShowToday] = useState(true);
  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0);
  const [shouldEditSpaceTitle, setShouldEditSpaceTitle] = useState(false);

  useEffect(() => {
    loadSpaces();
  }, []);

  useEffect(() => {
    if (selectedSpace) {
      loadTasks(selectedSpace.id);
    }
  }, [selectedSpace]);

  async function loadSpaces() {
    try {
      console.log("Loading spaces...");
      setLoading(true);
      const fetchedSpaces = await getAllSpaces();
      console.log("Spaces loaded:", fetchedSpaces);
      setSpaces(fetchedSpaces);
      if (fetchedSpaces.length > 0 && !selectedSpace) {
        setSelectedSpace(fetchedSpaces[0]);
      }
    } catch (error) {
      console.error("Failed to load spaces:", error);
      alert("Failed to load spaces: " + (error as Error).message);
    } finally {
      setLoading(false);
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

  async function handleCreateSpace() {
    try {
      console.log("Creating new space with empty title");
      const newSpace: NewSpace = { title: "" };
      const createdSpace = await createSpace(newSpace);
      console.log("Space created successfully:", createdSpace);
      setSpaces((prev) => [createdSpace, ...prev]);
      setSelectedSpace(createdSpace);
      setShouldEditSpaceTitle(true);
      handleNavigation("home");
    } catch (error) {
      console.error("Failed to create space:", error);
      alert("Failed to create space: " + (error as Error).message);
    }
  }

  async function handleUpdateSpaceTitle(spaceId: number, newTitle: string) {
    try {
      const updatedSpace = await updateSpace(spaceId, { title: newTitle });
      setSpaces((prev) =>
        prev.map((space) => (space.id === spaceId ? updatedSpace : space))
      );
      setSelectedSpace(updatedSpace);
      setShouldEditSpaceTitle(false);
    } catch (error) {
      console.error("Failed to update space title:", error);
      throw error;
    }
  }

  async function handleCreateTask(
    title: string,
    status: "todo" | "in_progress" | "for_review" | "done" = "todo",
  ) {
    if (!selectedSpace) {
      console.error("No selected space for task creation");
      return;
    }

    try {
      const newTask: NewTask = {
        space_id: selectedSpace.id,
        title,
        status,
      };
      const createdTask = await createTask(newTask);
      const taskWithSubTasks: TaskWithSubTasks = {
        ...createdTask,
        subtasks: [],
      };
      setTasks((prev) => [taskWithSubTasks, ...prev]);
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to create task: " + (error as Error).message);
      throw error;
    }
  }

  async function handleCreateTaskFromDialog() {
    if (!newTaskTitle.trim()) return;

    try {
      await handleCreateTask(newTaskTitle.trim());
      setTaskRefreshTrigger((prev) => prev + 1);
      setShowNewTaskDialog(false);
      setNewTaskTitle("");
    } catch (error) {
      console.error("Failed to create task from dialog:", error);
      alert("Failed to create task: " + (error as Error).message);
    }
  }

  async function handleUpdateTask(
    taskId: number,
    updates: Partial<TaskWithSubTasks>,
  ) {
    try {
      const isStatusOnly =
        Object.keys(updates).length === 1 && updates.status !== undefined;
      const updatedTask = isStatusOnly
        ? await updateTaskStatus(taskId, updates.status!)
        : await updateTask(taskId, updates);

      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, ...updatedTask } : task,
        ),
      );
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task: " + (error as Error).message);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Spinner size="large" />
      </div>
    );
  }

  if (selectedTaskId !== null) {
    const selectedTask = tasks.find((task) => task.id === selectedTaskId);
    if (selectedTask) {
      return (
        <TaskDetail
          task={selectedTask}
          spaceName={selectedSpace?.title || ""}
          onBack={() => setSelectedTaskId(null)}
          onUpdateTask={handleUpdateTask}
        />
      );
    }
  }

  const currentView = showSettings ? "settings" : showAgents ? "agents" : showToday ? "today" : "home";

  const handleNavigation = (view: "home" | "settings" | "agents" | "today") => {
    setShowSettings(view === "settings");
    setShowAgents(view === "agents");
    setShowToday(view === "today");
    if (view !== "home") {
      setShouldEditSpaceTitle(false);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <div style={{
        width: "200px",
        flexShrink: 0,
        backgroundColor: "black",
        padding: "32px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        overflow: "hidden",
      }}>
        {/* Top content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* On Deck: Today + Review */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              style={{
                ...sidebarRowBase,
                backgroundColor: currentView === "today" ? "rgba(255,255,255,0.1)" : "transparent",
              }}
              onClick={() => handleNavigation("today")}
            >
              <IconStar />
              <span style={{ fontSize: "16px", lineHeight: "20px" }}>Today</span>
            </button>
            <button style={{ ...sidebarRowBase }}>
              <IconQueueList />
              <span style={{ fontSize: "16px", lineHeight: "20px" }}>Review</span>
            </button>
          </div>

          {/* Spaces */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Spaces header row */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 8px",
              height: "32px",
            }}>
              <span style={{ fontSize: "16px", lineHeight: "20px", color: "#f2f2f2" }}>Spaces</span>
              <button
                onClick={handleCreateSpace}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#f2f2f2" }}
                title="New space"
              >
                <IconPlus />
              </button>
            </div>

            {/* Space items */}
            {spaces.map((space) => (
              <button
                key={space.id}
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: currentView === "home" && selectedSpace?.id === space.id
                    ? "rgba(255,255,255,0.1)"
                    : "transparent",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  color: "#f2f2f2",
                  fontFamily: "inherit",
                }}
                onClick={() => {
                  setSelectedSpace(space);
                  setShouldEditSpaceTitle(false);
                  handleNavigation("home");
                }}
              >
                {/* Color indicator */}
                <div style={{
                  width: "20px",
                  height: "20px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: "4px",
                }}>
                  <div style={{
                    width: "13px",
                    height: "13px",
                    backgroundColor: space.color,
                    borderRadius: "3px",
                  }} />
                </div>
                <span style={{
                  fontSize: "16px",
                  lineHeight: "20px",
                  flex: 1,
                  minWidth: 0,
                  wordBreak: "break-word",
                }}>
                  {space.title || "(Untitled)"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom content: Agents + Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            style={{
              ...sidebarRowBase,
              backgroundColor: currentView === "agents" ? "rgba(255,255,255,0.1)" : "transparent",
            }}
            onClick={() => handleNavigation("agents")}
          >
            <IconUsers />
            <span style={{ fontSize: "16px", lineHeight: "20px" }}>Agents</span>
          </button>
          <button
            style={{
              ...sidebarRowBase,
              backgroundColor: currentView === "settings" ? "rgba(255,255,255,0.1)" : "transparent",
            }}
            onClick={() => handleNavigation("settings")}
          >
            <IconCog />
            <span style={{ fontSize: "16px", lineHeight: "20px" }}>Settings</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {currentView === "settings" && <Settings />}
        {currentView === "agents" && <AgentsManager onBack={() => handleNavigation("home")} />}
        {currentView === "today" && <TodayPage onTaskClick={(taskId) => setSelectedTaskId(taskId)} />}
        {currentView === "home" && (
          <SpaceHome
            selectedSpace={selectedSpace}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            onShowNewTaskDialog={() => setShowNewTaskDialog(true)}
            onShowNewSpaceDialog={handleCreateSpace}
            onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
            refreshTrigger={taskRefreshTrigger}
            onUpdateSpaceTitle={handleUpdateSpaceTitle}
            shouldEditSpaceTitle={shouldEditSpaceTitle}
          />
        )}
      </div>

      {showNewTaskDialog && (
        <Dialog
          title="Add new task"
          onClose={() => {
            setShowNewTaskDialog(false);
            setNewTaskTitle("");
          }}
          sx={{
            backgroundColor: "canvas.default",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            boxShadow: "shadow.large",
          }}
        >
          <div style={{ padding: "16px", backgroundColor: "var(--bgColor-default, #ffffff)" }}>
            <TextInput
              placeholder="Enter task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              sx={{ width: "100%", mb: 3 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTaskTitle.trim()) {
                  e.preventDefault();
                  handleCreateTaskFromDialog();
                }
              }}
            />
            <ButtonGroup>
              <Button
                variant="primary"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (newTaskTitle.trim()) {
                    handleCreateTaskFromDialog().catch(console.error);
                  }
                }}
                disabled={!newTaskTitle.trim()}
              >
                Add Task
              </Button>
              <Button
                onClick={() => {
                  setShowNewTaskDialog(false);
                  setNewTaskTitle("");
                }}
              >
                Cancel
              </Button>
            </ButtonGroup>
          </div>
        </Dialog>
      )}

      <UpdateNotification />
    </div>
  );
}

export default App;
