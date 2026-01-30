import { useState, useEffect } from "react";
import { Box, Text, Button, Spinner, ProgressBar } from "@primer/react";
import { ChevronDownIcon, ChevronRightIcon, CheckCircleIcon, StopIcon, XIcon } from "@primer/octicons-react";
import { listen } from "@tauri-apps/api/event";
import { startTaskPlanning, cancelTaskPlanning } from "../api";
import type { SubTask, TaskWithSubTasks } from "../types";

interface PlanningProgressEvent {
  task_id: number;
  status: string;
  message: string;
  progress: number;
  current_step?: string;
}

interface PlanningCompleteEvent {
  task_id: number;
  success: boolean;
  message: string;
  subtasks_created?: number;
  error?: string;
}

interface PlanningCancelledEvent {
  task_id: number;
  message: string;
}

interface PlanCardProps {
  subtasks: SubTask[];
  task?: TaskWithSubTasks;
  onPlanningComplete?: () => void;
}

function PlanCard({ subtasks, task, onPlanningComplete }: PlanCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningProgress, setPlanningProgress] = useState<number>(0);
  const [planningMessage, setPlanningMessage] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<string>("");
  const [planningResult, setPlanningResult] = useState<string | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);

  const completedCount = subtasks.filter((s) => s.completed).length;
  const totalCount = subtasks.length;

  useEffect(() => {
    if (!task) return;

    const setupEventListeners = async () => {
      const unlistenProgress = await listen<PlanningProgressEvent>('task-planning-progress', (event) => {
        const progress = event.payload;
        if (progress.task_id === task.id) {
          setPlanningProgress(progress.progress);
          setPlanningMessage(progress.message);
          setCurrentStep(progress.current_step || "");
        }
      });

      const unlistenComplete = await listen<PlanningCompleteEvent>('task-planning-complete', (event) => {
        const completion = event.payload;
        if (completion.task_id === task.id) {
          setIsPlanning(false);
          setPlanningProgress(1.0);
          if (completion.success) {
            setPlanningResult(completion.message);
            setPlanningError(null);
            setPlanningMessage("Task planning completed successfully!");
            onPlanningComplete?.();
          } else {
            setPlanningError(completion.error || "Task planning failed");
            setPlanningResult(null);
            setPlanningMessage("");
          }
          setTimeout(() => {
            setPlanningProgress(0);
            setPlanningMessage("");
            setCurrentStep("");
          }, 3000);
        }
      });

      const unlistenCancelled = await listen<PlanningCancelledEvent>('task-planning-cancelled', (event) => {
        const cancellation = event.payload;
        if (cancellation.task_id === task.id) {
          setIsPlanning(false);
          setPlanningProgress(0);
          setWasCancelled(true);
          setPlanningMessage("");
          setCurrentStep("");
          setPlanningResult(null);
          setPlanningError(null);
          setTimeout(() => {
            setWasCancelled(false);
          }, 2000);
        }
      });

      return () => {
        unlistenProgress();
        unlistenComplete();
        unlistenCancelled();
      };
    };

    const cleanup = setupEventListeners();
    return () => {
      cleanup.then((fn) => fn?.());
    };
  }, [task, onPlanningComplete]);

  const handlePlanTask = async () => {
    if (!task) return;

    try {
      setIsPlanning(true);
      setPlanningResult(null);
      setPlanningProgress(0);
      setPlanningMessage("Starting task planning...");
      setCurrentStep("");
      setPlanningError(null);
      setWasCancelled(false);

      await startTaskPlanning(task.id, task.title, task.description);
    } catch (err) {
      console.error("Failed to start task planning:", err);
      setPlanningError("Failed to start task planning");
      setIsPlanning(false);
      setPlanningProgress(0);
      setPlanningMessage("");
      setCurrentStep("");
    }
  };

  const handleCancelPlanning = async () => {
    if (!task) return;

    try {
      await cancelTaskPlanning(task.id);
    } catch (err) {
      console.error("Failed to cancel task planning:", err);
      setPlanningError("Failed to cancel task planning");
    }
  };

  // Empty state - show "Plan task" CTA
  if (totalCount === 0 && !isPlanning && !planningResult && !wasCancelled) {
    return (
      <Box
        backgroundColor="canvas.subtle"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        p={3}
      >
        <Text sx={{ fontWeight: "semibold", fontSize: 1, mb: 2, display: "block" }}>
          Plan
        </Text>
        <Text sx={{ fontSize: 0, color: "fg.muted", mb: 3, display: "block" }}>
          No subtasks yet. Let AI analyze this task and create a plan.
        </Text>
        {planningError && (
          <Box p={2} mb={3} backgroundColor="danger.subtle" border="1px solid" borderColor="danger.muted" borderRadius={2}>
            <Text sx={{ fontSize: 0, color: "danger.fg" }}>{planningError}</Text>
          </Box>
        )}
        <Button
          size="medium"
          variant="primary"
          onClick={handlePlanTask}
          disabled={!task}
          sx={{ width: "100%" }}
        >
          Plan task
        </Button>
      </Box>
    );
  }

  // Planning in progress
  if (isPlanning) {
    return (
      <Box
        backgroundColor="canvas.subtle"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        p={3}
      >
        <Text sx={{ fontWeight: "semibold", fontSize: 1, mb: 3, display: "block" }}>
          Plan
        </Text>
        <Box p={3} backgroundColor="canvas.inset" border="1px solid" borderColor="border.muted" borderRadius={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" sx={{ gap: 2 }}>
              <Spinner size="small" />
              <Text sx={{ fontSize: 1, fontWeight: "semibold" }}>
                {currentStep || "Processing..."}
              </Text>
            </Box>
            <Text sx={{ fontSize: 0, color: "fg.muted", fontFamily: "mono" }}>
              {Math.round(planningProgress * 100)}%
            </Text>
          </Box>
          <ProgressBar progress={planningProgress} sx={{ mb: 2 }} />
          {planningMessage && (
            <Text sx={{ fontSize: 0, color: "fg.muted", mb: 2, display: "block" }}>
              {planningMessage}
            </Text>
          )}
          <Button
            size="small"
            variant="danger"
            onClick={handleCancelPlanning}
            sx={{ width: "100%" }}
            leadingVisual={StopIcon}
          >
            Cancel Planning
          </Button>
        </Box>
      </Box>
    );
  }

  // Planning complete (success) but no subtasks yet (waiting for refresh)
  if (planningResult && totalCount === 0) {
    return (
      <Box
        backgroundColor="canvas.subtle"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        p={3}
      >
        <Text sx={{ fontWeight: "semibold", fontSize: 1, mb: 3, display: "block" }}>
          Plan
        </Text>
        <Box p={3} backgroundColor="success.subtle" border="1px solid" borderColor="success.muted" borderRadius={2}>
          <Text sx={{ fontSize: 1, fontWeight: "semibold", mb: 2, color: "success.fg", display: "flex", alignItems: "center", gap: 1 }}>
            <CheckCircleIcon size={16} />
            Task Planning Complete
          </Text>
          <Text sx={{ fontSize: 0, color: "success.fg", whiteSpace: "pre-line" }}>
            {planningResult}
          </Text>
        </Box>
      </Box>
    );
  }

  // Cancelled state
  if (wasCancelled) {
    return (
      <Box
        backgroundColor="canvas.subtle"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        p={3}
      >
        <Text sx={{ fontWeight: "semibold", fontSize: 1, mb: 3, display: "block" }}>
          Plan
        </Text>
        <Box p={3} backgroundColor="attention.subtle" border="1px solid" borderColor="attention.muted" borderRadius={2}>
          <Text sx={{ fontSize: 1, fontWeight: "semibold", color: "attention.fg", display: "flex", alignItems: "center", gap: 1 }}>
            <XIcon size={16} />
            Task planning cancelled
          </Text>
          <Text sx={{ fontSize: 0, color: "attention.fg", mt: 1, display: "block" }}>
            The task planning operation was cancelled. You can try again at any time.
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      backgroundColor="canvas.subtle"
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      overflow="hidden"
    >
      {/* Collapsed header - always visible */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        p={3}
        sx={{
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "canvas.default",
          },
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box display="flex" alignItems="center" sx={{ gap: 2 }}>
          {isExpanded ? (
            <ChevronDownIcon size={16} />
          ) : (
            <ChevronRightIcon size={16} />
          )}
          <Text sx={{ fontWeight: "semibold", fontSize: 1 }}>Plan</Text>
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>
            {totalCount} subtask{totalCount !== 1 ? "s" : ""}
          </Text>
        </Box>
        <Box display="flex" alignItems="center" sx={{ gap: 1 }}>
          {completedCount > 0 && (
            <>
              <CheckCircleIcon size={14} className="color-fg-success" />
              <Text sx={{ fontSize: 0, color: "success.fg" }}>
                {completedCount}/{totalCount}
              </Text>
            </>
          )}
        </Box>
      </Box>

      {/* Expanded content */}
      {isExpanded && (
        <Box
          borderTop="1px solid"
          borderColor="border.default"
          p={3}
          display="flex"
          flexDirection="column"
          sx={{ gap: 2 }}
        >
          {subtasks.map((subtask, index) => {
            const isSubtaskExpanded = expandedSubtasks.has(subtask.id);
            const hasDescription = subtask.description && subtask.description.trim().length > 0;

            const toggleSubtask = () => {
              if (!hasDescription) return;
              setExpandedSubtasks((prev) => {
                const next = new Set(prev);
                if (next.has(subtask.id)) {
                  next.delete(subtask.id);
                } else {
                  next.add(subtask.id);
                }
                return next;
              });
            };

            return (
              <Box key={subtask.id}>
                <Box
                  display="flex"
                  alignItems="center"
                  sx={{
                    gap: 2,
                    cursor: hasDescription ? "pointer" : "default",
                    "&:hover": hasDescription ? {
                      backgroundColor: "canvas.default",
                    } : {},
                    borderRadius: 1,
                    p: 1,
                    ml: -1,
                  }}
                  onClick={toggleSubtask}
                >
                  {hasDescription && (
                    <Box sx={{ color: "fg.muted", flexShrink: 0 }}>
                      {isSubtaskExpanded ? (
                        <ChevronDownIcon size={14} />
                      ) : (
                        <ChevronRightIcon size={14} />
                      )}
                    </Box>
                  )}
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: subtask.completed
                        ? "success.emphasis"
                        : "border.default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: subtask.completed ? "fg.onEmphasis" : "fg.muted",
                      fontSize: 0,
                      fontWeight: "bold",
                      flexShrink: 0,
                      ml: hasDescription ? 0 : 3,
                    }}
                  >
                    {subtask.completed ? "✓" : index + 1}
                  </Box>
                  <Text
                    sx={{
                      fontSize: 1,
                      textDecoration: subtask.completed ? "line-through" : "none",
                      color: subtask.completed ? "fg.muted" : "fg.default",
                    }}
                  >
                    {subtask.title}
                  </Text>
                </Box>
                {/* Subtask description */}
                {isSubtaskExpanded && hasDescription && (
                  <Box
                    sx={{
                      ml: 6,
                      mt: 1,
                      pl: 3,
                      borderLeft: "2px solid",
                      borderColor: "border.default",
                    }}
                  >
                    <Text
                      sx={{
                        fontSize: 0,
                        color: "fg.muted",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {subtask.description}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default PlanCard;
