-- Add order_reject field to conversions table
-- order_reject = 1 means the order was rejected/cancelled by AccessTrade

ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS order_reject INTEGER DEFAULT 0;

COMMENT ON COLUMN conversions.order_reject IS 'AccessTrade order_reject field (1=rejected, 0=not rejected)';
