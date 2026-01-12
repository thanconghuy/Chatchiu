# PHÂN TÍCH TOÀN BỘ LOGIC HỆ THỐNG - TỪ ĐẦU

**Ngày:** 10/01/2026
**Mục đích:** Phân tích đúng logic từ đơn hàng đối soát → thanh toán → cập nhật số dư

---

## 🔄 WORKFLOW HOÀN CHỈNH (ĐÚNG)

### 1️⃣ **ĐƠN HÀNG ĐÃ ĐỐI SOÁT**

**Nguồn dữ liệu:**
- Bảng: `system_conversions`
- Điều kiện: `status = 'approved'`

**Khi admin chạy đối soát (System Reconciliation):**

```javascript
// backend/services/systemReconciliation/SystemReconciliationService.js

// 1. Tạo kỳ đối soát
INSERT INTO system_reconciliations (period_label, status, ...) VALUES (...)

// 2. Thêm conversions vào kỳ đối soát
INSERT INTO system_reconciliation_items (
  system_reconciliation_id,
  system_conversion_id,
  user_id,
  cashback_amount,
  conversion_status = 'approved',
  ...
)

// 3. Cập nhật user_system_balance
UPDATE user_system_balance
SET available_balance = available_balance + <tổng cashback approved>,
    total_earned = total_earned + <tổng cashback approved>,
    last_reconciliation_date = CURRENT_TIMESTAMP
WHERE user_id = ...
```

**Kết quả:**
- ✅ Conversions approved được cộng vào `user_system_balance.available_balance`
- ✅ User thấy số dư tăng lên
- ✅ `system_conversions.payment_status` = NULL (chưa thanh toán)

---

### 2️⃣ **USER TẠO YÊU CẦU THANH TOÁN**

**Input:**
- Số tiền: X đ (40,000đ ≤ X ≤ 500,000đ)
- Thông tin ngân hàng

**Validation:**
```javascript
// backend/services/paymentRequestService.js

// Check available balance
const balance = await BalanceManagementService.getUserBalance(userId)
const available = balance.available_balance

if (requestedAmount > available) {
  throw Error('Số dư không đủ')
}
```

**Action:**
```sql
-- Chỉ INSERT payment request
INSERT INTO payment_requests (
  user_id,
  requested_amount,
  status = 'pending',
  ...
) VALUES (...)
```

**Effect:**
- ✅ Request created với status = `pending`
- ❌ KHÔNG trừ `user_system_balance.available_balance` (chưa thanh toán!)
- ❌ KHÔNG thay đổi `system_conversions.payment_status`
- ❌ KHÔNG link items

**CHÚ Ý QUAN TRỌNG:**
Ở bước này, số dư KHÔNG thay đổi! Vì user chỉ "yêu cầu" chưa thực sự nhận tiền.

---

### 3️⃣ **ADMIN XÁC NHẬN THANH TOÁN (Optional)**

**Action:**
```sql
UPDATE payment_requests
SET status = 'confirmed'
WHERE id = ...
```

**Effect:**
- ✅ Status changed: `pending` → `confirmed`
- ❌ KHÔNG thay đổi balance
- ❌ KHÔNG thay đổi conversions

---

### 4️⃣ **ADMIN MARK AS PAID (ĐÃ THANH TOÁN)**

**Action:**
```javascript
// backend/services/paymentRequestService.js - markAsPaid()

// Step 1: Update payment request
UPDATE payment_requests
SET status = 'paid', paid_at = NOW()
WHERE id = ...

// Step 2: TRỪ số dư từ user_system_balance
UPDATE user_system_balance
SET available_balance = available_balance - <requested_amount>,
    total_withdrawn = total_withdrawn + <requested_amount>,
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = ...

// Step 3: Đánh dấu conversions đã thanh toán (FIFO)
WITH selected_conversions AS (
  SELECT id, cashback_amount,
    SUM(cashback_amount) OVER (ORDER BY order_time ASC, id ASC) as running_total
  FROM system_conversions
  WHERE user_id = ...
    AND status = 'approved'
    AND (payment_status IS NULL OR payment_status = 'unpaid')
)
UPDATE system_conversions
SET payment_status = 'paid',
    payment_request_id = <request_id>,
    payment_linked_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM selected_conversions WHERE running_total <= <requested_amount>
)
```

**Effect:**
- ✅ Request status: `confirmed` → `paid`
- ✅ `user_system_balance.available_balance` GIẢM requested_amount
- ✅ `user_system_balance.total_withdrawn` TĂNG requested_amount
- ✅ Conversions (FIFO) được đánh dấu `payment_status = 'paid'`
- ✅ Link conversions với payment request (tracking)

---

### 5️⃣ **USER HỦY YÊU CẦU (Optional)**

**Điều kiện:**
- ✅ Chỉ hủy được khi status = `pending`
- ❌ KHÔNG hủy được `confirmed` hoặc `paid`

