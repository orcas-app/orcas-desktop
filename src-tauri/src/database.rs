use serde::{Deserialize, Serialize};

// Space-related structs
#[derive(Debug, Serialize, Deserialize)]
pub struct Space {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSpace {
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

// Task-related structs
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: i64,
    pub space_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewTask {
    pub space_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
}

// Subtask-related structs
#[derive(Debug, Serialize, Deserialize)]
pub struct SubTask {
    pub id: i64,
    pub task_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub completed: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSubTask {
    pub task_id: i64,
    pub title: String,
    pub description: Option<String>,
}

// Composite structs
#[derive(Debug, Serialize, Deserialize)]
pub struct TaskWithSubTasks {
    #[serde(flatten)]
    pub task: Task,
    pub subtasks: Vec<SubTask>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpaceWithTasks {
    #[serde(flatten)]
    pub space: Space,
    pub tasks: Vec<TaskWithSubTasks>,
}

// Agent-related structs for task planning
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Agent {
    pub id: i32,
    pub name: String,
    pub model_name: String,
    pub agent_prompt: String,
    pub system_role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtaskPlan {
    pub title: String,
    pub description: String,
    pub agent_id: Option<i32>,
}
