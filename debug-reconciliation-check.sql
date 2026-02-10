-- ===========================================
-- DEBUG: Kiểm tra lịch sử đối soát user
-- User: mtkonline2018@gmail.com
-- ID: eb06669c-03c7-497d-a139-1e89c2a9df58
-- ===========================================

-- 2. Tất cả đơn hàng system_conversions của user
SELECT
    sc.id,
    sc.order_code,
    sc.merchant_name,
    sc.cashback_amount,
    sc.status,
    sc.order_time,
    sc.system_reconciliation_id,
    sc.system_reconciled_at
FROM system_conversions sc
WHERE sc.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
ORDER BY sc.created_at DESC;

-- 3. Kiểm tra system_reconciliation_items cho user này
SELECT
    sri.id as item_id,
    sri.system_conversion_id,
    sri.system_reconciliation_id,
    sri.user_id,
    sri.cashback_amount,
    sri.conversion_status,
    sc.order_code,
    sc.merchant_name
FROM system_reconciliation_items sri
LEFT JOIN system_conversions sc ON sc.id = sri.system_conversion_id
WHERE sri.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
ORDER BY sri.created_at DESC;

-- 4. So sánh: Đơn hàng "đã đối soát" trên system_conversions nhưng KHÔNG có trong system_reconciliation_items
SELECT
    sc.id,
    sc.order_code,
    sc.merchant_name,
    sc.cashback_amount,
    sc.status,
    sc.system_reconciliation_id,
    sc.system_reconciled_at,
    sri.id as sri_id
FROM system_conversions sc
LEFT JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
WHERE sc.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
  AND sc.system_reconciliation_id IS NOT NULL
  AND sri.id IS NULL;

-- 5. Tất cả kỳ đối soát liên quan đến user (qua cả 2 đường)
SELECT
    sr.id as recon_id,
    sr.period_label,
    sr.period_start,
    sr.period_end,
    sr.status,
    sr.finalized_at,
    COUNT(DISTINCT sri.id) as items_via_sri,
    COUNT(DISTINCT sc_direct.id) as items_via_sc_direct
FROM system_reconciliations sr
LEFT JOIN system_reconciliation_items sri ON sri.system_reconciliation_id = sr.id AND sri.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
LEFT JOIN system_conversions sc_direct ON sc_direct.system_reconciliation_id = sr.id AND sc_direct.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
WHERE sri.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58' OR sc_direct.user_id = 'eb06669c-03c7-497d-a139-1e89c2a9df58'
GROUP BY sr.id, sr.period_label, sr.period_start, sr.period_end, sr.status, sr.finalized_at
ORDER BY sr.created_at DESC;
