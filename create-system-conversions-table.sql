-- Create system_conversions table
-- This table stores ONLY conversions that are matched with clicks (real conversions)
-- It's a fast lookup table for Conversions Management UI

BEGIN;

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS system_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to AT conversion (from conversions table)
  at_conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,

  -- Link to user and click (denormalized for fast queries)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  click_id UUID NOT NULL REFERENCES clicks(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE SET NULL,

  -- Denormalized data for fast display (avoid JOINs)
  merchant_name VARCHAR(255),
  order_code VARCHAR(100),
  order_amount DECIMAL(15, 2) DEFAULT 0.00,
  commission DECIMAL(15, 2) DEFAULT 0.00,
  cashback_amount DECIMAL(15, 2) DEFAULT 0.00,
  status conversion_status_enum DEFAULT 'pending',

  -- Timestamps
  order_time TIMESTAMP,
  approval_time TIMESTAMP,
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When this conversion was matched with click

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure one AT conversion maps to one system conversion
  CONSTRAINT unique_at_conversion UNIQUE (at_conversion_id)
);

-- Step 2: Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_id ON system_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_system_conversions_click_id ON system_conversions(click_id);
CREATE INDEX IF NOT EXISTS idx_system_conversions_merchant_id ON system_conversions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_system_conversions_status ON system_conversions(status);
CREATE INDEX IF NOT EXISTS idx_system_conversions_order_time ON system_conversions(order_time DESC);
CREATE INDEX IF NOT EXISTS idx_system_conversions_matched_at ON system_conversions(matched_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_status ON system_conversions(user_id, status);

-- Step 3: Add trigger for updated_at
CREATE TRIGGER update_system_conversions_updated_at
  BEFORE UPDATE ON system_conversions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Add comments
COMMENT ON TABLE system_conversions IS 'Fast lookup table for conversions that are matched with clicks. Only contains conversions with valid user_id and click_id.';
COMMENT ON COLUMN system_conversions.at_conversion_id IS 'Reference to the source conversion from AccessTrade in conversions table';
COMMENT ON COLUMN system_conversions.matched_at IS 'Timestamp when this conversion was matched with a click';

-- Step 5: Migrate existing matched conversions from conversions table
INSERT INTO system_conversions (
  at_conversion_id,
  user_id,
  click_id,
  merchant_id,
  merchant_name,
  order_code,
  order_amount,
  commission,
  cashback_amount,
  status,
  order_time,
  approval_time,
  matched_at,
  created_at
)
SELECT
  c.id as at_conversion_id,
  c.user_id,
  c.click_id,
  c.merchant_id,
  c.merchant_name,
  c.order_code,
  c.order_amount,
  c.commission,
  c.cashback_amount,
  c.status,
  c.order_time,
  c.approval_time,
  c.updated_at as matched_at, -- Use updated_at as matched_at for existing data
  c.created_at
FROM conversions c
WHERE c.click_id IS NOT NULL
  AND c.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM system_conversions sc
    WHERE sc.at_conversion_id = c.id
  );

COMMIT;

-- Verify the migration
SELECT
  'system_conversions' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
  COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
  COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
FROM system_conversions;

-- Show some sample data
SELECT * FROM system_conversions ORDER BY matched_at DESC LIMIT 5;
