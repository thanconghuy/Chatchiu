# PHÂN TÍCH TOÀN BỘ WORKFLOW THANH TOÁN - TỪ ĐẦU ĐẾN CUỐI

**Ngày:** 10/01/2026
**Mục đích:** Trace toàn bộ logic từ conversion được đối soát → payment request → thanh toán → cập nhật số dư

---

## 🔄 WORKFLOW HOÀN CHỈNH

### BƯỚC 1: CONVERSIONS ĐƯỢC APPROVED

**File:** `backend/services/systemReconciliation/SystemReconciliationService.js`

```javascript
// Admin tạo kỳ đối soát
static async createReconciliation(periodLabel, periodStart, periodEnd, conversions, createdBy)
```

**Actions:**
```sql
-- 1.1. Tạo reconciliation period
INSERT INTO system_reconciliations (
  period_label, period_start, period_end,
  reconciliation_date, status
) VALUES (..., 'draft')

-- 1.2. Thêm conversions vào reconciliation_items
INSERT INTO system_reconciliation_items (
  system_reconciliation_id,
  system_conversion_id,
  user_id,
  cashback_amount,
  conversion_status = 'approved',
  ...
)

-- 1.3. Link conversions với reconciliation
UPDATE system_conversions
SET system_reconciliation_id = $1
WHERE id = ANY($2)
```

**Result:**
- ✅ Conversions được add vào reconciliation_items
- ✅ Status = 'draft' (chưa finalize)
- ❌ CHƯA cập nhật user_system_balance (chưa finalize)

---

### BƯỚC 2: ADMIN FINALIZE RECONCILIATION

**File:** `backend/services/systemReconciliation/SystemReconciliationService.js`

```javascript
static async finalizeReconciliation(reconciliationId, performedBy)
```

**Actions:**
```sql
-- 2.1. Tính tổng cashback cho mỗi user
SELECT user_id, SUM(cashback_amount) as total_cashback
FROM system_reconciliation_items
WHERE system_reconciliation_id = $1
GROUP BY user_id

-- 2.2. 🔥 CẬP NHẬT user_system_balance (100% vào available)
INSERT INTO user_system_balance (
  user_id, available_balance, total_earned, ...
) VALUES (...)
ON CONFLICT (user_id) DO UPDATE SET
  available_balance = user_system_balance.available_balance + EXCLUDED.available_balance,
  total_earned = user_system_balance.total_earned + EXCLUDED.total_earned,
  ...

-- 2.3. Update reconciliation status
UPDATE system_reconciliations
SET status = 'finalized', finalized_at = NOW()
WHERE id = $1
```

**Result:**
- ✅ `user_system_balance.available_balance` TĂNG (cộng cashback)
- ✅ `user_system_balance.total_earned` TĂNG (cộng cashback)
- ✅ User có thể thấy số dư tăng lên
- ✅ `system_conversions.payment_status` = NULL (chưa được thanh toán)

**Example:**
```
Before finalize:
  available_balance: 0đ
  total_earned: 0đ

After finalize (93,100đ cashback):
  available_balance: 93,100đ (+93,100đ)
  total_earned: 93,100đ (+93,100đ)
```

---

### BƯỚC 3: USER TẠO PAYMENT REQUEST

**File:** `backend/models/PaymentRequest.js` (line 23-113)

```javascript
static async create(data)
```

**Actions:**
```sql
-- 3.1. INSERT payment_requests
INSERT INTO payment_requests (
  user_id,
  requested_amount,
  bank_name,
  bank_account_number,
  bank_account_name,
  status = 'pending',
  ...
) VALUES (...)

-- 3.2. Log action
INSERT INTO payment_request_logs (
  payment_request_id,
  action = 'created',
  old_status = NULL,
  new_status = 'pending',
  ...
)
```

**Result:**
- ✅ Payment request created với status = 'pending'
- ❌ KHÔNG cập nhật user_system_balance
- ❌ KHÔNG trừ available_balance
- ❌ KHÔNG thay đổi system_conversions

**❌ VẤN ĐỀ:** User vẫn thấy số dư = 93,100đ mặc dù đã request 50,000đ!

---

### BƯỚC 4: USER CANCEL REQUEST (Optional)

**File:** `backend/models/PaymentRequest.js` (line 434-492)

```javascript
static async cancel(id, userId, reason = null)
```

**Validation:**
```javascript
if (paymentRequest.status !== 'pending') {
  throw Error('Can only cancel pending requests')
}
```

**Actions:**
```sql
-- 4.1. Soft delete (update cancelled fields)
UPDATE payment_requests
SET
  cancelled_at = NOW(),
  cancelled_by = $2,
  cancellation_reason = $3
WHERE id = $1 AND user_id = $2

-- 4.2. Log action
INSERT INTO payment_request_logs (
  action = 'cancelled',
  old_status = 'pending',
  new_status = 'cancelled',
  ...
)
```

