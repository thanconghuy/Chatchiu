# KẾ HOẠCH THIẾT KẾ LẠI TOÀN BỘ PAYMENT WORKFLOW

**Ngày:** 10/01/2026
**Mục đích:** Thiết kế lại hệ thống thanh toán an toàn, chính xác, tuân thủ best practices quốc tế

---

## 📚 NGHIÊN CỨU TỪ CÁC NGUỒN TIN CẬY

### 1. Payment Approval Process Best Practices

**Nguồn:** [Trustpair](https://trustpair.com/blog/payment-approval-process/), [Ramp](https://ramp.com/blog/payment-approval-process)

**Nguyên tắc chính:**

1. **Segregation of Duties (Phân tách quyền hạn)**
   - Không một người nào có toàn quyền kiểm soát giao dịch tài chính
   - Tạo hệ thống kiểm tra và cân đối (checks and balances)
   - Giảm thiểu rủi ro gian lận

2. **Multi-Level Approvals (Phê duyệt nhiều cấp)**
   - Phê duyệt phụ thuộc vào: số tiền, loại chi phí, chính sách công ty
   - Một số yêu cầu chỉ cần 1 người duyệt, số khác cần nhiều cấp

3. **Transaction Tiering (Phân cấp giao dịch)**
   - Xác định ngưỡng số tiền cho từng cấp phê duyệt
   - Tránh làm quá tải hệ thống

4. **Complete Audit Trail (Nhật ký kiểm toán đầy đủ)**
   - Ghi lại mọi thay đổi, ai làm, khi nào, tại sao
   - Hỗ trợ tuân thủ và phát hiện gian lận

---

### 2. Double-Entry Bookkeeping (Kế toán hai bên)

**Nguồn:** [Square Engineering](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/), [Modern Treasury](https://www.moderntreasury.com/journal/accounting-for-developers-part-ii)

**Nguyên lý cốt lõi:**

```
Mỗi giao dịch có 2 mặt:
- DEBIT (Nợ): Số tiền ra khỏi tài khoản (-)
- CREDIT (Có): Số tiền vào tài khoản (+)

Tổng DEBIT = Tổng CREDIT (luôn luôn cân bằng)
```

**Ví dụ:** User rút tiền 100,000đ

```
Entry #1:
  Account: user_balance (DEBIT -100,000đ)
  Account: pending_withdrawal (CREDIT +100,000đ)
  → Balance: 0 (cân bằng)

Entry #2 (khi admin mark paid):
  Account: pending_withdrawal (DEBIT -100,000đ)
  Account: cash_out (CREDIT +100,000đ)
  → Balance: 0 (cân bằng)
```

**Lợi ích:**

✅ **Immutability (Bất biến):** Không bao giờ XÓA hoặc SỬA giao dịch, chỉ TẠO MỚI
✅ **Consistency (Nhất quán):** Tổng luôn = 0, không bao giờ mất tiền
✅ **Audit Trail:** Lịch sử đầy đủ mọi thay đổi
✅ **Reconciliation:** Dễ đối soát, phát hiện sai sót

**Công ty áp dụng:**
- Square: Hệ thống "Books" với Google Cloud Spanner
- Uber: 2-year, 40-engineer migration project (2018)
- Stripe, PayPal, Adyen: Tất cả đều dùng double-entry

---

### 3. Idempotency (Tính bất biến khi retry)

**Nguồn:** [Stripe](https://medium.com/@sahintalha1/the-way-psps-such-as-paypal-stripe-and-adyen-prevent-duplicate-payment-idempotency-keys-615845c185bf), [Adyen](https://docs.adyen.com/development-resources/api-idempotency), [CockroachDB](https://www.cockroachlabs.com/blog/idempotency-in-finance/)

**Vấn đề:**

```
User click "Tạo yêu cầu" → Network timeout → User click lại
→ ❌ Tạo 2 requests cho cùng 1 ý định!
```

**Giải pháp: Idempotency Key**

```javascript
// Client generates UUID
const idempotencyKey = uuid.v4()

// Send with request
POST /api/payment-requests
Headers: {
  'Idempotency-Key': 'a7b8c9d0-...'
}
Body: { amount: 50000, ... }

// Server checks
if (existingRequest = findByIdempotencyKey(key)) {
  return existingRequest // Return cached, không tạo mới
}

// First time → Create new
const newRequest = create(...)
saveIdempotencyKey(key, newRequest)
return newRequest
```

**Best Practices:**

✅ UUID v4 (random) cho mỗi request
✅ Cache 24-48 giờ
✅ Check TRƯỚC KHI bắt đầu transaction
✅ Return kết quả cũ nếu key trùng

---

### 4. ACID Transactions

**Nguồn:** [Redis](https://redis.io/glossary/acid-transactions/), [DataCamp](https://www.datacamp.com/blog/acid-transactions), [TechTarget](https://www.techtarget.com/searchdatamanagement/definition/ACID)

**4 Thuộc tính:**

1. **Atomicity (Nguyên tử):**
   ```
   Chuyển 100k từ A → B:
     - Trừ A: -100k
     - Cộng B: +100k
   → HOẶC cả 2 thành công, HOẶC cả 2 rollback
   → KHÔNG BAO GIỜ chỉ 1 trong 2 xảy ra
   ```

2. **Consistency (Nhất quán):**
   ```
   Before: A=1000k, B=500k, Total=1500k
   After: A=900k, B=600k, Total=1500k ✅

   KHÔNG BAO GIỜ: Total ≠ 1500k
   ```

3. **Isolation (Cô lập):**
   ```
   Transaction 1: Chuyển 100k từ A → B
   Transaction 2: Chuyển 50k từ A → C

   → Mỗi transaction thấy DB như thể chỉ có mình
   → KHÔNG can thiệp lẫn nhau
   ```

4. **Durability (Bền vững):**
   ```
   Transaction commit → GHI VÀO DISK
   → Server crash ngay sau đó
   → Data KHÔNG mất (đã lưu transaction log)
   ```

**Implementation trong PostgreSQL:**

```javascript
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // Lock row để tránh race condition
  await client.query(`
    SELECT available_balance
    FROM user_balance
    WHERE user_id = $1
    FOR UPDATE
  `, [userId])

  // Update balance
  await client.query(`
    UPDATE user_balance
    SET available_balance = available_balance - $2
    WHERE user_id = $1
  `, [userId, amount])

  // Insert transaction log
  await client.query(`
    INSERT INTO balance_transactions (...)
  `)

  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
}
```

---

## 🎯 PHÂN TÍCH VẤN ĐỀ HỆ THỐNG HIỆN TẠI

### ❌ Vi phạm Best Practices:

1. **KHÔNG có Segregation of Duties:**
   - User tự tạo request NHƯNG balance không bị lock
   - Admin mark paid mới trừ balance
   - → User có thể abuse (tạo nhiều requests)

2. **KHÔNG áp dụng Double-Entry:**
   - Chỉ có 1 bên: `user_system_balance.available_balance -= amount`
   - Không có "bên kia" (pending_withdrawal account)
   - → Khó audit, khó reconcile

3. **KHÔNG có Idempotency:**
   - User click "Tạo yêu cầu" 2 lần → Tạo 2 requests
   - Admin click "Mark Paid" 2 lần → Trừ balance 2 lần?
   - → Risk duplicate charges

4. **Vi phạm ACID (một phần):**
   - ✅ Atomicity: OK (có dùng BEGIN/COMMIT)
   - ❌ Consistency: SAI (total_withdrawn ≠ SUM(paid_requests))
   - ⚠️ Isolation: Chưa rõ (có FOR UPDATE không?)
   - ✅ Durability: OK (PostgreSQL handles)

5. **KHÔNG có proper Audit Trail:**
   - Có `payment_request_logs` NHƯNG không log balance changes
   - Không biết balance thay đổi khi nào, do ai, vì request nào

---

## 🏗️ THIẾT KẾ MỚI - CHUẨN QUỐC TẾ

### A. Database Schema - Double-Entry Ledger

```sql
-- 1. ACCOUNTS TABLE (Chart of Accounts)
CREATE TABLE ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(50) UNIQUE NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL, -- 'asset', 'liability', 'equity', 'revenue', 'expense'
  is_debit_positive BOOLEAN NOT NULL, -- true for assets/expenses, false for liabilities/revenue
  parent_account_id UUID REFERENCES ledger_accounts(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Example accounts:
-- 1000: User Available Balance (asset, debit+)
-- 2000: Pending Withdrawals (liability, credit+)
-- 3000: Cash Out (expense, debit+)
-- 4000: Cashback Earned (revenue, credit+)

-- 2. JOURNAL ENTRIES (Transactions)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date TIMESTAMP NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  reference_type VARCHAR(50), -- 'payment_request', 'reconciliation', 'refund', etc.
  reference_id UUID, -- ID của payment_request, reconciliation, etc.
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),

  -- Idempotency
  idempotency_key VARCHAR(255) UNIQUE,

  -- Audit
  metadata JSONB,

  CONSTRAINT check_balanced CHECK (
    (SELECT SUM(amount) FROM posting_entries WHERE journal_entry_id = id) = 0
  )
);

-- 3. POSTING ENTRIES (Debits and Credits)
CREATE TABLE posting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
  account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  amount DECIMAL(15,2) NOT NULL, -- Positive = debit, Negative = credit
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Link to entities
  user_id UUID REFERENCES users(id),
  payment_request_id UUID REFERENCES payment_requests(id),
  system_conversion_id UUID REFERENCES system_conversions(id)
);

-- Index for balance calculation
CREATE INDEX idx_posting_entries_account_user
ON posting_entries(account_id, user_id);

-- 4. BALANCE VIEW (Calculated from postings)
CREATE VIEW user_balances AS
SELECT
  user_id,
  SUM(CASE WHEN a.account_code = '1000' THEN p.amount ELSE 0 END) as available_balance,
  SUM(CASE WHEN a.account_code = '2000' THEN -p.amount ELSE 0 END) as pending_withdrawals,
  SUM(CASE WHEN a.account_code = '4000' THEN -p.amount ELSE 0 END) as total_earned,
  SUM(CASE WHEN a.account_code = '3000' THEN p.amount ELSE 0 END) as total_withdrawn
FROM posting_entries p
JOIN ledger_accounts a ON p.account_id = a.id
WHERE user_id IS NOT NULL
GROUP BY user_id;
```

### B. Payment Request Schema (Updated)

```sql
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),

  -- Amount
  requested_amount DECIMAL(15,2) NOT NULL,

  -- Bank info (encrypted)
  bank_name VARCHAR(255) NOT NULL,
  bank_account_number_encrypted TEXT NOT NULL,
  bank_account_name_encrypted TEXT NOT NULL,
  bank_branch VARCHAR(255),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending → confirmed → paid
  -- pending → rejected
  -- pending → cancelled

  -- Idempotency
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  paid_at TIMESTAMP,
  rejected_at TIMESTAMP,
  cancelled_at TIMESTAMP,

  -- Who performed actions
  created_by UUID REFERENCES users(id), -- Same as user_id usually
  confirmed_by UUID REFERENCES users(id), -- Admin
  paid_by UUID REFERENCES users(id), -- Admin
  rejected_by UUID REFERENCES users(id), -- Admin
  cancelled_by UUID REFERENCES users(id), -- User

  -- Transaction reference (when paid)
  transaction_reference VARCHAR(255),

  -- Linked journal entries
  reserve_journal_entry_id UUID REFERENCES journal_entries(id), -- Created when pending
  payment_journal_entry_id UUID REFERENCES journal_entries(id), -- Created when paid
  refund_journal_entry_id UUID REFERENCES journal_entries(id), -- Created when cancelled

  -- Notes
  user_notes TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  cancellation_reason TEXT,

  -- Audit
  metadata JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Constraints
ALTER TABLE payment_requests
ADD CONSTRAINT check_status_valid
CHECK (status IN ('pending', 'confirmed', 'paid', 'rejected', 'cancelled'));

ALTER TABLE payment_requests
ADD CONSTRAINT check_amount_positive
CHECK (requested_amount > 0);
```

---

## 🔄 WORKFLOWS MỚI - CHI TIẾT

### WORKFLOW 1: User Tạo Payment Request

```javascript
/**
 * Create Payment Request with Double-Entry Ledger
 *
 * @param {Object} data
 * @param {string} data.userId
 * @param {number} data.requestedAmount
 * @param {string} data.bankName
 * @param {string} data.bankAccountNumber
 * @param {string} data.bankAccountName
 * @param {string} data.idempotencyKey - REQUIRED (UUID from client)
 * @returns {Promise<Object>}
 */
async function createPaymentRequest(data) {
  const {
    userId,
    requestedAmount,
    bankName,
    bankAccountNumber,
    bankAccountName,
    bankBranch,
    notes,
    idempotencyKey // ← REQUIRED
  } = data;

  // ========================
  // STEP 0: Idempotency Check
  // ========================
  const existing = await db.query(`
    SELECT * FROM payment_requests
    WHERE idempotency_key = $1
  `, [idempotencyKey]);

  if (existing.rows.length > 0) {
    logger.info('Idempotent request detected', { idempotencyKey });
    return existing.rows[0]; // Return cached result
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ========================
    // STEP 1: Validate Settings
    // ========================
    const minAmount = await getSetting('min_withdrawal_amount', 40000);
    const maxAmount = await getSetting('max_withdrawal_amount', 500000);

    if (requestedAmount < minAmount) {
      throw new ValidationError(`Số tiền tối thiểu ${minAmount}đ`);
    }

    if (requestedAmount > maxAmount) {
      throw new ValidationError(`Số tiền tối đa ${maxAmount}đ`);
    }

    // ========================
    // STEP 2: Check Available Balance (with FOR UPDATE lock)
    // ========================
    const balanceResult = await client.query(`
      SELECT
        COALESCE(SUM(CASE WHEN a.account_code = '1000' THEN p.amount ELSE 0 END), 0) as available_balance
      FROM posting_entries p
      JOIN ledger_accounts a ON p.account_id = a.id
      WHERE p.user_id = $1
      FOR UPDATE OF p
    `, [userId]);

    const availableBalance = parseFloat(balanceResult.rows[0].available_balance);

    if (requestedAmount > availableBalance) {
      throw new ValidationError(
        `Số dư không đủ. Khả dụng: ${availableBalance}đ, Yêu cầu: ${requestedAmount}đ`
      );
    }

    // ========================
    // STEP 3: Create Payment Request
    // ========================
    const paymentRequestResult = await client.query(`
      INSERT INTO payment_requests (
        user_id,
        requested_amount,
        bank_name,
        bank_account_number_encrypted,
        bank_account_name_encrypted,
        bank_branch,
        user_notes,
        status,
        idempotency_key,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
      RETURNING *
    `, [
      userId,
      requestedAmount,
      bankName,
      encrypt(bankAccountNumber),
      encrypt(bankAccountName),
      bankBranch,
      notes,
      idempotencyKey,
      userId
    ]);

    const paymentRequest = paymentRequestResult.rows[0];

    // ========================
    // STEP 4: Create Journal Entry (RESERVE BALANCE)
    // ========================
    // Double-Entry:
    //   DEBIT: Pending Withdrawals (+requestedAmount) [Account 2000]
    //   CREDIT: Available Balance (-requestedAmount) [Account 1000]

    const journalEntryResult = await client.query(`
      INSERT INTO journal_entries (
        entry_date,
        description,
        reference_type,
        reference_id,
        created_by,
        idempotency_key
      ) VALUES (NOW(), $1, 'payment_request_reserve', $2, $3, $4)
      RETURNING id
    `, [
      `Reserve balance for payment request ${paymentRequest.id.substring(0, 8)}`,
      paymentRequest.id,
      userId,
      `${idempotencyKey}-reserve`
    ]);

    const journalEntryId = journalEntryResult.rows[0].id;

    // Get account IDs
    const accountsResult = await client.query(`
      SELECT id, account_code FROM ledger_accounts
      WHERE account_code IN ('1000', '2000')
    `);

    const accounts = {};
    accountsResult.rows.forEach(row => {
      accounts[row.account_code] = row.id;
    });

    // DEBIT: Pending Withdrawals (+amount)
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['2000'], // Pending Withdrawals
      requestedAmount, // DEBIT (positive)
      'Reserve for withdrawal',
      userId,
      paymentRequest.id
    ]);

    // CREDIT: Available Balance (-amount)
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['1000'], // Available Balance
      -requestedAmount, // CREDIT (negative)
      'Withdraw reserve',
      userId,
      paymentRequest.id
    ]);

    // Link journal entry to payment request
    await client.query(`
      UPDATE payment_requests
      SET reserve_journal_entry_id = $2
      WHERE id = $1
    `, [paymentRequest.id, journalEntryId]);

    await client.query('COMMIT');

    logger.success('Payment request created', {
      paymentRequestId: paymentRequest.id,
      userId,
      requestedAmount,
      journalEntryId
    });

    return paymentRequest;

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create payment request', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}
```

**Kết quả:**

```sql
-- payment_requests table:
INSERT payment_requests (
  id='uuid-123',
  user_id='user-456',
  requested_amount=50000,
  status='pending',
  idempotency_key='...'
)

-- journal_entries table:
INSERT journal_entries (
  id='journal-789',
  description='Reserve balance for payment request...',
  reference_type='payment_request_reserve',
  reference_id='uuid-123'
)

-- posting_entries table:
INSERT posting_entries (account='2000-Pending', amount=+50000) -- DEBIT
INSERT posting_entries (account='1000-Available', amount=-50000) -- CREDIT

-- user_balances view (auto-calculated):
-- available_balance: 100,000 → 50,000 (giảm 50k)
-- pending_withdrawals: 0 → 50,000 (tăng 50k)
```

---

### WORKFLOW 2: User Cancel Request

```javascript
/**
 * Cancel Payment Request (Reverse Journal Entry)
 */
async function cancelPaymentRequest(paymentRequestId, userId, reason) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get payment request
    const prResult = await client.query(`
      SELECT * FROM payment_requests
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `, [paymentRequestId, userId]);

    if (prResult.rows.length === 0) {
      throw new Error('Payment request not found or unauthorized');
    }

    const paymentRequest = prResult.rows[0];

    // Validate status
    if (paymentRequest.status !== 'pending') {
      throw new Error('Can only cancel pending requests');
    }

    if (paymentRequest.cancelled_at) {
      throw new Error('Already cancelled');
    }

    // Update payment request
    await client.query(`
      UPDATE payment_requests
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = $2,
        cancellation_reason = $3
      WHERE id = $1
    `, [paymentRequestId, userId, reason]);

    // ========================
    // REVERSE Journal Entry
    // ========================
    // Double-Entry (OPPOSITE of reserve):
    //   DEBIT: Available Balance (+requestedAmount) [Account 1000]
    //   CREDIT: Pending Withdrawals (-requestedAmount) [Account 2000]

    const journalEntryResult = await client.query(`
      INSERT INTO journal_entries (
        entry_date,
        description,
        reference_type,
        reference_id,
        created_by,
        idempotency_key
      ) VALUES (NOW(), $1, 'payment_request_cancel', $2, $3, $4)
      RETURNING id
    `, [
      `Cancel payment request ${paymentRequestId.substring(0, 8)}`,
      paymentRequestId,
      userId,
      `${paymentRequestId}-cancel`
    ]);

    const journalEntryId = journalEntryResult.rows[0].id;

    // Get accounts
    const accountsResult = await client.query(`
      SELECT id, account_code FROM ledger_accounts
      WHERE account_code IN ('1000', '2000')
    `);

    const accounts = {};
    accountsResult.rows.forEach(row => {
      accounts[row.account_code] = row.id;
    });

    // DEBIT: Available Balance (+amount) - REFUND
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['1000'], // Available Balance
      paymentRequest.requested_amount, // DEBIT (positive)
      'Refund cancelled withdrawal',
      userId,
      paymentRequestId
    ]);

    // CREDIT: Pending Withdrawals (-amount)
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['2000'], // Pending Withdrawals
      -paymentRequest.requested_amount, // CREDIT (negative)
      'Release withdrawal reserve',
      userId,
      paymentRequestId
    ]);

    // Link journal entry
    await client.query(`
      UPDATE payment_requests
      SET refund_journal_entry_id = $2
      WHERE id = $1
    `, [paymentRequestId, journalEntryId]);

    await client.query('COMMIT');

    logger.success('Payment request cancelled', {
      paymentRequestId,
      userId,
      amount: paymentRequest.requested_amount
    });

    return paymentRequest;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Kết quả:**

```sql
-- payment_requests:
UPDATE payment_requests SET status='cancelled', cancelled_at=NOW()

-- journal_entries:
INSERT journal_entries (
  description='Cancel payment request...',
  reference_type='payment_request_cancel'
)

-- posting_entries:
INSERT posting_entries (account='1000-Available', amount=+50000) -- DEBIT (refund)
INSERT posting_entries (account='2000-Pending', amount=-50000) -- CREDIT (release)

-- user_balances view:
-- available_balance: 50,000 → 100,000 (tăng lại 50k)
-- pending_withdrawals: 50,000 → 0 (giảm 50k)
```

---

### WORKFLOW 3: Admin Mark as Paid

```javascript
/**
 * Mark Payment Request as Paid
 */
async function markAsPaid(paymentRequestId, adminId, transactionReference, notes) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get payment request
    const prResult = await client.query(`
      SELECT * FROM payment_requests
      WHERE id = $1
      FOR UPDATE
    `, [paymentRequestId]);

    if (prResult.rows.length === 0) {
      throw new Error('Payment request not found');
    }

    const paymentRequest = prResult.rows[0];

    // Validate status
    if (paymentRequest.status !== 'confirmed' && paymentRequest.status !== 'pending') {
      throw new Error(`Cannot mark as paid from status: ${paymentRequest.status}`);
    }

    if (!transactionReference) {
      throw new Error('Transaction reference required');
    }

    // Update payment request
    await client.query(`
      UPDATE payment_requests
      SET
        status = 'paid',
        paid_at = NOW(),
        paid_by = $2,
        transaction_reference = $3,
        admin_notes = $4
      WHERE id = $1
    `, [paymentRequestId, adminId, transactionReference, notes]);

    // ========================
    // Journal Entry: MOVE FROM PENDING → CASH OUT
    // ========================
    // Double-Entry:
    //   DEBIT: Cash Out (+requestedAmount) [Account 3000]
    //   CREDIT: Pending Withdrawals (-requestedAmount) [Account 2000]

    const journalEntryResult = await client.query(`
      INSERT INTO journal_entries (
        entry_date,
        description,
        reference_type,
        reference_id,
        created_by,
        idempotency_key,
        metadata
      ) VALUES (NOW(), $1, 'payment_request_paid', $2, $3, $4, $5)
      RETURNING id
    `, [
      `Payment completed for request ${paymentRequestId.substring(0, 8)}`,
      paymentRequestId,
      adminId,
      `${paymentRequestId}-paid`,
      JSON.stringify({ transactionReference })
    ]);

    const journalEntryId = journalEntryResult.rows[0].id;

    // Get accounts
    const accountsResult = await client.query(`
      SELECT id, account_code FROM ledger_accounts
      WHERE account_code IN ('2000', '3000')
    `);

    const accounts = {};
    accountsResult.rows.forEach(row => {
      accounts[row.account_code] = row.id;
    });

    // DEBIT: Cash Out (+amount)
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['3000'], // Cash Out
      paymentRequest.requested_amount, // DEBIT (positive)
      `Paid via ${transactionReference}`,
      paymentRequest.user_id,
      paymentRequestId
    ]);

    // CREDIT: Pending Withdrawals (-amount)
    await client.query(`
      INSERT INTO posting_entries (
        journal_entry_id,
        account_id,
        amount,
        description,
        user_id,
        payment_request_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      journalEntryId,
      accounts['2000'], // Pending Withdrawals
      -paymentRequest.requested_amount, // CREDIT (negative)
      'Complete withdrawal',
      paymentRequest.user_id,
      paymentRequestId
    ]);

    // ========================
    // Mark Conversions as Paid (FIFO)
    // ========================
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
      SET
        payment_status = 'paid',
        payment_request_id = $2,
        payment_linked_at = NOW()
      WHERE id IN (
        SELECT id FROM selected_conversions
        WHERE running_total <= $3
      )
      RETURNING id, cashback_amount
    `;

    const conversionsResult = await client.query(fifoQuery, [
      paymentRequest.user_id,
      paymentRequestId,
      paymentRequest.requested_amount
    ]);

    // Link journal entry
    await client.query(`
      UPDATE payment_requests
      SET payment_journal_entry_id = $2
      WHERE id = $1
    `, [paymentRequestId, journalEntryId]);

    await client.query('COMMIT');

    logger.success('Payment request marked as paid', {
      paymentRequestId,
      adminId,
      amount: paymentRequest.requested_amount,
      conversionsMarked: conversionsResult.rowCount,
      transactionReference
    });

    return paymentRequest;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Kết quả:**

```sql
-- payment_requests:
UPDATE payment_requests SET status='paid', paid_at=NOW(), transaction_reference='...'

-- journal_entries:
INSERT journal_entries (
  description='Payment completed...',
  reference_type='payment_request_paid'
)

-- posting_entries:
INSERT posting_entries (account='3000-CashOut', amount=+50000) -- DEBIT
INSERT posting_entries (account='2000-Pending', amount=-50000) -- CREDIT

-- system_conversions:
UPDATE system_conversions SET payment_status='paid' WHERE ... (FIFO)

-- user_balances view:
-- available_balance: 50,000 (không đổi)
-- pending_withdrawals: 50,000 → 0 (giảm)
-- total_withdrawn: 0 → 50,000 (tăng)
```

---

## 📋 KẾ HOẠCH TRIỂN KHAI

### Phase 1: BACKUP & PREPARATION (1 ngày)

**1.1. Backup Database**

```bash
# Full database dump
pg_dump -h <host> -U <user> -d <database> > backup_$(date +%Y%m%d_%H%M%S).sql

# Specific tables
pg_dump -h <host> -U <user> -d <database> \
  -t payment_requests \
  -t user_system_balance \
  -t system_conversions \
  -t payment_system_reconciliation_mapping \
  > payment_tables_backup_$(date +%Y%m%d_%H%M%S).sql
```

**1.2. Backup Code**

```bash
# Create backup branch
git checkout -b backup/payment-workflow-before-redesign
git add .
git commit -m "Backup before payment workflow redesign"
git push origin backup/payment-workflow-before-redesign

# Tag current state
git tag -a v1.0.0-before-payment-redesign -m "State before payment redesign"
git push origin v1.0.0-before-payment-redesign
```

**1.3. Export Current Data**

```bash
# Export to CSV for analysis
psql -h <host> -U <user> -d <database> -c "
COPY (
  SELECT * FROM payment_requests
  WHERE created_at >= '2025-01-01'
) TO STDOUT WITH CSV HEADER
" > payment_requests_export.csv

psql -h <host> -U <user> -d <database> -c "
COPY (
  SELECT * FROM user_system_balance
) TO STDOUT WITH CSV HEADER
" > user_balances_export.csv
```

---

### Phase 2: CREATE NEW SCHEMA (2 ngày)

**2.1. Create Migration Files**

```bash
backend/migrations/
├── 050_create_ledger_accounts.sql
├── 051_create_journal_entries.sql
├── 052_create_posting_entries.sql
├── 053_create_user_balances_view.sql
├── 054_add_idempotency_to_payment_requests.sql
├── 055_add_journal_links_to_payment_requests.sql
└── 056_seed_chart_of_accounts.sql
```

**2.2. Test Migrations on Staging**

```bash
# Run on staging DB
npm run migrate:up

# Verify schema
psql -h <staging-host> -U <user> -d <database> -c "\dt"
psql -h <staging-host> -U <user> -d <database> -c "\dv"
```

---

### Phase 3: DATA MIGRATION (3 ngày)

**3.1. Migrate Existing Balances**

```sql
-- Migration script: 057_migrate_existing_balances.sql

-- Step 1: Insert historical journal entries for existing balances
INSERT INTO journal_entries (
  id,
  entry_date,
  description,
  reference_type,
  created_at
)
SELECT
  gen_random_uuid(),
  usb.last_reconciliation_date,
  'Migration: Initial balance from user_system_balance',
  'migration_initial_balance',
  NOW()
FROM user_system_balance usb;

-- Step 2: Create posting entries for total_earned
-- DEBIT: Available Balance
-- CREDIT: Cashback Earned

-- Step 3: Create posting entries for total_withdrawn
-- DEBIT: Cash Out
-- CREDIT: Available Balance

-- Step 4: Verify totals match
SELECT
  usb.user_id,
  usb.available_balance as old_available,
  vub.available_balance as new_available,
  ABS(usb.available_balance - vub.available_balance) as discrepancy
FROM user_system_balance usb
JOIN user_balances vub ON usb.user_id = vub.user_id
WHERE ABS(usb.available_balance - vub.available_balance) > 0.01;
```

**3.2. Migrate Existing Payment Requests**

```sql
-- Migration script: 058_migrate_payment_requests.sql

-- Add idempotency_key to existing requests
UPDATE payment_requests
SET idempotency_key = gen_random_uuid()::text
WHERE idempotency_key IS NULL;

-- Create historical journal entries for paid requests
-- ...
```

---

### Phase 4: IMPLEMENT NEW CODE (5 ngày)

**4.1. Core Services**

```
backend/services/ledger/
├── LedgerService.js          # Core double-entry logic
├── AccountsService.js         # Chart of accounts
├── JournalService.js          # Journal entries
└── BalanceCalculator.js       # Balance calculation from postings
```

**4.2. Update Payment Request Service**

```
backend/services/
└── paymentRequestService.js   # Rewrite with double-entry
```

**4.3. Add Idempotency Middleware**

```
backend/middleware/
└── idempotency.js             # Check idempotency keys
```

---

### Phase 5: TESTING (7 ngày)

**5.1. Unit Tests**

```javascript
// tests/unit/ledger.test.js
describe('Ledger Service', () => {
  it('should create balanced journal entry', async () => {
    const entry = await LedgerService.createJournalEntry({
      description: 'Test entry',
      postings: [
        { account: '1000', amount: 100 },
        { account: '2000', amount: -100 }
      ]
    })

    expect(entry.isBalanced).toBe(true)
  })

  it('should reject unbalanced entry', async () => {
    await expect(
      LedgerService.createJournalEntry({
        description: 'Unbalanced',
        postings: [
          { account: '1000', amount: 100 },
          { account: '2000', amount: -50 }
        ]
      })
    ).rejects.toThrow('Journal entry not balanced')
  })
})
```

**5.2. Integration Tests**

```javascript
// tests/integration/payment-workflow.test.js
describe('Payment Request Workflow', () => {
  it('should reserve balance when creating request', async () => {
    const before = await getBalance(userId)

    await createPaymentRequest({
      userId,
      requestedAmount: 50000,
      idempotencyKey: uuid.v4()
    })

    const after = await getBalance(userId)

    expect(after.available_balance).toBe(before.available_balance - 50000)
    expect(after.pending_withdrawals).toBe(before.pending_withdrawals + 50000)
  })

  it('should refund balance when cancelling request', async () => {
    const request = await createPaymentRequest(...)
    const before = await getBalance(userId)

    await cancelPaymentRequest(request.id, userId)

    const after = await getBalance(userId)
    expect(after.available_balance).toBe(before.available_balance + 50000)
  })

  it('should prevent duplicate requests with same idempotency key', async () => {
    const key = uuid.v4()

    const request1 = await createPaymentRequest({ ..., idempotencyKey: key })
    const request2 = await createPaymentRequest({ ..., idempotencyKey: key })

    expect(request1.id).toBe(request2.id)
  })
})
```

**5.3. Load Testing**

```javascript
// tests/load/payment-concurrent.test.js
// Test concurrent requests don't cause race conditions

import { check } from 'k6'
import http from 'k6/http'

export default function() {
  const response = http.post('/api/payment-requests', {
    userId: 'test-user',
    requestedAmount: 50000,
    idempotencyKey: `${__VU}-${__ITER}` // Unique per virtual user iteration
  })

  check(response, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409
  })
}
```

---

### Phase 6: DEPLOYMENT (3 ngày)

**6.1. Staging Deployment**

```bash
# Deploy to staging
git checkout feature/payment-workflow-redesign
npm run build
npm run deploy:staging

# Run smoke tests
npm run test:e2e:staging
```

**6.2. Production Deployment (Blue-Green)**

```bash
# Deploy new version (Green)
npm run deploy:production:green

# Run health checks
curl https://api.example.com/health

# Switch traffic 10% → Green
# Monitor for 1 hour

# Switch traffic 50% → Green
# Monitor for 2 hours

# Switch traffic 100% → Green
# Monitor for 24 hours

# Decommission Blue if all good
```

---

### Phase 7: MONITORING & ROLLBACK PLAN (ongoing)

**7.1. Monitoring**

```javascript
// Monitor double-entry consistency
setInterval(async () => {
  const unbalanced = await db.query(`
    SELECT je.id, je.description,
      SUM(pe.amount) as total
    FROM journal_entries je
    LEFT JOIN posting_entries pe ON je.id = pe.journal_entry_id
    GROUP BY je.id, je.description
    HAVING ABS(SUM(pe.amount)) > 0.01
  `)

  if (unbalanced.rows.length > 0) {
    alert('⚠️ UNBALANCED JOURNAL ENTRIES DETECTED!')
  }
}, 60000) // Every minute
```

**7.2. Rollback Plan**

```bash
# If critical issue detected:

# 1. Switch traffic back to Blue
kubectl set image deployment/api api=api:v1.0.0

# 2. Restore database from backup
pg_restore -h <host> -U <user> -d <database> backup_20260110.sql

# 3. Revert code
git revert <commit-sha>
git push origin main

# 4. Investigate root cause
# 5. Fix and redeploy
```

---

## 📊 KỲ VỌNG SAU KHI TRIỂN KHAI

### ✅ Improvements:

1. **Data Integrity:**
   - ✅ Luôn balanced (sum of debits = sum of credits)
   - ✅ Complete audit trail (mọi thay đổi balance đều có journal entry)
   - ✅ Immutable history (không xóa, chỉ tạo reverse entries)

2. **Prevent Fraud:**
   - ✅ User KHÔNG thể tạo requests vượt số dư
   - ✅ Idempotency prevents duplicate charges
   - ✅ ACID transactions prevent race conditions

3. **Reconciliation:**
   - ✅ Dễ đối soát: `SUM(postings) = 0` for all journal entries
   - ✅ Balance calculated from postings (single source of truth)
   - ✅ Transaction history traceable

4. **Compliance:**
   - ✅ Audit trail đầy đủ (who, when, what, why)
   - ✅ Segregation of duties (user request, admin approve)
   - ✅ Follows accounting standards (double-entry)

---

## 📚 SOURCES

### Best Practices:
- [Payment Approval Process Best Practices - Trustpair](https://trustpair.com/blog/payment-approval-process/)
- [Payment Approval Process - Ramp](https://ramp.com/blog/payment-approval-process)

### Double-Entry Bookkeeping:
- [Books: An Immutable Double-Entry Accounting Database - Square](https://developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/)
- [Accounting for Developers Part II - Modern Treasury](https://www.moderntreasury.com/journal/accounting-for-developers-part-ii)
- [Double-Entry Accounting in a Relational Database - Medium](https://medium.com/@RobertKhou/double-entry-accounting-in-a-relational-database-2b7838a5d7f8)

### Idempotency:
- [Why Idempotency Matters in Payment Processing - IEEE](https://www.computer.org/publications/tech-news/trends/idempotency-in-payment-processing-architecture)
- [Preventing Duplicate Payments - Medium](https://medium.com/@sahintalha1/the-way-psps-such-as-paypal-stripe-and-adyen-prevent-duplicate-payment-idempotency-keys-615845c185bf)
- [API Idempotency - Adyen](https://docs.adyen.com/development-resources/api-idempotency)
- [Idempotency in Finance - CockroachDB](https://www.cockroachlabs.com/blog/idempotency-in-finance/)

### ACID Transactions:
- [ACID Transactions - Redis](https://redis.io/glossary/acid-transactions/)
- [What Are ACID Transactions - DataCamp](https://www.datacamp.com/blog/acid-transactions)
- [ACID Definition - TechTarget](https://www.techtarget.com/searchdatamanagement/definition/ACID)

---

**Tổng thời gian ước tính:** 21 ngày (3 tuần)
**Risk Level:** HIGH (liên quan tiền)
**Recommendation:** Thực hiện từng phase, test kỹ lưỡng, deploy dần dần
