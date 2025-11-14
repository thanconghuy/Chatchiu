-- Create table for auto-sync configuration
CREATE TABLE IF NOT EXISTS auto_sync_config (
    id SERIAL PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cron_schedule VARCHAR(50) NOT NULL DEFAULT '0 8 * * *', -- Every day at 8 AM
    sync_days INTEGER NOT NULL DEFAULT 2, -- Sync last 2 days
    last_run_at TIMESTAMP,
    last_run_status VARCHAR(20), -- 'success', 'error', 'running'
    last_run_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config if not exists
INSERT INTO auto_sync_config (enabled, cron_schedule, sync_days)
VALUES (FALSE, '0 8 * * *', 2)
ON CONFLICT DO NOTHING;

-- Add index
CREATE INDEX IF NOT EXISTS idx_auto_sync_config_enabled ON auto_sync_config(enabled);
