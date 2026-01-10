# PHÂN TÍCH TOÀN BỘ WORKFLOW VÀ LOGIC HỆ THỐNG PAYMENT

## 📊 HIỆN TRẠNG HỆ THỐNG

### Số liệu thực tế (Verified 10/01/2026):

```
✓ Tổng cashback đã duyệt: 203,100đ
✓ Tổng payment requested: 150,000đ
✓ Số dư khả dụng: 53,100đ
```

**Công thức:** `Available Balance = Total Approved - Total Requested`

---

## 🔄 WORKFLOW HOÀN CHỈNH

### 1️⃣ **User Tạo Payment Request**

**Input:**
- Số tiền X (40,000đ ≤ X ≤ 500,000đ)
- Thông tin ngân hàng

**Validation:**
```javascript
// Backend: paymentRequestService.js
if (requestedAmount < minWithdrawal) throw Error('Số tiền tối thiểu')
if (requestedAmount > maxWithdrawal) throw Error('Số tiền tối đa')

// Validate balance
const availableBalance = totalApproved - totalRequested
if (requestedAmount > availableBalance) throw Error('Số dư không đủ')
```

**Action:**
```sql
INSERT INTO payment_requests (
  user_id, requested_amount, status, ...
) VALUES ($1, $2, 'pending', ...)
```

**Effect:**
- ✅ Request created với status = `pending`
- ✅ Available Balance giảm X (reserved)
- ❌ KHÔNG auto-select items
- ❌ KHÔNG link items
- ❌ KHÔNG thay đổi conversions.payment_status

---

### 2️⃣ **Admin Xác Nhận (Optional)**

**Action:**
```sql
UPDATE payment_requests
SET status = 'confirmed'
WHERE id = $1
```

**Effect:**
- ✅ Status changed: `pending` → `confirmed`
- ❌ KHÔNG thay đổi balance
- ❌ KHÔNG thay đổi conversions

---

### 3️⃣ **Admin Mark as Paid**

**Action:**
```sql
-- Step 1: Update payment request
UPDATE payment_requests
SET status = 'paid', paid_at = NOW()
WHERE id = $1

-- Step 2: Mark conversions as paid (FIFO)
WITH selected_conversions AS (
  SELECT id, cashback_amount,
    SUM(cashback_amount) OVER (ORDER BY order_time ASC, id ASC) as running_total
  FROM system_conversions
  WHERE user_id = $2 AND status = 'approved'
    AND (payment_status IS NULL OR payment_status = 'unpaid')
)
UPDATE system_conversions
SET payment_status = 'paid', payment_request_id = $1
WHERE id IN (
  SELECT id FROM selected_conversions WHERE running_total <= $3
)
```

**Effect:**
- ✅ Request status: `confirmed` → `paid`
- ✅ Conversions marked as `paid` (FIFO, tổng ≤ requested_amount)
- ❌ KHÔNG thay đổi balance (đã reserve từ step 1)

**Ví dụ:**
```
Request: 100,000đ
Marked conversions: 98,800đ (7 items FIFO)
Balance deducted: 100,000đ (chính xác requested amount)
```

---

### 4️⃣ **User Cancel Request**

**Điều kiện:**
- ✅ Status = `pending` ONLY
- ❌ KHÔNG cancel được `confirmed` hoặc `paid`

**Action:**
```sql
UPDATE payment_requests
SET status = 'cancelled', cancelled_at = NOW()
WHERE id = $1 AND status = 'pending'
```

**Effect:**
- ✅ Status changed: `pending` → `cancelled`
- ✅ Available Balance tăng X (trả lại)
- ❌ KHÔNG xóa request (giữ lại history)

---

## 🎯 NGUYÊN TẮC QUAN TRỌNG

### ✅ Nguyên tắc 1: BALANCE CALCULATION

```
Available Balance = Total Approved Cashback - Total Payment Requested
```

**CHÚ Ý:**
- ✅ Tính dựa trên `requested_amount` từ payment_requests
- ❌ KHÔNG dựa trên items linking
- ❌ KHÔNG dựa trên conversions.payment_status
- ❌ KHÔNG dựa trên payment_system_reconciliation_mapping

**Code:**
```javascript
// backend/routes/dashboard.js
const balanceQuery = `
  WITH cashback_total AS (
    SELECT SUM(cashback_amount) as total_approved
    FROM system_conversions
    WHERE user_id = $1 AND status = 'approved'
  ),
  payment_total AS (
    SELECT SUM(requested_amount) as total_requested
    FROM payment_requests
    WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')
  )
  SELECT total_approved - total_requested as available_balance
  FROM cashback_total, payment_total