**Action:**
```sql
UPDATE payment_requests
SET status = 'cancelled', cancelled_at = NOW()
WHERE id = ... AND status = 'pending'
```

**Effect:**
- ✅ Status changed: `pending` → `cancelled`
- ❌ KHÔNG thay đổi balance (vì lúc tạo request cũng chưa trừ)
- ❌ KHÔNG thay đổi conversions

---

## 📊 SỐ DƯ KHẢ DỤNG - CÔNG THỨC ĐÚNG

### ✅ Công thức chính xác:

```
Số dư khả dụng = Tổng cashback đã đối soát (approved) - Tổng đã thanh toán thực tế
```

**Cách 1: Tính từ user_system_balance table**
```sql
SELECT available_balance
FROM user_system_balance
WHERE user_id = ...
```

**Giải thích:**
- `available_balance` được cập nhật khi:
  - ➕ Khi đối soát (reconciliation): cộng cashback approved
  - ➖ Khi mark paid: trừ requested_amount

**Cách 2: Tính từ conversions (backup/verification)**
```sql
SELECT
  SUM(CASE WHEN payment_status IS NULL OR payment_status = 'unpaid'
      THEN cashback_amount ELSE 0 END) as available_balance
FROM system_conversions
WHERE user_id = ... AND status = 'approved'
```

**Giải thích:**
- Đếm tất cả conversions approved MÀ chưa được thanh toán
- `payment_status = NULL` hoặc `'unpaid'` = chưa thanh toán
- `payment_status = 'paid'` = đã thanh toán (không tính vào available)

---

## 🎯 NGUYÊN TẮC QUAN TRỌNG

### ✅ Nguyên tắc 1: Số dư chỉ thay đổi khi THỰC SỰ nhận/trả tiền

```
✅ ĐỐI SOÁT (reconciliation) → CỘNG số dư (user nhận cashback)
✅ MARK PAID (admin chuyển tiền) → TRỪ số dư (user nhận tiền thật)
❌ TẠO REQUEST → KHÔNG đổi số dư (chỉ là yêu cầu)
❌ XÁC NHẬN REQUEST → KHÔNG đổi số dư (chưa chuyển tiền)
❌ HỦY REQUEST → KHÔNG đổi số dư (vì lúc tạo cũng chưa trừ)
```

### ✅ Nguyên tắc 2: payment_status tracking

```
system_conversions.payment_status:
  - NULL / 'unpaid': Chưa thanh toán, VẪN CÒN trong số dư khả dụng
  - 'paid': Đã thanh toán, KHÔNG CÒN trong số dư khả dụng
```

**Mục đích:**
- Tracking: Biết conversion nào đã được thanh toán qua request nào
- Verification: Cross-check với user_system_balance

### ✅ Nguyên tắc 3: user_system_balance là SOURCE OF TRUTH

```
user_system_balance.available_balance = SỐ DƯ KHẢ DỤNG CHÍNH THỨC
```

**Cập nhật bởi:**
1. System Reconciliation (cộng khi đối soát)
2. Mark as Paid (trừ khi thanh toán)

**KHÔNG cập nhật bởi:**
- ❌ Create payment request
- ❌ Cancel payment request
- ❌ Confirm payment request

---

## 🔍 VERIFICATION - KIỂM TRA HỆ THỐNG

### Check 1: Balance trong user_system_balance

```sql
SELECT
  available_balance,
  total_earned,
  total_withdrawn,
  last_reconciliation_date
FROM user_system_balance
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e'
```

**Kỳ vọng:**
```
available_balance = total_earned - total_withdrawn
```

### Check 2: Balance từ conversions (verification)

```sql
SELECT
  COUNT(*) as total_approved,
  SUM(cashback_amount) as total_approved_amount,
  COUNT(CASE WHEN payment_status IS NULL OR payment_status = 'unpaid' THEN 1 END) as unpaid_count,
  SUM(CASE WHEN payment_status IS NULL OR payment_status = 'unpaid' THEN cashback_amount ELSE 0 END) as unpaid_amount,
  COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
  SUM(CASE WHEN payment_status = 'paid' THEN cashback_amount ELSE 0 END) as paid_amount
FROM system_conversions
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e'
  AND status = 'approved'
```

**Kỳ vọng:**
```
unpaid_amount ≈ user_system_balance.available_balance
paid_amount ≈ user_system_balance.total_withdrawn
```

### Check 3: Payment requests

```sql
SELECT
  status,
  COUNT(*) as count,
  SUM(requested_amount) as total
FROM payment_requests
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e'
GROUP BY status
```

**Kỳ vọng:**
```
SUM(requested_amount WHERE status = 'paid') ≈ total_withdrawn
```

### Check 4: Reconciliation items

```sql
SELECT
  COUNT(*) as total_items,
  SUM(cashback_amount) as total_amount
FROM system_reconciliation_items
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e'
  AND conversion_status = 'approved'
```

