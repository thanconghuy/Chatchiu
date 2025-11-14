-- Add AccessTrade status fields to conversions table
-- These fields help determine if a conversion is "temp approved"
-- (approved on AccessTrade but payment not yet received)

ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS order_approved INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS products_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS order_pending INTEGER DEFAULT 0;

-- Add comment to explain fields
COMMENT ON COLUMN conversions.order_approved IS 'AccessTrade order_approved field (0=not approved, >0=approved)';
COMMENT ON COLUMN conversions.products_count IS 'Number of products in the order from AccessTrade';
COMMENT ON COLUMN conversions.order_pending IS 'AccessTrade order_pending field (0=not pending, >0=pending)';
