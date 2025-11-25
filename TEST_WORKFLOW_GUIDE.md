# 🧪 TEST WORKFLOW GUIDE - System Reconciliation Status

## ✅ HOÀN THÀNH TẤT CẢ UPDATES!

### **Backend:**
- ✅ Migration 019 đã chạy
- ✅ SystemReconciliationService.js updated (2 patches)
- ✅ PaymentSystemReconciliationService.js updated
- ✅ PaymentRequest.js updated

### **Frontend:**
- ✅ Thêm 2 cột mới: "TT đối soát HT" và "TT thanh toán"
- ✅ Thêm CSS classes cho status badges
- ✅ Thêm logic hiển thị status

### **Server:**
- ✅ Server đang chạy: http://localhost:3007

---

## 📋 TESTING WORKFLOW

### **🔹 TEST 1: Xem Conversions Management**

1. **Mở trình duyệt:**
   ```
   http://localhost:3007/admin/conversions.html
   ```

2. **Kiểm tra table có 12 columns:**
   - User
   - Merchant
   - Order Code
   - Order Amount
   - Commission
   - Cashback
   - TT đơn hàng
   - TT đối soát
   - **TT đối soát HT** ← MỚI
   - **TT thanh toán** ← MỚI
   - Order Time
   - Actions

3. **Expected hiện tại:**
   - Tất cả orders: "TT đối soát HT" = "Chưa đối soát" (gray badge)
   - Tất cả orders: "TT thanh toán" = "Chưa tạo yêu cầu" (gray badge)

---

### **🔹 TEST 2: Tạo System Reconciliation**

1. **Vào System Reconciliation:**
   ```
   http://localhost:3007/admin/system-reconciliation.html
   ```

2. **Click "Tạo kỳ đối soát mới"**

3. **Chọn period và orders:**
   - Chọn tháng (ví dụ: Tháng 11/2025)
   - Tick chọn một vài orders (status = approved)
   - Click "Tạo đối soát"

4. **Kiểm tra database:**
   ```sql
   SELECT c.id, c.order_code,
          c.system_reconciliation_status as conv_status,
          sc.system_reconciliation_status as sc_status
   FROM conversions c
   INNER JOIN system_conversions sc ON c.id = sc.at_conversion_id
   WHERE c.system_reconciliation_status IS NOT NULL
   ORDER BY c.created_at DESC
   LIMIT 10;
   ```

5. **Expected:**
   - `conv_status` = 'processing'
   - `sc_status` = 'processing'

6. **Quay lại Conversions Management, refresh page**
   - Các orders đã chọn: "TT đối soát HT" = "Đang xử lý" (yellow badge)

---

### **🔹 TEST 3: Finalize Reconciliation**

1. **Vào System Reconciliation list**

2. **Tìm reconciliation vừa tạo (status = draft)**

3. **Click "Hoàn tất"**

4. **Kiểm tra toast notification:**
   - Hiện: "Hoàn tất thành công! Số dư người dùng đã được cập nhật."
   - Animation: slide-in từ phải

5. **Kiểm tra database:**
   ```sql
   SELECT c.id, c.order_code,
          c.system_reconciliation_status as conv_status,
          sc.system_reconciliation_status as sc_status,
          usb.available_balance
   FROM conversions c
   INNER JOIN system_conversions sc ON c.id = sc.at_conversion_id
   INNER JOIN user_system_balance usb ON c.user_id = usb.user_id
   WHERE c.system_reconciliation_id = '<reconciliation_id>'
   LIMIT 10;
   ```

6. **Expected:**
   - `conv_status` = 'reconciled'
   - `sc_status` = 'reconciled'
   - `available_balance` đã tăng

7. **Quay lại Conversions Management, refresh**
   - Các orders: "TT đối soát HT" = "Đã đối soát" (green badge)

---

### **🔹 TEST 4: Create Payment Request (User)**

1. **Login as user có balance**
   ```
   http://localhost:3007/login.html
   ```

2. **Vào trang Payment Request**
   ```
   http://localhost:3007/user/payment-request.html
   ```

3. **Tạo payment request mới:**
   - Nhập số tiền (ví dụ: 100,000 VND)
   - Nhập thông tin bank
   - Click "Gửi yêu cầu"

4. **Kiểm tra database:**
   ```sql
   SELECT sc.id, sc.order_code,
          sc.payment_status,
          sc.payment_request_id,
          pr.status as payment_request_status
   FROM system_conversions sc
   INNER JOIN payment_system_reconciliation_mapping psrm
     ON sc.at_conversion_id = psrm.conversion_id
   INNER JOIN payment_requests pr ON psrm.payment_request_id = pr.id
   WHERE pr.user_id = '<user_id>'
   ORDER BY pr.created_at DESC
   LIMIT 10;
   ```

5. **Expected:**
   - `sc.payment_status` = 'pending'
   - `pr.status` = 'pending'

6. **Vào Admin Conversions Management, refresh**
   - Các orders linked: "TT thanh toán" = "Đang xử lý" (yellow badge)

