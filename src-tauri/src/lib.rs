mod database;

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::{Arc, LazyLock};
use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::process::Command;
use tokio::sync::Mutex;

mod chat;
mod settings;
mod providers;
mod planning_agent;
mod edit_locks;
mod task_notes;
mod space_context;
mod calendar;
#[derive(Debug, Serialize, Deserialize)]
struct PlanningResult {
    success: bool,
    message: String,
    subtasks_created: Option<i32>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct PlanningCompleteEvent {
    task_id: i32,
    success: bool,
    message: String,
    subtasks_created: Option<i32>,
    error: Option<String>,
}

// Global state to track MCP server process
static MCP_SERVER_PROCESS: LazyLock<Arc<Mutex<Option<tokio::process::Child>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(None)));

#[tauri::command]
async fn start_mcp_server() -> Result<String, String> {
    let process_guard = MCP_SERVER_PROCESS.clone();
    let mut guard = process_guard.lock().await;

    // If server is already running, return success
    if guard.is_some() {
        return Ok("MCP server is already running".to_string());
    }

    // Start the MCP server process from the current working directory
    let child = Command::new("npx")
        .args(["tsx", "src/mcp-servers/agent-notes-server.ts"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start MCP server: {}", e))?;

    *guard = Some(child);
    Ok("MCP server started successfully".to_string())
}

#[tauri::command]
async fn stop_mcp_server() -> Result<String, String> {
    let process_guard = MCP_SERVER_PROCESS.clone();
    let mut guard = process_guard.lock().await;

    if let Some(mut child) = guard.take() {
        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill MCP server: {}", e))?;
        Ok("MCP server stopped successfully".to_string())
    } else {
        Ok("MCP server was not running".to_string())
    }
}

#[tauri::command]
async fn start_task_planning(
    task_id: i32,
    task_title: String,
    task_description: Option<String>,
    agents: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // Spawn the planning task in the background
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        let app_handle_for_error = app_handle_clone.clone();
        if let Err(e) = execute_task_planning(
            task_id,
            task_title,
            task_description,
            agents,
            app_handle_clone,
        )
        .await
        {
            // Emit error event
            let error_event = PlanningCompleteEvent {
                task_id,
                success: false,
                message: "Task planning failed".to_string(),
                subtasks_created: None,
                error: Some(e),
            };
            let _ = app_handle_for_error.emit("task-planning-complete", error_event);
        }
    });

    Ok("Task planning started".to_string())
}

async fn execute_task_planning(
    task_id: i32,
    task_title: String,
    task_description: Option<String>,
    _agents: String, // DEPRECATED: agents now loaded from database
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use planning_agent::PlanningAgent;

    // Create planning agent instance
    let planning_agent = PlanningAgent::new(app_handle.clone(), task_id).await?;

    // Execute AI-powered planning with fallback
    match planning_agent
        .plan_task_with_fallback(task_title.clone(), task_description.clone())
        .await
    {
        Ok(result) => {
            // Emit completion event
            let complete_event = PlanningCompleteEvent {
                task_id,
                success: true,
                message: result.message,
                subtasks_created: Some(result.subtasks_created),
                error: None,
            };
            app_handle
                .emit("task-planning-complete", complete_event)
                .map_err(|e| format!("Failed to emit complete event: {}", e))?;
            Ok(())
        }
        Err(e) => {
            // Emit error event
            let error_event = PlanningCompleteEvent {
                task_id,
                success: false,
                message: "Planning failed".to_string(),
                subtasks_created: None,
                error: Some(e),
            };
            app_handle
                .emit("task-planning-complete", error_event)
                .map_err(|e| format!("Failed to emit error event: {}", e))?;
            Err("Planning failed".to_string())
        }
    }
}

// Tauri command to get available models from the configured provider
#[tauri::command]
async fn get_available_models(
    app_handle: tauri::AppHandle,
) -> Result<Vec<providers::ModelInfo>, String> {
    providers::fetch_models(app_handle).await
}

// Tauri command to resolve a friendly model name to its full snapshot ID
#[tauri::command]
async fn resolve_model_id(
    app_handle: tauri::AppHandle,
    friendly_name: String,
) -> Result<String, String> {
    providers::resolve_model_name(app_handle, &friendly_name).await
}

// Tauri command to check if a model supports tool use
#[tauri::command]
async fn check_model_supports_tools(
    app_handle: tauri::AppHandle,
    model_name: String,
) -> Result<bool, String> {
    providers::check_model_supports_tools(app_handle, &model_name).await
}

