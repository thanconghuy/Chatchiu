-- Migration 032: Add Cashback Notification Settings to System Settings
-- Purpose: Allow admin to configure reminder frequency and other notification settings
-- Date: 2025-12-26

-- Insert default notification settings
INSERT INTO system_settings (setting_key, setting_value, description, category, setting_type, is_editable, updated_by)
VALUES
  (
    'cashback_reminder_frequency_days',
    '7',
    'Số ngày giữa các lần gửi email nhắc nhở cashback (mặc định: 7 ngày)',
    'notifications',
    'number',
    true,
    NULL
  ),
  (
    'cashback_reminder_enabled',
    'true',
    'Bật/tắt tính năng gửi email nhắc nhở cashback tự động',
    'notifications',
    'boolean',
    true,
    NULL
  ),
  (
    'cashback_reminder_time',
    '10:00',
    'Thời gian trong ngày gửi email nhắc nhở (format: HH:MM, timezone: Asia/Ho_Chi_Minh)',
    'notifications',
    'string',
    true,
    NULL
  ),
  (
    'cashback_instant_enabled',
    'true',
    'Bật/tắt tính năng gửi email thông báo instant khi có cashback đủ rút',
    'notifications',
    'boolean',
    true,
    NULL
  )
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment
COMMENT ON TABLE system_settings IS 'System-wide configuration settings including notification preferences';

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration 032 completed successfully';
  RAISE NOTICE 'Added 4 notification settings to system_settings table';
  RAISE NOTICE 'Settings:';
  RAISE NOTICE '  - cashback_reminder_frequency_days: Configure reminder interval (default: 7)';
  RAISE NOTICE '  - cashback_reminder_enabled: Enable/disable reminders (default: true)';
  RAISE NOTICE '  - cashback_reminder_time: Daily send time (default: 10:00)';
  RAISE NOTICE '  - cashback_instant_enabled: Enable/disable instant notifications (default: true)';
END $$;
