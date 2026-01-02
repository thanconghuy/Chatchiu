# Cơ Chế Rollback Cashback Khi Đơn Hàng Bị Từ Chối Sau Thanh Toán

**Tài liệu này mô tả chi tiết cách hệ thống xử lý rollback cashback khi đơn hàng bị merchant từ chối sau khi user đã được thanh toán**

---

## 📋 Mục lục

1. [Tổng quan vấn đề](#1-tổng-quan-vấn-đề)
2. [Cơ chế Debt Management](#2-cơ-chế-debt-management)
3. [Quy trình Chargeback tự động](#3-quy-trình-chargeback-tự-động)
4. [Debt Offset - Trừ nợ tự động](#4-debt-offset---trừ-nợ-tự-động)
5. [Block Withdrawal khi có nợ](#5-block-withdrawal-khi-có-nợ)
6. [Database Schema](#6-database-schema)
7. [Timeline và Scenarios](#7-timeline-và-scenarios)
8. [Code Implementation](#8-code-implementation)

---

## 1. Tổng quan vấn đề

### 1.1. Kịch bản xảy ra

```
User mua hàng → Merchant approve → System đối soát → User tạo payment request
→ Admin confirm → Admin mark as paid → User nhận tiền ✓

❌ SAU ĐÓ: Merchant từ chối đơn hàng (fraud, return, cancellation...)

💡 VẤN ĐỀ: User đã nhận tiền nhưng đơn hàng không hợp lệ
   → Cần thu hồi cashback đã trả
```

### 1.2. Giải pháp: Debt Management System

**Thay vì:**
- ❌ Yêu cầu user trả lại tiền (khó khả thi)
- ❌ Chấp nhận mất tiền (thiệt hại cho hệ thống)

**Hệ thống sử dụng:**
- ✅ **Debt Balance**: Ghi nhận khoản nợ vào tài khoản user
- ✅ **Auto Offset**: Tự động trừ nợ từ cashback mới
- ✅ **Withdrawal Block**: Chặn rút tiền khi còn nợ
- ✅ **Transparent Tracking**: Audit trail đầy đủ

---

## 2. Cơ chế Debt Management

### 2.1. User Balance Structure

**File:** `backend/services/systemReconciliation/BalanceManagementService.js`

Mỗi user có **5 loại balance:**

```javascript
{
  available_balance: 500000,    // Số dư khả dụng (có thể rút)
  pending_balance: 200000,      // Đang chờ xác nhận
  reserved_balance: 100000,     // Dự trữ (high-risk items)
  debt_balance: 50000,          // ⚠️ KHOẢN NỢ
  total_earned: 1000000,        // Tổng đã kiếm
  total_withdrawn: 150000       // Tổng đã rút
}
```

**Debt Balance:**
- Ghi nhận số tiền user nợ hệ thống
- Tự động tăng khi có chargeback
- Tự động giảm khi có cashback mới (debt offset)
- Block withdrawal khi > 0

### 2.2. Balance Transactions Log

**Table:** `user_balance_transactions`

**Các loại transaction:**
- `chargeback`: Thu hồi cashback (tạo nợ)
- `debt_offset`: Trừ nợ tự động từ cashback mới
- `payment_deducted`: Rút tiền
- `reconciliation_added`: Thêm cashback từ đối soát

---

## 3. Quy trình Chargeback tự động

### 3.1. Trigger: Merchant từ chối đơn hàng

**Nguồn webhook từ AccessTrade:**

```javascript
// File: backend/services/trackingService.js:149
if (existingConversion.status === 'pending' && newStatus === 'rejected') {
  // Conversion bị reject
  await Conversion.updateStatus(conversionId, 'rejected', approvalTime);

  // Remove from pending balance
  await User.updateBalance(userId, 'reject_pending', cashbackAmount);
}
```

**⚠️ VẤN ĐỀ:** Đoạn code trên chỉ xử lý khi conversion còn status = `'pending'`

**Nếu conversion đã được thanh toán (status = 'paid'):**
- Cần dùng `DebtManagementService.handleRejectedOrder()`

### 3.2. Handle Rejected Order After Payout

**File:** `backend/services/systemReconciliation/DebtManagementService.js:21`

**Method:** `handleRejectedOrder(params)`

**Input:**
```javascript
{
  conversionId: 'uuid',
  userId: 'uuid',
  cashbackAmount: 50000,
  reason: 'Merchant từ chối: Đơn hàng hoàn trả'
}
```

**Process:**

```javascript
static async handleRejectedOrder({ conversionId, userId, cashbackAmount, reason }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get current balance
    const balanceResult = await client.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    const currentBalance = balanceResult.rows[0];
    const balanceBefore = parseFloat(currentBalance.available_balance);
    const debtBefore = parseFloat(currentBalance.debt_balance);

    // 2. Deduct from available_balance and add to debt_balance
    await client.query(`
      INSERT INTO user_system_balance (
        user_id, available_balance, debt_balance, updated_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        available_balance = user_system_balance.available_balance - $2,
        debt_balance = user_system_balance.debt_balance + $3,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, cashbackAmount, cashbackAmount]);

    // 3. Log chargeback transaction
    await client.query(`
      INSERT INTO user_balance_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reserved_before,
        reserved_after,
        description,
        conversion_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    `, [
      userId,
      'chargeback',                              // ✓ Transaction type
      -cashbackAmount,                           // ✓ Negative amount
      balanceBefore,
      balanceBefore - cashbackAmount,
      debtBefore,
      debtBefore + cashbackAmount,
      `Đơn hàng bị từ chối sau đối soát: ${reason}`,
      conversionId
    ]);

    // 4. Update conversion status
    await client.query(`
      UPDATE conversions
      SET system_reconciliation_status = 'api_rejected'
      WHERE id = $1
    `, [conversionId]);

    // 5. Get conversion details for notification
    const convResult = await client.query(
      'SELECT order_code, merchant_name FROM conversions WHERE id = $1',
      [conversionId]
    );
    const conversion = convResult.rows[0];

    await client.query('COMMIT');

    // 6. Send notification to user (async)
    this.sendDebtNotification({
      userId,
      amount: cashbackAmount,
      orderCode: conversion?.order_code,
      merchantName: conversion?.merchant_name,
      reason
    }).catch(err => console.error('Failed to send debt notification:', err));

    return {
      conversionId,
      userId,
      chargebackAmount: cashbackAmount,
      newDebt: debtBefore + cashbackAmount,
      newBalance: balanceBefore - cashbackAmount
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 3.3. Kết quả sau chargeback

**Ví dụ cụ thể:**

**Trước khi chargeback:**
```javascript
{
  available_balance: 500000,
  debt_balance: 0
}
```

**Conversion bị reject: 50,000 VND**

**Sau khi chargeback:**
```javascript
{
  available_balance: 450000,    // Giảm 50k
  debt_balance: 50000           // Tăng 50k nợ
}
```

**Transaction log:**
```sql
INSERT INTO user_balance_transactions (
  transaction_type: 'chargeback',
  amount: -50000,
  balance_before: 500000,
  balance_after: 450000,
  reserved_before: 0,
  reserved_after: 50000,
  description: 'Đơn hàng bị từ chối sau đối soát: Merchant từ chối do hoàn trả'
)
```

---

## 4. Debt Offset - Trừ nợ tự động

### 4.1. Cơ chế tự động

**Khi user có cashback mới:**
1. Hệ thống kiểm tra `debt_balance`
2. Nếu có nợ → tự động trừ nợ TRƯỚC
3. Số còn lại mới vào `available_balance`

**File:** `backend/services/systemReconciliation/DebtManagementService.js:120`

**Method:** `offsetDebtWithCashback(userId, newCashback)`

### 4.2. Logic Offset

```javascript
static async offsetDebtWithCashback(userId, newCashback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get current debt
    const balanceResult = await client.query(
      'SELECT debt_balance FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    const currentDebt = parseFloat(balanceResult.rows[0]?.debt_balance || 0);

    // 2. No debt? → Full cashback goes to available
    if (currentDebt === 0) {
      await client.query('COMMIT');
      return {
        offsetAmount: 0,
        availableCashback: newCashback,
        remainingDebt: 0
      };
    }

    // 3. Calculate offset
    const offsetAmount = Math.min(newCashback, currentDebt);
    const availableCashback = newCashback - offsetAmount;
    const remainingDebt = currentDebt - offsetAmount;

    // 4. Update balance
    await client.query(`
      UPDATE user_system_balance
      SET debt_balance = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
    `, [remainingDebt, userId]);

    // 5. Log offset transaction
    if (offsetAmount > 0) {
      await client.query(`
        INSERT INTO user_balance_transactions (
          user_id,
          transaction_type,
          amount,
          description,
          created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `, [
        userId,
        'debt_offset',                          // ✓ Transaction type
        offsetAmount,
        `Trừ nợ tự động: ${offsetAmount}₫ từ cashback mới`
      ]);
    }

    await client.query('COMMIT');

    return {
      offsetAmount,
      availableCashback,
      remainingDebt
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 4.3. Ví dụ Offset

#### Scenario 1: Nợ nhiều hơn cashback mới

**Trước:**
```javascript
debt_balance: 200000
```

**Cashback mới: 50,000 VND**

**Sau offset:**
```javascript
{
  offsetAmount: 50000,           // Toàn bộ cashback trừ nợ
  availableCashback: 0,          // Không có gì vào available
  remainingDebt: 150000          // Còn nợ 150k
}
```

#### Scenario 2: Cashback mới nhiều hơn nợ

**Trước:**
```javascript
debt_balance: 30000
```

**Cashback mới: 100,000 VND**

**Sau offset:**
```javascript
{
  offsetAmount: 30000,           // Trừ hết nợ
  availableCashback: 70000,      // 70k vào available
  remainingDebt: 0               // Hết nợ
}
```

**Balance update:**
```javascript
{
  available_balance: +70000,     // Số còn lại
  debt_balance: 0                // Hết nợ
}
```

---

## 5. Block Withdrawal khi có nợ

### 5.1. Validation trước khi rút tiền

**File:** `backend/services/systemReconciliation/BalanceManagementService.js:61`

**Method:** `canWithdraw(userId, amount)`

```javascript
static async canWithdraw(userId, amount) {
  const balance = await this.getUserBalance(userId);
  const minAmount = 100000; // 100k VND minimum

  const available = parseFloat(balance.available_balance);
  const debt = parseFloat(balance.debt_balance || 0);

  // ⚠️ BLOCK: User có nợ
  if (debt > 0) {
    return {
      eligible: false,
      reason: `Bạn có khoản nợ ${this.formatMoney(debt)} chưa thanh toán. Vui lòng thanh toán nợ trước khi rút tiền.`,
      available,
      debt,
      requested: amount
    };
  }

  // Check minimum amount
  if (amount < minAmount) {
    return {
      eligible: false,
      reason: `Số tiền tối thiểu là ${this.formatMoney(minAmount)}`,
      available,
      requested: amount
    };
  }

  // Check available balance
  if (amount > available) {
    return {
      eligible: false,
      reason: `Số dư khả dụng không đủ (${this.formatMoney(available)})`,
      available,
      requested: amount
    };
  }

  // ✓ Pass all checks
  return {
    eligible: true,
    reason: 'Đủ điều kiện rút tiền',
    available,
    requested: amount,
    remaining: available - amount
  };
}
```

### 5.2. UI/UX khi user có nợ

**Frontend hiển thị:**

```
┌─────────────────────────────────────────┐
│ ⚠️ Tài khoản có khoản nợ                │
├─────────────────────────────────────────┤
│ Số dư khả dụng:    450,000 ₫            │
│ Khoản nợ:          50,000 ₫             │
│                                         │
│ Lý do: Đơn hàng #SP123456 tại Shopee    │
│ đã bị merchant từ chối.                 │
│                                         │
│ 💡 Cashback mới sẽ tự động trừ nợ      │
│    trước khi vào số dư khả dụng.        │
│                                         │
│ [ Xem lịch sử nợ ]                      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🚫 Rút tiền                             │
├─────────────────────────────────────────┤
│ Không thể rút tiền khi còn nợ.          │
│ Vui lòng chờ cashback mới để trừ nợ.    │
└─────────────────────────────────────────┘
```

---

## 6. Database Schema

### 6.1. Table: `user_system_balance`

```sql
CREATE TABLE user_system_balance (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  available_balance DECIMAL(15, 2) DEFAULT 0,    -- Số dư khả dụng
  pending_balance DECIMAL(15, 2) DEFAULT 0,      -- Đang chờ
  reserved_balance DECIMAL(15, 2) DEFAULT 0,     -- Dự trữ
  debt_balance DECIMAL(15, 2) DEFAULT 0,         -- ⚠️ KHOẢN NỢ
  total_earned DECIMAL(15, 2) DEFAULT 0,         -- Tổng kiếm
  total_withdrawn DECIMAL(15, 2) DEFAULT 0,      -- Tổng rút
  last_reconciliation_date TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for debt queries
CREATE INDEX idx_user_balance_debt
ON user_system_balance(debt_balance)
WHERE debt_balance > 0;
```

### 6.2. Table: `user_balance_transactions`

```sql
CREATE TABLE user_balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  transaction_type VARCHAR(50),              -- 'chargeback' | 'debt_offset' | ...
  amount DECIMAL(15, 2),                     -- Số tiền (negative for chargeback)
  balance_before DECIMAL(15, 2),             -- Balance trước transaction
  balance_after DECIMAL(15, 2),              -- Balance sau transaction
  reserved_before DECIMAL(15, 2),            -- Debt balance trước (for chargeback)
  reserved_after DECIMAL(15, 2),             -- Debt balance sau
  description TEXT,
  conversion_id UUID,                        -- Link đến conversion
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit queries
CREATE INDEX idx_balance_transactions_user_type
ON user_balance_transactions(user_id, transaction_type, created_at DESC);

-- Index for chargeback queries
CREATE INDEX idx_balance_transactions_chargeback
ON user_balance_transactions(transaction_type, created_at DESC)
WHERE transaction_type IN ('chargeback', 'debt_offset');
```

### 6.3. Conversion status for rejected after payout

```sql
-- Update conversion table
ALTER TABLE conversions
ADD COLUMN system_reconciliation_status VARCHAR(50);

-- Values:
-- NULL                  : Chưa đối soát
-- 'reconciled'          : Đã đối soát thành công
-- 'api_rejected'        : ⚠️ Bị reject sau khi đối soát
-- 'chargeback_applied'  : Đã thực hiện chargeback
```

---

## 7. Timeline và Scenarios

### 7.1. Timeline đầy đủ từ order đến chargeback

```
Ngày 1: User mua hàng Shopee - 1,000,000 VND
  └─▶ Conversion created (status = 'pending')
  └─▶ Cashback: 50,000 VND (5%)

Ngày 7: Shopee approve đơn hàng
  └─▶ Conversion status = 'approved'
  └─▶ available_balance += 50,000

Ngày 15: System reconciliation tự động
  └─▶ Item added to system_reconciliation_items
  └─▶ system_reconciliation_status = 'reconciled'

Ngày 20: User tạo payment request (50,000 VND)
  └─▶ payment_requests.status = 'pending'
  └─▶ Items linked via payment_system_reconciliation_mapping

Ngày 22: Admin confirm
  └─▶ payment_requests.status = 'confirmed'
  └─▶ ✓ AUTO: payment_status = 'confirmed'

Ngày 25: Admin mark as paid
  └─▶ payment_requests.status = 'paid'
  └─▶ ✓ AUTO: payment_status = 'paid'
  └─▶ User nhận 50,000 VND vào tài khoản ngân hàng ✓

❌ Ngày 30: Shopee từ chối đơn hàng (user hoàn trả sản phẩm)
  └─▶ AccessTrade webhook: status = 'rejected'
  └─▶ 🚨 TRIGGER: DebtManagementService.handleRejectedOrder()

  Process:
  1. available_balance: 500,000 → 450,000 (-50k)
  2. debt_balance: 0 → 50,000 (+50k)
  3. Transaction log: type = 'chargeback', amount = -50,000
  4. conversion.system_reconciliation_status = 'api_rejected'
  5. Send notification to user

  User nhận email:
  "Đơn hàng #SP123456 tại Shopee đã bị merchant từ chối.
   Số tiền 50,000₫ đã được ghi nợ vào tài khoản của bạn."

Ngày 35: User có conversion mới được approve (100,000 VND)
  └─▶ 🔄 AUTO OFFSET:
      - offsetAmount: 50,000 (trừ hết nợ)
      - availableCashback: 50,000 (vào available)
      - remainingDebt: 0

  └─▶ Balance update:
      - available_balance: 450,000 → 500,000 (+50k)
      - debt_balance: 50,000 → 0 (hết nợ)

  └─▶ Transaction log: type = 'debt_offset', amount = 50,000

  User nhận thông báo:
  "Cashback mới 100,000₫ đã được dùng để thanh toán khoản nợ 50,000₫.
   Số dư khả dụng: +50,000₫"
```

### 7.2. Scenario: User có nhiều conversions bị reject

**Initial state:**
```javascript
{
  available_balance: 1000000,
  debt_balance: 0
}
```

**Conversion 1 reject: 50,000 VND**
```javascript
{
  available_balance: 950000,
  debt_balance: 50000
}
```

**Conversion 2 reject: 30,000 VND**
```javascript
{
  available_balance: 920000,
  debt_balance: 80000        // Nợ tích lũy
}
```

**User cố rút 100,000 VND:**
```
❌ BLOCKED
Lý do: Bạn có khoản nợ 80,000₫ chưa thanh toán.
Vui lòng thanh toán nợ trước khi rút tiền.
```

**Cashback mới: 150,000 VND**
```javascript
// Auto offset
offsetAmount: 80000        // Trừ hết nợ
availableCashback: 70000   // Còn lại vào available

// Final balance
{
  available_balance: 990000,  // 920k + 70k
  debt_balance: 0             // Hết nợ
}
```

**Giờ user có thể rút tiền ✓**

---

## 8. Code Implementation

### 8.1. Khi nào gọi handleRejectedOrder()?

**Trigger points:**

1. **Manual admin action** (Admin dashboard)
2. **AccessTrade webhook** khi conversion status thay đổi
3. **API sync job** phát hiện discrepancy

**Example integration:**

```javascript
// File: backend/services/trackingService.js
// Khi nhận webhook từ AccessTrade

async function handleConversionWebhook(atData) {
  const conversion = await Conversion.findByATId(atData._id);

  if (!conversion) return;

  const newStatus = atData.status.toLowerCase();

  // ⚠️ CRITICAL: Conversion đã thanh toán nhưng bị reject
  if (
    conversion.payment_status === 'paid' &&
    newStatus === 'rejected'
  ) {
    // Trigger chargeback
    await DebtManagementService.handleRejectedOrder({
      conversionId: conversion.id,
      userId: conversion.user_id,
      cashbackAmount: conversion.cashback_amount,
      reason: `Merchant từ chối: ${atData.reject_reason || 'Không rõ lý do'}`
    });

    logger.warn('Chargeback applied for paid conversion', {
      conversionId: conversion.id,
      userId: conversion.user_id,
      amount: conversion.cashback_amount
    });
  }
  // ... existing logic for other status changes
}
```

### 8.2. Integration với Payment Request

**Khi user tạo payment request:**

```javascript
// File: backend/services/paymentSystemReconciliationService.js
// Layer 1 validation

const validation = await validatePaymentRequest(userId, requestedAmount);

// Check debt
const debtCheck = await DebtManagementService.checkUserDebt(userId);

if (debtCheck.hasDebt) {
  return {
    isValid: false,
    errorCode: 'HAS_DEBT',
    errorMessage: `Không thể tạo yêu cầu thanh toán. Bạn có khoản nợ ${debtCheck.debtAmount}₫ chưa thanh toán.`
  };
}

// ... continue with validation
```

### 8.3. Integration với Reconciliation

**Khi add cashback mới:**

```javascript
// File: backend/services/systemReconciliation/SystemReconciliationService.js
// Sau khi finalize reconciliation

async function addCashbackToUser(userId, cashbackAmount) {
  // 1. Check và offset debt trước
  const offsetResult = await DebtManagementService.offsetDebtWithCashback(
    userId,
    cashbackAmount
  );

  // 2. Add available cashback (sau khi trừ nợ)
  if (offsetResult.availableCashback > 0) {
    await BalanceManagementService.addAvailableBalance(
      userId,
      offsetResult.availableCashback
    );
  }

  // 3. Log transaction
  logger.info('Cashback added with debt offset', {
    userId,
    totalCashback: cashbackAmount,
    offsetAmount: offsetResult.offsetAmount,
    availableAmount: offsetResult.availableCashback,
    remainingDebt: offsetResult.remainingDebt
  });

  // 4. Send notification
  if (offsetResult.offsetAmount > 0) {
    await NotificationService.send({
      userId,
      type: 'debt_offset',
      message: `Cashback mới ${cashbackAmount}₫ đã được dùng để thanh toán khoản nợ ${offsetResult.offsetAmount}₫. Số dư khả dụng: +${offsetResult.availableCashback}₫`
    });
  }
}
```

### 8.4. Admin Dashboard

**Endpoints cần thiết:**

```javascript
// 1. View users with debt
GET /api/admin/users/debt
Response: {
  users: [
    {
      user_id: '...',
      full_name: 'Nguyễn Văn A',
      debt_balance: 50000,
      available_balance: 450000,
      created_at: '...'
    }
  ]
}

// 2. View debt history for user
GET /api/admin/users/:userId/debt-history
Response: {
  transactions: [
    {
      transaction_type: 'chargeback',
      amount: -50000,
      description: 'Đơn hàng bị từ chối sau đối soát: ...',
      created_at: '...'
    },
    {
      transaction_type: 'debt_offset',
      amount: 50000,
      description: 'Trừ nợ tự động: 50000₫ từ cashback mới',
      created_at: '...'
    }
  ]
}

// 3. Manual chargeback (admin action)
POST /api/admin/conversions/:id/chargeback
Body: {
  reason: 'Admin manual chargeback - Fraud detected'
}

// 4. Forgive debt (admin action - exceptional cases)
POST /api/admin/users/:userId/forgive-debt
Body: {
  amount: 50000,
  reason: 'Customer service exception'
}
```

---

## 📊 Tổng Kết

### Workflow hoàn chỉnh

```
┌────────────────────────────────────────────────────────────┐
│ 1. CONVERSION BỊ REJECT SAU KHI ĐÃ THANH TOÁN             │
├────────────────────────────────────────────────────────────┤
│ Trigger: AccessTrade webhook hoặc Admin manual action      │
│                                                            │
│ DebtManagementService.handleRejectedOrder({               │
│   conversionId,                                           │
│   userId,                                                 │
│   cashbackAmount,                                         │
│   reason                                                  │
│ })                                                        │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 2. CHARGEBACK PROCESS                                      │
├────────────────────────────────────────────────────────────┤
│ ✓ available_balance -= cashbackAmount                     │
│ ✓ debt_balance += cashbackAmount                          │
│ ✓ Log transaction (type = 'chargeback')                   │
│ ✓ Update conversion: system_reconciliation_status =       │
│   'api_rejected'                                          │
│ ✓ Send notification to user                               │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 3. DEBT STATE                                              │
├────────────────────────────────────────────────────────────┤
│ User có khoản nợ trong hệ thống                            │
│                                                            │
│ Restrictions:                                              │
│ ❌ Không thể tạo payment request                          │
│ ❌ Không thể rút tiền                                      │
│ ✓ Vẫn có thể mua hàng và kiếm cashback                    │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 4. USER KIẾM CASHBACK MỚI                                  │
├────────────────────────────────────────────────────────────┤
│ Trigger: Reconciliation adds new cashback                 │
│                                                            │
│ DebtManagementService.offsetDebtWithCashback(             │
│   userId,                                                 │
│   newCashback                                             │
│ )                                                         │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 5. AUTO OFFSET                                             │
├────────────────────────────────────────────────────────────┤
│ offsetAmount = min(newCashback, currentDebt)              │
│ availableCashback = newCashback - offsetAmount            │
│                                                            │
│ ✓ debt_balance -= offsetAmount                            │
│ ✓ available_balance += availableCashback                  │
│ ✓ Log transaction (type = 'debt_offset')                  │
│ ✓ Send notification                                       │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ 6. DEBT CLEARED                                            │
├────────────────────────────────────────────────────────────┤
│ debt_balance = 0                                          │
│                                                            │
│ User quay lại normal state:                                │
│ ✓ Có thể tạo payment request                              │
│ ✓ Có thể rút tiền                                          │
└────────────────────────────────────────────────────────────┘
```

### Key Features

✅ **Tự động hoàn toàn:**
- Chargeback tự động khi conversion reject
- Debt offset tự động từ cashback mới
- Không cần admin intervention

✅ **Transparent:**
- User thấy rõ khoản nợ
- Lịch sử chargeback đầy đủ
- Notification mỗi khi có thay đổi

✅ **Secure:**
- Block withdrawal khi có nợ
- Audit trail đầy đủ
- Database transactions (ACID)

✅ **Fair:**
- User chỉ trả đúng số tiền đã nhận sai
- Không charge thêm phí penalty
- Cashback mới vẫn được tính bình thường

---

**Document Version:** 1.0
**Last Updated:** 2026-01-02
**Author:** Claude Code (generated from codebase analysis)
**Status:** ✅ Complete

**Related Files:**
- [backend/services/systemReconciliation/DebtManagementService.js](backend/services/systemReconciliation/DebtManagementService.js)
- [backend/services/systemReconciliation/BalanceManagementService.js](backend/services/systemReconciliation/BalanceManagementService.js)
