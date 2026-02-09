use crate::settings::get_db_pool;
use sqlx::Row;

/// Read context markdown for a project from the database
#[tauri::command]
pub async fn read_project_context(project_id: i32) -> Result<String, String> {
    let pool = get_db_pool()?;

    let row = sqlx::query("SELECT context_markdown FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    match row {
        Some(row) => {
            let content: Option<String> = row
                .try_get("context_markdown")
                .map_err(|e| format!("Failed to extract context_markdown: {}", e))?;
            Ok(content.unwrap_or_default())
        }
        None => Err(format!("Project {} not found", project_id)),
    }
}

/// Write context markdown for a project to the database
#[tauri::command]
pub async fn write_project_context(project_id: i32, content: String) -> Result<(), String> {
    let pool = get_db_pool()?;

    let result = sqlx::query(
        "UPDATE projects SET context_markdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&content)
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save project context: {}", e))?;

    if result.rows_affected() == 0 {
        return Err(format!("Project {} not found", project_id));
    }

    Ok(())
}
