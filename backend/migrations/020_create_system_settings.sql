-- Migration 020: Create system_settings table
-- Purpose: Store configurable system settings (withdrawal limits, fees, etc.)
-- Author: System
-- Date: 2025-11-24

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(20) NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  category VARCHAR(50) DEFAULT 'general', -- 'payment', 'reconciliation', 'general', etc.
  is_editable BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index on setting_key for fast lookup
CREATE INDEX idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, category, is_editable) VALUES
  ('min_withdrawal_amount', '50000', 'number', 'Hạn mức rút tiền tối thiểu (VNĐ)', 'payment', true),
  ('max_withdrawal_amount', '50000000', 'number', 'Hạn mức rút tiền tối đa (VNĐ)', 'payment', true),
  ('withdrawal_processing_days', '7', 'number', 'Số ngày xử lý yêu cầu thanh toán', 'payment', true),
  ('system_fee_percentage', '0', 'number', 'Phí hệ thống (%) - hiện tại không áp dụng', 'payment', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_timestamp
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_system_settings_timestamp();

-- Create audit log for settings changes
CREATE TABLE IF NOT EXISTS system_settings_audit (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  change_reason TEXT
);

CREATE INDEX idx_settings_audit_key ON system_settings_audit(setting_key);
CREATE INDEX idx_settings_audit_date ON system_settings_audit(changed_at DESC);

-- Create trigger to log settings changes
CREATE OR REPLACE FUNCTION log_system_settings_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO system_settings_audit (
    setting_key,
    old_value,
    new_value,
    changed_by
  ) VALUES (
    NEW.setting_key,
    OLD.setting_value,
    NEW.setting_value,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_system_settings_change
AFTER UPDATE ON system_settings
FOR EACH ROW
WHEN (OLD.setting_value IS DISTINCT FROM NEW.setting_value)
EXECUTE FUNCTION log_system_settings_change();

COMMENT ON TABLE system_settings IS 'System-wide configurable settings';
COMMENT ON TABLE system_settings_audit IS 'Audit log for system settings changes';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN system_settings.setting_type IS 'Data type: string, number, boolean, json';
COMMENT ON COLUMN system_settings.is_editable IS 'Whether this setting can be modified via admin UI';
