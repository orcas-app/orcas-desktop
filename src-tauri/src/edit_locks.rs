use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditLock {
    pub task_id: i64,
    pub locked_by: String,
    pub locked_at: String,
    pub original_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LockStatus {
    pub is_locked: bool,
    pub locked_by: Option<String>,
}

/// Get the database pool from app data directory
async fn get_db_pool(app_handle: &AppHandle) -> Result<SqlitePool, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let db_path = app_data_dir.join("orcascore.db");
    let db_url = format!("sqlite:{}", db_path.display());

    SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))
}

/// Acquire an edit lock for a task
#[tauri::command]
pub async fn acquire_edit_lock(
    task_id: i64,
    locked_by: String,
    original_content: Option<String>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let pool = get_db_pool(&app_handle).await?;

    // Validate locked_by parameter
    if locked_by != "agent" && locked_by != "user" {
        return Err("locked_by must be 'agent' or 'user'".to_string());
    }

    // Check if lock already exists
    let existing_lock: Option<(i64,)> = sqlx::query_as(
        "SELECT task_id FROM agent_edit_locks WHERE task_id = ?"
    )
    .bind(task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to check existing lock: {}", e))?;

    if existing_lock.is_some() {
        return Ok(false); // Lock already exists
    }

    // Insert new lock
    sqlx::query(
        "INSERT INTO agent_edit_locks (task_id, locked_by, original_content) VALUES (?, ?, ?)"
    )
    .bind(task_id)
    .bind(&locked_by)
    .bind(&original_content)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    Ok(true)
}

/// Release an edit lock for a task
#[tauri::command]
pub async fn release_edit_lock(
    task_id: i64,
    app_handle: AppHandle,
) -> Result<(), String> {
    let pool = get_db_pool(&app_handle).await?;

    sqlx::query("DELETE FROM agent_edit_locks WHERE task_id = ?")
        .bind(task_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to release lock: {}", e))?;

    Ok(())
}

/// Check if a task has an edit lock and who owns it
#[tauri::command]
pub async fn check_edit_lock(
    task_id: i64,
    app_handle: AppHandle,
) -> Result<LockStatus, String> {
    let pool = get_db_pool(&app_handle).await?;

    let lock: Option<(String,)> = sqlx::query_as(
        "SELECT locked_by FROM agent_edit_locks WHERE task_id = ?"
    )
    .bind(task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to check lock: {}", e))?;

    match lock {
        Some((locked_by,)) => Ok(LockStatus {
            is_locked: true,
            locked_by: Some(locked_by),
        }),
        None => Ok(LockStatus {
            is_locked: false,
            locked_by: None,
        }),
    }
}

/// Get the original content saved when lock was acquired
#[tauri::command]
pub async fn get_original_content(
    task_id: i64,
    app_handle: AppHandle,
) -> Result<Option<String>, String> {
    let pool = get_db_pool(&app_handle).await?;

    let result: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT original_content FROM agent_edit_locks WHERE task_id = ?"
    )
    .bind(task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get original content: {}", e))?;

    Ok(result.and_then(|(content,)| content))
}

/// Force release all locks (cleanup utility)
#[tauri::command]
pub async fn force_release_all_locks(
    app_handle: AppHandle,
) -> Result<i64, String> {
    let pool = get_db_pool(&app_handle).await?;

    let result = sqlx::query("DELETE FROM agent_edit_locks")
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to release all locks: {}", e))?;

    Ok(result.rows_affected() as i64)
}

/// Clean up stale locks older than timeout_minutes
#[tauri::command]
pub async fn cleanup_stale_locks(
    timeout_minutes: i64,
    app_handle: AppHandle,
) -> Result<i64, String> {
    let pool = get_db_pool(&app_handle).await?;

    let result = sqlx::query(
        "DELETE FROM agent_edit_locks
         WHERE datetime(locked_at, '+' || ? || ' minutes') < datetime('now')"
    )
    .bind(timeout_minutes)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to cleanup stale locks: {}", e))?;

    Ok(result.rows_affected() as i64)
}
