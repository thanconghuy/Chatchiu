# BƯỚC 7: END-TO-END TEST PLAN
*Created: 2026-01-09*

## Mục tiêu

Test toàn bộ flow từ đầu đến cuối để đảm bảo:
1. ✅ User tạo payment request thành công
2. ✅ Admin confirm payment request → Balance bị khấu trừ
3. ✅ system_conversions được đánh dấu payment_status = 'paid'
4. ✅ Đơn đã paid không xuất hiện trong reconciliation tiếp theo
5. ✅ Transaction log được ghi chính xác
6. ✅ Rollback hoạt động khi có lỗi

---

## Test Scenarios

### ⭐ SCENARIO 1: Happy Path - Payment Request Flow (CRITICAL)

**Mục đích:** Test flow bình thường từ request → paid

**Pre-conditions:**
- User có balance >= 50,000đ
- User không có pending payment request
- Có ít nhất 2 system_conversions đã approved chưa paid

**Test Steps:**

1. **Kiểm tra eligibility**
   ```bash
   GET /api/payment-requests/eligibility
   ```
   - ✅ Expect: `isEligible: true`
   - ✅ Expect: `availableBalance >= 10000`

2. **Tạo payment request**
   ```bash
   POST /api/payment-requests
   Body: {
     requestedAmount: 50000,
     bankName: "Test Bank",
     bankAccountNumber: "1234567890",
     bankAccountName: "Test User"
   }
   ```
   - ✅ Expect: Status 201
   - ✅ Expect: `status = 'pending'`
   - 📝 Ghi lại: `paymentRequestId`

3. **Admin confirm payment request**
   ```bash
   POST /api/admin/payment-requests/:id/confirm
   ```
   - ✅ Expect: Status 200
   - ✅ Expect: `status = 'confirmed'`

4. **Ghi lại balance trước khi pay**
   ```sql
   SELECT available_balance, total_withdrawn
   FROM user_system_balance
   WHERE user_id = :userId
   ```
   - 📝 Ghi lại: `balanceBefore`, `totalWithdrawnBefore`

5. **Admin mark as paid**
   ```bash
   POST /api/admin/payment-requests/:id/mark-paid
   Body: {
     transactionReference: "TEST-E2E-001",
     adminNotes: "Test payment"
   }
   ```
   - ✅ Expect: Status 200
   - ✅ Expect: `status = 'paid'`
   - ✅ Expect: `paid_at` IS NOT NULL

6. **Verify balance deducted**
   ```sql
   SELECT available_balance, total_withdrawn
   FROM user_system_balance
   WHERE user_id = :userId
   ```
   - ✅ Expect: `available_balance = balanceBefore - 50000`
   - ✅ Expect: `total_withdrawn = totalWithdrawnBefore + 50000`

7. **Verify transaction log**
   ```sql
   SELECT *
   FROM user_balance_transactions
   WHERE payment_request_id = :paymentRequestId
   ORDER BY created_at DESC
   LIMIT 1
   ```
   - ✅ Expect: `transaction_type = 'payment_deducted'`
   - ✅ Expect: `amount = -50000`
   - ✅ Expect: `balance_before = balanceBefore`
   - ✅ Expect: `balance_after = balanceBefore - 50000`

8. **Verify system_conversions marked as paid**
   ```sql
   SELECT sc.id, sc.payment_status, sc.payment_request_id, sc.payment_linked_at
   FROM system_conversions sc
   INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
   INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id
   WHERE prm.payment_request_id = :paymentRequestId
   ```
   - ✅ Expect: All rows have `payment_status = 'paid'`
   - ✅ Expect: All rows have `payment_request_id = :paymentRequestId`
   - ✅ Expect: All rows have `payment_linked_at` IS NOT NULL

9. **Verify paid orders excluded from new reconciliation**
   ```sql
   -- Simulate createReconciliation query
   SELECT sc.id
   FROM system_conversions sc
   WHERE sc.status = 'approved'
     AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
     AND NOT EXISTS (
       SELECT 1 FROM system_reconciliation_items sri
       WHERE sri.system_conversion_id = sc.id
     )
   ```
   - ✅ Expect: Previously paid conversions NOT in result

**Expected Result:** ✅ PASS

---

### ⭐ SCENARIO 2: Insufficient Balance - Rollback Test (CRITICAL)

**Mục đích:** Test rollback khi balance không đủ

**Pre-conditions:**
- User có balance = 5,000đ (< minimum 10,000đ)

**Test Steps:**

1. **Kiểm tra eligibility**
   ```bash
   GET /api/payment-requests/eligibility
   ```
   - ✅ Expect: `isEligible: false`
   - ✅ Expect: `reasons` contains "Số dư khả dụng phải ≥ 10,000"

2. **Thử tạo payment request (should fail)**
   ```bash
   POST /api/payment-requests
   Body: { requestedAmount: 50000, ... }
   ```
   - ✅ Expect: Status 400 or 403
   - ✅ Expect: Error message về insufficient balance

**Expected Result:** ✅ PASS

---

### ⭐ SCENARIO 3: Concurrent Payment Prevention

**Mục đích:** Test không cho phép tạo 2 payment request cùng lúc

**Pre-conditions:**
- User có balance >= 50,000đ
- User đã có 1 pending payment request

**Test Steps:**

1. **Kiểm tra eligibility**
   ```bash
   GET /api/payment-requests/eligibility
   ```
   - ✅ Expect: `isEligible: false`
   - ✅ Expect: `reasons` contains "đang chờ xử lý"