// Calendar integration commands

#[tauri::command]
async fn request_calendar_permission() -> Result<calendar::PermissionStatus, String> {
    calendar::macos::request_calendar_permission().await
}

#[tauri::command]
fn get_calendar_list() -> Result<Vec<calendar::Calendar>, String> {
    calendar::macos::get_calendar_list()
}

#[tauri::command]
fn get_events_for_date(
    calendar_ids: Vec<String>,
    date: String,
) -> Result<Vec<calendar::CalendarEvent>, String> {
    calendar::macos::get_events_for_date(calendar_ids, date)
}

#[tauri::command]
fn open_calendar_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars")
            .spawn()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Calendar settings are only available on macOS".to_string())
    }
}

// Today page task queries

#[tauri::command]
async fn get_tasks_scheduled_for_date(
    date: String,
) -> Result<Vec<database::Task>, String> {
    let pool = settings::get_db_pool()?;

    sqlx::query_as::<_, database::Task>(
        r#"
        SELECT id, space_id, title, description, status, priority,
               due_date, scheduled_date, created_at, updated_at
        FROM tasks
        WHERE scheduled_date = ?
        ORDER BY created_at DESC
        "#
    )
    .bind(date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
async fn get_recently_edited_tasks(
    hours_ago: i64,
) -> Result<Vec<database::Task>, String> {
    let pool = settings::get_db_pool()?;

    sqlx::query_as::<_, database::Task>(
        r#"
        SELECT id, space_id, title, description, status, priority,
               due_date, scheduled_date, created_at, updated_at
        FROM tasks
        WHERE status != 'done'
          AND updated_at >= datetime('now', ? || ' hours')
        ORDER BY updated_at DESC
        "#
    )
    .bind(format!("-{}", hours_ago))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))
}

// Event-space tagging commands

