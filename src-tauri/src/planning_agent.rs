use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use crate::chat::{send_chat_message, ChatMessage};
use crate::database::Agent;
use crate::settings::get_db_pool;
use tauri::Emitter;

#[derive(Debug, Deserialize)]
pub struct ClaudeResponse {
    pub content: Vec<ContentBlock>,
    pub stop_reason: String,
    #[allow(dead_code)]
    pub usage: Option<Usage>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Serialize)]
pub struct PlanningResult {
    pub success: bool,
    pub subtasks_created: i32,
    pub message: String,
}

pub struct PlanningAgent {
    app: tauri::AppHandle,
    task_id: i32,
    agent_prompt: String,
    model_name: String,
    available_agents: Vec<Agent>,
}

impl PlanningAgent {
    /// Create a new planning agent instance
    pub async fn new(
        app: tauri::AppHandle,
        task_id: i32,
    ) -> Result<Self, String> {
        let pool = get_db_pool()?;

        // Load planning agent from database by system_role
        let row = sqlx::query("SELECT id, name, model_name, agent_prompt FROM agents WHERE system_role = 'planning'")
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Planning agent not found in database. Please ensure a planning agent exists with system_role = 'planning'.".to_string())?;

        let agent_prompt: String = row.try_get("agent_prompt")
            .map_err(|e| format!("Failed to get agent_prompt: {}", e))?;

        // Get model from the planning agent record (can be customized in Agents UI)
        let model_name: String = row.try_get("model_name")
            .map_err(|e| format!("Failed to get model_name: {}", e))?;

        // Load all available agents for context (exclude system agents)
        let agent_rows = sqlx::query("SELECT id, name, model_name, agent_prompt FROM agents WHERE system_role IS NULL ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to load agents: {}", e))?;

        let mut available_agents = Vec::new();
        for row in agent_rows {
            available_agents.push(Agent {
                id: row.try_get("id").unwrap_or(0),
                name: row.try_get("name").unwrap_or_else(|_| "Unknown".to_string()),
                model_name: row.try_get("model_name").unwrap_or_else(|_| "unknown".to_string()),
                agent_prompt: row.try_get("agent_prompt").unwrap_or_else(|_| "".to_string()),
                system_role: None, // User agents don't have system roles
            });
        }