`
```

---

### ✅ Nguyên tắc 2: PAYMENT REQUEST AMOUNT

**User request X đ → Balance trừ chính xác X đ**

```
Request Amount = Requested Amount (FROM user input)
Deducted Amount = Requested Amount (NOT from auto-selected items)
```

**CHÚ Ý:**
- ✅ User nhập bao nhiêu → hệ thống trừ bấy nhiêu
- ❌ KHÔNG auto-calculate từ available items
- ❌ KHÔNG thay đổi requested_amount sau khi create

**Ví dụ Sai (Logic cũ - ĐÃ XÓA):**
```javascript
// ❌ SAI - Đã loại bỏ
const autoSelected = autoSelectItems(userId, requestedAmount)
const actualAmount = autoSelected.totalAmount // 58,800đ cho request 50,000đ
// → Dẫn đến balance leak!
```

**Ví dụ Đúng (Logic mới):**
```javascript
// ✅ ĐÚNG
const paymentRequest = await PaymentRequest.create({
  userId,
  requestedAmount, // User input: 50,000đ
  ...
})
// Balance deducted = 50,000đ (exactly!)
```

---

### ✅ Nguyên tắc 3: ITEMS MARKING (payment_status)

**Khi admin mark payment as paid:**

```javascript
// Update conversions.payment_status = 'paid' (FIFO)
// Chọn items cũ nhất cho đến khi tổng <= requested_amount
```

**CHÚ Ý:**
- ✅ Marking chỉ để TRACKING (biết đơn hàng nào đã thanh toán)
- ✅ Tổng cashback marked CÓ THỂ < requested_amount
- ❌ Marking KHÔNG ảnh hưởng balance calculation

**Ví dụ:**
```
Scenario: Request 100,000đ
Available conversions FIFO:
  1. 9,800đ
  2. 14,700đ
  3. 9,800đ
  4. 19,600đ
  5. 14,700đ
  6. 14,700đ
  7. 14,700đ
  → Total selected: 98,000đ (< 100,000đ)

Result:
  ✓ Balance deducted: 100,000đ (requested)
  ✓ Conversions marked: 98,000đ (7 items)
  ✓ Difference: 2,000đ (acceptable, không ảnh hưởng balance)
```

---

### ✅ Nguyên tắc 4: MAPPING TABLE

**`payment_system_reconciliation_mapping` table:**

**Mục đích:**
- ✅ Tracking lịch sử (item nào thuộc request nào)
- ✅ Hiển thị payment details cho user
- ✅ Báo cáo & analytics

**KHÔNG dùng để:**
- ❌ Tính balance
- ❌ Validate payment amount
- ❌ Auto-select items

**Schema:**
```sql
CREATE TABLE payment_system_reconciliation_mapping (
  id UUID PRIMARY KEY,
  payment_request_id UUID REFERENCES payment_requests(id),
  system_reconciliation_item_id UUID,
  cashback_amount DECIMAL(15,2)
  -- CHỈ để tracking, KHÔNG dùng cho balance calculation
);
```

---

## 🔍 CONSISTENCY CHECKS

### Check 1: Balance Calculation

```javascript
// All these should return the SAME value:

// 1. Script calculation
const available1 = totalApproved - totalRequested

// 2. Database function
const available2 = calculate_user_available_balance_from_system_recon(userId)

// 3. Dashboard query
const available3 = (SELECT total_approved - total_requested FROM ...)

// ✅ available1 === available2 === available3
```

### Check 2: Payment Request Integrity

```javascript
// For each payment request:
const request = getPaymentRequest(id)
const markedConversions = getMarkedConversions(id)

// ✅ request.requested_amount = EXACT deduction from balance
// ⚠️ markedConversions.total MAY BE < requested_amount (OK!)
```

---

## 📝 DATABASE SCHEMA QUAN TRỌNG

### system_conversions
```sql
CREATE TABLE system_conversions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  cashback_amount DECIMAL(15,2) NOT NULL,
  status conversion_status_enum, -- 'pending', 'approved', 'rejected'
  payment_status VARCHAR(20), -- NULL, 'unpaid', 'paid'
  payment_request_id UUID, -- Link to payment request (nullable)
  order_time TIMESTAMP,
  ...
);

-- payment_status: CHỈ để tracking, KHÔNG dùng tính balance
```

