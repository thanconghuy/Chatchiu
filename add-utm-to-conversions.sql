-- Add UTM parameters to conversions table
-- This allows tracking of UTM data from AccessTrade orders

ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100),
ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100),
ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100),
ADD COLUMN IF NOT EXISTS utm_content VARCHAR(100);

-- Create indexes for faster UTM-based queries
CREATE INDEX IF NOT EXISTS idx_conversions_utm_source ON conversions(utm_source);
CREATE INDEX IF NOT EXISTS idx_conversions_utm_campaign ON conversions(utm_campaign);

-- Display confirmation
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'conversions'
    AND column_name LIKE 'utm_%'
ORDER BY column_name;

COMMENT ON COLUMN conversions.utm_source IS 'UTM source parameter from AccessTrade order';
COMMENT ON COLUMN conversions.utm_medium IS 'UTM medium parameter from AccessTrade order';
COMMENT ON COLUMN conversions.utm_campaign IS 'UTM campaign parameter from AccessTrade order';
COMMENT ON COLUMN conversions.utm_content IS 'UTM content parameter from AccessTrade order';

-- Show total conversions with UTM data
SELECT
    COUNT(*) as total_conversions,
    COUNT(utm_source) as with_utm_source,
    COUNT(utm_campaign) as with_utm_campaign
FROM conversions;
