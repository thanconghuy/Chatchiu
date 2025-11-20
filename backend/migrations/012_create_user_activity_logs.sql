-- Migration: Create user_activity_logs table
-- Description: Track user activities like link generation, logins, etc.
-- Date: 2025-01-20

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(100) NOT NULL,
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE SET NULL,
  merchant_name VARCHAR(255),
  product_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  response_time_ms INTEGER,
  device_type VARCHAR(50),
  browser VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_merchant_id ON user_activity_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_status ON user_activity_logs(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_status ON user_activity_logs(user_id, status);

-- Add comment
COMMENT ON TABLE user_activity_logs IS 'Track user activities like link generation, logins, and other system interactions';