**Result:**
- ✅ Request marked as cancelled
- ❌ KHÔNG cập nhật user_system_balance
- ❌ KHÔNG hoàn trả available_balance

**❌ VẤN ĐỀ:** Cancel không có tác dụng gì với số dư!

---

### BƯỚC 5: ADMIN CONFIRM REQUEST (Optional)

**File:** `backend/services/paymentRequestService.js`

```javascript
async confirmPaymentRequest(paymentRequestId, adminId, notes)
```

**Actions:**
```sql
-- Update status từ 'pending' → 'confirmed'
UPDATE payment_requests
SET status = 'confirmed', confirmed_at = NOW()
WHERE id = $1
```

**Result:**
- ✅ Status changed to 'confirmed'
- ❌ KHÔNG cập nhật user_system_balance
- ❌ KHÔNG thay đổi conversions

---

### BƯỚC 6: ADMIN MARK AS PAID

**File:** `backend/services/paymentRequestService.js` (line 458-590)

```javascript
async markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes)
```

**Actions:**
```javascript
// Step 1: Get payment request
const paymentRequest = await findById(paymentRequestId)
const requestedAmount = paymentRequest.requested_amount

// Step 2: 🔥 DEDUCT BALANCE
await BalanceManagementService.deductBalance(
  paymentRequest.user_id,
  requestedAmount,
  paymentRequestId
)

// → BalanceManagementService.deductBalance() làm gì?
```

**BalanceManagementService.deductBalance():**
```sql
-- File: backend/services/systemReconciliation/BalanceManagementService.js (line 115-158)

BEGIN;

-- Lock row để tránh race condition
SELECT available_balance
FROM user_system_balance
WHERE user_id = $1
FOR UPDATE

-- Check balance đủ không
IF available_balance < amount THEN
  ROLLBACK; THROW Error('Số dư không đủ')
END IF

-- 🔥 TRỪ available_balance, TĂNG total_withdrawn
UPDATE user_system_balance
SET
  available_balance = available_balance - $2,
  total_withdrawn = total_withdrawn + $2,
  updated_at = NOW()
WHERE user_id = $1

COMMIT;
```

**Continue markAsPaid:**
```sql
-- Step 3: Update payment_requests status
UPDATE payment_requests
SET
  status = 'paid',
  paid_at = NOW(),
  transaction_reference = $2,
  admin_notes = $3
WHERE id = $1

-- Step 3.5: 🔥 Mark conversions as paid (FIFO)
WITH selected_conversions AS (
  SELECT
    id,
    cashback_amount,
    SUM(cashback_amount) OVER (
      ORDER BY order_time ASC, id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as running_total
  FROM system_conversions
  WHERE user_id = $1
    AND status = 'approved'
    AND (payment_status IS NULL OR payment_status = 'unpaid')
)
UPDATE system_conversions
SET
  payment_status = 'paid',
  payment_request_id = $2,
  payment_linked_at = NOW()
WHERE id IN (
  SELECT id FROM selected_conversions
  WHERE running_total <= $3  -- $3 = requested_amount
)
```

**Result:**
- ✅ `payment_requests.status` = 'paid'
- ✅ `user_system_balance.available_balance` GIẢM requestedAmount
- ✅ `user_system_balance.total_withdrawn` TĂNG requestedAmount
- ✅ `system_conversions.payment_status` = 'paid' (FIFO selection)
- ✅ `system_conversions.payment_request_id` = paymentRequestId (tracking)

**Example:**
```
Before mark paid:
  available_balance: 93,100đ
  total_withdrawn: 0đ

After mark paid (100,000đ request):
  available_balance: -6,900đ (❌ ÂM!)
  total_withdrawn: 100,000đ
```

---

## 📊 PHÂN TÍCH LOGIC HIỆN TẠI

### ✅ ĐÚNG:

1. **Finalize reconciliation CẬP NHẬT balance:**
   - `available_balance += cashback`
   - `total_earned += cashback`

2. **Mark as paid TRỪ balance:**
   - `available_balance -= requested_amount`
   - `total_withdrawn += requested_amount`

3. **Mark conversions as paid (FIFO):**
   - Chọn conversions cũ nhất (order_time ASC)
   - Tổng <= requested_amount
   - Set payment_status = 'paid'

4. **Cancel chỉ cho phép pending:**
   - Validate status = 'pending'
   - Soft delete (cancelled_at)

### ❌ SAI:

1. **CREATE request KHÔNG trừ balance:**
   ```
   User có: 100,000đ
   User tạo request #1: 80,000đ → Balance vẫn: 100,000đ ❌
   User tạo request #2: 80,000đ → Validation PASS (80k <= 100k) ❌❌❌
   → User đã tạo 160,000đ requests nhưng chỉ có 100,000đ!
   ```

