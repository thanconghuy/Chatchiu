-- Migration 031: Cashback Notification System
-- Purpose: Enable automated email notifications for pending cashback withdrawals
-- Author: System
-- Date: 2025-12-26

-- ============================================================
-- TABLE 1: cashback_notifications
-- Track all cashback notification emails sent to users
-- ============================================================
CREATE TABLE IF NOT EXISTS cashback_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- 'instant', 'periodic', 'urgent', 'info_missing'
  email_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email_status VARCHAR(20) NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'pending'

  -- User balance snapshot at time of notification
  available_balance DECIMAL(12,2) NOT NULL,
  min_threshold DECIMAL(12,2) NOT NULL,

  -- Email tracking
  email_template VARCHAR(100) NOT NULL,
  email_subject VARCHAR(255),
  email_message_id VARCHAR(255), -- For tracking email delivery

  -- User response tracking
  user_action VARCHAR(50), -- 'created_request', 'clicked_link', 'ignored', 'unsubscribed'
  user_action_at TIMESTAMP,

  -- Additional metadata
  metadata JSONB, -- Store extra info like reconciliation_id, deadline, etc.

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_cashback_notif_user_id ON cashback_notifications(user_id);
CREATE INDEX idx_cashback_notif_type ON cashback_notifications(notification_type);
CREATE INDEX idx_cashback_notif_sent_at ON cashback_notifications(email_sent_at);
CREATE INDEX idx_cashback_notif_status ON cashback_notifications(email_status);
CREATE INDEX idx_cashback_notif_user_type ON cashback_notifications(user_id, notification_type);

-- Comment
COMMENT ON TABLE cashback_notifications IS 'Tracks all cashback notification emails sent to users';
COMMENT ON COLUMN cashback_notifications.notification_type IS 'Type: instant (first eligible), periodic (weekly reminder), urgent (before deadline), info_missing (payment details needed)';
COMMENT ON COLUMN cashback_notifications.user_action IS 'User action after receiving email: created_request, clicked_link, ignored, unsubscribed';

-- ============================================================
-- TABLE 2: user_notification_preferences
-- User preferences for email notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Email preferences (opt-in/opt-out)
  cashback_instant_email BOOLEAN NOT NULL DEFAULT TRUE,
  cashback_reminder_email BOOLEAN NOT NULL DEFAULT TRUE,
  cashback_urgent_email BOOLEAN NOT NULL DEFAULT TRUE,
  payment_status_email BOOLEAN NOT NULL DEFAULT TRUE,

  -- Reminder frequency
  reminder_frequency_days INTEGER NOT NULL DEFAULT 7,

  -- Tracking
  last_reminder_sent TIMESTAMP,
  last_instant_sent TIMESTAMP,
  last_urgent_sent TIMESTAMP,

  -- Unsubscribe
  unsubscribed_at TIMESTAMP,
  unsubscribe_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Comment
COMMENT ON TABLE user_notification_preferences IS 'User preferences for cashback notification emails';
COMMENT ON COLUMN user_notification_preferences.reminder_frequency_days IS 'How often to send periodic reminders (default: 7 days)';

-- ============================================================
-- TABLE 3: notification_statistics
-- Aggregate statistics for notification performance
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Date tracking
  stat_date DATE NOT NULL,
  notification_type VARCHAR(50) NOT NULL,

  -- Counts
  emails_sent INTEGER NOT NULL DEFAULT 0,
  emails_failed INTEGER NOT NULL DEFAULT 0,
  emails_opened INTEGER NOT NULL DEFAULT 0,
  links_clicked INTEGER NOT NULL DEFAULT 0,
  requests_created INTEGER NOT NULL DEFAULT 0,

  -- Amounts
  total_available_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_requested_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- Timing
  avg_time_to_action_hours INTEGER,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint to prevent duplicates
  UNIQUE(stat_date, notification_type)
);

-- Indexes
CREATE INDEX idx_notif_stats_date ON notification_statistics(stat_date);
CREATE INDEX idx_notif_stats_type ON notification_statistics(notification_type);

-- Comment
COMMENT ON TABLE notification_statistics IS 'Daily aggregated statistics for notification performance tracking';

-- ============================================================
-- FUNCTION: Update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_cashback_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER cashback_notifications_updated_at
  BEFORE UPDATE ON cashback_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_cashback_notification_updated_at();

CREATE TRIGGER user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_cashback_notification_updated_at();

CREATE TRIGGER notification_statistics_updated_at
  BEFORE UPDATE ON notification_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_cashback_notification_updated_at();

-- ============================================================
-- DEFAULT DATA: Create preferences for existing users
-- ============================================================
INSERT INTO user_notification_preferences (user_id)
SELECT id FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_notification_preferences WHERE user_id = users.id
);

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 031 completed successfully';
  RAISE NOTICE 'Created tables: cashback_notifications, user_notification_preferences, notification_statistics';
  RAISE NOTICE 'Created indexes for performance optimization';
  RAISE NOTICE 'Created triggers for automatic timestamp updates';
  RAISE NOTICE 'Initialized preferences for % existing users', (SELECT COUNT(*) FROM user_notification_preferences);
END $$;
