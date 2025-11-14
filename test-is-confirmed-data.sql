-- ============================================
-- TEST IS_CONFIRMED DATA - July 2025
-- ============================================

-- 1. Kiểm tra dữ liệu is_confirmed trong conversions table
SELECT
    order_code,
    accesstrade_id,
    merchant_name,
    order_amount,
    commission,
    status,
    is_confirmed,
    confirmed_time,
    order_approved,
    order_pending,
    order_reject,
    order_time,
    created_at
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-08-01'
ORDER BY order_time DESC
LIMIT 20;

-- 2. Thống kê is_confirmed theo status
SELECT
    status,
    is_confirmed,
    COUNT(*) as total_orders,
    SUM(order_amount) as total_amount,
    SUM(commission) as total_commission
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-08-01'
GROUP BY status, is_confirmed
ORDER BY status, is_confirmed;

-- 3. Kiểm tra các đơn có is_confirmed = 1 (Đã đối soát)
SELECT
    order_code,
    accesstrade_id,
    merchant_name,
    status,
    is_confirmed,
    confirmed_time,
    order_amount,
    commission
FROM conversions
WHERE order_time >= '2025-07-01'
    AND order_time < '2025-08-01'
    AND is_confirmed = 1
ORDER BY confirmed_time DESC;

-- 4. Kiểm tra các đơn có is_confirmed = 0 (Chưa đối soát)
SELECT
    order_code,
    accesstrade_id,
    merchant_name,
    status,
    is_confirmed,
    confirmed_time,
    order_amount,
    commission
FROM conversions
WHERE order_time >= '2025-07-01'
    AND order_time < '2025-08-01'
    AND is_confirmed = 0
ORDER BY order_time DESC
LIMIT 20;

-- 5. Tìm các đơn có trạng thái approved nhưng chưa đối soát (bất thường)
SELECT
    order_code,
    accesstrade_id,
    merchant_name,
    status,
    is_confirmed,
    confirmed_time,
    order_amount,
    commission,
    order_time
FROM conversions
WHERE order_time >= '2025-07-01'
    AND order_time < '2025-08-01'
    AND status = 'approved'
    AND is_confirmed = 0
ORDER BY order_time DESC;

-- 6. Kiểm tra một số order cụ thể từ screenshot
SELECT
    order_code,
    accesstrade_id,
    merchant_name,
    status,
    is_confirmed,
    confirmed_time,
    order_approved,
    order_pending,
    order_reject,
    order_amount,
    commission,
    order_time,
    created_at,
    updated_at
FROM conversions
WHERE order_code IN (
    '250731K0B8N60J',
    '250731JU3VVVV4',
    '250731JHK4JN6K',
    '6974710919',
    '250731J9EJJP8D'
)
ORDER BY order_time DESC;

-- 7. Tổng hợp tất cả để so sánh
SELECT
    COUNT(*) as total_orders,
    SUM(CASE WHEN is_confirmed = 1 THEN 1 ELSE 0 END) as confirmed_count,
    SUM(CASE WHEN is_confirmed = 0 THEN 1 ELSE 0 END) as not_confirmed_count,
    SUM(CASE WHEN is_confirmed IS NULL THEN 1 ELSE 0 END) as null_count,
    ROUND(SUM(CASE WHEN is_confirmed = 1 THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 2) as confirmed_percentage
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-08-01';

-- 8. Chi tiết theo merchant và is_confirmed
SELECT
    merchant_name,
    is_confirmed,
    COUNT(*) as total_orders,
    SUM(order_amount) as total_amount
FROM conversions
WHERE order_time >= '2025-07-01' AND order_time < '2025-08-01'
GROUP BY merchant_name, is_confirmed
ORDER BY merchant_name, is_confirmed;
