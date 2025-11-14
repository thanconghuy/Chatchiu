-- ==========================================
-- TEST RECONCILIATION ELIGIBILITY - July 2025
-- Kiểm tra các đơn đủ điều kiện đối soát
-- ==========================================

-- 1. Query CHÍNH XÁC như reconciliationService (Tất cả utm_source)
-- Giống hệt query ở backend/services/reconciliationService.js line 37-87
SELECT
  c.id,
  c.user_id,
  c.click_id,
  c.order_code,
  c.merchant_name,
  c.order_amount,
  c.commission,
  c.cashback_amount,
  c.order_time,
  c.confirmed_time,
  c.status,
  c.is_confirmed,
  c.utm_source,
  c.utm_campaign,
  u.full_name as user_name,
  u.email as user_email,
  ri.reconciliation_id as existing_reconciliation_id,
  r.period_label as existing_period_label
FROM conversions c
INNER JOIN users u ON c.user_id = u.id
LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
LEFT JOIN reconciliations r ON ri.reconciliation_id = r.id
WHERE 1=1
  AND c.is_confirmed = 1
  AND c.status = 'approved'
  AND c.confirmed_time >= '2025-07-01'
  AND c.confirmed_time < '2025-07-05'
  -- NO UTM_SOURCE FILTER (Tất cả)
ORDER BY c.confirmed_time DESC;

-- 2. Query với filter chatchiu only
SELECT
  c.id,
  c.order_code,
  c.merchant_name,
  c.order_amount,
  c.commission,
  c.cashback_amount,
  c.order_time,
  c.confirmed_time,
  c.status,
  c.is_confirmed,
  c.utm_source,
  u.full_name as user_name,
  u.email as user_email
FROM conversions c
INNER JOIN users u ON c.user_id = u.id
WHERE 1=1
  AND c.is_confirmed = 1
  AND c.status = 'approved'
  AND c.confirmed_time >= '2025-07-01'
  AND c.confirmed_time < '2025-07-05'
  AND c.utm_source = 'chatchiu'  -- Filter chatchiu only
ORDER BY c.confirmed_time DESC;

-- 3. Thống kê theo utm_source trong khoảng thời gian
SELECT
    utm_source,
    COUNT(*) as total_orders,
    SUM(CASE WHEN is_confirmed = 1 AND status = 'approved' THEN 1 ELSE 0 END) as eligible_orders,
    SUM(CASE WHEN is_confirmed = 1 AND status = 'approved' THEN cashback_amount ELSE 0 END) as total_cashback
FROM conversions
WHERE confirmed_time >= '2025-07-01'
  AND confirmed_time < '2025-07-05'
GROUP BY utm_source
ORDER BY eligible_orders DESC;

-- 4. Kiểm tra confirmed_time có NULL không
SELECT
    COUNT(*) as total_with_confirmed_time,
    COUNT(CASE WHEN confirmed_time IS NULL THEN 1 END) as null_confirmed_time,
    COUNT(CASE WHEN confirmed_time >= '2025-07-01' AND confirmed_time < '2025-07-05' THEN 1 END) as in_range
FROM conversions
WHERE is_confirmed = 1
  AND status = 'approved'
  AND order_time >= '2025-07-01'
  AND order_time < '2025-07-05';

-- 5. Chi tiết các đơn có order_time trong range nhưng confirmed_time ngoài range
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
        WHEN confirmed_time IS NULL THEN '❌ NULL confirmed_time'
        WHEN confirmed_time < '2025-07-01' THEN '❌ confirmed_time trước 01/07'
        WHEN confirmed_time >= '2025-07-05' THEN '❌ confirmed_time sau 04/07'
        ELSE '✅ confirmed_time trong range'
    END as confirmed_time_status
FROM conversions
WHERE order_time >= '2025-07-01'
  AND order_time < '2025-07-05'
  AND is_confirmed = 1
  AND status = 'approved'
ORDER BY
    CASE
        WHEN confirmed_time >= '2025-07-01' AND confirmed_time < '2025-07-05' THEN 0
        ELSE 1
    END,
    order_time DESC
LIMIT 30;
