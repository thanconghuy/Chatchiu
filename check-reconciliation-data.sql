-- ==========================================
-- CHECK RECONCILIATION ELIGIBILITY - July 2025
-- ==========================================

-- 1. Kiểm tra các đơn trong khoảng thời gian 01-04/07/2025
SELECT
    order_code,
    status,
    is_confirmed,
    confirmed_time,
    utm_source,
    order_time,
    merchant_name,
    cashback_amount
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
ORDER BY order_time DESC
LIMIT 20;

-- 2. Thống kê theo điều kiện đối soát
SELECT
    'Total orders in period' as metric,
    COUNT(*) as count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'

UNION ALL

SELECT
    'is_confirmed = 1' as metric,
    COUNT(*) as count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
    AND is_confirmed = 1

UNION ALL

SELECT
    'status = approved' as metric,
    COUNT(*) as count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
    AND status = 'approved'

UNION ALL

SELECT
    'confirmed + approved' as metric,
    COUNT(*) as count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
    AND is_confirmed = 1
    AND status = 'approved'

UNION ALL

SELECT
    'confirmed_time IS NOT NULL' as metric,
    COUNT(*) as count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
    AND confirmed_time IS NOT NULL

UNION ALL

SELECT
    'Has confirmed_time in range' as metric,
    COUNT(*) as count
FROM conversions
WHERE confirmed_time >= '2025-07-01' AND confirmed_time < '2025-07-05';

-- 3. Chi tiết các đơn đã confirmed + approved NHƯNG confirmed_time không trong range
SELECT
    order_code,
    status,
    is_confirmed,
    order_time,
    confirmed_time,
    utm_source,
    merchant_name,
    cashback_amount,
    CASE
        WHEN confirmed_time IS NULL THEN 'NULL confirmed_time'
        WHEN confirmed_time < '2025-07-01' THEN 'confirmed_time trước 01/07'
        WHEN confirmed_time >= '2025-07-05' THEN 'confirmed_time sau 04/07'
        ELSE 'confirmed_time trong range'
    END as confirmed_time_status
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
    AND is_confirmed = 1
    AND status = 'approved'
ORDER BY order_time DESC
LIMIT 20;

-- 4. Kiểm tra utm_source distribution
SELECT
    utm_source,
    COUNT(*) as count,
    SUM(CASE WHEN is_confirmed = 1 AND status = 'approved' THEN 1 ELSE 0 END) as eligible_count
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-07-05'
GROUP BY utm_source
ORDER BY count DESC;

-- 5. Query giống hệt logic reconciliation service
SELECT
    c.order_code,
    c.status,
    c.is_confirmed,
    c.confirmed_time,
    c.order_time,
    c.utm_source,
    c.merchant_name,
    c.cashback_amount
FROM conversions c
INNER JOIN users u ON c.user_id = u.id
WHERE 1=1
    AND c.is_confirmed = 1
    AND c.status = 'approved'
    AND c.confirmed_time >= '2025-07-01'
    AND c.confirmed_time < '2025-07-05'
    AND c.utm_source = 'chatchiu'
ORDER BY c.confirmed_time DESC;