2. **CANCEL request KHÔNG hoàn trả balance:**
   ```
   User tạo request: 50,000đ (balance vẫn = 100,000đ)
   User cancel request → Balance vẫn = 100,000đ
   → Cancel vô nghĩa!
   ```

3. **Số dư hiển thị SAI cho user:**
   ```
   User có: 100,000đ
   User tạo request: 80,000đ
   → UI vẫn hiển thị: 100,000đ ❌
   → User NGHĨ còn 100k nhưng thực tế chỉ còn 20k available
   ```

4. **Mark paid CÓ THỂ GÂY BALANCE ÂM:**
   ```
   User có: 100,000đ
   User tạo requests tổng: 300,000đ (3 requests x 100k)
   Admin mark paid request #1: 100k → balance = 0đ ✅
   Admin mark paid request #2: 100k → balance = -100,000đ ❌❌❌
   ```

---

## 🔍 DỮ LIỆU THỰC TẾ

Từ script verify:

```
user_system_balance:
  available_balance: 34,300đ
  total_earned: 93,100đ
  total_withdrawn: 58,800đ

system_conversions:
  approved + NULL: 70,000đ (chưa thanh toán)
  approved + paid: 133,100đ (đã thanh toán)

payment_requests:
  paid: 2 requests, 150,000đ
  cancelled: 1 request, 50,000đ
```

### ❌ INCONSISTENCY:

```
total_withdrawn = 58,800đ
payment_requests(paid) = 150,000đ
Chênh lệch: -91,200đ ❌❌❌
```

**Giải thích:**
- Có 2 payment requests đã paid (150,000đ)
- Nhưng `total_withdrawn` chỉ = 58,800đ
- → Có payment requests được mark paid TRƯỚC KHI code `deductBalance()` tồn tại
- → Hoặc có payment requests được mark paid khi balance không đủ (gây lỗi, không update total_withdrawn)

### ✅ Công thức ĐÚNG phải thỏa mãn:

```
available_balance = total_earned - total_withdrawn
34,300đ = 93,100đ - 58,800đ ✅ ĐÚNG

total_withdrawn = SUM(payment_requests WHERE status = 'paid')
58,800đ ≠ 150,000đ ❌ SAI
```

---

## 💡 LOGIC ĐÚNG NÊN LÀ GÌ?

### Option A: RESERVE khi create (KHUYẾN NGHỊ)

```javascript
// CREATE REQUEST
async createPaymentRequest(data) {
  // Validate balance
  const balance = await BalanceManagementService.getUserBalance(userId)
  if (requestedAmount > balance.available_balance) {
    throw Error('Số dư không đủ')
  }

  await BEGIN()

  // Create request
  INSERT INTO payment_requests (...) VALUES (...)

  // 🔥 TRỪ available_balance NGAY
  UPDATE user_system_balance
  SET available_balance = available_balance - $2
  WHERE user_id = $1

  await COMMIT()
}

// CANCEL REQUEST
async cancelPaymentRequest(paymentRequestId, userId) {
  const paymentRequest = await findById(paymentRequestId)

  if (paymentRequest.status !== 'pending') {
    throw Error('Chỉ hủy được pending requests')
  }

  await BEGIN()

  // Update cancelled
  UPDATE payment_requests
  SET cancelled_at = NOW()
  WHERE id = $1

  // 🔥 HOÀN TRẢ available_balance
  UPDATE user_system_balance
  SET available_balance = available_balance + $2
  WHERE user_id = $1

  await COMMIT()
}

// MARK AS PAID
async markAsPaid(paymentRequestId, adminInfo, ...) {
  await BEGIN()

  // Update status
  UPDATE payment_requests SET status = 'paid' WHERE id = $1

  // ❌ KHÔNG TRỪ available_balance (đã trừ lúc create rồi!)
  // ✅ CHỈ update total_withdrawn
  UPDATE user_system_balance
  SET total_withdrawn = total_withdrawn + $2
  WHERE user_id = $1

  // Mark conversions
  UPDATE system_conversions SET payment_status = 'paid' WHERE ...

  await COMMIT()
}
```

**Kết quả:**
```
Initial:
  available: 100,000đ
  total_earned: 100,000đ
  total_withdrawn: 0đ

User creates request 50,000đ:
  available: 50,000đ (locked 50k)
  total_earned: 100,000đ
  total_withdrawn: 0đ

User tries to create request 80,000đ:
  ❌ ERROR: 80k > 50k available

User cancels first request:
  available: 100,000đ (released 50k)
  total_earned: 100,000đ
  total_withdrawn: 0đ

Admin marks paid 50,000đ:
  available: 50,000đ (không đổi, đã trừ lúc create)
  total_earned: 100,000đ
  total_withdrawn: 50,000đ (tăng)
```

