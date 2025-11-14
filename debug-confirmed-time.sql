-- Debug confirmed_time values
SELECT
    order_code,
    order_time,
    confirmed_time,
    DATE(confirmed_time) as confirmed_date,
    status,
    is_confirmed,
    utm_source,
    cashback_amount
FROM conversions
WHERE order_time >= '2025-07-01'
  AND order_time < '2025-07-05'
  AND is_confirmed = 1
  AND status = 'approved'
ORDER BY confirmed_time DESC
LIMIT 10;
