import { useState, useEffect } from "react";
import "./App.css";
import {
  Header,
  Heading,
  Button,
  Spinner,
  ButtonGroup,
  Dialog,
  TextInput,
  NavList,
} from "@primer/react";
import {
  HomeIcon,
  ProjectIcon,
  GearIcon,
  PlusIcon,
  PeopleIcon,
  StarIcon,
} from "@primer/octicons-react";
import {
  getAllSpaces,
  getTasksBySpace,
  createSpace,
  createTask,
  updateTask,
} from "./api";
import type { Space, TaskWithSubTasks, NewSpace, NewTask } from "./types";
import TaskDetail from "./components/TaskDetail";
import Settings from "./components/Settings";
import AgentsManager from "./components/AgentsManager";
import SpaceHome from "./components/SpaceHome";
import TodayPage from "./components/TodayPage";

function App() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSpaceDialog, setShowNewSpaceDialog] = useState(false);
  const [newSpaceTitle, setNewSpaceTitle] = useState("");
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0);

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
    if (!newSpaceTitle.trim()) return;

    try {
      console.log("Creating space with title:", newSpaceTitle);
      const newSpace: NewSpace = { title: newSpaceTitle.trim() };
      const createdSpace = await createSpace(newSpace);
      console.log("Space created successfully:", createdSpace);
      setSpaces((prev) => [createdSpace, ...prev]);
      setSelectedSpace(createdSpace);
      setShowNewSpaceDialog(false);
      setNewSpaceTitle("");
    } catch (error) {
      console.error("Failed to create space:", error);
      alert("Failed to create space: " + (error as Error).message);
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

      // Trigger refresh in SpaceHome component
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
      const updatedTask = await updateTask(taskId, updates);

      // Update the task in the local state
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Spinner size="large" />
      </div>
    );
  }

  // Show task detail view if a task is selected (full screen for now)
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

  // Determine which view to show in the main content area
  const currentView = showSettings ? "settings" : showAgents ? "agents" : showToday ? "today" : "home";

  // Helper to handle navigation and clear other views
  const handleNavigation = (view: "home" | "settings" | "agents" | "today") => {
    setShowSettings(view === "settings");
    setShowAgents(view === "agents");
    setShowToday(view === "today");
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <div
          style={{
            width: "240px",
            backgroundColor: "var(--bgColor-muted, #f6f8fa)",
            borderRight: "1px solid var(--borderColor-default, #d0d7de)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <NavList>
            <Header>
              <Header.Item>
                <Heading sx={{ fontSize: 2 }}>Orcas</Heading>
              </Header.Item>
            </Header>

            <NavList.Item
              onClick={() => handleNavigation("home")}
              aria-current={currentView === "home" ? "page" : undefined}
            >
              <NavList.LeadingVisual>
                <HomeIcon />
              </NavList.LeadingVisual>
              Home
            </NavList.Item>

            <NavList.Item href="#" aria-current={undefined}>
              <NavList.LeadingVisual>
                <ProjectIcon />
              </NavList.LeadingVisual>
              For review
            </NavList.Item>

            <NavList.Item
              onClick={() => handleNavigation("agents")}
              aria-current={currentView === "agents" ? "page" : undefined}
            >
              <NavList.LeadingVisual>
                <PeopleIcon />
              </NavList.LeadingVisual>
              Agents
            </NavList.Item>

            <NavList.Item
              onClick={() => handleNavigation("settings")}
              aria-current={currentView === "settings" ? "page" : undefined}
            >
              <NavList.LeadingVisual>
                <GearIcon />
              </NavList.LeadingVisual>
              Settings
            </NavList.Item>

            <NavList.Divider />
            <NavList.Item>
              Work
              <NavList.TrailingAction
                label="New space"
                icon={PlusIcon}
                onClick={() => setShowNewSpaceDialog(true)}
              />
            </NavList.Item>
            <NavList.Item
                key="0"
                onClick={() => handleNavigation("today")}
                aria-current={currentView === "today" ? "page" : undefined}
              >
                <NavList.LeadingVisual>
                  <StarIcon />
                </NavList.LeadingVisual>
                Today
              </NavList.Item>

            {spaces.map((space) => (
              <NavList.Item
                key={space.id}
                onClick={() => {
                  setSelectedSpace(space);
                  handleNavigation("home");
                }}
                aria-current={currentView === "home" && selectedSpace?.id === space.id ? "page" : undefined}
              >
                <NavList.LeadingVisual>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: space.color,
                      borderRadius: "2px",
                    }}
                  />
                </NavList.LeadingVisual>
                {space.title}
              </NavList.Item>
            ))}
          </NavList>
        </div>

        {/* Main Content */}
        {currentView === "settings" && <Settings />}
        {currentView === "agents" && <AgentsManager onBack={() => handleNavigation("home")} />}
        {currentView === "today" && <TodayPage onTaskClick={(taskId) => setSelectedTaskId(taskId)} />}
        {currentView === "home" && (
          <SpaceHome
            selectedSpace={selectedSpace}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            onShowNewTaskDialog={() => setShowNewTaskDialog(true)}
            onShowNewSpaceDialog={() => setShowNewSpaceDialog(true)}
            refreshTrigger={taskRefreshTrigger}
          />
        )}
      </div>

      {showNewSpaceDialog && (
        <Dialog
          title="Create New Space"
          onClose={() => {
            setShowNewSpaceDialog(false);
            setNewSpaceTitle("");
          }}
          sx={{
            backgroundColor: "canvas.default",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            boxShadow: "shadow.large",
          }}
        >
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bgColor-default, #ffffff)",
            }}
          >
            <TextInput
              placeholder="Enter space title..."
              value={newSpaceTitle}
              onChange={(e) => setNewSpaceTitle(e.target.value)}
              sx={{ width: "100%", mb: 3 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateSpace();
                }
              }}
            />
            <ButtonGroup>
              <Button
                variant="primary"
                onClick={handleCreateSpace}
                disabled={!newSpaceTitle.trim()}
              >
                Create Space
              </Button>
              <Button
                onClick={() => {
                  setShowNewSpaceDialog(false);
                  setNewSpaceTitle("");
                }}
              >
                Cancel
              </Button>
            </ButtonGroup>
          </div>
        </Dialog>
      )}

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
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bgColor-default, #ffffff)",
            }}
          >
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
    </div>
  );
}

export default App;