---

### Option B: Tính available trừ pending requests

```javascript
// Không đổi create/cancel/markpaid
// Chỉ đổi cách TÍNH available_balance

async getUserBalance(userId) {
  const query = `
    SELECT
      usb.total_earned,
      usb.total_withdrawn,
      COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'confirmed')
          AND cancelled_at IS NULL
      ), 0) as pending_requests,
      usb.total_earned - usb.total_withdrawn - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'confirmed')
          AND cancelled_at IS NULL
      ), 0) as available_balance
    FROM user_system_balance usb
    WHERE usb.user_id = $1
  `

  const result = await pool.query(query, [userId])
  return result.rows[0]
}
```

**Nhược điểm:**
- ❌ Phức tạp hơn
- ❌ total_withdrawn vẫn KHÔNG khớp với paid requests

---

## ✅ KHUYẾN NGHỊ

### Chọn Option A - Reserve khi create

**Lý do:**

1. **Prevent user spam requests:**
   - User KHÔNG THỂ tạo requests vượt quá số dư
   - Validate ĐÚNG available balance (đã trừ pending)

2. **UI hiển thị ĐÚNG:**
   - Available balance = Số thực sự có thể dùng
   - User thấy số dư giảm ngay khi tạo request

3. **Cancel có ý nghĩa:**
   - Hoàn trả số dư đã lock
   - User có thể tạo request mới sau khi cancel

4. **Data consistent:**
   - `total_withdrawn = SUM(paid_requests)` ✅
   - `available = earned - withdrawn - pending` ✅

5. **Đơn giản hơn:**
   - Logic rõ ràng: create = lock, cancel = release, paid = deduct total_withdrawn
   - Dễ verify, dễ debug

---

## 🚀 HÀNH ĐỘNG CẦN LÀM

### 1. FIX DATA (hiện tại)

```sql
-- 1.1. Tính lại total_withdrawn từ payment_requests
UPDATE user_system_balance usb
SET total_withdrawn = (
  SELECT COALESCE(SUM(requested_amount), 0)
  FROM payment_requests
  WHERE user_id = usb.user_id
    AND status = 'paid'
    AND cancelled_at IS NULL
),
available_balance = total_earned - (
  SELECT COALESCE(SUM(requested_amount), 0)
  FROM payment_requests
  WHERE user_id = usb.user_id
    AND status = 'paid'
    AND cancelled_at IS NULL
)
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

-- 1.2. Verify
SELECT
  available_balance,
  total_earned,
  total_withdrawn,
  total_earned - total_withdrawn as calculated_available
FROM user_system_balance
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
```

### 2. FIX CODE

**Files cần sửa:**

#### A. `backend/models/PaymentRequest.js`

**Line 23-113 - create():**
```javascript
// ADD sau khi INSERT payment_requests:

// Deduct available_balance (reserve)
await client.query(`
  UPDATE user_system_balance
  SET available_balance = available_balance - $2,
      updated_at = NOW()
  WHERE user_id = $1
`, [userId, requestedAmount]);
```

**Line 434-492 - cancel():**
```javascript
// ADD sau khi UPDATE cancelled_at:

// Refund available_balance (release)
await client.query(`
  UPDATE user_system_balance
  SET available_balance = available_balance + $2,
      updated_at = NOW()
  WHERE user_id = $1
`, [userId, paymentRequest.requested_amount]);
```

#### B. `backend/services/paymentRequestService.js`

**Line 487-497 - markAsPaid():**
```javascript
// BEFORE (SAI):
await BalanceManagementService.deductBalance(
  paymentRequest.user_id,
  requestedAmount,
  paymentRequestId
);

// AFTER (ĐÚNG):
// ❌ KHÔNG gọi deductBalance() (đã trừ available lúc create rồi!)
// ✅ CHỈ update total_withdrawn
await client.query(`
  UPDATE user_system_balance
  SET total_withdrawn = total_withdrawn + $2,
      updated_at = NOW()
  WHERE user_id = $1
`, [paymentRequest.user_id, requestedAmount]);
```

### 3. TEST

Test cases:
1. User tạo request → Balance giảm ✅
2. User tạo request vượt quá số dư → Error ✅
3. User cancel request → Balance tăng lại ✅
4. Admin mark paid → total_withdrawn tăng, available không đổi ✅
5. Verify: `total_withdrawn = SUM(paid_requests)` ✅

---

**Date:** 10/01/2026
**Status:** ❌ LOGIC SAI NGHIÊM TRỌNG - CẦN FIX NGAY
**Root Cause:** Create/cancel không update balance
**Solution:** Reserve balance khi create, release khi cancel
**Impact:** HIGH - Ảnh hưởng trực tiếp đến tiền, user có thể abuse
