-- Check data in both tables

-- 1. Check conversions table
SELECT 'CONVERSIONS TABLE' as info;
SELECT
  id,
  user_id,
  click_id,
  accesstrade_id,
  merchant_name,
  order_code,
  status,
  order_time
FROM conversions
ORDER BY order_time DESC
LIMIT 10;

-- 2. Check system_conversions table
SELECT 'SYSTEM_CONVERSIONS TABLE' as info;
SELECT
  id,
  user_id,
  click_id,
  at_conversion_id,
  merchant_name,
  order_code,
  status,
  order_time
FROM system_conversions
ORDER BY order_time DESC
LIMIT 10;

-- 3. Check conversions that SHOULD be in system_conversions
SELECT 'CONVERSIONS WITH CLICK_ID (should be in system_conversions)' as info;
SELECT
  id,
  user_id,
  click_id,
  merchant_name,
  order_code,
  status
FROM conversions
WHERE click_id IS NOT NULL AND user_id IS NOT NULL
LIMIT 10;

-- 4. Count comparison
SELECT 'COUNT COMPARISON' as info;
SELECT
  (SELECT COUNT(*) FROM conversions) as total_conversions,
  (SELECT COUNT(*) FROM conversions WHERE click_id IS NOT NULL) as conversions_with_click,
  (SELECT COUNT(*) FROM system_conversions) as system_conversions;
