-- Migration: Create user_activity_logs table
-- Purpose: Track user activities for monitoring and analytics
-- Author: System
-- Date: 2025-11-15

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Activity classification
    activity_type VARCHAR(50) NOT NULL,
    merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE SET NULL,

    -- Event details (flexible JSON storage)
    event_data JSONB DEFAULT '{}',

    -- Product URL tracking (for link generation activities)
    product_url TEXT,

    -- Request metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(20), -- 'mobile', 'desktop', 'tablet'
    browser VARCHAR(50),
    os VARCHAR(50),

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failed', 'error'
    error_message TEXT,

    -- Performance metrics
    response_time_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for performance
    CONSTRAINT check_activity_type CHECK (activity_type IN (
        'link_generate_attempt',
        'link_generate_success',
        'link_generate_failed',
        'login',
        'logout',
        'view_merchant',
        'search_merchant',
        'view_conversions',
        'view_clicks',
        'api_error'
    ))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_merchant_id ON user_activity_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_status ON user_activity_logs(status, created_at DESC);

-- Note: Partial index for cleanup would be created manually if needed
-- Cannot use CURRENT_TIMESTAMP in index predicate as it's not immutable

-- Create GIN index for JSONB event_data search
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_event_data ON user_activity_logs USING GIN (event_data);

-- Add comment
COMMENT ON TABLE user_activity_logs IS 'Stores user activity logs for monitoring and analytics. Auto-deleted after 90 days.';
COMMENT ON COLUMN user_activity_logs.product_url IS 'Product URL for link generation activities';
COMMENT ON COLUMN user_activity_logs.event_data IS 'Flexible JSONB field for activity-specific data';
COMMENT ON COLUMN user_activity_logs.response_time_ms IS 'Server response time in milliseconds for performance monitoring';

-- Create function for auto cleanup (called by cron)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_activity_logs
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_activity_logs IS 'Deletes activity logs older than 90 days. Returns count of deleted rows.';