---

### **🔹 TEST 5: Admin Confirm Payment**

1. **Vào Admin Payment Requests:**
   ```
   http://localhost:3007/admin/payment-requests.html
   ```

2. **Tìm payment request vừa tạo**

3. **Click "Xác nhận"**

4. **Kiểm tra database:**
   ```sql
   SELECT sc.payment_status, pr.status
   FROM system_conversions sc
   INNER JOIN payment_system_reconciliation_mapping psrm
     ON sc.at_conversion_id = psrm.conversion_id
   INNER JOIN payment_requests pr ON psrm.payment_request_id = pr.id
   WHERE pr.id = '<payment_request_id>';
   ```

5. **Expected:**
   - `sc.payment_status` = 'confirmed'
   - `pr.status` = 'confirmed'

6. **Vào Conversions Management, refresh**
   - Status vẫn: "Đang xử lý" (vì confirmed cũng map to "Đang xử lý")

---

### **🔹 TEST 6: Admin Mark as Paid**

1. **Trong Payment Requests, click "Đánh dấu đã thanh toán"**

2. **Nhập transaction reference**

3. **Click "Xác nhận"**

4. **Kiểm tra database:**
   ```sql
   SELECT sc.payment_status, pr.status
   FROM system_conversions sc
   INNER JOIN payment_system_reconciliation_mapping psrm
     ON sc.at_conversion_id = psrm.conversion_id
   INNER JOIN payment_requests pr ON psrm.payment_request_id = pr.id
   WHERE pr.id = '<payment_request_id>';
   ```

5. **Expected:**
   - `sc.payment_status` = 'paid'
   - `pr.status` = 'paid'

6. **Vào Conversions Management, refresh**
   - Status: "TT thanh toán" = "Đã thanh toán" (green badge)

---

### **🔹 TEST 7: Admin Reject Payment**

1. **Tạo payment request mới (repeat TEST 4)**

2. **Trong Admin Panel, click "Từ chối"**

3. **Nhập lý do reject**

4. **Expected:**
   - Database: `sc.payment_status` = 'rejected'
   - Frontend: "TT thanh toán" = "Hủy" (red badge)

---

## 🎨 STATUS BADGE COLORS

### **TT đối soát HT:**
- 🟦 **Chưa đối soát** (gray) - NULL/not in reconciliation
- 🟨 **Đang xử lý** (yellow) - 'processing'
- 🟩 **Đã đối soát** (green) - 'reconciled' or 'paid'

### **TT thanh toán:**
- 🟦 **Chưa tạo yêu cầu** (gray) - NULL
- 🟨 **Đang xử lý** (yellow) - 'pending' or 'confirmed'
- 🟩 **Đã thanh toán** (green) - 'paid'
- 🟥 **Hủy** (red) - 'rejected'

---

## 🐛 TROUBLESHOOTING

### **Issue 1: Columns không hiện**
- Clear cache: Ctrl + Shift + R
- Check browser console (F12) có lỗi không

### **Issue 2: Status không update**
- Check server logs
- Verify migration 019 đã chạy:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'system_conversions'
  AND column_name IN ('system_reconciliation_status', 'payment_status');
  ```

### **Issue 3: Trigger không chạy**
- Check trigger tồn tại:
  ```sql
  SELECT tgname FROM pg_trigger
  WHERE tgname = 'trigger_sync_reconciliation_status';
  ```

---

## 📊 QUICK DATABASE CHECKS

### **Check all conversions with status:**
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN system_reconciliation_status = 'processing' THEN 1 END) as processing,
  COUNT(CASE WHEN system_reconciliation_status = 'reconciled' THEN 1 END) as reconciled,
  COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as payment_pending,
  COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as payment_paid
FROM system_conversions;
```

### **View all statuses:**
```sql
SELECT
  sc.id,
  sc.order_code,
  sc.system_reconciliation_status as recon_status,
  sc.payment_status,
  sr.period_label,
  pr.status as payment_request_status
FROM system_conversions sc
LEFT JOIN system_reconciliations sr ON sc.system_reconciliation_id = sr.id
LEFT JOIN payment_system_reconciliation_mapping psrm ON sc.at_conversion_id = psrm.conversion_id
LEFT JOIN payment_requests pr ON psrm.payment_request_id = pr.id
ORDER BY sc.created_at DESC
LIMIT 20;
```

---

## ✅ SUCCESS CRITERIA

Tất cả tests PASS nếu:

1. ✅ 2 cột mới hiển thị đúng trong Conversions Management
2. ✅ Status "Đang xử lý" hiện khi tạo reconciliation
3. ✅ Status "Đã đối soát" hiện khi finalize
4. ✅ Status "Đang xử lý" hiện khi tạo payment
5. ✅ Status "Đã thanh toán" hiện khi mark as paid
6. ✅ Status "Hủy" hiện khi reject payment
7. ✅ Trigger tự động sync conversions → system_conversions

---

**Anh bắt đầu test từ TEST 1 nhé! Báo tôi kết quả từng bước! 🚀**
