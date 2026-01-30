import { useState, useEffect } from "react";
import { Heading, Button, Text } from "@primer/react";
import { getTasksByProject } from "../api";
import type { Project, TaskWithSubTasks } from "../types";
import StatusChip from "./StatusChip";

interface ProjectHomeProps {
  selectedProject: Project | null;
  onTaskClick: (taskId: number) => void;
  onShowNewTaskDialog: () => void;
  onShowNewProjectDialog: () => void;
  refreshTrigger?: number; // Add optional prop to trigger refresh
}

function ProjectHome({
  selectedProject,
  onTaskClick,
  onShowNewTaskDialog,
  onShowNewProjectDialog,
  refreshTrigger,
}: ProjectHomeProps) {
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);

  // Show non-done tasks first, then done tasks at the end
  const sortedTasks = [
    ...tasks.filter((task) => task.status !== "done"),
    ...tasks.filter((task) => task.status === "done"),
  ];

  useEffect(() => {
    if (selectedProject) {
      loadTasks(selectedProject.id);
    }
  }, [selectedProject, refreshTrigger]); // Re-run when refreshTrigger changes

  async function loadTasks(projectId: number) {
    try {
      const fetchedTasks = await getTasksByProject(projectId);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      alert("Failed to load tasks: " + (error as Error).message);
    }
  }


  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      {selectedProject && (
        <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "32px",
            }}
          >
            <Heading sx={{ fontSize: 4, color: selectedProject.color }}>
              {selectedProject.title}
            </Heading>
            <Button variant="primary" onClick={onShowNewTaskDialog}>
              + Add Task
            </Button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
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
                    borderLeft: `4px solid ${selectedProject.color}`,
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
      )}

      {!selectedProject && (
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
            Create your first project to get started!
          </Text>
          <Button
            variant="primary"
            size="large"
            onClick={onShowNewProjectDialog}
          >
            Create First Project
          </Button>
        </div>
      )}
    </div>
  );
}

export default ProjectHome;
