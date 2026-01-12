# BƯỚC 7: HƯỚNG DẪN TEST E2E THỦ CÔNG

## 📋 Test Summary

Chúng ta sẽ test toàn bộ flow payment request từ đầu đến cuối để verify code mới hoạt động đúng.

**Test User:** exccbuy@gmail.com
**Current Balance:** 137,751.6đ
**Test Amount:** 50,000đ

---

## ✅ Pre-Test Checklist

### 1. Ghi lại Balance Ban Đầu

Chạy query này trước khi test:

```sql
SELECT
  u.email,
  usb.available_balance,
  usb.total_withdrawn,
  usb.total_earned
FROM users u
INNER JOIN user_system_balance usb ON usb.user_id = u.id
WHERE u.email = 'exccbuy@gmail.com';
```

📝 **Ghi lại:**
- available_balance (BEFORE): _______________
- total_withdrawn (BEFORE): _______________
- total_earned (BEFORE): _______________

### 2. Verify Server Running

```bash
cd f:/VSCODE/Chatchiu
npm start
```

Server should be running on: http://localhost:3007

---

## 🎯 TEST SCENARIO: Happy Path Payment Flow

### STEP 1: Login as User

**URL:** http://localhost:3007/login
**Credentials:**
- Email: exccbuy@gmail.com
- Password: [password từ database]

✅ Verify: User logged in successfully

---

### STEP 2: Check Eligibility

**Option A: Via API (Postman/cURL)**
```bash
curl -X GET http://localhost:3007/api/payment-requests/eligibility \
  -H "Authorization: Bearer <user-token>"
```

**Option B: Via Frontend**
- Navigate to: Payment Requests page
- Check if "Request Payment" button is enabled

✅ **Expected:**
- `isEligible: true`
- `availableBalance: 137751.6` (or similar)
- No error messages

📝 **Actual Result:** _______________

---

### STEP 3: Create Payment Request

**Option A: Via API**
```bash
curl -X POST http://localhost:3007/api/payment-requests \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestedAmount": 50000,
    "bankName": "Test Bank E2E",
    "bankAccountNumber": "1234567890",
    "bankAccountName": "Mạnh Thuý"
  }'
```

**Option B: Via Frontend**
- Click "Request Payment" button
- Fill form:
  - Amount: 50,000
  - Bank: Test Bank E2E
  - Account Number: 1234567890
  - Account Name: Mạnh Thuý
- Submit

✅ **Expected:**
- Status 201 Created
- Response contains `id` (payment request ID)
- Status is `pending`

📝 **Payment Request ID:** _______________

---

### STEP 4: Admin Confirm Payment Request

**Login as Admin:**
- Email: [admin email]
- Navigate to: Admin > Payment Requests

**Find the payment request:**
- Filter by status: "Pending"
- Find the request just created

**Click "Confirm" button**

✅ **Expected:**
- Status changes to `confirmed`
- User receives notification (if email enabled)

📝 **Actual Result:** _______________

---

### STEP 5: Admin Mark as Paid (⚠️ CRITICAL TEST)

**This is where the NEW code will run!**

**On Admin Panel:**
- Find the confirmed payment request
- Click "Mark as Paid" button
- Fill modal:
  - Transaction Reference: `E2E-TEST-001`
  - Admin Notes: `Test payment for BƯỚC 7 E2E verification`
- Submit

✅ **Expected:**
- Success message
- Status changes to `paid`
- paid_at timestamp is set

📝 **Actual Result:** _______________

---

### STEP 6: IMMEDIATE VERIFICATION

**Run verification script:**
```bash
cd f:/VSCODE/Chatchiu
node backend/tests/step7-e2e-verify.js <payment-request-id>
```

Replace `<payment-request-id>` with the ID from Step 3.

**Example:**
```bash
node backend/tests/step7-e2e-verify.js 123e4567-e89b-12d3-a456-426614174000
```

✅ **Expected Output:**
```
🎉 ALL CHECKS PASSED!

✅ This payment was processed with the NEW code.
✅ All fixes are working correctly.
```

📝 **Actual Output:** _______________

---

## 🔍 DETAILED VERIFICATION QUERIES

### Query 1: Check Balance Deduction

```sql
SELECT
  u.email,
  usb.available_balance as current_balance,
  usb.total_withdrawn,
  usb.total_earned,
  usb.updated_at
FROM users u
INNER JOIN user_system_balance usb ON usb.user_id = u.id
WHERE u.email = 'exccbuy@gmail.com';
```

✅ **Expected:**
- available_balance = (BEFORE) - 50,000
- total_withdrawn = (BEFORE) + 50,000

📝 **Results:**
- available_balance: _______________
- total_withdrawn: _______________
- Calculation: _______________

---

### Query 2: Check Transaction Log

