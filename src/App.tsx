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
  getAllProjects,
  getTasksByProject,
  createProject,
  createTask,
  updateTask,
} from "./api";
import type { Project, TaskWithSubTasks, NewProject, NewTask } from "./types";
import TaskDetail from "./components/TaskDetail";
import Settings from "./components/Settings";
import AgentsManager from "./components/AgentsManager";
import ProjectHome from "./components/ProjectHome";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadTasks(selectedProject.id);
    }
  }, [selectedProject]);

  async function loadProjects() {
    try {
      console.log("Loading projects...");
      setLoading(true);
      const fetchedProjects = await getAllProjects();
      console.log("Projects loaded:", fetchedProjects);
      setProjects(fetchedProjects);
      if (fetchedProjects.length > 0 && !selectedProject) {
        setSelectedProject(fetchedProjects[0]);
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
      alert("Failed to load projects: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks(projectId: number) {
    try {
      const fetchedTasks = await getTasksByProject(projectId);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      alert("Failed to load tasks: " + (error as Error).message);
    }
  }

  async function handleCreateProject() {
    if (!newProjectTitle.trim()) return;

    try {
      console.log("Creating project with title:", newProjectTitle);
      const newProject: NewProject = { title: newProjectTitle.trim() };
      const createdProject = await createProject(newProject);
      console.log("Project created successfully:", createdProject);
      setProjects((prev) => [createdProject, ...prev]);
      setSelectedProject(createdProject);
      setShowNewProjectDialog(false);
      setNewProjectTitle("");
    } catch (error) {
      console.error("Failed to create project:", error);
      alert("Failed to create project: " + (error as Error).message);
    }
  }

  async function handleCreateTask(
    title: string,
    status: "todo" | "in_progress" | "for_review" | "done" = "todo",
  ) {
    if (!selectedProject) {
      console.error("No selected project for task creation");
      return;
    }

    try {
      const newTask: NewTask = {
        project_id: selectedProject.id,
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

      // Trigger refresh in ProjectHome component
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
          projectName={selectedProject?.title || ""}
          onBack={() => setSelectedTaskId(null)}
          onUpdateTask={handleUpdateTask}
        />
      );
    }
  }

  // Determine which view to show in the main content area
  const currentView = showSettings ? "settings" : showAgents ? "agents" : "home";

  // Helper to handle navigation and clear other views
  const handleNavigation = (view: "home" | "settings" | "agents") => {
    setShowSettings(view === "settings");
    setShowAgents(view === "agents");
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
                label="New project"
                icon={PlusIcon}
                onClick={() => setShowNewProjectDialog(true)}
              />
            </NavList.Item>
            <NavList.Item
                key="0"
                onClick={() => {
                  setSelectedProject(null);
                }}
              >
                <NavList.LeadingVisual>
                  <StarIcon />
                </NavList.LeadingVisual>
                Today
              </NavList.Item>

            {projects.map((project) => (
              <NavList.Item
                key={project.id}
                onClick={() => {
                  setSelectedProject(project);
                  handleNavigation("home");
                }}
                aria-current={currentView === "home" && selectedProject?.id === project.id ? "page" : undefined}
              >
                <NavList.LeadingVisual>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: project.color,
                      borderRadius: "2px",
                    }}
                  />
                </NavList.LeadingVisual>
                {project.title}
              </NavList.Item>
            ))}
          </NavList>
        </div>

        {/* Main Content */}
        {currentView === "settings" && <Settings onBack={() => handleNavigation("home")} />}
        {currentView === "agents" && <AgentsManager onBack={() => handleNavigation("home")} />}
        {currentView === "home" && (
          <ProjectHome
            selectedProject={selectedProject}
            onTaskClick={(taskId) => setSelectedTaskId(taskId)}
            onShowNewTaskDialog={() => setShowNewTaskDialog(true)}
            onShowNewProjectDialog={() => setShowNewProjectDialog(true)}
            refreshTrigger={taskRefreshTrigger}
          />
        )}
      </div>

      {showNewProjectDialog && (
        <Dialog
          title="Create New Project"
          onClose={() => {
            setShowNewProjectDialog(false);
            setNewProjectTitle("");
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
              placeholder="Enter project title..."
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              sx={{ width: "100%", mb: 3 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateProject();
                }
              }}
            />
            <ButtonGroup>
              <Button
                variant="primary"
                onClick={handleCreateProject}
                disabled={!newProjectTitle.trim()}
              >
                Create Project
              </Button>
              <Button
                onClick={() => {
                  setShowNewProjectDialog(false);
                  setNewProjectTitle("");
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
