# PHÂN TÍCH HỆ THỐNG THANH TOÁN HIỆN TẠI
*Backup Date: 2026-01-09 16:42:49*

## 1. FLOW HIỆN TẠI

### 1.1 User tạo Payment Request
```
File: backend/services/paymentRequestService.js
Function: createPaymentRequest()

Flow:
1. User submit form với amount, bank info
2. Backend validate:
   - Check eligibility (available_balance >= minAmount)
   - Check no pending request
3. INSERT vào payment_requests table:
   - status = 'pending'
   - requested_amount = X
4. ❌ KHÔNG khấu trừ balance ở đây
5. Return payment request object
```

### 1.2 Admin Confirm Payment Request
```
File: backend/services/paymentRequestService.js
Function: confirmPaymentRequest()

Flow:
1. Admin click "Xác nhận"
2. UPDATE payment_requests:
   - status = 'pending' → 'confirmed'
   - confirmed_by = admin_id
   - confirmed_at = NOW()
3. ❌ KHÔNG khấu trừ balance
4. Send notification email
```

### 1.3 Admin Mark as Paid
```
File: backend/services/paymentRequestService.js
Function: markAsPaid() - Line 471

CURRENT CODE:
async markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes) {
  // 1. Update payment_requests status
  const updated = await PaymentRequest.updateStatus(paymentRequestId, 'paid', {
    adminId: adminInfo.id,
    adminNotes: adminNotes || 'Đã chuyển tiền thành công',
    transactionReference,
    performedBy: adminInfo
  });

  // 2. Create payment history (async)
  setImmediate(async () => {
    await this._createPaymentHistoryFromRequest(updated);
  });

  // 3. Send email (async)
  setImmediate(async () => {
    await sendPaymentPaidEmail(updated);
  });

  return updated;
}

PROBLEMS:
❌ Không khấu trừ user_system_balance.available_balance
❌ Không cập nhật user_system_balance.total_withdrawn
❌ Không UPDATE system_conversions.payment_status
❌ Không set system_conversions.payment_request_id
❌ Không có transaction (rollback nếu lỗi)
```

### 1.4 Create Reconciliation
```
File: backend/services/systemReconciliation/SystemReconciliationService.js
Function: createReconciliation() - Line 26

CURRENT QUERY (Line ~49-75):
SELECT * FROM system_conversions
WHERE id = ANY($1)
  AND status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_conversion_id = sc.id
  )

PROBLEMS:
❌ Không kiểm tra payment_status
❌ Đơn đã paid có thể vào đối soát lại nếu:
   - Chưa có trong system_reconciliation_items
   - Hoặc đã xóa khỏi system_reconciliation_items
```

## 2. DATABASE SCHEMA

### 2.1 user_system_balance
```sql
CREATE TABLE user_system_balance (
  user_id UUID PRIMARY KEY,
  available_balance DECIMAL(15,2) DEFAULT 0,    -- ✅ Có
  pending_balance DECIMAL(15,2) DEFAULT 0,
  reserved_balance DECIMAL(15,2) DEFAULT 0,
  debt_balance DECIMAL(15,2) DEFAULT 0,
  total_earned DECIMAL(15,2) DEFAULT 0,         -- ✅ Có
  total_withdrawn DECIMAL(15,2) DEFAULT 0,      -- ✅ Có (nhưng không cập nhật)
  last_reconciliation_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 2.2 system_conversions
```sql
CREATE TABLE system_conversions (
  id UUID PRIMARY KEY,
  user_id UUID,
  order_code VARCHAR,
  cashback_amount DECIMAL(15,2),
  status VARCHAR,  -- 'pending', 'approved', 'rejected'

  -- Payment tracking fields ✅ ĐÃ CÓ
  payment_status VARCHAR,              -- NULL, 'paid'
  payment_request_id UUID,             -- Link to payment_requests
  payment_linked_at TIMESTAMPTZ,       -- Timestamp when linked

  -- Reconciliation tracking
  system_reconciliation_id UUID,
  created_at TIMESTAMPTZ
);
```

### 2.3 payment_requests
```sql
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY,
  user_id UUID,
  requested_amount DECIMAL(15,2),
  status VARCHAR,  -- 'pending', 'confirmed', 'paid', 'rejected', 'cancelled'

  -- Admin actions
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  transaction_reference VARCHAR,

  -- Bank info
  bank_name VARCHAR,
  bank_account_number VARCHAR,
  bank_account_name VARCHAR,

  created_at TIMESTAMPTZ
);
```

### 2.4 user_balance_transactions (AUTO LOG)
```sql
CREATE TABLE user_balance_transactions (
  id UUID PRIMARY KEY,
  user_id UUID,
  transaction_type VARCHAR,  -- 'payment_deducted', 'reconciliation_finalized', etc.
  amount DECIMAL(15,2),

  -- Balance snapshots
  balance_before DECIMAL(15,2),
  balance_after DECIMAL(15,2),

  -- References
  payment_request_id UUID,
  system_reconciliation_id UUID,

  created_at TIMESTAMPTZ
);

