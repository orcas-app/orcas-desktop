-- Add web_search_enabled column to agents table
ALTER TABLE agents ADD COLUMN web_search_enabled BOOLEAN NOT NULL DEFAULT 0;
