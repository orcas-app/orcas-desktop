-- Add system_role column to agents table
-- This column identifies agents with special system roles like 'planning'
-- Regular user agents will have NULL for this column

-- Add the system_role column
ALTER TABLE agents ADD COLUMN system_role TEXT;

-- Create index for efficient lookup by system_role
CREATE INDEX IF NOT EXISTS idx_agents_system_role ON agents(system_role);

-- Update the existing planning agent (id = -1) to use system_role
UPDATE agents SET system_role = 'planning' WHERE id = -1;

-- Now we need to move the planning agent to a positive ID
-- First, insert a new copy with the system_role set
INSERT INTO agents (name, model_name, agent_prompt, system_role, created_at, updated_at)
SELECT 'Task Planning Agent', model_name, agent_prompt, 'planning', created_at, updated_at
FROM agents WHERE id = -1;

-- Delete the old negative ID agent
DELETE FROM agents WHERE id = -1;
