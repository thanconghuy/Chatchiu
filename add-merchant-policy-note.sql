-- Add policy_note field to merchants table
-- This field will store quick policy notes for users

ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS policy_note TEXT;

-- Add index for faster search
CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(name);

-- Update existing merchants with sample policy notes
UPDATE merchants
SET policy_note = CASE
  WHEN id = 'shopee' THEN 'Hoàn tiền 3-8% đơn hàng. Duyệt sau 30-45 ngày khi đơn hoàn tất.'
  WHEN id = 'lazada' THEN 'Hoàn tiền 2-6% đơn hàng. Duyệt sau 45-60 ngày khi đơn hoàn tất.'
  WHEN id = 'tiki' THEN 'Hoàn tiền 2-5% đơn hàng. Duyệt sau 30 ngày khi đơn hoàn tất.'
  WHEN id = 'sendo' THEN 'Hoàn tiền 1-4% đơn hàng. Duyệt sau 30 ngày khi đơn hoàn tất.'
  ELSE 'Liên hệ admin để biết chi tiết chính sách hoàn tiền.'
END
WHERE policy_note IS NULL;

-- Display updated structure
SELECT
  id,
  name,
  commission_rate,
  policy_note,
  is_active
FROM merchants
ORDER BY name;
