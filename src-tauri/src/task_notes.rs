use crate::settings::get_db_pool;
use sqlx::Row;

/// Read shared notes for a task from the database
#[tauri::command]
pub async fn read_task_notes(task_id: i32) -> Result<String, String> {
    let pool = get_db_pool()?;

    let row = sqlx::query("SELECT content FROM task_notes WHERE task_id = ?")
        .bind(task_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    match row {
        Some(row) => {
            let content: Option<String> = row
                .try_get("content")
                .map_err(|e| format!("Failed to extract content: {}", e))?;
            Ok(content.unwrap_or_default())
        }
        None => Ok(String::new()) // Return empty string if no notes exist yet
    }
}

/// Write shared notes for a task to the database
#[tauri::command]
pub async fn write_task_notes(task_id: i32, content: String) -> Result<(), String> {
    let pool = get_db_pool()?;

    sqlx::query(
        "INSERT INTO task_notes (task_id, content, created_at, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(task_id) DO UPDATE SET
         content = excluded.content,
         updated_at = CURRENT_TIMESTAMP",
    )
    .bind(task_id)
    .bind(&content)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save task notes: {}", e))?;

    Ok(())
}