#[derive(Debug, Serialize, Deserialize)]
struct EventSpaceAssociation {
    id: i64,
    space_id: i64,
    event_id_external: String,
    event_title: String,
    associated_date: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct EventSpaceTagWithSpace {
    id: i64,
    space_id: i64,
    event_id_external: String,
    event_title: String,
    associated_date: String,
    created_at: String,
    space_title: String,
    space_color: String,
}

#[tauri::command]
async fn tag_event_to_space(
    space_id: i64,
    event_id: String,
    event_title: String,
    event_date: String,
) -> Result<(), String> {
    let pool = settings::get_db_pool()?;

    sqlx::query(
        "INSERT OR IGNORE INTO event_space_associations (space_id, event_id_external, event_title, associated_date) VALUES (?, ?, ?, ?)"
    )
    .bind(space_id)
    .bind(&event_id)
    .bind(&event_title)
    .bind(&event_date)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to tag event: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn untag_event_from_space(
    space_id: i64,
    event_id: String,
) -> Result<(), String> {
    let pool = settings::get_db_pool()?;

    sqlx::query(
        "DELETE FROM event_space_associations WHERE space_id = ? AND event_id_external = ?"
    )
    .bind(space_id)
    .bind(&event_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to untag event: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_event_space_tags(
    event_id: String,
) -> Result<Vec<EventSpaceTagWithSpace>, String> {
    let pool = settings::get_db_pool()?;

    let rows = sqlx::query_as::<_, (i64, i64, String, String, String, String, String, String)>(
        r#"
        SELECT esa.id, esa.space_id, esa.event_id_external, esa.event_title, esa.associated_date, esa.created_at,
               s.title as space_title, s.color as space_color
        FROM event_space_associations esa
        JOIN spaces s ON s.id = esa.space_id
        WHERE esa.event_id_external = ?
        ORDER BY s.title ASC
        "#
    )
    .bind(&event_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get event tags: {}", e))?;

    Ok(rows.into_iter().map(|r| EventSpaceTagWithSpace {
        id: r.0,
        space_id: r.1,
        event_id_external: r.2,
        event_title: r.3,
        associated_date: r.4,
        created_at: r.5,
        space_title: r.6,
        space_color: r.7,
    }).collect())
}

#[tauri::command]
async fn get_space_events(
    space_id: i64,
    start_date: String,
    end_date: String,
) -> Result<Vec<EventSpaceAssociation>, String> {
    let pool = settings::get_db_pool()?;

    let rows = sqlx::query_as::<_, (i64, i64, String, String, String, String)>(
        r#"
        SELECT id, space_id, event_id_external, event_title, associated_date, created_at
        FROM event_space_associations
        WHERE space_id = ? AND associated_date >= ? AND associated_date <= ?
        ORDER BY associated_date ASC
        "#
    )
    .bind(space_id)
    .bind(&start_date)
    .bind(&end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get space events: {}", e))?;

    Ok(rows.into_iter().map(|r| EventSpaceAssociation {
        id: r.0,
        space_id: r.1,
        event_id_external: r.2,
        event_title: r.3,
        associated_date: r.4,
        created_at: r.5,
    }).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_subtask_descriptions",
            sql: include_str!("../migrations/002_add_subtask_descriptions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "placeholder_migration",
            sql: include_str!("../migrations/003_placeholder_migration.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "placeholder_migration",
            sql: include_str!("../migrations/004_placeholder_migration.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "placeholder_migration",
            sql: include_str!("../migrations/006_placeholder_migration.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_agents_table",
            sql: include_str!("../migrations/009_add_agents_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_sample_agent",
            sql: include_str!("../migrations/010_add_sample_agent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_task_agent_sessions",
            sql: include_str!("../migrations/005_add_task_agent_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_marketing_copywriter_agent",
            sql: include_str!("../migrations/011_add_marketing_copywriter_agent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_task_notes_path",
            sql: include_str!("../migrations/007_add_task_notes_path.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_agent_notes_table",
            sql: include_str!("../migrations/008_create_agent_notes_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_settings_table",
            sql: include_str!("../migrations/012_add_settings_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_agent_id_to_subtasks",
            sql: include_str!("../migrations/012_add_agent_id_to_subtasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add_planning_agent",
            sql: include_str!("../migrations/013_add_planning_agent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "update_model_names",
            sql: include_str!("../migrations/014_update_model_names.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "create_agent_edit_locks",
            sql: include_str!("../migrations/016_create_agent_edit_locks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "create_task_notes_table",
            sql: include_str!("../migrations/017_create_task_notes_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "add_scheduled_date_to_tasks",
            sql: include_str!("../migrations/018_add_scheduled_date_to_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "add_project_context",
            sql: include_str!("../migrations/019_add_project_context.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "rename_projects_to_spaces",
            sql: include_str!("../migrations/020_rename_projects_to_spaces.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "add_web_search_to_agents",
            sql: include_str!("../migrations/021_add_web_search_to_agents.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "create_event_space_associations",
            sql: include_str!("../migrations/022_create_event_space_associations.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:orcascore.db", migrations)
                .build(),
        )
        .setup(|app| {
            // Initialize the database pool for Rust-side database operations
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");

            // Spawn async init in a blocking way during setup
            tauri::async_runtime::block_on(async {
                if let Err(e) = settings::init_db_pool(&app_data_dir).await {
                    eprintln!("Warning: Failed to initialize Rust database pool: {}", e);
                    // Non-fatal - the frontend SQL plugin will still work
                }

                // Clean up stale locks on startup (older than 5 minutes)
                let app_handle = app.handle().clone();
                if let Err(e) = edit_locks::cleanup_stale_locks(5, app_handle).await {
                    eprintln!("Warning: Failed to cleanup stale locks: {}", e);
                }

                // Spawn background task to periodically clean up stale locks
                let app_handle_bg = app.handle().clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
                    loop {
                        interval.tick().await;
                        if let Err(e) = edit_locks::cleanup_stale_locks(5, app_handle_bg.clone()).await {
                            eprintln!("Warning: Background cleanup of stale locks failed: {}", e);
                        }
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_mcp_server,
            stop_mcp_server,
            chat::send_chat_message,
            settings::get_setting,
            settings::set_setting,
            settings::delete_setting,
            start_task_planning,
            get_available_models,
            resolve_model_id,
            check_model_supports_tools,
            edit_locks::acquire_edit_lock,
            edit_locks::release_edit_lock,
            edit_locks::check_edit_lock,
            edit_locks::get_original_content,
            edit_locks::force_release_all_locks,
            edit_locks::cleanup_stale_locks,
            task_notes::read_task_notes,
            task_notes::write_task_notes,
            space_context::read_space_context,
            space_context::write_space_context,
            request_calendar_permission,
            get_calendar_list,
            get_events_for_date,
            open_calendar_settings,
            get_tasks_scheduled_for_date,
            get_recently_edited_tasks,
            chat::test_connection,
            tag_event_to_space,
            untag_event_from_space,
            get_event_space_tags,
            get_space_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