**Kỳ vọng:**
```
total_amount = user_system_balance.total_earned
```

---

## ❌ VẤN ĐỀ HIỆN TẠI

### Vấn đề 1: Conversions mới CHƯA được đối soát

Khi chạy script `add-test-conversions-simple.js`:
```javascript
// Chỉ INSERT vào system_conversions
INSERT INTO system_conversions (...) VALUES (...)

// ❌ KHÔNG tạo system_reconciliation
// ❌ KHÔNG tạo system_reconciliation_items
// ❌ KHÔNG cập nhật user_system_balance
```

**Kết quả:**
```
system_conversions: 203,100đ (approved) ✅
system_reconciliation_items: 93,100đ ❌ (thiếu 110,000đ)
user_system_balance.total_earned: 93,100đ ❌ (thiếu 110,000đ)
user_system_balance.available_balance: 34,300đ ❌ (sai)
```

### Vấn đề 2: Dashboard tính SAI

```javascript
// backend/routes/dashboard.js
// ❌ SAI: Tính từ system_conversions trực tiếp
const balanceQuery = `
  SELECT
    SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END) as total_approved
  FROM system_conversions
  WHERE user_id = $1
`
// → 203,100đ (WRONG - bao gồm cả conversions chưa được đối soát!)
```

**Đúng phải là:**
```javascript
// ✅ ĐÚNG: Đọc từ user_system_balance (source of truth)
SELECT available_balance
FROM user_system_balance
WHERE user_id = $1
// → 34,300đ (đúng với số đã được đối soát)
```

---

## ✅ GIẢI PHÁP ĐÚNG

### Bước 1: Tạo đối soát cho conversions mới

```javascript
// Script: create-reconciliation-for-new-conversions.js

// 1. Tìm conversions chưa có trong reconciliation_items
SELECT sc.* FROM system_conversions sc
WHERE NOT EXISTS (
  SELECT 1 FROM system_reconciliation_items sri
  WHERE sri.system_conversion_id = sc.id
)

// 2. Tạo kỳ đối soát mới
INSERT INTO system_reconciliations (...)

// 3. Thêm vào reconciliation_items
INSERT INTO system_reconciliation_items (
  system_reconciliation_id,
  system_conversion_id,
  ...
)

// 4. Cập nhật user_system_balance
UPDATE user_system_balance
SET available_balance = available_balance + <total_new_cashback>,
    total_earned = total_earned + <total_new_cashback>
WHERE user_id = ...
```

### Bước 2: Sửa Dashboard để đọc từ user_system_balance

```javascript
// backend/routes/dashboard.js

// BEFORE (SAI):
const balance = await pool.query(`
  SELECT SUM(...) FROM system_conversions ...
`)

// AFTER (ĐÚNG):
const balance = await BalanceManagementService.getUserBalance(userId)
// hoặc
const balance = await pool.query(`
  SELECT available_balance, total_earned, total_withdrawn
  FROM user_system_balance
  WHERE user_id = $1
`, [userId])
```

### Bước 3: Widget giữ nguyên (đã đúng)

```javascript
// frontend/js/system-balance-widget.js
// ✅ Đã đúng - đọc từ user_system_balance
fetch('/api/user/system-reconciliation/balance')
```

---

## 📝 SUMMARY

### Luồng ĐÚNG:

```
1. Conversions approved
   ↓
2. Admin chạy SYSTEM RECONCILIATION
   ↓ (tạo system_reconciliation + items)
   ↓ (UPDATE user_system_balance: available += cashback)
   ↓
3. User tạo PAYMENT REQUEST
   ↓ (chỉ INSERT payment_requests, KHÔNG đổi balance)
   ↓
4. Admin CONFIRM REQUEST (optional)
   ↓ (chỉ UPDATE status, KHÔNG đổi balance)
   ↓
5. Admin MARK AS PAID
   ↓ (UPDATE user_system_balance: available -= amount)
   ↓ (UPDATE system_conversions: payment_status = 'paid')
   ↓
6. User nhận tiền
```

### Source of Truth:

```
✅ user_system_balance.available_balance = SỐ DƯ KHẢ DỤNG
✅ user_system_balance.total_earned = TỔNG ĐÃ ĐỐI SOÁT
✅ user_system_balance.total_withdrawn = TỔNG ĐÃ THANH TOÁN
```

### Các bảng khác:

```
system_conversions.payment_status = Tracking only (đã thanh toán chưa)
payment_requests = Lịch sử requests
system_reconciliation_items = Lịch sử đối soát
payment_system_reconciliation_mapping = Link tracking (optional)
```

---

**Date:** 10/01/2026
**Status:** Logic clarified
**Next Steps:**
1. Tạo reconciliation cho 110,000đ conversions mới
2. Sửa dashboard đọc từ user_system_balance
3. Verify balance = 53,100đ (sau khi reconcile)
