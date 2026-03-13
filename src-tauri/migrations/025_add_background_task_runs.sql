CREATE TABLE IF NOT EXISTS background_task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id INTEGER NOT NULL,
    trigger_source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT,
    input_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_background_task_runs_lookup
    ON background_task_runs (task_type, scope_type, scope_id, created_at);
