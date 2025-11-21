-- Migration: Fix all TIMESTAMP columns to TIMESTAMPTZ
-- Description: Convert all timestamp columns to include timezone information
-- Date: 2025-11-21
-- Issue: TIMESTAMP without timezone causes incorrect time display when converting between UTC and local time

-- Auto Sync Config
ALTER TABLE auto_sync_config ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE auto_sync_config ALTER COLUMN last_run_at TYPE timestamptz USING last_run_at AT TIME ZONE 'GMT';
ALTER TABLE auto_sync_config ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Clicks
ALTER TABLE clicks ALTER COLUMN last_checked_at TYPE timestamptz USING last_checked_at AT TIME ZONE 'GMT';
ALTER TABLE clicks ALTER COLUMN link_clicked_at TYPE timestamptz USING link_clicked_at AT TIME ZONE 'GMT';
ALTER TABLE clicks ALTER COLUMN link_expires_at TYPE timestamptz USING link_expires_at AT TIME ZONE 'GMT';

-- Conversions
ALTER TABLE conversions ALTER COLUMN approval_time TYPE timestamptz USING approval_time AT TIME ZONE 'GMT';
ALTER TABLE conversions ALTER COLUMN confirmed_time TYPE timestamptz USING confirmed_time AT TIME ZONE 'GMT';
ALTER TABLE conversions ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE conversions ALTER COLUMN order_time TYPE timestamptz USING order_time AT TIME ZONE 'GMT';
ALTER TABLE conversions ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Merchants
ALTER TABLE merchants ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE merchants ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Payment Reconciliation Mapping
ALTER TABLE payment_reconciliation_mapping ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';

-- Payment Request Logs
ALTER TABLE payment_request_logs ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';

-- Payment Requests
ALTER TABLE payment_requests ALTER COLUMN confirmed_at TYPE timestamptz USING confirmed_at AT TIME ZONE 'GMT';
ALTER TABLE payment_requests ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE payment_requests ALTER COLUMN paid_at TYPE timestamptz USING paid_at AT TIME ZONE 'GMT';
ALTER TABLE payment_requests ALTER COLUMN rejected_at TYPE timestamptz USING rejected_at AT TIME ZONE 'GMT';
ALTER TABLE payment_requests ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Payments
ALTER TABLE payments ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'GMT';
ALTER TABLE payments ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE payments ALTER COLUMN failed_at TYPE timestamptz USING failed_at AT TIME ZONE 'GMT';
ALTER TABLE payments ALTER COLUMN processing_at TYPE timestamptz USING processing_at AT TIME ZONE 'GMT';
ALTER TABLE payments ALTER COLUMN requested_at TYPE timestamptz USING requested_at AT TIME ZONE 'GMT';
ALTER TABLE payments ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Reconciliation Items
ALTER TABLE reconciliation_items ALTER COLUMN confirmed_time TYPE timestamptz USING confirmed_time AT TIME ZONE 'GMT';
ALTER TABLE reconciliation_items ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE reconciliation_items ALTER COLUMN order_time TYPE timestamptz USING order_time AT TIME ZONE 'GMT';

-- Reconciliation Logs
ALTER TABLE reconciliation_logs ALTER COLUMN performed_at TYPE timestamptz USING performed_at AT TIME ZONE 'GMT';

-- Reconciliations
ALTER TABLE reconciliations ALTER COLUMN cancelled_at TYPE timestamptz USING cancelled_at AT TIME ZONE 'GMT';
ALTER TABLE reconciliations ALTER COLUMN confirmed_at TYPE timestamptz USING confirmed_at AT TIME ZONE 'GMT';
ALTER TABLE reconciliations ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE reconciliations ALTER COLUMN paid_at TYPE timestamptz USING paid_at AT TIME ZONE 'GMT';

-- System Conversions
ALTER TABLE system_conversions ALTER COLUMN approval_time TYPE timestamptz USING approval_time AT TIME ZONE 'GMT';
ALTER TABLE system_conversions ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE system_conversions ALTER COLUMN matched_at TYPE timestamptz USING matched_at AT TIME ZONE 'GMT';
ALTER TABLE system_conversions ALTER COLUMN order_time TYPE timestamptz USING order_time AT TIME ZONE 'GMT';
ALTER TABLE system_conversions ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- System Settings
ALTER TABLE system_settings ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Users
ALTER TABLE users ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'GMT';
ALTER TABLE users ALTER COLUMN reset_token_expiry TYPE timestamptz USING reset_token_expiry AT TIME ZONE 'GMT';
ALTER TABLE users ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'GMT';

-- Add comment
COMMENT ON COLUMN user_activity_logs.created_at IS 'Created timestamp with timezone (UTC)';
COMMENT ON COLUMN clicks.clicked_at IS 'Click timestamp with timezone (UTC)';