        Ok(Self {
            app,
            task_id,
            agent_prompt,
            model_name,
            available_agents,
        })
    }

    /// Get tool definitions for the planning agent (Claude API tool-use format)
    fn get_tool_schemas(&self) -> Vec<serde_json::Value> {
        vec![json!({
            "name": "create_subtask",
            "description": "Create a new subtask for the task being planned",
            "input_schema": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "number",
                        "description": "The ID of the parent task (will be auto-filled)"
                    },
                    "title": {
                        "type": "string",
                        "description": "Clear, action-oriented title for the subtask"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of subtask scope, deliverables, and expectations"
                    },
                    "agent_id": {
                        "type": "number",
                        "description": "ID of the agent best suited for this subtask"
                    }
                },
                "required": ["task_id", "title", "description", "agent_id"]
            }
        })]
    }

    /// Build system prompt with agent context
    fn build_system_prompt(&self, task_title: &str, task_description: &Option<String>) -> String {
        let agents_context = self
            .available_agents
            .iter()
            .map(|agent| {
                format!(
                    "**Agent ID {}: {} (Model: {})**\n{}\n",
                    agent.id, agent.name, agent.model_name, agent.agent_prompt
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        format!(
            "{}\n\n## Current Planning Task\n\n**Task ID**: {}\n**Title**: {}\n**Description**: {}\n\n## Available Agents for Assignment\n\n{}\n\n## Instructions\n\nAnalyze this task and create appropriate subtasks using the create_subtask tool. Each subtask should have a clear title, detailed description, and be assigned to the most suitable agent based on their capabilities.",
            self.agent_prompt,
            self.task_id,
            task_title,
            task_description.as_deref().unwrap_or("No description provided"),
            agents_context
        )
    }

    /// Execute create_subtask tool call
    async fn execute_create_subtask(&self, input: serde_json::Value) -> Result<String, String> {
        let title: String = input["title"]
            .as_str()
            .ok_or("Missing title")?
            .to_string();
        let description: String = input["description"]
            .as_str()
            .ok_or("Missing description")?
            .to_string();
        let agent_id: i32 = input["agent_id"]
            .as_i64()
            .ok_or("Missing agent_id")? as i32;

        // Validate agent exists
        if !self
            .available_agents
            .iter()
            .any(|a| a.id == agent_id)
        {
            return Err(format!("Invalid agent_id: {}", agent_id));
        }

        // Insert into database
        let pool = get_db_pool()?;

        sqlx::query(
            "INSERT INTO subtasks (task_id, title, description, agent_id, completed, created_at, updated_at)
             VALUES (?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(self.task_id)
        .bind(&title)
        .bind(&description)
        .bind(agent_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create subtask: {}", e))?;

        Ok(format!("Successfully created subtask: '{}'", title))
    }

    /// Emit progress event
    async fn emit_progress(
        &self,
        status: &str,
        message: &str,
        progress: f32,
        current_step: Option<&str>,
    ) -> Result<(), String> {
        let event = serde_json::json!({
            "task_id": self.task_id,
            "status": status,
            "message": message,
            "progress": progress.clamp(0.0, 1.0),
            "current_step": current_step
        });

        self.app
            .emit("task-planning-progress", event)
            .map_err(|e| format!("Failed to emit progress: {}", e))
    }

    /// Main planning workflow - AI agent creates subtasks via tool use
    pub async fn plan_task(
        &self,
        task_title: String,
        task_description: Option<String>,
    ) -> Result<PlanningResult, String> {
        self.emit_progress("analyzing", "Initializing AI planning agent...", 0.1, Some("Initialization"))
            .await?;

        let system_prompt = self.build_system_prompt(&task_title, &task_description);

        let user_message = "Please analyze this task and create a comprehensive breakdown using the create_subtask tool. Create 3-7 subtasks that cover the complete workflow, and assign each to the most appropriate agent.".to_string();

        // Build initial messages
        let mut conversation_messages: Vec<ChatMessage> = vec![ChatMessage {
            role: "user".to_string(),
            content: serde_json::Value::String(user_message),
        }];

        let mcp_tools = self.get_tool_schemas();
        let mut subtasks_created = 0;
        let mut tool_use_iterations = 0;
        const MAX_ITERATIONS: usize = 20;

        self.emit_progress("planning", "AI agent analyzing task...", 0.2, Some("Analysis"))
            .await?;

        // Tool use loop
        loop {
            tool_use_iterations += 1;
            if tool_use_iterations > MAX_ITERATIONS {
                return Err(format!("Planning exceeded maximum iterations ({})", MAX_ITERATIONS));
            }

            // Call Claude API
            let response_text = send_chat_message(
                self.app.clone(),
                self.model_name.clone(),
                conversation_messages.clone(),
                Some(system_prompt.clone()),
                4096,
                Some(mcp_tools.to_vec()),
                None,
            )
            .await?;

            let response: ClaudeResponse = serde_json::from_str(&response_text)
                .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

            // Check stop reason
            if response.stop_reason == "end_turn" {
                // Agent finished planning
                break;
            }

            if response.stop_reason != "tool_use" {
                return Err(format!("Unexpected stop reason: {}", response.stop_reason));
            }

            // Extract tool calls and text
            let mut tool_calls = Vec::new();
            let mut _text_content = String::new();

            for block in &response.content {
                match block {
                    ContentBlock::Text { text } => {
                        _text_content.push_str(text);
                    }
                    ContentBlock::ToolUse { id, name, input } => {
                        tool_calls.push((id.clone(), name.clone(), input.clone()));
                    }
                }
            }

            if tool_calls.is_empty() {
                return Err("Agent requested tool_use but provided no tool calls".to_string());
            }

            // Execute tool calls
            let mut tool_results = Vec::new();
            for (tool_id, tool_name, tool_input) in tool_calls {
                if tool_name == "create_subtask" {
                    match self.execute_create_subtask(tool_input).await {
                        Ok(result) => {
                            subtasks_created += 1;

                            // Update progress
                            let progress = 0.2 + (0.6 * (subtasks_created as f32 / 5.0)).min(0.6);
                            self.emit_progress(
                                "creating",
                                &format!("Created subtask {} of estimated 3-7...", subtasks_created),
                                progress,
                                Some("Subtask Creation"),
                            )
                            .await?;

                            tool_results.push(json!({
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "content": result
                            }));
                        }
                        Err(e) => {
                            tool_results.push(json!({
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "is_error": true,
                                "content": format!("Tool execution error: {}", e)
                            }));
                        }
                    }
                } else {
                    tool_results.push(json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "is_error": true,
                        "content": format!("Unknown tool: {}", tool_name)
                    }));
                }
            }

            // Add assistant response to conversation
            conversation_messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: serde_json::json!(response.content),
            });

            // Add tool results
            conversation_messages.push(ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!(tool_results),
            });
        }

        self.emit_progress(
            "finalizing",
            "Planning complete, generating summary...",
            0.9,
            Some("Finalization"),
        )
        .await?;

        Ok(PlanningResult {
            success: true,
            subtasks_created,
            message: format!(
                "Successfully created {} subtasks using AI planning agent",
                subtasks_created
            ),
        })
    }

    /// Fallback planning if AI agent fails
    async fn fallback_planning(
        &self,
        _task_title: &str,
        _task_description: &Option<String>,
    ) -> Result<PlanningResult, String> {
        eprintln!("Warning: Using fallback planning (AI agent unavailable)");

        let subtasks = [
            ("Research and plan approach", "Gather requirements, research best practices, and develop a comprehensive execution plan"),
            ("Execute primary deliverables", "Complete the main task deliverables according to the researched plan and requirements"),
            ("Review and finalize output", "Quality check, refinements, and final validation of deliverables"),
        ];

        let mut subtasks_created = 0;
        for (index, (title, description)) in subtasks.iter().enumerate() {
            // Assign to agents in round-robin fashion
            let agent_id = if !self.available_agents.is_empty() {
                self.available_agents[index % self.available_agents.len()].id
            } else {
                return Err("No agents available for fallback planning".to_string());
            };

            let input = json!({
                "title": title,
                "description": description,
                "agent_id": agent_id
            });

            self.execute_create_subtask(input).await?;
            subtasks_created += 1;

            // Emit progress
            let progress = 0.3 + (0.5 * (subtasks_created as f32 / 3.0));
            self.emit_progress(
                "fallback_creating",
                &format!("Fallback: Created subtask {}/3", subtasks_created),
                progress,
                Some("Fallback Planning"),
            )
            .await?;
        }

        Ok(PlanningResult {
            success: true,
            subtasks_created,
            message: format!(
                "Created {} subtasks using fallback planning (AI agent unavailable)",
                subtasks_created
            ),
        })
    }

    /// Plan task with fallback to generic planning if AI fails
    pub async fn plan_task_with_fallback(
        &self,
        task_title: String,
        task_description: Option<String>,
    ) -> Result<PlanningResult, String> {
        // Try AI planning first
        match self.plan_task(task_title.clone(), task_description.clone()).await {
            Ok(result) => Ok(result),
            Err(e) => {
                eprintln!("AI planning failed: {}", e);
                eprintln!("Attempting fallback planning...");

                self.emit_progress(
                    "fallback",
                    "AI planning unavailable, using fallback...",
                    0.3,
                    Some("Fallback"),
                )
                .await?;

                self.fallback_planning(&task_title, &task_description).await
            }
        }
    }
}
