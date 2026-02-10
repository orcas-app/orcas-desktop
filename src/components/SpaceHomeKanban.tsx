import { useState, useEffect } from "react";
import { Box, Heading, Button, Text } from "@primer/react";
import { getTasksBySpace } from "../api";
import type { Space, TaskWithSubTasks } from "../types";
import StatusChip from "./StatusChip";

interface SpaceHomeProps {
  selectedSpace: Space | null;
  onTaskClick: (taskId: number) => void;
  onShowNewTaskDialog: () => void;
  onShowNewSpaceDialog: () => void;
}

function SpaceHome({
  selectedSpace,
  onTaskClick,
  onShowNewTaskDialog,
  onShowNewSpaceDialog,
}: SpaceHomeProps) {
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>([]);

  const todoTasks = tasks.filter((task) => task.status === "todo");
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const forReviewTasks = tasks.filter((task) => task.status === "for_review");
  const doneTasks = tasks.filter((task) => task.status === "done");

  useEffect(() => {
    if (selectedSpace) {
      loadTasks(selectedSpace.id);
    }
  }, [selectedSpace]);

  async function loadTasks(spaceId: number) {
    try {
      const fetchedTasks = await getTasksBySpace(spaceId);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      alert("Failed to load tasks: " + (error as Error).message);
    }
  }

  return (
    <Box flex={1}>
      {selectedSpace && (
        <Box p={4}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={4}
          >
            <Heading sx={{ fontSize: 4, color: selectedSpace.color }}>
              {selectedSpace.title}
            </Heading>
            <Button variant="primary" onClick={onShowNewTaskDialog}>
              + Add Task
            </Button>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns="1fr 1fr 1fr 1fr"
            gridGap={4}
            height="calc(100vh - 180px)"
          >
            <Box
              backgroundColor="canvas.subtle"
              borderRadius={2}
              p={3}
              border="1px solid"
              borderColor="border.default"
            >
              <Heading sx={{ fontSize: 2, mb: 3, color: "fg.default" }}>
                To Do ({todoTasks.length})
              </Heading>
              <Box
                display="flex"
                flexDirection="column"
                sx={{
                  gap: 3,
                  overflowY: "auto",
                  maxHeight: "calc(100% - 60px)",
                }}
              >
                {todoTasks.map((task) => (
                  <Box
                    key={task.id}
                    backgroundColor="canvas.default"
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius={2}
                    p={3}
                    sx={{
                      "&:hover": {
                        boxShadow: "shadow.medium",
                        cursor: "pointer",
                      },
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <Heading sx={{ fontSize: 1, mb: 2, color: "fg.default" }}>
                      {task.title}
                    </Heading>
                    <StatusChip variant={task.status}>
                      {task.status.replace("_", " ").toUpperCase()}
                    </StatusChip>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box
              backgroundColor="canvas.subtle"
              borderRadius={2}
              p={3}
              border="1px solid"
              borderColor="border.default"
            >
              <Heading sx={{ fontSize: 2, mb: 3, color: "fg.default" }}>
                In Progress ({inProgressTasks.length})
              </Heading>
              <Box
                display="flex"
                flexDirection="column"
                sx={{
                  gap: 3,
                  overflowY: "auto",
                  maxHeight: "calc(100% - 60px)",
                }}
              >
                {inProgressTasks.map((task) => (
                  <Box
                    key={task.id}
                    backgroundColor="canvas.default"
                    border="1px solid"
                    borderColor="border.default"
                    borderLeft="4px solid"
                    borderLeftColor="attention.emphasis"
                    borderRadius={2}
                    p={3}
                    sx={{
                      "&:hover": {
                        boxShadow: "shadow.medium",
                        cursor: "pointer",
                      },
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <Heading sx={{ fontSize: 1, mb: 2, color: "fg.default" }}>
                      {task.title}
                    </Heading>
                    {task.description && (
                      <Text sx={{ fontSize: 1, color: "fg.muted", mb: 3 }}>
                        {task.description}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            <Box
              backgroundColor="canvas.subtle"
              borderRadius={2}
              p={3}
              border="1px solid"
              borderColor="border.default"
            >
              <Heading sx={{ fontSize: 2, mb: 3, color: "fg.default" }}>
                For Review ({forReviewTasks.length})
              </Heading>
              <Box
                display="flex"
                flexDirection="column"
                sx={{
                  gap: 3,
                  overflowY: "auto",
                  maxHeight: "calc(100% - 60px)",
                }}
              >
                {forReviewTasks.map((task) => (
                  <Box
                    key={task.id}
                    backgroundColor="canvas.default"
                    border="1px solid"
                    borderColor="border.default"
                    borderLeft="4px solid"
                    borderLeftColor="accent.emphasis"
                    borderRadius={2}
                    p={3}
                    sx={{
                      "&:hover": {
                        boxShadow: "shadow.medium",
                        cursor: "pointer",
                      },
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <Heading sx={{ fontSize: 1, mb: 2, color: "fg.default" }}>
                      {task.title}
                    </Heading>
                    {task.description && (
                      <Text sx={{ fontSize: 1, color: "fg.muted", mb: 3 }}>
                        {task.description}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            <Box
              backgroundColor="canvas.subtle"
              borderRadius={2}
              p={3}
              border="1px solid"
              borderColor="border.default"
            >
              <Heading sx={{ fontSize: 2, mb: 3, color: "fg.default" }}>
                Done ({doneTasks.length})
              </Heading>
              <Box
                display="flex"
                flexDirection="column"
                sx={{
                  gap: 3,
                  overflowY: "auto",
                  maxHeight: "calc(100% - 60px)",
                }}
              >
                {doneTasks.map((task) => (
                  <Box
                    key={task.id}
                    backgroundColor="canvas.default"
                    border="1px solid"
                    borderColor="border.default"
                    borderLeft="4px solid"
                    borderLeftColor="success.emphasis"
                    borderRadius={2}
                    p={3}
                    sx={{
                      opacity: 0.8,
                      "&:hover": {
                        boxShadow: "shadow.medium",
                        cursor: "pointer",
                      },
                    }}
                    onClick={() => onTaskClick(task.id)}
                  >
                    <Heading sx={{ fontSize: 1, mb: 2, color: "fg.default" }}>
                      {task.title}
                    </Heading>
                    {task.description && (
                      <Text sx={{ fontSize: 1, color: "fg.muted", mb: 3 }}>
                        {task.description}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {!selectedSpace && (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height="calc(100vh - 120px)"
          textAlign="center"
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
        </Box>
      )}
    </Box>
  );
}

export default SpaceHome;
