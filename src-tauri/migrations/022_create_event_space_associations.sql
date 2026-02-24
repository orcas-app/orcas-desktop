CREATE TABLE IF NOT EXISTS event_space_associations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id INTEGER NOT NULL,
    event_id_external TEXT NOT NULL,
    event_title TEXT NOT NULL,
    associated_date TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    UNIQUE (space_id, event_id_external, associated_date)
);