-- ✅ Có TRIGGER tự động log khi user_system_balance thay đổi
-- See: backend/migrations/015_create_user_balance_transactions.sql
```

## 3. DEPENDENCIES & SIDE EFFECTS

### 3.1 markAsPaid() Dependencies
- PaymentRequest.updateStatus()
- PaymentRequest.findById()
- _createPaymentHistoryFromRequest()
- sendPaymentPaidEmail()

### 3.2 BalanceManagementService.deductBalance()
```javascript
// File: backend/services/systemReconciliation/BalanceManagementService.js
// Line: 114

✅ ĐÃ TỒN TẠI và hoạt động đúng:
- Khấu trừ available_balance
- Tăng total_withdrawn
- Trigger tự động log vào user_balance_transactions
- Có transaction với FOR UPDATE lock
- Rollback nếu lỗi
```

### 3.3 Side Effects cần lưu ý
1. **Trigger:** user_system_balance UPDATE → Auto log to user_balance_transactions
2. **Email:** Async send email (không block)
3. **Payment History:** Async create history (không block)
4. **Transaction Isolation:** Cần wrap trong BEGIN/COMMIT

## 4. TEST SCENARIOS CẦN VALIDATE

### Scenario 1: Happy Path
1. User balance = 100,000đ
2. Create payment request 50,000đ
3. Admin confirm
4. Admin mark as paid
5. Expect:
   - available_balance = 50,000đ
   - total_withdrawn = 50,000đ
   - payment_status = 'paid'
   - user_balance_transactions có record

### Scenario 2: Insufficient Balance
1. User balance = 10,000đ
2. Try create payment request 50,000đ
3. Expect: checkEligibility returns false

### Scenario 3: Rollback on Error
1. Mock error trong deductBalance()
2. Try mark as paid
3. Expect: Balance không đổi, status không đổi

### Scenario 4: Duplicate Reconciliation Prevention
1. Order đã paid
2. Create new reconciliation
3. Expect: Order KHÔNG trong list

## 5. CHECKLIST THAY ĐỔI

### File 1: paymentRequestService.js
- [ ] markAsPaid(): Add deductBalance()
- [ ] markAsPaid(): Update payment_status
- [ ] markAsPaid(): Wrap in transaction
- [ ] markAsPaid(): Add error handling

### File 2: SystemReconciliationService.js
- [ ] createReconciliation(): Add payment_status filter
- [ ] createReconciliation(): Document the change

### File 3: BalanceManagementService.js
- [ ] No changes needed (already works correctly)

### File 4: paymentSystemReconciliationService.js
- [ ] calculateAvailableBalance(): Already fixed (reads from user_system_balance)

## 6. ROLLBACK PLAN

If anything goes wrong:
```bash
# Restore from backup
cd f:/VSCODE/Chatchiu
cp .backups/payment-fix-20260109-164249/*.js backend/services/
cp .backups/payment-fix-20260109-164249/SystemReconciliationService.js backend/services/systemReconciliation/
cp .backups/payment-fix-20260109-164249/BalanceManagementService.js backend/services/systemReconciliation/

# Restart server
npm start
```

## 7. SUCCESS CRITERIA

✅ Bước 1: Backup hoàn tất
✅ Bước 2-5: Code changes
✅ Bước 6-7: All tests pass
✅ Bước 8: Historical data fixed
✅ Bước 9: Deployed successfully

---

**Next Step:** Proceed to BƯỚC 2 - Sửa markAsPaid()
