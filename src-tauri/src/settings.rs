use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePool, Row};
use std::sync::OnceLock;

static DB_POOL: OnceLock<SqlitePool> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

/// Initialize the database pool (call once at app startup)
pub async fn init_db_pool(app_data_dir: &std::path::Path) -> Result<(), String> {
    let db_path = app_data_dir.join("orcascore.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    DB_POOL.set(pool).map_err(|_| "Database pool already initialized".to_string())?;
    Ok(())
}

/// Get the database pool
pub fn get_db_pool() -> Result<&'static SqlitePool, String> {
    DB_POOL.get().ok_or_else(|| "Database pool not initialized".to_string())
}

#[tauri::command]
pub async fn get_setting(_app: tauri::AppHandle, key: String) -> Result<String, String> {
    let pool = get_db_pool()?;

    let row = sqlx::query("SELECT value FROM settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    match row {
        Some(row) => {
            let value: String = row.try_get("value")
                .map_err(|e| format!("Failed to extract value: {}", e))?;
            Ok(value)
        }
        None => Err(format!("Setting '{}' not found", key))
    }
}

#[tauri::command]
pub async fn set_setting(
    _app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = get_db_pool()?;

    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value, created_at, updated_at)
         VALUES (?, ?, COALESCE((SELECT created_at FROM settings WHERE key = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)",
    )
    .bind(&key)
    .bind(&value)
    .bind(&key)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to set setting: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_setting(_app: tauri::AppHandle, key: String) -> Result<(), String> {
    let pool = get_db_pool()?;

    sqlx::query("DELETE FROM settings WHERE key = ?")
        .bind(&key)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete setting: {}", e))?;

    Ok(())
}