2. **Thử tạo payment request mới (should fail)**
   ```bash
   POST /api/payment-requests
   Body: { requestedAmount: 30000, ... }
   ```
   - ✅ Expect: Status 400 or 403
   - ✅ Expect: Error message về pending request

**Expected Result:** ✅ PASS

---

### SCENARIO 4: Payment Without Conversions (Edge Case)

**Mục đích:** Test payment request không có linked conversions

**Note:** Đây là edge case - có thể xảy ra nếu admin tạo manual payment

**Test Steps:**

1. **Tạo payment request thủ công trong DB**
   ```sql
   INSERT INTO payment_requests (id, user_id, requested_amount, status, ...)
   VALUES (:id, :userId, 50000, 'confirmed', ...)
   ```

2. **Admin mark as paid**
   - ✅ Expect: Success (không crash)
   - ✅ Expect: Balance vẫn được deduct
   - ✅ Expect: Không update system_conversions (vì không có)

**Expected Result:** ✅ PASS (graceful handling)

---

### SCENARIO 5: Verify Historical Data

**Mục đích:** Kiểm tra dữ liệu cũ có vấn đề gì không

**Test Steps:**

1. **Tìm payment requests đã paid từ trước**
   ```sql
   SELECT pr.id, pr.user_id, pr.requested_amount, pr.paid_at
   FROM payment_requests pr
   WHERE pr.status = 'paid'
     AND pr.paid_at < CURRENT_DATE
   ORDER BY pr.paid_at DESC
   LIMIT 10
   ```

2. **Check xem balance có bị deduct chưa**
   ```sql
   SELECT ubt.id, ubt.amount, ubt.balance_before, ubt.balance_after
   FROM user_balance_transactions ubt
   WHERE ubt.payment_request_id = :paymentRequestId
   ```
   - ❌ If NOT EXISTS → Need to fix in BƯỚC 8
   - ✅ If EXISTS → Already fixed

3. **Check system_conversions có payment_status chưa**
   ```sql
   SELECT sc.id, sc.payment_status, sc.payment_request_id
   FROM system_conversions sc
   INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
   INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id
   WHERE prm.payment_request_id = :paymentRequestId
   ```
   - ❌ If `payment_status IS NULL` → Need to fix in BƯỚC 8
   - ✅ If `payment_status = 'paid'` → Already fixed

**Expected Result:** Identify data needing fix in BƯỚC 8

---

## Test Execution Plan

### Phase 1: Manual Testing (Recommended)

**Cách test thủ công qua Postman/Frontend:**

1. Login as user
2. Navigate to payment requests page
3. Create new payment request
4. Login as admin
5. Confirm payment request
6. Mark as paid
7. Verify results in database

**Duration:** ~10-15 minutes

---

### Phase 2: Automated Testing (Optional)

**Nếu muốn tạo automated test:**

```javascript
// backend/tests/step7-e2e-tests.js
const request = require('supertest');
const app = require('../server-cashback');

describe('BƯỚC 7: E2E Payment Flow', () => {
  it('should complete full payment flow', async () => {
    // 1. Check eligibility
    // 2. Create payment request
    // 3. Admin confirm
    // 4. Admin mark as paid
    // 5. Verify all side effects
  });
});
```

**Duration:** 1-2 hours to implement

---

## Success Criteria

### ✅ Scenario 1 (Happy Path)
- [ ] User can create payment request
- [ ] Admin can confirm
- [ ] Admin can mark as paid
- [ ] Balance is deducted correctly
- [ ] Transaction is logged
- [ ] system_conversions updated with payment_status
- [ ] Paid orders excluded from reconciliation

### ✅ Scenario 2 (Insufficient Balance)
- [ ] Eligibility check returns false
- [ ] Cannot create payment request

### ✅ Scenario 3 (Concurrent Prevention)
- [ ] Cannot create second pending request

### ✅ Scenario 4 (Edge Case)
- [ ] Payment without conversions handled gracefully

### ✅ Scenario 5 (Historical Data)
- [ ] Identified old data needing fix (for BƯỚC 8)

---

## Rollback Plan

If any test fails:

1. **Check logs:**
   ```bash
   tail -f logs/app.log
   ```

2. **Check database state:**
   ```sql
   SELECT * FROM payment_requests WHERE id = :id;
   SELECT * FROM user_system_balance WHERE user_id = :userId;
   ```

3. **Restore from backup if needed:**
   ```bash
   cp .backups/payment-fix-20260109-164249/*.js backend/services/
   ```

4. **Fix issue and retest**

---

## Test Data Requirements

### User Account
- Email: (use existing test user)
- Balance: >= 50,000đ
- No pending payment requests

### System Conversions
- At least 2 approved conversions
- Status: 'approved'
- Not in any reconciliation yet

### Admin Account
- Has admin privileges
- Can access /api/admin/* endpoints

---

## Next Steps After Testing

### If All Tests Pass ✅
→ Proceed to **BƯỚC 8**: Fix historical data

### If Tests Fail ❌
1. Identify root cause
2. Fix code
3. Re-run BƯỚC 6 (function tests)
4. Re-run BƯỚC 7 (e2e tests)

---

## Notes

- **Thời gian dự kiến:** 15-30 phút test thủ công
- **Environment:** Production database (careful!)
- **Backup:** Đã có backup ở `.backups/payment-fix-20260109-164249/`
- **Rollback:** Có thể rollback bất cứ lúc nào

---

*Created: 2026-01-09*
*Ready for execution*
