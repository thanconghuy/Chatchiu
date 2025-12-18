-- =====================================================
-- Migration 034: Create Email Logs Table
-- Purpose: Audit trail cho email notifications
-- Created: 2025-12-16
-- =====================================================

-- =====================================================
-- 1. EMAIL LOGS TABLE
-- Tracks all emails sent by the system
-- =====================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient info
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_to VARCHAR(255) NOT NULL,

  -- Email details
  email_type VARCHAR(50) NOT NULL,
  subject TEXT NOT NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL,
  error_message TEXT,

  -- Context (what triggered this email)
  context_id UUID,
  context_type VARCHAR(50),

  -- Metadata
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_email_status CHECK (status IN ('sent', 'failed', 'skipped'))
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

-- Index for user queries
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);

-- Index for email type filtering
CREATE INDEX idx_email_logs_email_type ON email_logs(email_type);

-- Index for status filtering
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- Index for time-based queries
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at DESC);

-- Composite index for common queries (type + status)
CREATE INDEX idx_email_logs_type_status ON email_logs(email_type, status);

-- Index for context queries
CREATE INDEX idx_email_logs_context ON email_logs(context_id, context_type);

-- =====================================================
-- 3. VIEWS
-- =====================================================

-- View: Email statistics by type and status
CREATE OR REPLACE VIEW v_email_stats_by_type AS
SELECT
  email_type,
  status,
  COUNT(*) as total_count,
  COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as count_24h,
  COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '7 days' THEN 1 END) as count_7d,
  COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '30 days' THEN 1 END) as count_30d,
  MIN(sent_at) as first_sent,
  MAX(sent_at) as last_sent
FROM email_logs
GROUP BY email_type, status
ORDER BY email_type, status;

-- View: Recent failed emails
CREATE OR REPLACE VIEW v_recent_failed_emails AS
SELECT
  el.id,
  el.user_id,
  u.email as user_email,
  u.full_name as user_name,
  el.email_to,
  el.email_type,
  el.subject,
  el.error_message,
  el.context_id,
  el.context_type,
  el.sent_at
FROM email_logs el
LEFT JOIN users u ON el.user_id = u.id
WHERE el.status = 'failed'
  AND el.sent_at >= NOW() - INTERVAL '7 days'
ORDER BY el.sent_at DESC;

-- View: Email delivery rate by type
CREATE OR REPLACE VIEW v_email_delivery_rate AS
SELECT
  email_type,
  COUNT(*) as total_emails,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_count,
  ROUND(
    100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / NULLIF(COUNT(*), 0),
    2
  ) as success_rate,
  MIN(sent_at) as first_email,
  MAX(sent_at) as last_email
FROM email_logs
GROUP BY email_type
ORDER BY total_emails DESC;

-- =====================================================
-- 4. FUNCTIONS
-- =====================================================

-- Function: Get email stats for a specific date range
CREATE OR REPLACE FUNCTION get_email_stats(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_email_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  email_type VARCHAR,
  status VARCHAR,
  count BIGINT,
  avg_per_day NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.email_type,
    el.status,
    COUNT(*)::BIGINT as count,
    ROUND(
      COUNT(*)::NUMERIC / GREATEST(EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400, 1),
      2
    ) as avg_per_day
  FROM email_logs el
  WHERE el.sent_at >= p_start_date
    AND el.sent_at <= p_end_date
    AND (p_email_type IS NULL OR el.email_type = p_email_type)
  GROUP BY el.email_type, el.status
  ORDER BY el.email_type, el.status;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user email history
CREATE OR REPLACE FUNCTION get_user_email_history(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  email_type VARCHAR,
  subject TEXT,
  status VARCHAR,
  error_message TEXT,
  sent_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.id,
    el.email_type,
    el.subject,
    el.status,
    el.error_message,
    el.sent_at
  FROM email_logs el
  WHERE el.user_id = p_user_id
  ORDER BY el.sent_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Clean up old email logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_email_logs(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  deleted_count BIGINT
) AS $$
DECLARE
  v_deleted_count BIGINT;
BEGIN
  DELETE FROM email_logs
  WHERE sent_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. COMMENTS
-- =====================================================

COMMENT ON TABLE email_logs IS 'Audit trail for all email notifications sent by the system';
COMMENT ON COLUMN email_logs.user_id IS 'User who received the email (nullable for non-user emails)';
COMMENT ON COLUMN email_logs.email_to IS 'Recipient email address';
COMMENT ON COLUMN email_logs.email_type IS 'Type of email: reconciliation_finalized, payment_confirmed, payment_rejected, payment_paid';
COMMENT ON COLUMN email_logs.status IS 'Email status: sent (successful), failed (error), skipped (dev mode or no SMTP)';
COMMENT ON COLUMN email_logs.context_id IS 'ID of related entity (reconciliation_id or payment_request_id)';
COMMENT ON COLUMN email_logs.context_type IS 'Type of context: reconciliation or payment_request';

-- =====================================================
-- 6. SAMPLE QUERIES
-- =====================================================

-- Get email stats for last 7 days
-- SELECT * FROM get_email_stats(NOW() - INTERVAL '7 days', NOW());

-- Get email stats for a specific type
-- SELECT * FROM get_email_stats(NOW() - INTERVAL '30 days', NOW(), 'payment_confirmed');

-- Get user's email history
-- SELECT * FROM get_user_email_history('user-uuid-here', 20);

-- View overall delivery rate
-- SELECT * FROM v_email_delivery_rate;

-- View recent failures
-- SELECT * FROM v_recent_failed_emails LIMIT 20;

-- Clean up logs older than 90 days
-- SELECT * FROM cleanup_old_email_logs(90);

-- Daily email volume
-- SELECT
--   DATE(sent_at) as date,
--   email_type,
--   status,
--   COUNT(*) as count
-- FROM email_logs
-- WHERE sent_at >= NOW() - INTERVAL '30 days'
-- GROUP BY DATE(sent_at), email_type, status
-- ORDER BY date DESC, email_type;

-- Success rate by email type
-- SELECT
--   email_type,
--   COUNT(*) as total,
--   COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
--   ROUND(100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / COUNT(*), 2) as success_rate
-- FROM email_logs
-- GROUP BY email_type;
