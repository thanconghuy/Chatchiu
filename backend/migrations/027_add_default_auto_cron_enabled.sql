-- Migration 027: Add default auto_cron_enabled setting
-- Purpose: Ensure cron jobs are enabled by default on server startup
-- Created: 2025-12-06

-- Insert default auto_cron_enabled setting (only if not exists)
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_editable, created_at, updated_at)
VALUES (
    'auto_cron_enabled',
    'true',
    'boolean',
    'system',
    'Enable/disable automatic cron jobs (retry clicks, cleanup, alerts)',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (setting_key) DO NOTHING;

-- Verify the setting
SELECT * FROM system_settings WHERE setting_key = 'auto_cron_enabled';
