# KẾ HOẠCH TỔNG QUAN MODULE THANH TOÁN - HỆ THỐNG CHATCHIU

**Ngày:** 10/01/2026
**Phiên bản:** 2.0
**Trạng thái:** Draft for Review

---

## 📋 MỤC LỤC

1. [Tổng quan hệ thống hiện tại](#1-tổng-quan-hệ-thống-hiện-tại)
2. [Vấn đề cần giải quyết](#2-vấn-đề-cần-giải-quyết)
3. [Kiến trúc mới đề xuất](#3-kiến-trúc-mới-đề-xuất)
4. [Kế hoạch triển khai](#4-kế-hoạch-triển-khai)
5. [Chi tiết từng giai đoạn](#5-chi-tiết-từng-giai-đoạn)
6. [Testing & Validation](#6-testing--validation)
7. [Rollback Plan](#7-rollback-plan)
8. [Success Metrics](#8-success-metrics)

---

## 1. TỔNG QUAN HỆ THỐNG HIỆN TẠI

### 1.1. Kiến trúc Database

```
CASHBACK FLOW:
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: System Reconciliation (Admin)                      │
│                                                             │
│ system_conversions (status='approved')                     │
│         ↓                                                   │
│ system_reconciliation_items (kỳ đối soát)                 │
│         ↓                                                   │
│ finalize_reconciliation()                                   │
│         ↓                                                   │
│ user_system_balance.available_balance += cashback         │
│ user_system_balance.total_earned += cashback              │
└─────────────────────────────────────────────────────────────┘

PAYMENT FLOW:
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: User Request Payment                               │
│                                                             │
│ payment_requests (status='pending')                        │
│         ↓ (validation only, NO balance change)             │
│ Check: requested_amount <= available_balance               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Admin Mark as Paid                                 │
│                                                             │
│ payment_requests.status = 'paid'                           │
│         ↓                                                   │
│ user_system_balance.available_balance -= amount           │
│ user_system_balance.total_withdrawn += amount             │
│         ↓                                                   │
│ system_conversions.payment_status = 'paid' (FIFO)         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2. Các Bảng Chính

| Bảng | Mục đích | Vấn đề hiện tại |
|------|----------|-----------------|
| `system_conversions` | Đơn hàng approved | ✅ OK |
| `system_reconciliation_items` | Items trong kỳ đối soát | ✅ OK |
| `user_system_balance` | Số dư user | ❌ Không cập nhật khi create/cancel request |
| `payment_requests` | Yêu cầu thanh toán | ❌ Không reserve balance |
| `payment_system_reconciliation_mapping` | Link payment ↔ items | ⚠️ Không dùng, có thể xóa |
| `payment_accounts` | Tài khoản ngân hàng đã lưu | ✅ OK |

### 1.3. Services Chính

1. **SystemReconciliationService** - Quản lý kỳ đối soát
   - `finalizeReconciliation()` - Cập nhật balance khi finalize
   - ✅ Đang hoạt động tốt

2. **PaymentRequestService** - Xử lý payment requests
   - `createPaymentRequest()` - Tạo request (❌ không reserve)
   - `markAsPaid()` - Admin mark paid (❌ deduct balance)
   - ❌ Logic sai, cần fix

3. **BalanceManagementService** - Quản lý số dư
   - `getUserBalance()` - Lấy từ `user_system_balance`
   - `deductBalance()` - Trừ balance (chỉ dùng trong markAsPaid)
   - ✅ OK nhưng dùng sai chỗ

---

## 2. VẤN ĐỀ CẦN GIẢI QUYẾT

### 2.1. Critical Issues (Phải fix ngay)

#### ❌ Issue #1: User có thể tạo nhiều requests vượt số dư

**Hiện tại:**
```javascript
User có: 100,000đ
User tạo request #1: 80,000đ
  → Validate: 80k <= 100k ✅ PASS
  → Balance: 100,000đ (KHÔNG đổi)

User tạo request #2: 80,000đ
  → Validate: 80k <= 100k ✅ PASS (vì balance chưa trừ!)
  → Balance: 100,000đ (KHÔNG đổi)

Tổng requests: 160,000đ nhưng chỉ có 100,000đ!
```

**Impact:** HIGH - User có thể abuse hệ thống

---

#### ❌ Issue #2: Cancel request không hoàn trả balance

**Hiện tại:**
```javascript
User tạo request: 50,000đ
  → Balance: 100,000đ (không đổi)

User cancel:
  → Balance: 100,000đ (không đổi)

→ Cancel vô nghĩa!
```

**Impact:** HIGH - UX confusing, chức năng không có ý nghĩa

---

#### ❌ Issue #3: Data inconsistency

**Phát hiện:**
```
user_system_balance.total_withdrawn = 58,800đ
SUM(payment_requests WHERE status='paid') = 150,000đ
Chênh lệch: -91,200đ
```

**Impact:** CRITICAL - Data không tin cậy, không thể reconcile

---

#### ❌ Issue #4: UI hiển thị sai số dư

**Hiện tại:**
```
User có: 100,000đ
User tạo request: 80,000đ
UI vẫn hiển thị: 100,000đ (sai!)

User nghĩ còn 100k nhưng thực tế chỉ còn 20k available
```

**Impact:** HIGH - User confusion, poor UX

---

### 2.2. Major Issues (Nên fix)

- ⚠️ Không có idempotency (duplicate requests risk)
- ⚠️ Không có proper audit trail cho balance changes
- ⚠️ FIFO logic có bug (có thể select 0 items)
- ⚠️ Encryption không đầy đủ
- ⚠️ Không có transaction isolation level

### 2.3. Minor Issues

- No rate limiting
- No payment request timeout
- No comprehensive monitoring
- Email notifications có thể mất nếu crash

---

## 3. KIẾN TRÚC MỚI ĐỀ XUẤT

### 3.1. Nguyên tắc thiết kế

#### ✅ Nguyên tắc 1: Reserve Balance khi Create Request

```
CREATE request → TRỪ available_balance (lock/reserve)
CANCEL request → CỘNG lại available_balance (release)
MARK PAID → CHỈ update total_withdrawn (không trừ available nữa)
```

**Lợi ích:**
- ✅ User KHÔNG thể tạo requests vượt số dư
- ✅ UI hiển thị ĐÚNG (số dư đã trừ requests pending)
- ✅ Cancel có ý nghĩa (hoàn trả số dư)

#### ✅ Nguyên tắc 2: Single Source of Truth

```
user_system_balance = SOURCE OF TRUTH cho balance
  - available_balance: Số dư thực sự có thể dùng
  - total_earned: Tổng đã đối soát
  - total_withdrawn: Tổng đã thanh toán

Công thức:
  available_balance = total_earned - total_withdrawn - pending_requests
```

#### ✅ Nguyên tắc 3: ACID Transactions

```javascript
await client.query('BEGIN')
await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')

// Lock balance row
await client.query(`
  SELECT available_balance FROM user_system_balance
  WHERE user_id = $1
  FOR UPDATE
`, [userId])

// Update balance
await client.query(`UPDATE user_system_balance SET ...`)

await client.query('COMMIT')
```

#### ✅ Nguyên tắc 4: Idempotency

```javascript
// Client gửi idempotency key
POST /api/payment-requests
Headers: {
  'Idempotency-Key': 'uuid-v4-random'
}

// Server check
const existing = await findByIdempotencyKey(key)
if (existing) return existing // Return cached

// Create new
const newRequest = await create(...)
saveIdempotencyKey(key, newRequest)
```

#### ✅ Nguyên tắc 5: Comprehensive Audit Trail

```javascript
// Log tất cả balance changes
CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_type VARCHAR(50), -- 'reconciliation_earned', 'payment_reserved', 'payment_released', 'payment_withdrawn'
  amount DECIMAL(15,2),
  balance_before DECIMAL(15,2),
  balance_after DECIMAL(15,2),
  reference_type VARCHAR(50), -- 'payment_request', 'reconciliation'
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
)
```

---

### 3.2. Database Schema Changes

#### Bảng CẦN SỬA:

**1. payment_requests**
```sql
ALTER TABLE payment_requests
ADD COLUMN idempotency_key VARCHAR(255) UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN reserve_balance_at TIMESTAMP, -- Khi nào reserve balance
ADD COLUMN release_balance_at TIMESTAMP; -- Khi nào release (cancel)

CREATE INDEX idx_payment_requests_idempotency ON payment_requests(idempotency_key);
```

**2. user_system_balance**
```sql
-- Thêm trigger để auto-log balance changes
CREATE TRIGGER log_balance_changes
AFTER UPDATE ON user_system_balance
FOR EACH ROW
EXECUTE FUNCTION log_balance_transaction();
```

#### Bảng MỚI:

**3. balance_transactions** (Audit trail)
```sql
CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  payment_request_id UUID REFERENCES payment_requests(id),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB,

  CONSTRAINT check_transaction_type CHECK (
    transaction_type IN (
      'reconciliation_earned',
      'payment_reserved',
      'payment_released',
      'payment_withdrawn',
      'payment_refunded',
      'manual_adjustment'
    )
  )
);

CREATE INDEX idx_balance_transactions_user ON balance_transactions(user_id, created_at DESC);
CREATE INDEX idx_balance_transactions_payment ON balance_transactions(payment_request_id);
```

#### Bảng CÓ THỂ XÓA:

**4. payment_system_reconciliation_mapping**
- Hiện không dùng (validate cho thấy)
- Có thể migrate data sang balance_transactions rồi xóa

---

### 3.3. Service Logic Changes

#### A. createPaymentRequest() - BEFORE & AFTER

**BEFORE (SAI):**
```javascript
async createPaymentRequest(data) {
  // Validate
  if (requestedAmount > availableBalance) throw Error()

  // Create request
  INSERT INTO payment_requests (status='pending')

  // ❌ KHÔNG update balance
  return paymentRequest
}
```

**AFTER (ĐÚNG):**
```javascript
async createPaymentRequest(data) {
  const { userId, requestedAmount, idempotencyKey } = data

  // 🔥 STEP 0: Idempotency check
  const existing = await db.query(`
    SELECT * FROM payment_requests
    WHERE idempotency_key = $1
  `, [idempotencyKey])

  if (existing.rows.length > 0) {
    return existing.rows[0] // Return cached
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')

    // 🔥 STEP 1: Lock and check balance
    const balanceResult = await client.query(`
      SELECT available_balance, total_earned, total_withdrawn
      FROM user_system_balance
      WHERE user_id = $1
      FOR UPDATE
    `, [userId])

    if (balanceResult.rows.length === 0) {
      throw new Error('User balance not found')
    }

    const balance = balanceResult.rows[0]
    const availableBalance = parseFloat(balance.available_balance)
    const balanceBefore = availableBalance

    // Validate
    if (requestedAmount > availableBalance) {
      throw new ValidationError(`Số dư không đủ. Khả dụng: ${availableBalance}đ`)
    }

    // 🔥 STEP 2: Create payment request
    const prResult = await client.query(`
      INSERT INTO payment_requests (
        user_id, requested_amount, status,
        idempotency_key, reserve_balance_at,
        bank_name, bank_account_number_encrypted, ...
      ) VALUES ($1, $2, 'pending', $3, NOW(), ...)
      RETURNING *
    `, [userId, requestedAmount, idempotencyKey, ...])

    const paymentRequest = prResult.rows[0]

    // 🔥 STEP 3: RESERVE balance (trừ available_balance)
    await client.query(`
      UPDATE user_system_balance
      SET available_balance = available_balance - $2,
          updated_at = NOW()
      WHERE user_id = $1
    `, [userId, requestedAmount])

    const balanceAfter = availableBalance - requestedAmount

    // 🔥 STEP 4: Log balance transaction
    await client.query(`
      INSERT INTO balance_transactions (
        user_id, transaction_type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        payment_request_id, description, created_by
      ) VALUES ($1, 'payment_reserved', $2, $3, $4, 'payment_request', $5, $5, $6, $7)
    `, [
      userId,
      -requestedAmount, // Negative = debit
      balanceBefore,
      balanceAfter,
      paymentRequest.id,
      `Reserve balance for payment request ${paymentRequest.id.substring(0, 8)}`,
      userId
    ])

    await client.query('COMMIT')

    logger.success('Payment request created', {
      paymentRequestId: paymentRequest.id,
      userId,
      requestedAmount,
      balanceBefore,
      balanceAfter
    })

    return paymentRequest

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

---

#### B. cancelPaymentRequest() - BEFORE & AFTER

**BEFORE (SAI):**
```javascript
async cancel(id, userId, reason) {
  // Update cancelled_at
  UPDATE payment_requests SET cancelled_at = NOW()

  // ❌ KHÔNG hoàn trả balance
  return paymentRequest
}
```

**AFTER (ĐÚNG):**
```javascript
async cancelPaymentRequest(paymentRequestId, userId, reason) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')

    // 🔥 STEP 1: Get and lock payment request
    const prResult = await client.query(`
      SELECT * FROM payment_requests
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `, [paymentRequestId, userId])

    if (prResult.rows.length === 0) {
      throw new Error('Payment request not found or unauthorized')
    }

    const paymentRequest = prResult.rows[0]

    // Validate
    if (paymentRequest.status !== 'pending') {
      throw new Error('Can only cancel pending requests')
    }

    if (paymentRequest.cancelled_at) {
      throw new Error('Already cancelled')
    }

    // 🔥 STEP 2: Lock balance
    const balanceResult = await client.query(`
      SELECT available_balance FROM user_system_balance
      WHERE user_id = $1
      FOR UPDATE
    `, [userId])

    const balanceBefore = parseFloat(balanceResult.rows[0].available_balance)

    // 🔥 STEP 3: Update payment request
    await client.query(`
      UPDATE payment_requests
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by = $2,
          cancellation_reason = $3,
          release_balance_at = NOW()
      WHERE id = $1
    `, [paymentRequestId, userId, reason])

    // 🔥 STEP 4: RELEASE balance (hoàn trả)
    await client.query(`
      UPDATE user_system_balance
      SET available_balance = available_balance + $2,
          updated_at = NOW()
      WHERE user_id = $1
    `, [userId, paymentRequest.requested_amount])

    const balanceAfter = balanceBefore + parseFloat(paymentRequest.requested_amount)

    // 🔥 STEP 5: Log balance transaction
    await client.query(`
      INSERT INTO balance_transactions (
        user_id, transaction_type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        payment_request_id, description, created_by
      ) VALUES ($1, 'payment_released', $2, $3, $4, 'payment_request', $5, $5, $6, $7)
    `, [
      userId,
      paymentRequest.requested_amount, // Positive = credit (refund)
      balanceBefore,
      balanceAfter,
      paymentRequestId,
      `Cancel payment request ${paymentRequestId.substring(0, 8)}`,
      userId
    ])

    await client.query('COMMIT')

    logger.success('Payment request cancelled', {
      paymentRequestId,
      userId,
      amount: paymentRequest.requested_amount,
      balanceBefore,
      balanceAfter
    })

    return paymentRequest

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

---

#### C. markAsPaid() - BEFORE & AFTER

**BEFORE (SAI):**
```javascript
async markAsPaid(paymentRequestId, adminInfo, transactionRef) {
  await BEGIN()

  // Get payment request
  const pr = await findById(paymentRequestId)

  // ❌ Deduct balance (SAI - đã trừ lúc create rồi!)
  await BalanceManagementService.deductBalance(pr.user_id, pr.requested_amount)

  // Update status
  UPDATE payment_requests SET status = 'paid'

  // Mark conversions
  UPDATE system_conversions SET payment_status = 'paid' (FIFO)

  await COMMIT()
}
```

**AFTER (ĐÚNG):**
```javascript
async markAsPaid(paymentRequestId, adminId, transactionReference, notes) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')

    // STEP 1: Get and lock payment request
    const prResult = await client.query(`
      SELECT * FROM payment_requests
      WHERE id = $1
      FOR UPDATE
    `, [paymentRequestId])

    if (prResult.rows.length === 0) {
      throw new Error('Payment request not found')
    }

    const paymentRequest = prResult.rows[0]

    // Validate status
    if (!['pending', 'confirmed'].includes(paymentRequest.status)) {
      throw new Error(`Cannot mark as paid from status: ${paymentRequest.status}`)
    }

    if (!transactionReference) {
      throw new Error('Transaction reference required')
    }

    // 🔥 STEP 2: Lock balance
    const balanceResult = await client.query(`
      SELECT available_balance, total_withdrawn
      FROM user_system_balance
      WHERE user_id = $1
      FOR UPDATE
    `, [paymentRequest.user_id])

    const balance = balanceResult.rows[0]
    const withdrawnBefore = parseFloat(balance.total_withdrawn)

    // 🔥 STEP 3: Update payment request status
    await client.query(`
      UPDATE payment_requests
      SET status = 'paid',
          paid_at = NOW(),
          paid_by = $2,
          transaction_reference = $3,
          admin_notes = $4
      WHERE id = $1
    `, [paymentRequestId, adminId, transactionReference, notes])

    // 🔥 STEP 4: Update total_withdrawn (KHÔNG trừ available - đã trừ lúc create)
    await client.query(`
      UPDATE user_system_balance
      SET total_withdrawn = total_withdrawn + $2,
          updated_at = NOW()
      WHERE user_id = $1
    `, [paymentRequest.user_id, paymentRequest.requested_amount])

    const withdrawnAfter = withdrawnBefore + parseFloat(paymentRequest.requested_amount)

    // 🔥 STEP 5: Log balance transaction
    await client.query(`
      INSERT INTO balance_transactions (
        user_id, transaction_type, amount,
        balance_before, balance_after,
        reference_type, reference_id,
        payment_request_id, description, created_by,
        metadata
      ) VALUES ($1, 'payment_withdrawn', $2, $3, $4, 'payment_request', $5, $5, $6, $7, $8)
    `, [
      paymentRequest.user_id,
      -paymentRequest.requested_amount, // Negative = withdrawal
      withdrawnBefore,
      withdrawnAfter,
      paymentRequestId,
      `Payment completed for request ${paymentRequestId.substring(0, 8)}`,
      adminId,
      JSON.stringify({ transactionReference })
    ])

    // 🔥 STEP 6: Mark conversions as paid (FIFO) - FIXED LOGIC
    const fifoQuery = `
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
      SET payment_status = 'paid',
          payment_request_id = $2,
          payment_linked_at = NOW()
      WHERE id IN (
        SELECT id FROM selected_conversions
        WHERE running_total <= $3
           OR (running_total - cashback_amount) < $3  -- 🔥 FIX: Ensure at least 1 item
      )
      RETURNING id, cashback_amount
    `

    const conversionsResult = await client.query(fifoQuery, [
      paymentRequest.user_id,
      paymentRequestId,
      paymentRequest.requested_amount
    ])

    await client.query('COMMIT')

    logger.success('Payment request marked as paid', {
      paymentRequestId,
      adminId,
      amount: paymentRequest.requested_amount,
      conversionsMarked: conversionsResult.rowCount,
      transactionReference
    })

    // Send email (async, non-blocking)
    setImmediate(async () => {
      try {
        await sendPaymentPaidEmail(paymentRequest)
      } catch (emailError) {
        logger.error('Failed to send payment email', { error: emailError.message })
      }
    })

    return paymentRequest

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

---

### 3.4. Công Thức Balance (Đúng)

```javascript
// Source of truth
available_balance = total_earned - total_withdrawn - SUM(pending_requests)

// Hoặc tính trực tiếp:
available_balance =
  (SELECT COALESCE(SUM(cashback_amount), 0)
   FROM system_conversions
   WHERE user_id = $1 AND status = 'approved')
  -
  (SELECT COALESCE(SUM(requested_amount), 0)
   FROM payment_requests
   WHERE user_id = $1 AND status IN ('pending', 'confirmed', 'paid'))

// Verification:
total_withdrawn =
  (SELECT COALESCE(SUM(requested_amount), 0)
   FROM payment_requests
   WHERE user_id = $1 AND status = 'paid')
```

---

## 4. KẾ HOẠCH TRIỂN KHAI

### Tổng quan Timeline:

```
Week 1: Preparation & Backup
Week 2-3: Implementation
Week 4: Testing
Week 5: Deployment
Week 6+: Monitoring & Optimization
```

---

## 5. CHI TIẾT TỪNG GIAI ĐOẠN

### 📦 PHASE 1: BACKUP & AUDIT (3 ngày)

**Mục tiêu:** Backup toàn bộ, audit data hiện tại, xác định scope

#### Day 1: Database Backup

```bash
# 1. Full database dump
pg_dump -h $NEON_HOST -U $USER -d chatchiu \
  --format=custom \
  --file=backup_full_$(date +%Y%m%d).dump

# 2. Specific tables dump
pg_dump -h $NEON_HOST -U $USER -d chatchiu \
  -t payment_requests \
  -t user_system_balance \
  -t system_conversions \
  -t payment_system_reconciliation_mapping \
  -t balance_transactions \
  --format=custom \
  --file=backup_payment_tables_$(date +%Y%m%d).dump

# 3. Export to CSV for analysis
psql -h $NEON_HOST -U $USER -d chatchiu -c "
  COPY (
    SELECT
      pr.id,
      pr.user_id,
      pr.requested_amount,
      pr.status,
      pr.created_at,
      pr.paid_at,
      pr.cancelled_at,
      u.email,
      usb.available_balance,
      usb.total_earned,
      usb.total_withdrawn
    FROM payment_requests pr
    LEFT JOIN users u ON pr.user_id = u.id
    LEFT JOIN user_system_balance usb ON pr.user_id = usb.user_id
    ORDER BY pr.created_at DESC
  ) TO STDOUT WITH CSV HEADER
" > payment_requests_full_export.csv
```

#### Day 2: Code Backup & Branch

```bash
# 1. Create backup branch
git checkout main
git pull origin main
git checkout -b backup/before-payment-redesign-$(date +%Y%m%d)
git push origin backup/before-payment-redesign-$(date +%Y%m%d)

# 2. Tag current state
git tag -a v2.0.0-before-payment-redesign \
  -m "Backup before payment workflow redesign - $(date +%Y-%m-%d)"
git push origin v2.0.0-before-payment-redesign

# 3. Create working branch
git checkout main
git checkout -b feature/payment-workflow-redesign
```

#### Day 3: Data Audit & Analysis

```bash
# Run comprehensive analysis script
cd backend
node scripts/verify-complete-logic.js > audit_report_$(date +%Y%m%d).txt

# Analyze inconsistencies
node scripts/diagnose-balance-discrepancy.js > inconsistencies_$(date +%Y%m%d).txt

# Export for review
```

**Deliverables:**
- ✅ Full database backup (.dump file)
- ✅ Payment tables backup
- ✅ CSV exports for analysis
- ✅ Git backup branch + tag
- ✅ Audit report showing all inconsistencies
- ✅ List of affected users (if any)

---

### 🔧 PHASE 2: FIX DATA INCONSISTENCIES (3 ngày)

**Mục tiêu:** Sửa data hiện tại cho đúng trước khi deploy code mới

#### Day 4: Fix total_withdrawn

```sql
-- Script: backend/migrations/060_fix_total_withdrawn.sql

BEGIN;

-- Backup current state
CREATE TEMP TABLE user_system_balance_backup AS
SELECT * FROM user_system_balance;

-- Recalculate total_withdrawn from payment_requests
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
);

-- Verify
SELECT
  usb.user_id,
  u.email,
  usb.available_balance as new_available,
  usb.total_withdrawn as new_withdrawn,
  backup.available_balance as old_available,
  backup.total_withdrawn as old_withdrawn,
  (usb.available_balance - backup.available_balance) as available_diff,
  (usb.total_withdrawn - backup.total_withdrawn) as withdrawn_diff
FROM user_system_balance usb
JOIN user_system_balance_backup backup ON usb.user_id = backup.user_id
LEFT JOIN users u ON usb.user_id = u.id
WHERE ABS(usb.available_balance - backup.available_balance) > 0.01
   OR ABS(usb.total_withdrawn - backup.total_withdrawn) > 0.01
ORDER BY ABS(available_diff) DESC;

-- If verification OK:
COMMIT;

-- If NOT OK:
-- ROLLBACK;
```

#### Day 5: Add idempotency keys to existing requests

```sql
-- Script: backend/migrations/061_add_idempotency_keys.sql

BEGIN;

-- Add column (allow NULL first)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Generate UUID for existing requests
UPDATE payment_requests
SET idempotency_key = gen_random_uuid()::text
WHERE idempotency_key IS NULL;

-- Make NOT NULL and add constraint
ALTER TABLE payment_requests
ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX idx_payment_requests_idempotency
ON payment_requests(idempotency_key);

COMMIT;
```

#### Day 6: Create balance_transactions table

```sql
-- Script: backend/migrations/062_create_balance_transactions.sql

BEGIN;

CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  payment_request_id UUID REFERENCES payment_requests(id),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB,

  CONSTRAINT check_transaction_type CHECK (
    transaction_type IN (
      'reconciliation_earned',
      'payment_reserved',
      'payment_released',
      'payment_withdrawn',
      'payment_refunded',
      'manual_adjustment'
    )
  )
);

CREATE INDEX idx_balance_transactions_user
ON balance_transactions(user_id, created_at DESC);

CREATE INDEX idx_balance_transactions_payment
ON balance_transactions(payment_request_id);

CREATE INDEX idx_balance_transactions_type
ON balance_transactions(transaction_type);

-- Trigger để auto-log balance changes
CREATE OR REPLACE FUNCTION log_balance_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type VARCHAR(50);
BEGIN
  -- Determine transaction type based on what changed
  IF NEW.available_balance < OLD.available_balance THEN
    IF NEW.total_withdrawn > OLD.total_withdrawn THEN
      change_type := 'payment_withdrawn';
    ELSE
      change_type := 'payment_reserved';
    END IF;
  ELSIF NEW.available_balance > OLD.available_balance THEN
    IF NEW.total_earned > OLD.total_earned THEN
      change_type := 'reconciliation_earned';
    ELSE
      change_type := 'payment_released';
    END IF;
  ELSE
    RETURN NEW; -- No balance change
  END IF;

  -- Log the transaction
  INSERT INTO balance_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
  ) VALUES (
    NEW.user_id,
    change_type,
    NEW.available_balance - OLD.available_balance,
    OLD.available_balance,
    NEW.available_balance,
    'Auto-logged balance change',
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_balance_changes
AFTER UPDATE ON user_system_balance
FOR EACH ROW
WHEN (OLD.available_balance IS DISTINCT FROM NEW.available_balance
   OR OLD.total_withdrawn IS DISTINCT FROM NEW.total_withdrawn
   OR OLD.total_earned IS DISTINCT FROM NEW.total_earned)
EXECUTE FUNCTION log_balance_change();

COMMIT;
```

**Deliverables:**
- ✅ Data fixed (total_withdrawn corrected)
- ✅ Idempotency keys added
- ✅ balance_transactions table created
- ✅ Auto-logging trigger installed
- ✅ Verification report

---

### 💻 PHASE 3: IMPLEMENT NEW CODE (5 ngày)

#### Day 7-8: Update Services

**Files to modify:**

1. **backend/services/paymentRequestService.js**
   - Rewrite `createPaymentRequest()`
   - Rewrite `cancelPaymentRequest()` (currently in model)
   - Update `markAsPaid()`
   - Add idempotency check

2. **backend/models/PaymentRequest.js**
   - Move `cancel()` logic to service
   - Keep as data access layer only

3. **backend/services/systemReconciliation/BalanceManagementService.js**
   - Keep `getUserBalance()` as-is
   - Remove `deductBalance()` usage from markAsPaid flow
   - Add `reserveBalance()`, `releaseBalance()` methods

#### Day 9: Update Routes & Middleware

1. **backend/middleware/idempotency.js** (NEW)
```javascript
const { v4: isValidUUID } = require('uuid')

function validateIdempotencyKey(req, res, next) {
  const key = req.headers['idempotency-key']

  if (!key) {
    return res.status(400).json({
      success: false,
      message: 'Idempotency-Key header required',
      code: 'MISSING_IDEMPOTENCY_KEY'
    })
  }

  if (!isValidUUID(key)) {
    return res.status(400).json({
      success: false,
      message: 'Idempotency-Key must be valid UUID v4',
      code: 'INVALID_IDEMPOTENCY_KEY'
    })
  }

  req.idempotencyKey = key
  next()
}

module.exports = { validateIdempotencyKey }
```

2. **Update routes/paymentRequest.js**
```javascript
const { validateIdempotencyKey } = require('../middleware/idempotency')

// Add middleware to POST endpoint
router.post('/',
  authenticateToken,
  validateIdempotencyKey,  // ← NEW
  async (req, res) => {
    const { requestedAmount, bankName, ... } = req.body
    const idempotencyKey = req.idempotencyKey

    const paymentRequest = await PaymentRequestService.createPaymentRequest({
      userId: req.userId,
      requestedAmount,
      idempotencyKey,  // ← Pass to service
      ...
    })

    res.json({ success: true, data: paymentRequest })
  }
)

// Add DELETE endpoint for cancel
router.delete('/:id',
  authenticateToken,
  async (req, res) => {
    const paymentRequest = await PaymentRequestService.cancelPaymentRequest(
      req.params.id,
      req.userId,
      req.body.reason
    )

    res.json({ success: true, data: paymentRequest })
  }
)
```

#### Day 10-11: Testing & Bug Fixes

- Write unit tests
- Write integration tests
- Test on local environment
- Fix bugs discovered

**Deliverables:**
- ✅ Code implemented with reserve/release logic
- ✅ Idempotency middleware
- ✅ Routes updated
- ✅ Unit tests passing
- ✅ Integration tests passing

---

### 🧪 PHASE 4: COMPREHENSIVE TESTING (7 ngày)

#### Day 12-14: Unit & Integration Tests

**Create test files:**

```javascript
// tests/unit/payment-request.test.js
describe('PaymentRequestService', () => {
  describe('createPaymentRequest', () => {
    it('should reserve balance when creating request', async () => {
      const before = await getBalance(testUserId)

      await PaymentRequestService.createPaymentRequest({
        userId: testUserId,
        requestedAmount: 50000,
        idempotencyKey: uuid.v4(),
        ...
      })

      const after = await getBalance(testUserId)
      expect(after.available_balance).toBe(before.available_balance - 50000)
    })

    it('should return same request for duplicate idempotency key', async () => {
      const key = uuid.v4()
      const req1 = await create({ ..., idempotencyKey: key })
      const req2 = await create({ ..., idempotencyKey: key })

      expect(req1.id).toBe(req2.id)
    })

    it('should reject if balance insufficient', async () => {
      await expect(
        create({ ..., requestedAmount: 999999999 })
      ).rejects.toThrow('Số dư không đủ')
    })
  })

  describe('cancelPaymentRequest', () => {
    it('should release balance when cancelling', async () => {
      const request = await create({ requestedAmount: 50000, ... })
      const before = await getBalance(testUserId)

      await PaymentRequestService.cancelPaymentRequest(request.id, testUserId)

      const after = await getBalance(testUserId)
      expect(after.available_balance).toBe(before.available_balance + 50000)
    })

    it('should only allow cancel pending requests', async () => {
      const request = await create({ ... })
      await markAsPaid(request.id)

      await expect(
        cancel(request.id)
      ).rejects.toThrow('Can only cancel pending')
    })
  })

  describe('markAsPaid', () => {
    it('should update total_withdrawn, not change available', async () => {
      const request = await create({ requestedAmount: 50000 })
      const before = await getBalance(testUserId)

      await markAsPaid(request.id, adminId, 'TXN123')

      const after = await getBalance(testUserId)
      expect(after.available_balance).toBe(before.available_balance) // Same
      expect(after.total_withdrawn).toBe(before.total_withdrawn + 50000) // Increased
    })

    it('should mark conversions as paid (FIFO)', async () => {
      // Create conversions with different order_time
      const conv1 = await createConversion({ order_time: '2026-01-01', amount: 10000 })
      const conv2 = await createConversion({ order_time: '2026-01-05', amount: 20000 })
      const conv3 = await createConversion({ order_time: '2026-01-10', amount: 30000 })

      // Create and pay request for 25000
      const request = await create({ requestedAmount: 25000 })
      await markAsPaid(request.id)

      // Check which conversions marked
      const c1 = await getConversion(conv1.id)
      const c2 = await getConversion(conv2.id)
      const c3 = await getConversion(conv3.id)

      expect(c1.payment_status).toBe('paid') // 10k (oldest)
      expect(c2.payment_status).toBe('paid') // 20k (second) → total 30k covers 25k
      expect(c3.payment_status).toBeNull() // Not marked
    })
  })
})
```

#### Day 15-16: Load Testing

```javascript
// tests/load/payment-concurrent.test.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],  // <1% errors
    http_req_duration: ['p(95)<2000'], // 95% < 2s
  },
}

export default function() {
  const url = 'http://localhost:3007/api/payment-requests'
  const token = __ENV.TEST_TOKEN

  const payload = JSON.stringify({
    requestedAmount: 50000,
    bankName: 'Vietcombank',
    bankAccountNumber: '1234567890',
    bankAccountName: 'Test User',
  })

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Idempotency-Key': `${__VU}-${__ITER}-${Date.now()}`,
    },
  }

  const res = http.post(url, payload, params)

  check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'balance consistent': (r) => {
      const body = JSON.parse(r.body)
      return body.success === true || body.code === 'INSUFFICIENT_BALANCE'
    },
  })

  sleep(1)
}
```

#### Day 17-18: Manual E2E Testing

**Test scenarios:**

1. **Happy Path:**
   - ✅ User tạo request → Balance giảm
   - ✅ Admin mark paid → total_withdrawn tăng
   - ✅ Conversions marked (FIFO)

2. **Cancel Flow:**
   - ✅ User tạo request → Balance giảm
   - ✅ User cancel → Balance tăng lại
   - ✅ Cannot cancel confirmed/paid

3. **Idempotency:**
   - ✅ Same key → Same request returned
   - ✅ Different key → New request created

4. **Concurrent Requests:**
   - ✅ 2 users không thể overdraw balance
   - ✅ Race condition handled correctly

5. **Error Cases:**
   - ✅ Insufficient balance → Rejected
   - ✅ Invalid amount → Rejected
   - ✅ Missing idempotency key → 400 error

**Deliverables:**
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ Load test passed (no race conditions)
- ✅ Manual E2E test report
- ✅ Bug fixes completed

---

### 🚀 PHASE 5: DEPLOYMENT (5 ngày)

#### Day 19-20: Staging Deployment

```bash
# 1. Deploy to staging
git push origin feature/payment-workflow-redesign

# 2. Run migrations on staging
npm run migrate:staging

# 3. Deploy code
npm run deploy:staging

# 4. Run smoke tests
npm run test:e2e:staging

# 5. Monitor logs
tail -f /var/log/app/staging.log
```

#### Day 21: Production Deployment (Blue-Green)

```bash
# 1. Deploy to Green (new version)
npm run deploy:production:green

# 2. Health check
curl https://api.chatchiu.online/health
curl https://api.chatchiu.online/api/payment-requests/eligibility \
  -H "Authorization: Bearer $TOKEN"

# 3. Switch 10% traffic to Green
kubectl set traffic deployment/api --canary-weight=10

# 4. Monitor for 2 hours
watch -n 60 'kubectl logs -l app=api --tail=100 | grep -i error'

# 5. Increase to 50% if OK
kubectl set traffic deployment/api --canary-weight=50

# 6. Monitor for 4 hours

# 7. Switch 100% if OK
kubectl set traffic deployment/api --canary-weight=100

# 8. Monitor for 24 hours
```

#### Day 22-23: Post-Deployment Monitoring

**Monitor:**
- ✅ Error rate < 0.1%
- ✅ Response time p95 < 2s
- ✅ Balance consistency checks
- ✅ No negative balances
- ✅ Idempotency working
- ✅ Email notifications sent

**Deliverables:**
- ✅ Staging deployed successfully
- ✅ Production deployed (green)
- ✅ Traffic switched 100%
- ✅ No critical errors in 24h
- ✅ Monitoring dashboard setup

---

## 6. TESTING & VALIDATION

### 6.1. Automated Tests

**Unit Tests** (Jest):
```bash
npm run test:unit
# Expected: 50+ tests, 100% pass rate
```

**Integration Tests** (Supertest):
```bash
npm run test:integration
# Expected: 20+ tests, covers all workflows
```

**Load Tests** (k6):
```bash
npm run test:load
# Expected: 1000 req/s, <1% error, p95 < 2s
```

### 6.2. Manual Test Checklist

- [ ] User can create payment request
- [ ] Balance decreases immediately
- [ ] UI shows correct available balance
- [ ] User can cancel pending request
- [ ] Balance increases when cancelled
- [ ] Cannot cancel confirmed/paid request
- [ ] Admin can mark as paid
- [ ] Conversions marked in FIFO order
- [ ] Email notification sent
- [ ] Idempotency works (duplicate key → same request)
- [ ] Concurrent requests don't cause negative balance
- [ ] Balance audit trail is complete

### 6.3. Data Validation Queries

```sql
-- Check 1: No negative balances
SELECT user_id, available_balance
FROM user_system_balance
WHERE available_balance < 0;
-- Expected: 0 rows

-- Check 2: total_withdrawn = SUM(paid requests)
SELECT
  usb.user_id,
  usb.total_withdrawn as balance_withdrawn,
  COALESCE(SUM(pr.requested_amount), 0) as requests_paid,
  ABS(usb.total_withdrawn - COALESCE(SUM(pr.requested_amount), 0)) as diff
FROM user_system_balance usb
LEFT JOIN payment_requests pr ON usb.user_id = pr.user_id AND pr.status = 'paid'
GROUP BY usb.user_id, usb.total_withdrawn
HAVING ABS(usb.total_withdrawn - COALESCE(SUM(pr.requested_amount), 0)) > 0.01;
-- Expected: 0 rows

-- Check 3: available + pending + withdrawn = total_earned
SELECT
  usb.user_id,
  usb.available_balance,
  usb.total_earned,
  usb.total_withdrawn,
  COALESCE(SUM(pr.requested_amount), 0) as pending_amount,
  (usb.available_balance + usb.total_withdrawn + COALESCE(SUM(pr.requested_amount), 0)) as calculated_earned,
  ABS(usb.total_earned - (usb.available_balance + usb.total_withdrawn + COALESCE(SUM(pr.requested_amount), 0))) as diff
FROM user_system_balance usb
LEFT JOIN payment_requests pr ON usb.user_id = pr.user_id AND pr.status IN ('pending', 'confirmed')
GROUP BY usb.user_id, usb.available_balance, usb.total_earned, usb.total_withdrawn
HAVING ABS(usb.total_earned - (usb.available_balance + usb.total_withdrawn + COALESCE(SUM(pr.requested_amount), 0))) > 0.01;
-- Expected: 0 rows

-- Check 4: All balance_transactions logged
SELECT
  COUNT(*) as total_transactions,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(CASE WHEN transaction_type = 'payment_reserved' THEN 1 ELSE 0 END) as reserved,
  SUM(CASE WHEN transaction_type = 'payment_released' THEN 1 ELSE 0 END) as released,
  SUM(CASE WHEN transaction_type = 'payment_withdrawn' THEN 1 ELSE 0 END) as withdrawn
FROM balance_transactions;
-- Expected: non-zero counts
```

---

## 7. ROLLBACK PLAN

### 7.1. Rollback Triggers

**Critical Issues** (Rollback immediately):
- ❌ Error rate > 5%
- ❌ Users report negative balances
- ❌ Data inconsistency detected
- ❌ Payment failures > 10%

**Major Issues** (Rollback within 1 hour):
- ⚠️ Error rate > 1%
- ⚠️ Response time p95 > 5s
- ⚠️ Email notifications failing
- ⚠️ Admin unable to process payments

### 7.2. Rollback Procedure

```bash
# STEP 1: Switch traffic back to Blue (old version)
kubectl set traffic deployment/api --canary-weight=0
# Immediate effect: All traffic → old code

# STEP 2: Restore database (if data corrupted)
# 2a. Stop all writes
kubectl scale deployment/api --replicas=0

# 2b. Restore from backup
pg_restore -h $NEON_HOST -U $USER -d chatchiu \
  --clean --if-exists \
  backup_full_20260110.dump

# 2c. Verify restoration
psql -h $NEON_HOST -U $USER -d chatchiu -c "
  SELECT COUNT(*) FROM payment_requests;
  SELECT COUNT(*) FROM user_system_balance;
"

# 2d. Restart app
kubectl scale deployment/api --replicas=3

# STEP 3: Revert code
git revert <commit-sha>
git push origin main

# STEP 4: Notify team & users
# Send email to affected users
# Post-mortem meeting scheduled
```

### 7.3. Partial Rollback (Code only, keep data)

```bash
# If code has bugs but data is OK:

# 1. Switch traffic to old code
kubectl set traffic deployment/api --canary-weight=0

# 2. Keep new database schema (migrations applied)
# 3. Deploy hotfix on old code to work with new schema
# 4. OR fix bugs in new code and redeploy
```

---

## 8. SUCCESS METRICS

### 8.1. Technical Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Error Rate | < 0.1% | Monitoring dashboard |
| Response Time (p95) | < 2s | APM tools |
| Balance Consistency | 100% | SQL validation queries |
| Idempotency Success | 100% | Test duplicate requests |
| Negative Balances | 0 | Daily cron check |
| Audit Trail Coverage | 100% | All balance changes logged |

### 8.2. Business Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Payment Request Success Rate | > 99% | Track create → paid rate |
| Average Processing Time | < 24h | From create → paid |
| User Complaints | 0 | Support tickets |
| Admin Efficiency | +50% | Time to process payment |
| Cancel Rate | < 5% | Cancelled / Total requests |

### 8.3. Monitoring Dashboard

**Setup Grafana/Datadog dashboard:**

```javascript
// Queries to track:

// 1. Balance over time
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  SUM(amount) as total_change
FROM balance_transactions
GROUP BY hour
ORDER BY hour;

// 2. Payment request status distribution
SELECT
  status,
  COUNT(*) as count,
  AVG(requested_amount) as avg_amount
FROM payment_requests
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

// 3. Error rate
SELECT
  DATE_TRUNC('minute', timestamp) as minute,
  COUNT(*) FILTER (WHERE status >= 400) as errors,
  COUNT(*) as total,
  (COUNT(*) FILTER (WHERE status >= 400)::FLOAT / COUNT(*)) * 100 as error_rate
FROM request_logs
WHERE path LIKE '/api/payment-requests%'
GROUP BY minute;
```

---

## 9. KẾT LUẬN & KHUYẾN NGHỊ

### 9.1. Lợi ích của hệ thống mới

✅ **Integrity:** Balance luôn chính xác, không thể overdraw
✅ **Security:** Idempotency prevents duplicate charges
✅ **Transparency:** Complete audit trail
✅ **UX:** User thấy balance real-time
✅ **Reliability:** ACID transactions, race condition handled
✅ **Maintainability:** Code clear, dễ debug

### 9.2. Rủi ro & Mitigation

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Data migration lỗi | HIGH | Backup đầy đủ, test trên staging |
| Downtime khi deploy | MEDIUM | Blue-green deployment, zero downtime |
| Users bị ảnh hưởng | MEDIUM | Deploy ngoài giờ cao điểm, thông báo trước |
| Bugs trong code mới | MEDIUM | Comprehensive testing, gradual rollout |
| Performance regression | LOW | Load testing trước, monitoring sau |

### 9.3. Timeline Tổng Quan

```
┌─────────────────────────────────────────────────────────────┐
│ WEEK 1: Preparation                                         │
│ ├─ Day 1-3: Backup & Audit                                 │
│ └─ Day 4-6: Fix Data Inconsistencies                       │
├─────────────────────────────────────────────────────────────┤
│ WEEK 2-3: Implementation                                    │
│ ├─ Day 7-9: Code Changes                                   │
│ └─ Day 10-11: Initial Testing                              │
├─────────────────────────────────────────────────────────────┤
│ WEEK 4: Testing                                             │
│ ├─ Day 12-14: Unit & Integration Tests                    │
│ ├─ Day 15-16: Load Testing                                │
│ └─ Day 17-18: Manual E2E Testing                          │
├─────────────────────────────────────────────────────────────┤
│ WEEK 5: Deployment                                          │
│ ├─ Day 19-20: Staging Deployment                          │
│ ├─ Day 21: Production Deployment                          │
│ └─ Day 22-23: Post-Deployment Monitoring                  │
├─────────────────────────────────────────────────────────────┤
│ WEEK 6+: Optimization                                       │
│ └─ Continuous monitoring, bug fixes, improvements          │
└─────────────────────────────────────────────────────────────┘

Total: ~6 weeks (có thể nhanh hơn nếu song song tasks)
```

### 9.4. Next Steps

1. **Review plan này với team** ✋ (Quan trọng!)
2. **Get approval** từ stakeholders
3. **Assign tasks** cho developers
4. **Bắt đầu Phase 1** - Backup

---

**Prepared by:** Claude (AI Assistant)
**Date:** 10/01/2026
**Status:** ⏸️ Awaiting Review & Approval
**Risk Level:** 🔴 HIGH (Payment system)
**Recommendation:** ✅ Proceed với caution, test thoroughly

---

## APPENDIX A: Files Reference

### Core Files to Modify:

```
backend/
├── services/
│   ├── paymentRequestService.js          # Main changes
│   └── systemReconciliation/
│       └── BalanceManagementService.js   # Update methods
├── models/
│   └── PaymentRequest.js                 # Simplify (data layer only)
├── routes/
│   └── paymentRequest.js                 # Add idempotency middleware
├── middleware/
│   └── idempotency.js                    # NEW
├── migrations/
│   ├── 060_fix_total_withdrawn.sql       # NEW
│   ├── 061_add_idempotency_keys.sql      # NEW
│   └── 062_create_balance_transactions.sql # NEW
└── scripts/
    ├── verify-complete-logic.js          # Existing
    └── validate-balance-consistency.js   # NEW
```

### Test Files to Create:

```
tests/
├── unit/
│   ├── payment-request.test.js           # NEW
│   └── balance-management.test.js        # NEW
├── integration/
│   └── payment-workflow.test.js          # NEW
└── load/
    └── payment-concurrent.test.js        # NEW
```

---

## APPENDIX B: SQL Verification Queries

```sql
-- Query 1: Find users with inconsistent balance
SELECT
  usb.user_id,
  u.email,
  usb.available_balance,
  usb.total_earned,
  usb.total_withdrawn,
  (SELECT COALESCE(SUM(requested_amount), 0)
   FROM payment_requests
   WHERE user_id = usb.user_id AND status = 'paid') as actual_withdrawn,
  (usb.total_withdrawn - (SELECT COALESCE(SUM(requested_amount), 0)
   FROM payment_requests
   WHERE user_id = usb.user_id AND status = 'paid')) as discrepancy
FROM user_system_balance usb
LEFT JOIN users u ON usb.user_id = u.id
WHERE ABS(usb.total_withdrawn - (
  SELECT COALESCE(SUM(requested_amount), 0)
  FROM payment_requests
  WHERE user_id = usb.user_id AND status = 'paid'
)) > 0.01;

-- Query 2: Find requests without idempotency key
SELECT id, user_id, requested_amount, status, created_at
FROM payment_requests
WHERE idempotency_key IS NULL;

-- Query 3: Find balance_transactions gaps
SELECT
  pr.id as payment_request_id,
  pr.status,
  pr.requested_amount,
  pr.created_at,
  COUNT(bt.id) as transaction_logs_count
FROM payment_requests pr
LEFT JOIN balance_transactions bt ON pr.id = bt.payment_request_id
WHERE pr.created_at > NOW() - INTERVAL '7 days'
GROUP BY pr.id, pr.status, pr.requested_amount, pr.created_at
HAVING COUNT(bt.id) = 0
  AND pr.status IN ('pending', 'confirmed', 'paid');
```

---

**END OF DOCUMENT**
