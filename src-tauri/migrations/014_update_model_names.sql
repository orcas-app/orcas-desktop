-- Update all agents with old model names to use the new model name
UPDATE agents SET model_name = 'claude-sonnet-4-5' WHERE model_name IN (
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-sonnet-4-20250514'
);

UPDATE agents SET model_name = 'claude-opus-4-5' WHERE model_name IN (
    'claude-3-opus-20240229',
    'claude-opus-4-20250514'
);

-- Update default_planning_model setting if it exists
UPDATE settings SET value = 'claude-sonnet-4-5' WHERE key = 'default_planning_model' AND value IN (
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-sonnet-4-20250514'
);
