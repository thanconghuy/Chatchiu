-- =====================================================
-- Migration 036: Create Cron Jobs Management Table
-- Purpose: Manage cron jobs from database instead of env variable
-- Date: 2025-12-28
-- =====================================================

-- =====================================================
-- 1. CREATE CRON JOBS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_jobs (
  id SERIAL PRIMARY KEY,

  -- Job identification
  job_key VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'retry-unmatched', 'cleanup-expired'
  job_name VARCHAR(255) NOT NULL,         -- Display name
  description TEXT,

  -- Scheduling
  cron_schedule VARCHAR(100) NOT NULL,    -- Cron expression (e.g., '0 */6 * * *')
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',

  -- Status & Control
  is_enabled BOOLEAN DEFAULT true,        -- Enable/disable this job
  is_running BOOLEAN DEFAULT false,       -- Currently executing (set by job)

  -- Execution tracking
  last_run_at TIMESTAMPTZ,                -- Last execution time
  last_run_status VARCHAR(20),            -- 'success' | 'failed' | 'running'
  last_run_duration_ms INTEGER,           -- Duration in milliseconds
  last_run_result JSONB,                  -- Result details (counts, errors, etc.)

  next_run_at TIMESTAMPTZ,                -- Calculated next run time

  -- Statistics
  total_runs INTEGER DEFAULT 0,
  success_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

CREATE INDEX idx_cron_jobs_job_key ON cron_jobs(job_key);
CREATE INDEX idx_cron_jobs_is_enabled ON cron_jobs(is_enabled);
CREATE INDEX idx_cron_jobs_last_run_at ON cron_jobs(last_run_at DESC);
CREATE INDEX idx_cron_jobs_next_run_at ON cron_jobs(next_run_at ASC);

-- =====================================================
-- 3. CREATE TRIGGER FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_cron_jobs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cron_jobs_timestamp
BEFORE UPDATE ON cron_jobs
FOR EACH ROW
EXECUTE FUNCTION update_cron_jobs_timestamp();

-- =====================================================
-- 4. INSERT DEFAULT CRON JOBS
-- =====================================================

INSERT INTO cron_jobs (job_key, job_name, description, cron_schedule, is_enabled) VALUES
(
  'retry-unmatched',
  'Retry Unmatched Clicks',
  'Tự động thử lại các click chưa match với conversion sau 1 ngày',
  '0 */6 * * *',  -- Every 6 hours
  true
),
(
  'cleanup-expired',
  'Cleanup Expired Clicks',
  'Đánh dấu các click đã hết hạn sau 30 ngày',
  '0 3 * * *',    -- Daily at 3 AM
  true
),
(
  'expiring-alert',
  'Alert Expiring Clicks',
  'Cảnh báo các click sắp hết hạn',
  '0 9 * * *',    -- Daily at 9 AM
  true
),
(
  'activity-logs-cleanup',
  'Cleanup Activity Logs',
  'Xóa activity logs cũ hơn 90 ngày',
  '0 2 * * *',    -- Daily at 2 AM
  true
),
(
  'cashback-reminders',
  'Cashback Reminder Emails',
  'Gửi email nhắc nhở về cashback đang chờ',
  '0 10 * * *',   -- Daily at 10 AM
  true
),
(
  'notification-logs-cleanup',
  'Cleanup Notification Logs',
  'Xóa notification logs cũ hơn 30 ngày',
  '0 4 * * *',    -- Daily at 4 AM
  true
)
ON CONFLICT (job_key) DO NOTHING;

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to update job execution start
CREATE OR REPLACE FUNCTION cron_job_started(p_job_key VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE cron_jobs
  SET
    is_running = true,
    last_run_at = NOW(),
    last_run_status = 'running',
    updated_at = NOW()
  WHERE job_key = p_job_key;
END;
$$ LANGUAGE plpgsql;

-- Function to update job execution completion
CREATE OR REPLACE FUNCTION cron_job_completed(
  p_job_key VARCHAR,
  p_status VARCHAR,           -- 'success' | 'failed'
  p_duration_ms INTEGER,
  p_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE cron_jobs
  SET
    is_running = false,
    last_run_status = p_status,
    last_run_duration_ms = p_duration_ms,
    last_run_result = p_result,
    total_runs = total_runs + 1,
    success_runs = CASE WHEN p_status = 'success' THEN success_runs + 1 ELSE success_runs END,
    failed_runs = CASE WHEN p_status = 'failed' THEN failed_runs + 1 ELSE failed_runs END,
    updated_at = NOW()
  WHERE job_key = p_job_key;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. COMMENTS
-- =====================================================

COMMENT ON TABLE cron_jobs IS
  'Cron jobs configuration and execution tracking';

COMMENT ON COLUMN cron_jobs.job_key IS
  'Unique identifier for the cron job (e.g., retry-unmatched)';

COMMENT ON COLUMN cron_jobs.cron_schedule IS
  'Cron expression format: minute hour day month weekday (e.g., 0 */6 * * * = every 6 hours)';

COMMENT ON COLUMN cron_jobs.is_enabled IS
  'Enable/disable this specific job without affecting others';

COMMENT ON COLUMN cron_jobs.last_run_result IS
  'JSON object containing execution results (e.g., {total: 100, matched: 50, failed: 2})';

COMMENT ON FUNCTION cron_job_started(VARCHAR) IS
  'Mark job as started - call at beginning of cron job execution';

COMMENT ON FUNCTION cron_job_completed(VARCHAR, VARCHAR, INTEGER, JSONB) IS
  'Mark job as completed with status and results - call at end of cron job execution';

-- =====================================================
-- 7. MIGRATE EXISTING SETTING
-- =====================================================

-- Remove old AUTO_CRON_ENABLED from system_settings if exists
-- (The new approach uses individual job is_enabled flags)
DELETE FROM system_settings WHERE setting_key = 'auto_cron_enabled';

-- =====================================================
-- 8. SAMPLE QUERIES
-- =====================================================

-- Get all enabled jobs
-- SELECT * FROM cron_jobs WHERE is_enabled = true ORDER BY next_run_at ASC;

-- Get job statistics
-- SELECT
--   job_name,
--   total_runs,
--   success_runs,
--   failed_runs,
--   ROUND(success_runs::NUMERIC / NULLIF(total_runs, 0) * 100, 2) as success_rate
-- FROM cron_jobs
-- ORDER BY total_runs DESC;

-- Toggle job enabled status
-- UPDATE cron_jobs SET is_enabled = NOT is_enabled WHERE job_key = 'retry-unmatched';

-- Update cron schedule
-- UPDATE cron_jobs SET cron_schedule = '0 */3 * * *' WHERE job_key = 'retry-unmatched';