### payment_requests
```sql
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  requested_amount DECIMAL(15,2) NOT NULL, -- User input amount
  status VARCHAR(20), -- 'pending', 'confirmed', 'paid', 'cancelled', 'rejected'
  created_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  ...
);

-- requested_amount: ĐÚNG BẰNG số tiền trừ khỏi balance
```

---

## ⚠️ COMMON MISTAKES TO AVOID

### ❌ Mistake 1: Tính balance dựa trên items

```javascript
// ❌ SAI
const availableItems = getAvailableItems(userId)
const availableBalance = sum(availableItems.cashback_amount)
```

**Tại sao sai?**
- Items có thể đã được mark paid nhưng request cancelled
- Items có thể được link vào nhiều requests
- Không đồng bộ với payment_requests table

### ❌ Mistake 2: Deduct theo linked items

```javascript
// ❌ SAI
const linkedItems = autoSelectItems(userId, requestedAmount)
await deductBalance(userId, linkedItems.totalAmount) // 58,800đ
```

**Tại sao sai?**
- User request 50,000đ nhưng hệ thống trừ 58,800đ
- Gây balance leak!
- User confused về số dư

### ❌ Mistake 3: Validate bằng mapping table

```javascript
// ❌ SAI
const mappedAmount = getMappedAmount(paymentRequestId)
if (mappedAmount < requestedAmount) {
  throw Error('Not enough items linked')
}
```

**Tại sao sai?**
- Mapping chỉ để tracking
- Không cần map đủ 100% requested amount
- Gây blocking không cần thiết

---

## ✅ VERIFIED CORRECTNESS

### Test Case 1: Create & Pay
```
Initial: 203,100đ approved, 0đ requested
→ Available: 203,100đ

User creates request: 50,000đ
→ Available: 153,100đ ✅

Admin marks as paid
→ Available: 153,100đ ✅ (không thay đổi)
```

### Test Case 2: Create & Cancel
```
Initial: 203,100đ approved, 150,000đ requested
→ Available: 53,100đ

User creates request: 40,000đ
→ Available: 13,100đ ✅

User cancels request
→ Available: 53,100đ ✅ (trả lại)
```

### Test Case 3: Items Marking
```
Request: 100,000đ
Marked items (FIFO): 98,800đ (7 items)

Balance deducted: 100,000đ ✅
Not 98,800đ ❌
```

---

## 🚀 RECOMMENDED TESTING STEPS

### Step 1: Verify Balance Calculation
```bash
cd backend
node scripts/verify-ui-flow.js
```

Expected:
```
✅ Tổng approved: 203,100đ
✅ Tổng requested: 150,000đ
✅ Available: 53,100đ
✅ ĐÚNG! Balance calculation hoạt động chính xác
```

### Step 2: Create Payment Request from UI
1. Login as test user
2. Go to "Yêu cầu thanh toán"
3. Enter amount: 40,000đ
4. Submit
5. Verify: Available balance = 53,100 - 40,000 = 13,100đ ✅

### Step 3: Cancel Request
1. Click "Hủy" on pending request
2. Confirm
3. Verify: Available balance = 13,100 + 40,000 = 53,100đ ✅

### Step 4: Mark as Paid (Admin)
1. Admin confirms request
2. Admin marks as paid
3. Verify: Available balance unchanged ✅
4. Verify: Some conversions marked as paid ✅

---

## 📚 KEY FILES

### Backend Core Logic
- `backend/services/paymentRequestService.js` - Payment request logic
- `backend/routes/dashboard.js` - Balance calculation
- `backend/models/PaymentRequest.js` - Payment request model
- `backend/scripts/update-validation-function.js` - DB function

### Frontend
- `frontend/js/payment-requests.js` - Payment request UI
- `frontend/js/dashboard.js` - Dashboard display

### Database
- `backend/migrations/017_enhanced_payment_validation.sql` - Schema

---

## 🎯 CONCLUSION

**Hệ thống hiện tại hoạt động theo nguyên tắc:**

```
✅ Balance = Approved - Requested (KHÔNG phụ thuộc items)
✅ Request Amount = Deducted Amount (CHÍNH XÁC)
✅ Items Marking = Tracking Only (KHÔNG ảnh hưởng balance)
✅ Mapping Table = History Only (KHÔNG dùng calculation)
```

**Verified:** ✅ 10/01/2026
**Status:** ✅ Production Ready
**Logic:** ✅ Correct & Consistent
