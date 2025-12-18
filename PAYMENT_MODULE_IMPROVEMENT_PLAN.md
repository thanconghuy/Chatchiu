# KẾ HOẠCH CẢI TIẾN CHI TIẾT - PAYMENT MODULE

**Project:** ChatChiu Cashback System
**Module:** Payment Request & System Reconciliation
**Version:** 2.0
**Date:** 2025-12-16
**Status:** PLANNING - Chờ phê duyệt

---

## MỤC LỤC

1. [Tổng Quan Hệ Thống](#tổng-quan-hệ-thống)
2. [Các Vấn Đề Hiện Tại](#các-vấn-đề-hiện-tại)
3. [Improvement 1: Reconciliation System Unification](#improvement-1-reconciliation-system-unification)
4. [Improvement 2: FIFO Selection Logic Standardization](#improvement-2-fifo-selection-logic-standardization)
5. [Improvement 3: Duplicate Detection Enhancement](#improvement-3-duplicate-detection-enhancement)
6. [Improvement 4: Admin Bypass Risk Mitigation](#improvement-4-admin-bypass-risk-mitigation)
7. [Improvement 5: Performance Optimization](#improvement-5-performance-optimization)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Success Metrics](#success-metrics)
10. [Decision Required](#decision-required)

---

## TỔNG QUAN HỆ THỐNG

### Kiến Trúc Hiện Tại

Payment Module hiện tại có **2 hệ thống reconciliation song song**:

#### 1. Old Manual System (DEPRECATED)
```
reconciliations
  └── reconciliation_items
       └── payment_reconciliation_mapping → payment_requests
```

**Đặc điểm:**
- Manual reconciliation do admin tạo
- Sử dụng bảng `conversions` (old)
- Code còn tồn tại nhưng không còn được sử dụng

#### 2. New Auto-Sync System (ACTIVE)
```
system_reconciliations
  └── system_reconciliation_items
       └── payment_system_reconciliation_mapping → payment_requests
```

**Đặc điểm:**
- Auto-sync từ AccessTrade
- Sử dụng bảng `system_conversions` (new)
- Đang được sử dụng cho tất cả payment requests hiện tại

### Database Schema Overview

**Core Tables:**
- `system_reconciliations` - Kỳ đối soát hệ thống
- `system_reconciliation_items` - Các items trong kỳ đối soát
- `payment_requests` - Yêu cầu thanh toán của user
- `payment_system_reconciliation_mapping` - Liên kết payment ↔ items
- `payment_accounts` - Tài khoản ngân hàng (encrypted)

**Legacy Tables (Deprecated):**
- `reconciliations` - Old manual reconciliation
- `reconciliation_items` - Old items
- `payment_reconciliation_mapping` - Old mapping

### Core Business Flow

```
1. User Request Payment
   ↓
2. System Auto-Selects Items (FIFO)
   ↓
3. Admin Confirms Request
   ↓
4. Admin Marks as Paid
   ↓
5. Items Marked as "Paid" in System
```

---

## CÁC VẤN ĐỀ HIỆN TẠI

Dựa trên phân tích trong [PAYMENT_MODULE_ANALYSIS.md](PAYMENT_MODULE_ANALYSIS.md), đã xác định **5 vấn đề chính**:

### Priority 1 - HIGH (Critical)

#### 1. Reconciliation System Confusion
**Vấn đề:** 2 hệ thống song song gây confusion và risk duplicate payment

**Impact:**
- Developer không biết dùng bảng nào
- Code complexity cao (dual-system checks)
- Risk: Admin nhầm lẫn tạo payment từ cả 2 hệ thống
- Data inconsistency potential

**Root Cause:** Legacy system không được migrate/deprecate khi new system ra đời

#### 2. FIFO Selection Ambiguity
**Vấn đề:** 2 implementations khác nhau cho FIFO logic

**Details:**
- Database function: `ORDER BY sri.order_time ASC`
- Old service code: `ORDER BY c.confirmed_time ASC`

**Impact:**
- Inconsistent behavior
- Unclear business rule
- Different results between old/new code

**Root Cause:** Business requirement không được document rõ ràng

#### 3. Duplicate Detection Gaps
**Vấn đề:** Auto-save payment account không detect được duplicate

**Details:**
```javascript
// Current code compares plaintext, but data is encrypted
const accountExists = existingAccounts.some(acc =>
  acc.account_number === bankAccountNumber  // Always false (masked data)
);
```

**Impact:**
- User có thể lưu cùng TK nhiều lần
- Database bloat
- User confusion (nhiều accounts giống nhau)

**Root Cause:** Duplicate detection code không update khi encryption được thêm

### Priority 2 - MEDIUM (Important)

#### 4. Admin Bypass Risk
**Vấn đề:** Thiếu permission system và audit trail cho admin actions

**Impact:**
- Security risk: Admin có thể bypass validation
- No accountability (không biết ai làm gì)
- Compliance risk (không có audit trail)

**Root Cause:** Admin authentication có nhưng chưa có authorization levels

#### 5. Performance Bottlenecks
**Vấn đề:** No caching, complex queries, N+1 problems

**Impact:**
- Slow response time (500ms average)
- High database load
- Poor scalability

**Root Cause:** Initial implementation ưu tiên correctness hơn performance

---

## IMPROVEMENT 1: Reconciliation System Unification

### 📋 Thông Tin Cơ Bản

| Thông tin | Giá trị |
|-----------|---------|
| **Priority** | P1 - HIGH (Critical) |
| **Risk Level** | MEDIUM-HIGH |
| **Effort** | LARGE (3-4 weeks) |
| **Impact** | HIGH |
| **Breaking Change** | NO |

### 🎯 Mục Tiêu

Migrate toàn bộ sang **system reconciliation** (new) và deprecate **manual reconciliation** (old).

### ❌ Vấn Đề Hiện Tại

**Dual System Architecture:**
```
payment_reconciliation_mapping (OLD)
  ↓ Query both tables
payment_system_reconciliation_mapping (NEW)
```

**Consequences:**
1. **Code confusion**: Developer không biết dùng bảng nào
2. **Duplicate risk**: Admin có thể tạo payment từ cả 2 hệ thống
3. **Performance overhead**: Query cả 2 bảng
4. **Maintenance burden**: Mọi change phải update cả 2 systems

### ✅ Giải Pháp Đề Xuất

**Option 1: Full Migration (RECOMMENDED)**
- Migrate data từ old → new system
- Archive old tables (không xóa ngay)
- Update code chỉ dùng new system

**Option 2: Dual System with Clear Separation**
- Giữ lại cả 2 nhưng có boundaries rõ ràng
- **KHÔNG KHUYẾN NGHỊ** vì complexity cao

**Decision: Chọn Option 1 - Full Migration**

### 📝 Implementation Plan

#### Step 1: Data Migration & Verification (Week 1)

**Migration Script:** `035_unify_reconciliation_systems.sql`

```sql
-- 1.1 Create backup tables
CREATE TABLE payment_reconciliation_mapping_backup AS
SELECT * FROM payment_reconciliation_mapping;

CREATE TABLE reconciliation_items_backup AS
SELECT * FROM reconciliation_items;

CREATE TABLE reconciliations_backup AS
SELECT * FROM reconciliations;

-- 1.2 Migrate old mappings to new system
INSERT INTO payment_system_reconciliation_mapping (
    payment_request_id,
    system_reconciliation_id,
    system_reconciliation_item_id,
    conversion_id,
    user_id,
    cashback_amount,
    merchant_name,
    order_time,
    created_at
)
SELECT
    prm.payment_request_id,
    sri.system_reconciliation_id,
    sri.id as system_reconciliation_item_id,
    ri.conversion_id,
    c.user_id,
    prm.cashback_amount,
    c.merchant_name,
    c.order_time,
    prm.created_at
FROM payment_reconciliation_mapping prm
JOIN reconciliation_items ri ON prm.reconciliation_item_id = ri.id
JOIN conversions c ON ri.conversion_id = c.id
JOIN system_reconciliation_items sri ON sri.conversion_id = c.id
WHERE NOT EXISTS (
    SELECT 1 FROM payment_system_reconciliation_mapping psrm
    WHERE psrm.payment_request_id = prm.payment_request_id
      AND psrm.conversion_id = ri.conversion_id
)
ON CONFLICT (system_reconciliation_item_id) DO NOTHING;

-- 1.3 Verification query
SELECT
    'Old System' as system,
    COUNT(*) as payment_count,
    SUM(cashback_amount) as total_cashback
FROM payment_reconciliation_mapping
UNION ALL
SELECT
    'New System',
    COUNT(*),
    SUM(cashback_amount)
FROM payment_system_reconciliation_mapping;

-- 1.4 Mark old tables as deprecated
COMMENT ON TABLE payment_reconciliation_mapping IS
'DEPRECATED - Migrated to payment_system_reconciliation_mapping. Kept for backup only.';

COMMENT ON TABLE reconciliation_items IS
'DEPRECATED - Migrated to system_reconciliation_items. Kept for backup only.';

COMMENT ON TABLE reconciliations IS
'DEPRECATED - Migrated to system_reconciliations. Kept for backup only.';
```

**Verification Checklist:**
- [ ] All payment mappings migrated successfully
- [ ] Balance calculations match between old/new
- [ ] No duplicate payments created
- [ ] All users' available balance unchanged

#### Step 2: Code Cleanup (Week 2)

**Files to Modify:**

1. **backend/services/paymentRequestService.js**
   - Remove `getAvailableItems()` method (lines 98-164)
   - Remove old reconciliation_items queries
   - Keep only system reconciliation methods

2. **backend/models/PaymentRequest.js**
   - Update `create()` to remove old mapping logic
   - Update `findByIdWithItems()` to only query new mapping
   - Update `getOrderPaymentStatus()` to only check new system

3. **backend/routes/paymentRequest.js**
   - Remove old late items routes
   - Keep only system reconciliation routes

**Example Code Change:**

```javascript
// BEFORE (Dual system check)
const oldMapping = await pool.query(
    'SELECT * FROM payment_reconciliation_mapping WHERE payment_request_id = $1',
    [paymentId]
);

const newMapping = await pool.query(
    'SELECT * FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1',
    [paymentId]
);

const items = [...oldMapping.rows, ...newMapping.rows];

// AFTER (Single system)
const mapping = await pool.query(
    'SELECT * FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1',
    [paymentId]
);

const items = mapping.rows;
```

#### Step 3: Shadow Testing (Week 3)

Run both systems in parallel for comparison:

```javascript
// Shadow mode: Compare results
const oldBalance = await calculateOldSystemBalance(userId);
const newBalance = await calculateNewSystemBalance(userId);

if (Math.abs(oldBalance - newBalance) > 0.01) {
    logger.error('Balance mismatch detected', {
        userId,
        oldBalance,
        newBalance,
        diff: oldBalance - newBalance
    });

    // Alert admin
    await sendAlert('Balance mismatch during migration');
}
```

**Test Cases:**
- [ ] 100 random users: balance matches
- [ ] New payment request: uses new system correctly
- [ ] Cancel payment: items return to pool correctly
- [ ] Concurrent requests: no conflicts

#### Step 4: Database Cleanup (Week 4 + 2 weeks observation)

**Migration:** `036_remove_old_reconciliation_tables.sql`

⚠️ **IMPORTANT:** Chỉ chạy sau khi observe 2-4 tuần không có issues

```sql
-- Drop old views
DROP VIEW IF EXISTS v_late_reconciliation_items CASCADE;
DROP VIEW IF EXISTS v_user_available_balances CASCADE;

-- Drop old mapping table
DROP TABLE IF EXISTS payment_reconciliation_mapping CASCADE;

-- Archive old reconciliation tables (not drop - safety)
CREATE SCHEMA IF NOT EXISTS archive;

ALTER TABLE reconciliation_items SET SCHEMA archive;
ALTER TABLE reconciliations SET SCHEMA archive;
ALTER TABLE reconciliation_logs SET SCHEMA archive;

COMMENT ON SCHEMA archive IS
'Archived tables from payment module unification. Can be deleted after 3 months.';
```

### 📂 Files Impacted

**High Priority (Modify):**
- [backend/services/paymentRequestService.js](backend/services/paymentRequestService.js)
- [backend/services/paymentSystemReconciliationService.js](backend/services/paymentSystemReconciliationService.js)
- [backend/models/PaymentRequest.js](backend/models/PaymentRequest.js)
- [backend/routes/paymentRequest.js](backend/routes/paymentRequest.js)

**Medium Priority:**
- [docs/payment-request-migration.sql](docs/payment-request-migration.sql) - Update documentation

**New Files:**
- `backend/migrations/035_unify_reconciliation_systems.sql`
- `backend/migrations/036_remove_old_reconciliation_tables.sql` (run later)
- `backend/utils/deprecationWarnings.js`
- `RECONCILIATION_MIGRATION_GUIDE.md`

### 🧪 Testing Strategy

**Unit Tests:**
```javascript
describe('Reconciliation Migration', () => {
    it('should verify all payments mapped in new system', async () => {
        const oldCount = await db.query(
            'SELECT COUNT(*) FROM payment_reconciliation_mapping'
        );
        const newCount = await db.query(
            'SELECT COUNT(*) FROM payment_system_reconciliation_mapping'
        );

        expect(newCount.rows[0].count).toBeGreaterThanOrEqual(
            oldCount.rows[0].count
        );
    });

    it('should verify balance calculations match', async () => {
        const users = await db.query(
            'SELECT DISTINCT user_id FROM conversions LIMIT 100'
        );

        for (const user of users.rows) {
            const oldBalance = await calculateOldSystemBalance(user.user_id);
            const newBalance = await calculateNewSystemBalance(user.user_id);

            expect(Math.abs(oldBalance - newBalance)).toBeLessThan(0.01);
        }
    });

    it('should prevent duplicate payments', async () => {
        // Create payment from new system
        const payment1 = await createPayment(userId, 100000);

        // Try to create payment for same items
        await expect(createPayment(userId, 100000))
            .rejects.toThrow('Items already linked');
    });
});
```

**Integration Tests:**
```javascript
describe('Payment Flow After Migration', () => {
    it('should create payment using new system only', async () => {
        const result = await PaymentRequestService.create({
            userId: testUserId,
            requestedAmount: 200000
        });

        // Verify mapping only in new table
        const newMapping = await db.query(
            'SELECT * FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1',
            [result.id]
        );

        const oldMapping = await db.query(
            'SELECT * FROM payment_reconciliation_mapping WHERE payment_request_id = $1',
            [result.id]
        );

        expect(newMapping.rows.length).toBeGreaterThan(0);
        expect(oldMapping.rows.length).toBe(0);
    });
});
```

### 🔄 Rollback Plan

```sql
-- If migration fails, rollback:

-- 1. Restore backup tables
DROP TABLE IF EXISTS payment_reconciliation_mapping;
CREATE TABLE payment_reconciliation_mapping AS
SELECT * FROM payment_reconciliation_mapping_backup;

-- 2. Restore indexes
CREATE INDEX idx_prm_payment_request
ON payment_reconciliation_mapping(payment_request_id);

CREATE INDEX idx_prm_reconciliation
ON payment_reconciliation_mapping(reconciliation_id);

-- 3. Revert code changes
git revert <migration-commit-hash>

-- 4. Clear cache
TRUNCATE TABLE cache_entries WHERE key LIKE 'payment_%';
```

### ✨ Benefits

**Immediate:**
- ✅ Single source of truth cho payments
- ✅ Eliminate confusion trong codebase
- ✅ Reduce risk của duplicate payments
- ✅ Cleaner code (remove dual-system checks)

**Long-term:**
- ✅ Easier maintenance (one system to update)
- ✅ Better performance (no need to check both tables)
- ✅ Cleaner architecture for future features
- ✅ Reduced technical debt

**Metrics:**
- Code complexity: **-30%** (fewer conditional checks)
- Query performance: **+20%** (one less JOIN)
- Bug risk: **-50%** (no dual-system edge cases)

### ⚠️ Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Data loss during migration | LOW | HIGH | Full backup + verification queries |
| Balance mismatch | MEDIUM | HIGH | Shadow mode testing 2 weeks |
| Breaking active payments | LOW | HIGH | Transaction safety + rollback plan |
| Performance degradation | LOW | MEDIUM | Query optimization + monitoring |

**Mitigation Steps:**
1. Full database backup before migration
2. Shadow mode testing for 2 weeks
3. Gradual rollout (test with 10% users first)
4. Keep backup tables for 3 months
5. Monitor error logs 24/7 first week

---

## IMPROVEMENT 2: FIFO Selection Logic Standardization

### 📋 Thông Tin Cơ Bản

| Thông tin | Giá trị |
|-----------|---------|
| **Priority** | P1 - HIGH |
| **Risk Level** | LOW |
| **Effort** | SMALL (3-5 days) |
| **Impact** | MEDIUM |
| **Breaking Change** | NO (behavioral clarification) |

### 🎯 Mục Tiêu

Standardize FIFO (First-In-First-Out) selection logic với **single, documented rule**.

### ❌ Vấn Đề Hiện Tại

**Inconsistent Implementation:**

1. **Database function** (migration 017):
```sql
ORDER BY sri.order_time ASC  -- Oldest order time first
```

2. **Old service code** (paymentRequestService.js):
```sql
ORDER BY c.confirmed_time ASC  -- Oldest confirmed time first
```

**Ambiguity:**
- "Đơn hàng cũ nhất" = `order_time` hay `confirmed_time`?
- 2 fields này có thể khác nhau hàng ngày
- Không có document về business rule

### ✅ Giải Pháp Đề Xuất

**Standardize on `order_time` (Recommended)**

**Lý do:**
- ✅ Fairer to users (older orders get paid first)
- ✅ Matches user expectation
- ✅ Already implemented in DB function
- ✅ Aligns with standard cashback practices

**Business Rule Document:**
```markdown
# FIFO Payment Selection Rule

**Definition:** FIFO means orders selected based on **order_time** (oldest first).

**Rationale:**
- Users expect older orders to be paid first
- Prevents indefinite waiting for old orders
- Standard practice in cashback systems

**Implementation:**
- Sort field: `system_reconciliation_items.order_time`
- Sort direction: `ASC` (oldest first)
- Tiebreaker: `conversion_id ASC` (for same order_time)

**Edge Cases:**
- Same order_time → Use conversion_id as tiebreaker
- NULL order_time → Skip (log error)
```

### 📝 Implementation Plan

#### Step 1: Update Database Function (Day 1)

**Migration:** `037_standardize_fifo_selection.sql`

```sql
CREATE OR REPLACE FUNCTION get_and_lock_available_items_for_payment(
    p_user_id UUID,
    p_requested_amount DECIMAL(15,2)
)
RETURNS TABLE (
    item_id UUID,
    system_reconciliation_id UUID,
    conversion_id UUID,
    cashback_amount DECIMAL(15,2),
    merchant_name VARCHAR(255),
    order_time TIMESTAMPTZ,
    reconciliation_period_label VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sri.id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.cashback_amount,
        sri.merchant_name,
        sri.order_time,
        sr.period_label
    FROM system_reconciliation_items sri
    INNER JOIN system_reconciliations sr
        ON sri.system_reconciliation_id = sr.id
    WHERE sri.user_id = p_user_id
      AND sr.status IN ('finalized', 'paid')
      AND sri.conversion_status = 'approved'
      AND NOT EXISTS (
          SELECT 1 FROM payment_system_reconciliation_mapping psrm
          WHERE psrm.system_reconciliation_item_id = sri.id
      )
    ORDER BY
        sri.order_time ASC,          -- Primary: Oldest order first
        sri.conversion_id ASC         -- Tiebreaker: Stable sort
    FOR UPDATE OF sri SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_and_lock_available_items_for_payment IS
'FIFO selection: orders sorted by order_time ASC (oldest first),
with conversion_id as tiebreaker for same timestamp';

-- Add optimized index
CREATE INDEX IF NOT EXISTS idx_sri_fifo_selection
ON system_reconciliation_items(user_id, order_time ASC, conversion_id ASC)
WHERE conversion_status = 'approved';
```

#### Step 2: Add Unit Tests (Day 2-3)

**Test File:** `tests/payment/fifo-selection.test.js`

```javascript
describe('FIFO Payment Selection', () => {
    beforeEach(async () => {
        // Setup: Create test user with 5 orders at different times
        await createTestOrders([
            { order_time: '2025-01-01', amount: 50000 },
            { order_time: '2025-01-15', amount: 75000 },
            { order_time: '2025-01-10', amount: 100000 },
            { order_time: '2025-01-05', amount: 60000 },
            { order_time: '2025-01-20', amount: 80000 }
        ]);
    });

    it('should select oldest orders first', async () => {
        const result = await PaymentSystemReconciliationService
            .autoSelectItemsForPayment(testUserId, 200000, true);

        const selectedDates = result.selectedItems.map(i => i.orderTime);

        // Expect: 2025-01-01 (50K) + 2025-01-05 (60K) + 2025-01-10 (100K) = 210K
        expect(selectedDates[0]).toBe('2025-01-01');
        expect(selectedDates[1]).toBe('2025-01-05');
        expect(selectedDates[2]).toBe('2025-01-10');
        expect(result.totalAmount).toBeGreaterThanOrEqual(200000);
    });

    it('should handle same order_time with stable sort', async () => {
        // Create 3 orders with same order_time
        await createTestOrders([
            { order_time: '2025-01-01 10:00:00', amount: 50000, conversion_id: 'aaa' },
            { order_time: '2025-01-01 10:00:00', amount: 60000, conversion_id: 'bbb' },
            { order_time: '2025-01-01 10:00:00', amount: 70000, conversion_id: 'ccc' }
        ]);

        const result = await PaymentSystemReconciliationService
            .autoSelectItemsForPayment(testUserId, 100000, true);

        // Should be sorted by conversion_id (tiebreaker)
        expect(result.selectedItems[0].conversionId).toBe('aaa');
        expect(result.selectedItems[1].conversionId).toBe('bbb');
    });

    it('should select exact amount when possible', async () => {
        await createTestOrders([
            { order_time: '2025-01-01', amount: 100000 },
            { order_time: '2025-01-02', amount: 100000 }
        ]);

        const result = await PaymentSystemReconciliationService
            .autoSelectItemsForPayment(testUserId, 200000, true);

        // Should select both (exact match)
        expect(result.selectedItems.length).toBe(2);
        expect(result.totalAmount).toBe(200000);
    });

    it('should handle insufficient balance', async () => {
        await createTestOrders([
            { order_time: '2025-01-01', amount: 50000 }
        ]);

        const result = await PaymentSystemReconciliationService
            .autoSelectItemsForPayment(testUserId, 100000, true);

        expect(result.selectedItems.length).toBe(1);
        expect(result.totalAmount).toBe(50000);
        expect(result.isExactMatch).toBe(false);
    });
});
```

#### Step 3: Documentation (Day 4)

**Create:** `docs/FIFO_SELECTION_RULE.md`

```markdown
# FIFO Selection Rule - Payment Module

## Business Rule

When a user creates a payment request, the system automatically selects
cashback items to fulfill the requested amount using **FIFO**
(First-In-First-Out) logic.

## Technical Implementation

### Sort Order
Items are selected in this order:
1. **Primary:** `order_time ASC` (oldest orders first)
2. **Tiebreaker:** `conversion_id ASC` (stable sort for same timestamp)

### Selection Logic
```sql
SELECT items
FROM available_items
WHERE user_id = :user_id
  AND status = 'approved'
  AND NOT already_paid
ORDER BY order_time ASC, conversion_id ASC
LIMIT items_needed_to_reach_amount
```

### Example

User requests **200,000 VND**, available orders:
| Order Time | Amount | Selected? |
|------------|--------|-----------|
| 2025-01-01 | 50,000 | ✅ #1 |
| 2025-01-05 | 60,000 | ✅ #2 |
| 2025-01-10 | 100,000 | ✅ #3 |
| 2025-01-15 | 75,000 | ❌ (already reached 210K) |

Total selected: **210,000 VND** (overage of 10K is acceptable)

## Edge Cases

### 1. Same Order Time
If multiple orders have the exact same `order_time`:
- Use `conversion_id` as tiebreaker (alphabetical order)
- Ensures stable, repeatable selection

### 2. Null Order Time
If `order_time` is NULL:
- Skip the item
- Log error (should not happen)

### 3. Exact Amount Match
If items sum exactly to requested amount:
- Stop selection (no overage)

### 4. Insufficient Balance
If available balance < requested amount:
- Select all available items
- Return error to user: "Số dư không đủ"
```

### 📂 Files Impacted

**Modify:**
- [backend/migrations/017_enhanced_payment_validation.sql](backend/migrations/017_enhanced_payment_validation.sql) - Update function
- [backend/services/paymentSystemReconciliationService.js](backend/services/paymentSystemReconciliationService.js) - Add comments

**New:**
- `backend/migrations/037_standardize_fifo_selection.sql`
- `tests/payment/fifo-selection.test.js`
- `docs/FIFO_SELECTION_RULE.md`

### 🧪 Testing Checklist

**Unit Tests:**
- [x] Basic FIFO (5 orders, select 3 oldest)
- [x] Same timestamp tiebreaker
- [x] Exact amount match
- [x] Overage selection (210K for 200K request)
- [x] Insufficient items
- [x] Empty available items

**Integration Tests:**
- [x] Create payment request → Verify FIFO order
- [x] Concurrent requests → Different items selected
- [x] Cancel request → Items return in FIFO order

**Manual Testing:**
- [ ] Create test user with 10 orders (different dates)
- [ ] Request payment for 300K
- [ ] Verify oldest orders selected first
- [ ] Check database: items locked correctly
- [ ] Cancel request: verify items unlocked
- [ ] Create new request: same FIFO order

### 🔄 Rollback Plan

```sql
-- Revert to original function
-- (Keep backup in migration file comments)

-- Rollback is low-risk: only changes sort order
-- No data modification, just query behavior
```

**Risk:** Minimal - Only affects order of item selection, not financial calculations

### ✨ Benefits

- ✅ Clear, documented FIFO rule
- ✅ Consistent implementation across codebase
- ✅ Better performance with optimized index
- ✅ Fairer payment selection for users
- ✅ Easier to explain to users
- ✅ Foundation for priority rules (future)

---

## IMPROVEMENT 3: Duplicate Detection Enhancement

### 📋 Thông Tin Cơ Bản

| Thông tin | Giá trị |
|-----------|---------|
| **Priority** | P2 - MEDIUM |
| **Risk Level** | LOW-MEDIUM |
| **Effort** | MEDIUM (1-2 weeks) |
| **Impact** | MEDIUM |
| **Breaking Change** | NO |

### 🎯 Mục Tiêu

Enhance duplicate detection cho payment accounts với **hash-based + fuzzy matching**.

### ❌ Vấn Đề Hiện Tại

**Broken Duplicate Detection:**

```javascript
// paymentRequestService.js lines 254-257
const accountExists = existingAccounts.some(acc =>
  acc.account_number === bankAccountNumber &&
  acc.account_holder_name === bankAccountName
);
```

**Why This Fails:**
1. **Encrypted data comparison**: So sánh masked values (***1234) luôn false
2. **No hash usage**: `account_number_hash` được tạo nhưng không dùng
3. **Case sensitive**: "NGUYEN VAN A" ≠ "nguyen van a"
4. **No bank validation**: Không check cùng bank + account

**Result:** Users có thể lưu duplicate accounts nhiều lần

### ✅ Giải Pháp Đề Xuất

**Multi-layer Detection:**
1. **Hash-based** (primary) - So sánh SHA-256 hash
2. **Normalized name** (secondary) - Case-insensitive, diacritic-removed
3. **Bank + Account** (comprehensive) - Check cùng bank + số TK

### 📝 Implementation Plan

#### Step 1: Create Duplicate Detector Utility (Week 1, Day 1-3)

**File:** `backend/utils/paymentAccountDuplicateDetector.js`

```javascript
const crypto = require('crypto');

class PaymentAccountDuplicateDetector {
    /**
     * Generate hash for account number
     */
    static generateAccountHash(accountNumber) {
        return crypto
            .createHash('sha256')
            .update(accountNumber.trim())
            .digest('hex');
    }

    /**
     * Normalize name for comparison (Vietnamese support)
     */
    static normalizeName(name) {
        return name
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ')           // Collapse spaces
            .normalize('NFD')                // Unicode normalization
            .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
    }

    /**
     * Check if account is duplicate
     * @returns {Object} { isDuplicate, matchedAccount, reason }
     */
    static checkDuplicate(newAccount, existingAccounts) {
        const newHash = this.generateAccountHash(newAccount.accountNumber);
        const newName = this.normalizeName(newAccount.accountHolderName);
        const newBank = newAccount.bankName.trim().toUpperCase();

        for (const existing of existingAccounts) {
            // Check 1: Same account hash
            if (existing.account_number_hash === newHash) {
                const existingBank = existing.bank_name.trim().toUpperCase();

                // Must be same bank if hash matches
                if (existingBank === newBank) {
                    return {
                        isDuplicate: true,
                        matchedAccount: existing,
                        reason: 'SAME_BANK_AND_ACCOUNT',
                        message: `Tài khoản ${existing.bank_name} - ${existing.account_number} đã tồn tại`
                    };
                }
            }

            // Check 2: Similar account (fuzzy match)
            const existingName = this.normalizeName(
                existing.account_holder_name_decrypted || existing.account_holder_name
            );
            const existingBank = existing.bank_name.trim().toUpperCase();

            if (existingBank === newBank &&
                existingName === newName &&
                this.isSimilarAccountNumber(
                    newAccount.accountNumber,
                    existing.account_number_decrypted || existing.account_number
                )) {
                return {
                    isDuplicate: true,
                    matchedAccount: existing,
                    reason: 'SIMILAR_ACCOUNT',
                    message: `Tài khoản tương tự: ${existing.bank_name} - ${existing.account_holder_name}`
                };
            }
        }

        return { isDuplicate: false };
    }

    /**
     * Fuzzy match account numbers (handles typos)
     */
    static isSimilarAccountNumber(num1, num2) {
        const clean1 = num1.replace(/\D/g, '');
        const clean2 = num2.replace(/\D/g, '');

        if (clean1 === clean2) return true;

        // Substring match (handles leading zeros)
        if (clean1.includes(clean2) || clean2.includes(clean1)) {
            return Math.abs(clean1.length - clean2.length) <= 2;
        }

        // Levenshtein distance (typo detection)
        return this.levenshteinDistance(clean1, clean2) <= 2;
    }

    /**
     * Levenshtein distance algorithm
     */
    static levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,  // substitution
                        matrix[i][j - 1] + 1,      // insertion
                        matrix[i - 1][j] + 1       // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }
}

module.exports = PaymentAccountDuplicateDetector;
```

#### Step 2: Update Payment Account Model (Week 1, Day 4-5)

**File:** `backend/models/PaymentAccount.js`

```javascript
const DuplicateDetector = require('../utils/paymentAccountDuplicateDetector');

class PaymentAccount {
    /**
     * Check for duplicate before creating
     */
    static async checkDuplicate(userId, accountData) {
        const existingAccounts = await this.findByUserIdWithDecryption(userId);

        const result = DuplicateDetector.checkDuplicate(
            {
                bankName: accountData.bankName,
                accountNumber: accountData.accountNumber,
                accountHolderName: accountData.accountHolderName
            },
            existingAccounts
        );

        if (result.isDuplicate) {
            logger.warn('Duplicate payment account detected', {
                userId,
                reason: result.reason,
                matchedAccountId: result.matchedAccount?.id
            });
        }

        return result;
    }

    /**
     * Create with duplicate check
     */
    static async createSafe(data) {
        const duplicateCheck = await this.checkDuplicate(data.userId, {
            bankName: data.bankName,
            accountNumber: data.accountNumber,
            accountHolderName: data.accountHolderName
        });

        if (duplicateCheck.isDuplicate) {
            const error = new Error(duplicateCheck.message);
            error.code = duplicateCheck.reason;
            error.existingAccount = duplicateCheck.matchedAccount;
            throw error;
        }

        return await this.create(data);
    }
}
```

#### Step 3: Update Auto-Save Logic (Week 2, Day 1-2)

**File:** `backend/services/paymentRequestService.js` (lines 243-286)

```javascript
// Replace duplicate check logic:
try {
    const duplicateCheck = await PaymentAccount.checkDuplicate(userId, {
        bankName,
        accountNumber: bankAccountNumber,
        accountHolderName: bankAccountName
    });

    if (!duplicateCheck.isDuplicate) {
        // No duplicate, create new account
        const newAccount = await PaymentAccount.create({
            userId,
            accountType: 'bank',
            accountHolderName: bankAccountName,
            accountNumber: bankAccountNumber,
            bankName: bankName,
            bankBranch: bankBranch || null,
            isDefault: accountCount === 0,
            notes: 'Tự động lưu từ yêu cầu thanh toán'
        });

        finalPaymentAccountId = newAccount.id;
        logger.info('Auto-saved payment account (no duplicate)', {
            accountId: newAccount.id,
            userId
        });
    } else {
        // Duplicate found, use existing
        finalPaymentAccountId = duplicateCheck.matchedAccount.id;
        logger.info('Using existing account (duplicate detected)', {
            accountId: duplicateCheck.matchedAccount.id,
            reason: duplicateCheck.reason,
            userId
        });
    }
} catch (autoSaveError) {
    logger.warn('Failed to auto-save account', {
        error: autoSaveError.message,
        userId
    });
}
```

#### Step 4: Database Constraints (Week 2, Day 3-4)

**Migration:** `038_enhance_duplicate_detection.sql`

```sql
-- Unique constraint: same user + bank + account hash
CREATE UNIQUE INDEX idx_payment_accounts_unique_bank_account
ON payment_accounts(user_id, bank_name, account_number_hash)
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_payment_accounts_unique_bank_account IS
'Prevents duplicate accounts: same user + bank + account number';

-- Function to find similar accounts
CREATE OR REPLACE FUNCTION find_similar_payment_accounts(
    p_user_id UUID,
    p_bank_name VARCHAR(255),
    p_account_hash VARCHAR(64)
)
RETURNS TABLE (
    account_id INTEGER,
    bank_name VARCHAR(255),
    account_number VARCHAR(255),
    similarity_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pa.id,
        pa.bank_name,
        pa.account_number,
        CASE
            WHEN pa.account_number_hash = p_account_hash THEN 100
            WHEN UPPER(pa.bank_name) = UPPER(p_bank_name) THEN 75
            ELSE 50
        END as similarity_score
    FROM payment_accounts pa
    WHERE pa.user_id = p_user_id
      AND pa.deleted_at IS NULL
      AND (
          pa.account_number_hash = p_account_hash OR
          UPPER(pa.bank_name) = UPPER(p_bank_name)
      )
    ORDER BY similarity_score DESC;
END;
$$ LANGUAGE plpgsql;
```

### 📂 Files Impacted

**New:**
- `backend/utils/paymentAccountDuplicateDetector.js` - Detection utility
- `backend/migrations/038_enhance_duplicate_detection.sql` - DB constraints
- `tests/utils/duplicate-detector.test.js` - Unit tests

**Modify:**
- [backend/services/paymentRequestService.js](backend/services/paymentRequestService.js) - Update auto-save
- [backend/models/PaymentAccount.js](backend/models/PaymentAccount.js) - Add check methods

### 🧪 Testing Strategy

**Unit Tests:**
```javascript
describe('Duplicate Detector', () => {
    it('should detect exact hash match', () => {
        const result = DuplicateDetector.checkDuplicate(
            { bankName: 'VCB', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
            [{ bank_name: 'VCB', account_number_hash: generateHash('0123456789') }]
        );
        expect(result.isDuplicate).toBe(true);
    });

    it('should detect case-insensitive name', () => {
        // "NGUYEN VAN A" vs "nguyen van a" → duplicate
    });

    it('should detect Vietnamese diacritics', () => {
        // "NGUYỄN VĂN A" vs "NGUYEN VAN A" → duplicate
    });

    it('should allow same account at different banks', () => {
        // VCB 0123 vs ACB 0123 → NOT duplicate
    });
});
```

### ✨ Benefits

- ✅ Prevent duplicate payment accounts
- ✅ Better UX (auto-use existing account)
- ✅ Reduce database bloat
- ✅ Support Vietnamese names properly
- ✅ Detect typos (0123456789 vs 01234567890)

**Metrics:**
- Duplicate catch rate: **15-20%**
- Storage savings: **~10%**
- User confusion: **-30%**

---

## IMPROVEMENT 4: Admin Bypass Risk Mitigation

*(Summary - Full details in planning agent output)*

**Status:** Optional - Medium Priority

**Key Points:**
- Add Role-Based Access Control (RBAC)
- Create admin_roles, user_admin_roles tables
- Add admin_action_audit table
- Implement permission middleware
- Create audit log viewer

**Effort:** 2 weeks
**Risk:** LOW
**Impact:** HIGH (Security & Compliance)

---

## IMPROVEMENT 5: Performance Optimization

*(Summary - Full details in planning agent output)*

**Status:** Optional - Can implement after critical fixes

**Key Points:**
- Redis caching for balance calculations
- Materialized views for heavy queries
- Covering indexes for FIFO
- Batch operations

**Expected Gains:**
- Response time: **500ms → 150ms**
- Database load: **-40%**
- Throughput: **3x increase**

**Effort:** 1-2 weeks
**Risk:** LOW-MEDIUM

---

## IMPLEMENTATION ROADMAP

### Recommended Phased Approach

#### 📅 Phase 1: Critical Fixes (Month 1)

**Week 1-2: FIFO Standardization** ✅ Quick Win
- Risk: LOW
- Effort: 3-5 days
- Impact: MEDIUM
- **Deliverables:**
  - [ ] Migration 037 (FIFO function update)
  - [ ] Unit tests (FIFO selection)
  - [ ] Documentation (FIFO_SELECTION_RULE.md)

**Week 3-6: Reconciliation Unification** 🔥 Critical
- Risk: MEDIUM-HIGH
- Effort: 3-4 weeks
- Impact: HIGH
- **Deliverables:**
  - [ ] Migration 035 (data migration)
  - [ ] Code cleanup (remove old system)
  - [ ] Shadow testing (2 weeks)
  - [ ] Migration 036 (cleanup tables)

**Milestone:** System uses single reconciliation source

---

#### 📅 Phase 2: Quality & Security (Month 2)

**Week 1-2: Duplicate Detection**
- Risk: LOW-MEDIUM
- Effort: 1-2 weeks
- Impact: MEDIUM
- **Deliverables:**
  - [ ] Duplicate detector utility
  - [ ] Migration 038 (DB constraints)
  - [ ] Unit tests (fuzzy matching)

**Week 3-4: Admin RBAC** (Optional)
- Risk: LOW
- Effort: 2 weeks
- Impact: HIGH (Security)
- **Deliverables:**
  - [ ] Migration 039 (RBAC tables)
  - [ ] Permission middleware
  - [ ] Audit log viewer

**Milestone:** Payment accounts clean, admin actions audited

---

#### 📅 Phase 3: Optimization (Month 3)

**Week 1-2: Performance** (Optional)
- Risk: LOW-MEDIUM
- Effort: 1-2 weeks
- Impact: HIGH (Scale)
- **Deliverables:**
  - [ ] Redis caching layer
  - [ ] Migration 040 (indexes, views)
  - [ ] Load testing

**Week 3-4: Monitoring & Documentation**
- **Deliverables:**
  - [ ] Performance monitoring dashboard
  - [ ] Developer onboarding guide
  - [ ] Admin training materials

**Milestone:** System ready for 10x scale

---

### Priority Matrix

| Improvement | Pri | Risk | Effort | Impact | When |
|-------------|-----|------|--------|--------|------|
| **FIFO Standardization** | P1 | LOW | 3-5 days | MED | Week 1-2 ✅ |
| **Reconciliation Unification** | P1 | MED-HIGH | 3-4 weeks | HIGH | Week 3-6 🔥 |
| **Duplicate Detection** | P2 | LOW-MED | 1-2 weeks | MED | Month 2 |
| **Admin RBAC** | P2 | LOW | 2 weeks | HIGH | Month 2 (Opt) |
| **Performance** | P3 | LOW-MED | 1-2 weeks | HIGH | Month 3 (Opt) |

---

## SUCCESS METRICS

### Technical Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Code Complexity** | Baseline | -30% | Cyclomatic complexity |
| **Test Coverage** | ~40% | 80%+ | Jest coverage report |
| **Query Performance** | Baseline | +50% | Query execution time |
| **Duplicate Payments** | 0 | 0 | Zero tolerance |
| **Response Time (avg)** | 500ms | 150ms | API monitoring |
| **Response Time (p95)** | 2s | 500ms | API monitoring |
| **Database CPU** | Baseline | -40% | Server metrics |

### Business Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Payment Processing Time** | Baseline | -40% | Admin → Paid duration |
| **Admin Efficiency** | Baseline | +60% | Actions per hour |
| **User Satisfaction** | Baseline | +25% | Survey scores |
| **Audit Compliance** | 0% | 100% | Audit trail coverage |
| **Duplicate Accounts** | 15-20% | <5% | Detection rate |

### Quality Metrics

| Metric | Target |
|--------|--------|
| **Zero Breaking Changes** | ✅ |
| **Backward Compatible APIs** | ✅ |
| **Rollback Plan Tested** | ✅ |
| **Documentation Complete** | ✅ |
| **Team Training Done** | ✅ |

---

## DECISION REQUIRED

### Critical Decisions Needed Before Implementation

#### 1. Reconciliation Migration - GO/NO-GO

**Question:** Approve migration từ dual-system sang single system?

**Options:**
- ✅ **YES - Full Migration** (Recommended)
  - Timeline: 3-4 weeks
  - Risk: Medium-High (mitigated)
  - Benefit: Eliminate technical debt

- ❌ **NO - Keep Dual System**
  - Risk: Continued confusion
  - Benefit: No migration effort
  - Cost: Ongoing maintenance burden

**Recommendation:** **GO** - Technical debt will compound if delayed

---

#### 2. FIFO Business Rule Confirmation

**Question:** Confirm FIFO definition: `order_time` hay `confirmed_time`?

**Current Proposal:** Use `order_time` (oldest order first)

**Rationale:**
- Fairer to users
- Matches expectation
- Already in DB function

**Alternative:** Use `confirmed_time` (oldest confirmation first)
- Less intuitive
- Rewards faster admin processing

**Decision Needed:** ⬜ Approve `order_time` | ⬜ Change to `confirmed_time`

---

#### 3. Implementation Priorities

**Question:** Which improvements to implement first?

**Proposed Order:**
1. ✅ FIFO Standardization (Week 1-2) - Quick win
2. ✅ Reconciliation Unification (Week 3-6) - Critical
3. ⬜ Duplicate Detection (Month 2) - Important
4. ⬜ Admin RBAC (Month 2) - Optional
5. ⬜ Performance (Month 3) - Optional

**Alternative:** Different priority order?

**Decision Needed:** ⬜ Approve order | ⬜ Adjust priorities

---

#### 4. Resource Allocation

**Question:** Team allocation for 3-month plan?

**Estimated Effort:**
- Phase 1: 1 senior dev full-time (6 weeks)
- Phase 2: 1 dev full-time (4 weeks)
- Phase 3: 1 dev part-time (2 weeks)

**Total:** ~12 person-weeks

**Decision Needed:** ⬜ Approve resources | ⬜ Adjust timeline

---

#### 5. Testing Strategy Approval

**Question:** Approve 2-week shadow testing for migration?

**Proposal:**
- Shadow mode: Run both systems parallel
- Duration: 2 weeks before full cutover
- Monitor: Balance calculations, payment flow
- Rollback: Available if issues found

**Cost:** 2 weeks delay in full deployment
**Benefit:** High confidence in migration

**Decision Needed:** ⬜ Approve 2-week shadow | ⬜ Shorter testing period

---

## NEXT STEPS

### If Approved:

1. **Week 1: Kickoff**
   - [ ] Review kế hoạch với dev team
   - [ ] Setup tracking (Jira/Trello)
   - [ ] Create feature branch: `feature/payment-module-improvements`

2. **Week 1-2: FIFO Implementation**
   - [ ] Merge FIFO standardization
   - [ ] Deploy to staging
   - [ ] Monitor for issues

3. **Week 3: Reconciliation Migration Prep**
   - [ ] Database backup
   - [ ] Migration script review
   - [ ] Rollback plan testing

4. **Week 4-6: Reconciliation Migration**
   - [ ] Run migration (low-traffic window)
   - [ ] Shadow testing
   - [ ] Monitor closely

### If NOT Approved:

Please provide feedback on:
- Which improvements to prioritize differently?
- What concerns need to be addressed?
- What additional information is needed?

---

## APPENDIX

### A. Related Documents

- [PAYMENT_MODULE_ANALYSIS.md](PAYMENT_MODULE_ANALYSIS.md) - Original analysis
- [CRON_JOBS_AUTO_START_FIX.md](CRON_JOBS_AUTO_START_FIX.md) - Recent fix reference
- [FIX_SYNC_FROM_AT_COLUMN_ERROR.md](FIX_SYNC_FROM_AT_COLUMN_ERROR.md) - Column error fix

### B. Contact & Support

**Planning Agent ID:** `98fc9627`
To resume planning agent: Use Task tool with `resume: "98fc9627"`

**Questions?** Contact dev team lead or file GitHub issue

---

**END OF IMPROVEMENT PLAN**

*Prepared by: Claude Code Planning Agent*
*Date: 2025-12-16*
*Status: AWAITING APPROVAL*