```sql
SELECT
  transaction_type,
  amount,
  balance_before,
  balance_after,
  description,
  created_at
FROM user_balance_transactions
WHERE payment_request_id = '<payment-request-id>'
ORDER BY created_at DESC;
```

✅ **Expected:**
- 1 row with `transaction_type = 'payment_deducted'`
- amount = -50,000
- balance_before = (original balance)
- balance_after = (original balance - 50,000)

📝 **Results:** _______________

---

### Query 3: Check system_conversions Marked

```sql
SELECT
  sc.id,
  sc.order_amount,
  sc.cashback_amount,
  sc.payment_status,
  sc.payment_request_id,
  sc.payment_linked_at
FROM system_conversions sc
INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id
WHERE prm.payment_request_id = '<payment-request-id>';
```

✅ **Expected:**
- All rows have `payment_status = 'paid'`
- All rows have `payment_request_id = <your-id>`
- All rows have `payment_linked_at` IS NOT NULL

📝 **Results:** _______________

---

### Query 4: Verify Exclusion from Reconciliation

```sql
-- Get conversion IDs from the payment
WITH paid_conversions AS (
  SELECT DISTINCT sc.id
  FROM system_conversions sc
  INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
  INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id
  WHERE prm.payment_request_id = '<payment-request-id>'
)
-- Check if they would be included in new reconciliation
SELECT sc.id
FROM system_conversions sc
INNER JOIN paid_conversions pc ON pc.id = sc.id
WHERE sc.status = 'approved'
  AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
  AND NOT EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_conversion_id = sc.id
  );
```

✅ **Expected:**
- 0 rows (conversions will NOT be included in reconciliation)

📝 **Result:** _______________

---

## ✅ Success Criteria

### MUST PASS (Critical):
- [ ] Payment request status = 'paid'
- [ ] paid_at timestamp is set
- [ ] Balance deducted: available_balance decreased by 50,000
- [ ] total_withdrawn increased by 50,000
- [ ] Transaction log exists with type 'payment_deducted'
- [ ] system_conversions have payment_status = 'paid'
- [ ] Conversions excluded from future reconciliation

### SHOULD PASS (Important):
- [ ] Email notification sent to user
- [ ] Payment history created
- [ ] Admin action logged

### NICE TO HAVE:
- [ ] Frontend updates immediately
- [ ] No errors in server logs

---

## ❌ If Test Fails

### Failure Mode 1: Balance Not Deducted

**Symptoms:**
- total_withdrawn = 0 (unchanged)
- available_balance unchanged

**Diagnosis:**
- Check server logs for errors
- Verify BalanceManagementService.deductBalance() was called
- Check if transaction was rolled back

**Rollback:**
```bash
# Restore from backup
cp .backups/payment-fix-20260109-164249/*.js backend/services/
npm restart
```

---

### Failure Mode 2: Transaction Log Missing

**Symptoms:**
- No row in user_balance_transactions
- payment_request_id not found

**Diagnosis:**
- Trigger not working
- BalanceManagementService not called
- Using old code

**Fix:**
- Verify imports in paymentRequestService.js
- Check markAsPaid() implementation

---

### Failure Mode 3: Conversions Not Marked

**Symptoms:**
- payment_status = NULL
- payment_request_id = NULL

**Diagnosis:**
- markAsPaid() Step 3.5 not executed
- Query error in conversion update

**Fix:**
- Check payment_reconciliation_mapping exists
- Verify query syntax

---

## 📊 Test Results Summary

**Test Date:** _______________
**Tester:** _______________
**Environment:** Local Development

### Results:
- [ ] ✅ PASS - All checks passed
- [ ] ⚠️  PARTIAL - Some checks failed
- [ ] ❌ FAIL - Critical checks failed

### Notes:
_______________
_______________
_______________

### Next Steps:
- [ ] If PASS → Proceed to BƯỚC 8 (Fix historical data)
- [ ] If FAIL → Debug and retest
- [ ] If PARTIAL → Document issues and proceed

---

## 🔄 Cleanup After Test (Optional)

**If you want to restore test data:**

```sql
-- Delete test payment request
DELETE FROM user_balance_transactions WHERE payment_request_id = '<payment-request-id>';
DELETE FROM payment_reconciliation_mapping WHERE payment_request_id = '<payment-request-id>';
DELETE FROM payment_requests WHERE id = '<payment-request-id>';

-- Restore balance
UPDATE user_system_balance
SET
  available_balance = available_balance + 50000,
  total_withdrawn = total_withdrawn - 50000
WHERE user_id = (SELECT user_id FROM users WHERE email = 'exccbuy@gmail.com');

-- Unmark conversions
UPDATE system_conversions
SET
  payment_status = NULL,
  payment_request_id = NULL,
  payment_linked_at = NULL
WHERE payment_request_id = '<payment-request-id>';
```

---

*Created: 2026-01-09*
*For: BƯỚC 7 E2E Testing*
