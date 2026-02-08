-- =====================================================
-- TEST USER ORDERS - Copy và chạy trực tiếp trên Neon
-- =====================================================
-- Thay email bên dưới để test user khác
-- =====================================================

-- 1. DANH SÁCH TẤT CẢ ĐƠN HÀNG CỦA USER
SELECT
  u.email as "User",
  sc.order_code as "Order Code",
  sc.commission as "Commission",
  sc.cashback_amount as "Cashback",
  sc.status as "TT Đơn Hàng",
  sc.system_reconciliation_status as "TT Đối Soát",
  sc.payment_status as "TT Thanh Toán",
  sc.order_time as "Ngày Đặt"
FROM system_conversions sc
JOIN users u ON sc.user_id = u.id
WHERE u.email = 'andytt19@gmail.com'
ORDER BY sc.order_time DESC;


-- 2. TỔNG HỢP THEO TRẠNG THÁI
-- NOTE: "Tổng Cashback" = TẤT CẢ đơn hàng (pending + approved + rejected)
SELECT
  u.email as "User",

  -- Tổng TẤT CẢ đơn (pending + approved + rejected) - ĐÂY LÀ "TỔNG CASHBACK" TRÊN UI
  COUNT(*) as "Tổng Số Đơn",
  COALESCE(SUM(sc.cashback_amount), 0) as "TỔNG CASHBACK (hiển thị trên UI)",

  -- Theo status
  COUNT(*) FILTER (WHERE sc.status = 'pending') as "Số Đơn Chờ Duyệt",
  COALESCE(SUM(sc.cashback_amount) FILTER (WHERE sc.status = 'pending'), 0) as "Cashback Chờ Duyệt",

  COUNT(*) FILTER (WHERE sc.status = 'approved') as "Số Đơn Đã Duyệt",
  COALESCE(SUM(sc.cashback_amount) FILTER (WHERE sc.status = 'approved'), 0) as "Cashback Đã Duyệt",

  COUNT(*) FILTER (WHERE sc.status = 'rejected') as "Số Đơn Đã Hủy",
  COALESCE(SUM(sc.cashback_amount) FILTER (WHERE sc.status = 'rejected'), 0) as "Cashback Đã Hủy"

FROM system_conversions sc
JOIN users u ON sc.user_id = u.id
WHERE u.email = 'andytt19@gmail.com'
GROUP BY u.email;


-- 3. CHI TIẾT THEO TỪNG TRẠNG THÁI ĐỐI SOÁT (cho đơn approved)
SELECT
  u.email as "User",

  -- Đã duyệt nhưng CHƯA đối soát
  COUNT(*) FILTER (WHERE sc.status = 'approved' AND (sc.system_reconciliation_status IS NULL OR sc.system_reconciliation_status != 'reconciled')) as "Đơn Chưa Đối Soát",
  COALESCE(SUM(sc.cashback_amount) FILTER (WHERE sc.status = 'approved' AND (sc.system_reconciliation_status IS NULL OR sc.system_reconciliation_status != 'reconciled')), 0) as "Cashback Chưa Đối Soát",

  -- Đã duyệt VÀ đã đối soát
  COUNT(*) FILTER (WHERE sc.status = 'approved' AND sc.system_reconciliation_status = 'reconciled') as "Đơn Đã Đối Soát",
  COALESCE(SUM(sc.cashback_amount) FILTER (WHERE sc.status = 'approved' AND sc.system_reconciliation_status = 'reconciled'), 0) as "Cashback Đã Đối Soát"

FROM system_conversions sc
JOIN users u ON sc.user_id = u.id
WHERE u.email = 'andytt19@gmail.com'
GROUP BY u.email;


-- 4. THÔNG TIN SỐ DƯ TỪ user_system_balance
SELECT
  u.email as "User",
  usb.total_earned as "Total Earned (DB)",
  usb.total_withdrawn as "Total Withdrawn",
  usb.pending_reserved as "Pending Reserved",
  usb.debt_balance as "Debt Balance"
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
WHERE u.email = 'andytt19@gmail.com';


-- 5. THÔNG TIN PAYMENT REQUESTS
SELECT
  u.email as "User",
  pr.id as "Request ID",
  pr.requested_amount as "Số Tiền",
  pr.status as "Trạng Thái",
  pr.created_at as "Ngày Tạo",
  pr.paid_at as "Ngày TT"
FROM payment_requests pr
JOIN users u ON pr.user_id = u.id
WHERE u.email = 'andytt19@gmail.com'
ORDER BY pr.created_at DESC;
