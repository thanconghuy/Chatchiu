-- Migration: Add product_info column to clicks table
-- Purpose: Store TikTok Shop product metadata (name, price, image, commission)
-- Created: 2025-01-16

-- Add product_info column as JSONB to store flexible product data
ALTER TABLE clicks ADD COLUMN IF NOT EXISTS product_info JSONB;

-- Create index on product_info for faster queries
CREATE INDEX IF NOT EXISTS idx_clicks_product_info ON clicks USING GIN (product_info);

-- Add comment to explain the column
COMMENT ON COLUMN clicks.product_info IS 'TikTok Shop product metadata from V2 API: {id, name, price, image, commission}';

-- Example product_info structure:
-- {
--   "id": "1729836100247522192",
--   "name": "Ghim Tráng Men Hình Mèo...",
--   "price": {
--     "amount": "20000",
--     "currency": "VND"
--   },
--   "image": "https://p16-oec-sg.ibyteimg.com/...",
--   "commission": {
--     "amount": "3.000",
--     "currency": "VND",
--     "rate": 1500
--   }
-- }
