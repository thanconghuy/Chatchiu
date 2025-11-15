-- Migration: Create system_settings table
-- Purpose: Store persistent system configuration (API mode, cron jobs, etc.)
-- Date: 2025-11-15

CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string', -- 'string', 'boolean', 'number', 'json'
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
    ('api_mode_enabled', 'false', 'boolean', 'Enable AccessTrade API mode for link generation'),
    ('auto_cron_enabled', 'false', 'boolean', 'Enable automatic cron jobs'),
    ('accesstrade_api_token', '', 'string', 'AccessTrade API access token')
ON CONFLICT (setting_key) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

COMMENT ON TABLE system_settings IS 'Persistent system configuration settings';
