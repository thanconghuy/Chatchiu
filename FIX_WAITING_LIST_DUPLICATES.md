# Fix Waiting List Duplicates Issue

## 🐛 Vấn đề

**Conversions đã tồn tại trong kỳ đối soát nhưng vẫn còn trong danh sách chờ**

### Triệu chứng:
1. Admin tạo kỳ đối soát từ waiting list
2. Các đơn hàng được thêm vào reconciliation thành công
3. Nhưng các đơn vẫn còn trong `reconciliation_waiting_list` ❌
4. Khi xem tab "Danh Sách Chờ", vẫn thấy các đơn đã được xử lý

### Evidence:
- Screenshot 1: Kỳ "Tháng 12/2025 - Đợt 1" có 3 đơn hàng
- Screenshot 2: Tab "Danh Sách Chờ" vẫn hiển thị 3 đơn hàng đó

**Impact:**
- Gây confusion cho admin
- Có thể tạo duplicate reconciliations
- Waiting list không phản ánh đúng trạng thái

---

## 🔍 Root Cause Analysis

### Nguyên nhân: Logic không nhất quán khi tạo reconciliation

Có 2 flows tạo reconciliation:

#### Flow 1: Manual Create (từ preview)
**Route:** `POST /api/admin/system-reconciliation/create`
**Service:** `SystemReconciliationService.createReconciliation()`

**Vấn đề:**
```javascript
// SystemReconciliationService.js:175-184 (CŨ)
// Update conversions status to 'pending'
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'pending',
      system_reconciliation_id = $1,
      system_reconciled_at = CURRENT_TIMESTAMP
  WHERE id = ANY($2)
`, [reconciliation.id, orders.map(o => o.conversion_id)]);

// ❌ MISSING: No logic to remove from waiting list!
```

#### Flow 2: Add to Existing Reconciliation
**Route:** `POST /api/admin/system-reconciliation/:id/add-orders`
**Service:** `SystemReconciliationService.addOrdersToReconciliation()`

**OK:**
```javascript
// SystemReconciliationService.js:685-690 (ĐÃ CÓ)
// Remove from waiting list (if exists)
const conversionIds = orders.map(o => o.conversion_id);
await client.query(`
  DELETE FROM reconciliation_waiting_list
  WHERE conversion_id = ANY($1)
`, [conversionIds]);
```

#### Flow 3: Create from Waiting List
**Route:** `POST /api/admin/system-reconciliation/auto-sync/create-from-waiting`

**Vấn đề:**
```javascript
// systemReconciliationAdmin.js:1250-1254 (CŨ)
// Move orders from waiting list to reconciled status
const movedResult = await pool.query(
  'SELECT move_from_waiting_to_reconciliation($1, $2) as moved_count',
  [reconciliation.id, selectedOrderIds]
);
```

Function `move_from_waiting_to_reconciliation()` **UPDATE status = 'reconciled'** thay vì **DELETE**:
```sql
-- Migration 028_create_reconciliation_waiting_list.sql:255-267
UPDATE reconciliation_waiting_list
SET
  status = 'reconciled',
  selected_for_reconciliation_id = p_reconciliation_id,
  updated_at = NOW()
WHERE conversion_id = ANY(p_conversion_ids)
  AND status = 'waiting';

-- ❌ KHÔNG DELETE, CHỈ UPDATE STATUS!
```

### Tổng kết nguyên nhân:
1. ❌ `createReconciliation()` không xóa khỏi waiting list
2. ✅ `addOrdersToReconciliation()` có xóa (inconsistent)
3. ❌ Function `move_from_waiting_to_reconciliation()` chỉ UPDATE status, không DELETE

**Result:** Orders ở status `'reconciled'` vẫn tồn tại trong table, nhưng query waiting list filter `WHERE status = 'waiting'` nên không hiển thị.

**NHƯNG:** Nếu có bug hoặc data inconsistency, records với status `'reconciled'` sẽ leak vào UI.

---

## ✅ Giải pháp đã triển khai

### 1. **Fix createReconciliation() - Add DELETE logic**

File: [backend/services/systemReconciliation/SystemReconciliationService.js:186-192](backend/services/systemReconciliation/SystemReconciliationService.js#L186-L192)

**Before:**
```javascript
// Update conversions status to 'pending'
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'pending',
      system_reconciliation_id = $1,
      system_reconciled_at = CURRENT_TIMESTAMP
  WHERE id = ANY($2)
`, [reconciliation.id, orders.map(o => o.conversion_id)]);

// Log creation
await client.query(...);
```

**After:**
```javascript
// Update conversions status to 'pending'
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'pending',
      system_reconciliation_id = $1,
      system_reconciled_at = CURRENT_TIMESTAMP
  WHERE id = ANY($2)
`, [reconciliation.id, orders.map(o => o.conversion_id)]);

// Remove from waiting list (if exists)
// Orders may have been added via auto-sync waiting list
const conversionIds = orders.map(o => o.conversion_id);
await client.query(`
  DELETE FROM reconciliation_waiting_list
  WHERE conversion_id = ANY($1)
`, [conversionIds]);

// Log creation
await client.query(...);
```

**Lợi ích:**
- ✅ Consistent behavior: tất cả các flows đều cleanup waiting list
- ✅ Idempotent: DELETE an toàn ngay cả khi order không có trong waiting list
- ✅ Transaction safety: Nằm trong COMMIT block

---

### 2. **Update create-from-waiting route**

File: [backend/routes/systemReconciliationAdmin.js:1250-1251](backend/routes/systemReconciliationAdmin.js#L1250-L1251)

**Before:**
```javascript
// Move orders from waiting list to reconciled status
const movedResult = await pool.query(
  'SELECT move_from_waiting_to_reconciliation($1, $2) as moved_count',
  [reconciliation.id, selectedOrderIds]
);

const movedCount = movedResult.rows[0].moved_count;

// ... use movedCount in response
```

**After:**
```javascript
// Note: Waiting list cleanup is now handled automatically in SystemReconciliationService
// Both createReconciliation() and addOrdersToReconciliation() delete from waiting list

// Get remaining waiting list count
const remainingResult = await pool.query(
  'SELECT COUNT(*) as remaining FROM reconciliation_waiting_list WHERE status = $1',
  ['waiting']
);
const remaining = parseInt(remainingResult.rows[0].remaining);

// ... use remaining in response
```

**Changes:**
- ❌ Removed call to `move_from_waiting_to_reconciliation()` (redundant)
- ✅ Service layer now handles cleanup automatically
- ✅ Simpler code, single source of truth

---

### 3. **Cleanup existing duplicates**

File: [cleanup-waiting-list-duplicates.js](cleanup-waiting-list-duplicates.js)

**Script đã chạy thành công:**
```bash
$ node cleanup-waiting-list-duplicates.js

========================================
🧹 Cleanup Waiting List Duplicates
========================================

1. Finding duplicates...
   Found 7 duplicate orders in waiting list

2. Duplicates by reconciliation period:
   • Tháng 12/2025 - Đợt 1 (draft): 7 orders

3. Deleting duplicates from waiting list...
   ✅ Deleted 7 duplicate records

4. Verifying cleanup...
   ✅ All duplicates removed successfully

5. Current waiting list summary:
   Total waiting orders: 0
   Months: 0
   Total cashback: 0 VNĐ

========================================
✅ Cleanup Completed Successfully
========================================
```

**Query sử dụng:**
```sql
-- Delete orders from waiting list if they exist in reconciliations
DELETE FROM reconciliation_waiting_list
WHERE conversion_id IN (
  SELECT sri.conversion_id
  FROM system_reconciliation_items sri
);
```

---

## 📊 Luồng hoạt động sau khi fix

### Scenario 1: Tạo reconciliation từ waiting list

```
Admin clicks "Tạo Kỳ Đối Soát" from waiting list
    ↓
Frontend: POST /api/admin/system-reconciliation/auto-sync/create-from-waiting
    ↓
Backend Route: Get orders from waiting list (status = 'waiting')
    ↓
Call: SystemReconciliationService.createReconciliation(orderIds)
    ↓
Service: BEGIN TRANSACTION
    ↓
Service: INSERT INTO system_reconciliations
    ↓
Service: INSERT INTO system_reconciliation_items
    ↓
Service: UPDATE conversions SET system_reconciliation_id = ...
    ↓
Service: DELETE FROM reconciliation_waiting_list  ← NEW!
    ↓
Service: COMMIT
    ↓
Response: { success: true, order_count: N }
    ↓
Frontend: Reload waiting list → Empty ✅
```

### Scenario 2: Tạo reconciliation manual (từ preview)

```
Admin selects date range & previews orders
    ↓
Admin selects specific order IDs
    ↓
Frontend: POST /api/admin/system-reconciliation/create
    ↓
Call: SystemReconciliationService.createReconciliation(orderIds)
    ↓
Service: BEGIN TRANSACTION
    ↓
Service: Check orders not already reconciled
    ↓
Service: INSERT INTO system_reconciliations
    ↓
Service: INSERT INTO system_reconciliation_items
    ↓
Service: UPDATE conversions
    ↓
Service: DELETE FROM reconciliation_waiting_list  ← NEW!
    ↓
Service: COMMIT
    ↓
Response: { success: true }
```

**Benefit:** Nếu order đã được auto-sync vào waiting list, sẽ tự động cleanup khi tạo reconciliation manual.

---

## 🧪 Testing

### Test 1: Tạo reconciliation từ waiting list
```bash
# 1. Check waiting list có orders
GET /api/admin/system-reconciliation/auto-sync/waiting-list
→ Expect: Orders with status = 'waiting'

# 2. Create reconciliation from waiting list
POST /api/admin/system-reconciliation/auto-sync/create-from-waiting
{
  "month": "2025-12-01",
  "periodLabel": "Tháng 12/2025 - Test"
}
→ Expect: Success

# 3. Check waiting list again
GET /api/admin/system-reconciliation/auto-sync/waiting-list
→ Expect: Empty (orders removed)

# 4. Verify orders in reconciliation
GET /api/admin/system-reconciliation/{id}/items
→ Expect: Orders present
```

### Test 2: Tạo reconciliation manual
```bash
# 1. Add orders to waiting list manually
SELECT add_eligible_conversions_to_waiting_list('admin');

# 2. Create reconciliation via preview (not from waiting list)
POST /api/admin/system-reconciliation/create
{
  "periodStart": "2025-12-01",
  "periodEnd": "2025-12-31",
  "periodLabel": "Tháng 12/2025",
  "selectedOrderIds": ["uuid1", "uuid2", "uuid3"]
}
→ Expect: Success

# 3. Check waiting list
SELECT * FROM reconciliation_waiting_list
WHERE conversion_id IN ('uuid1', 'uuid2', 'uuid3');
→ Expect: Empty (auto-deleted)
```

### Test 3: Add orders to existing reconciliation
```bash
# 1. Create reconciliation with some orders
POST /api/admin/system-reconciliation/create
{ ... }

# 2. Add more orders from waiting list
POST /api/admin/system-reconciliation/{id}/add-orders
{
  "orderIds": ["uuid4", "uuid5"]
}
→ Expect: Success

# 3. Check waiting list
→ Expect: uuid4, uuid5 removed from waiting list
```

---

## 📁 Files Modified

1. ✅ [backend/services/systemReconciliation/SystemReconciliationService.js:186-192](backend/services/systemReconciliation/SystemReconciliationService.js#L186-L192)
   - Added DELETE from waiting list in `createReconciliation()`

2. ✅ [backend/routes/systemReconciliationAdmin.js:1250-1251](backend/routes/systemReconciliationAdmin.js#L1250-L1251)
   - Removed redundant `move_from_waiting_to_reconciliation()` call

3. 📝 [cleanup-waiting-list-duplicates.js](cleanup-waiting-list-duplicates.js)
   - Cleanup script for existing duplicates (ran successfully)

---

## 🚀 Deployment

### Local (Already Applied):
```bash
✅ Service logic updated
✅ Route updated
✅ Duplicates cleaned up (7 records deleted)
✅ Waiting list now shows 0 orders
```

### Production (Vercel):
```bash
# 1. Commit changes
git add backend/services/systemReconciliation/SystemReconciliationService.js
git add backend/routes/systemReconciliationAdmin.js
git add cleanup-waiting-list-duplicates.js
git add FIX_WAITING_LIST_DUPLICATES.md

git commit -m "Fix waiting list duplicates issue

- Add DELETE from waiting list in createReconciliation()
- Remove redundant move_from_waiting_to_reconciliation() call
- Cleanup existing duplicates in database
- Ensure consistent behavior across all reconciliation flows

Fixes: Orders staying in waiting list after being added to reconciliation"

# 2. Push to main
git push origin main

# 3. Vercel auto-deploys

# 4. After deploy, run cleanup on production
node cleanup-waiting-list-duplicates.js
```

---

## ✅ Validation

### Before fix:
- ❌ 7 orders trong waiting list
- ❌ 7 orders cũng có trong reconciliation "Tháng 12/2025 - Đợt 1"
- ❌ Duplicates

### After fix:
- ✅ 0 orders trong waiting list
- ✅ 7 orders chỉ có trong reconciliation
- ✅ No duplicates
- ✅ Waiting list query trả về empty

---

## 🔧 Technical Details

### Database Schema:
```sql
-- reconciliation_waiting_list table
CREATE TABLE reconciliation_waiting_list (
  id UUID PRIMARY KEY,
  conversion_id UUID NOT NULL REFERENCES conversions(id),
  status VARCHAR(20) DEFAULT 'waiting',  -- waiting | reconciled | selected
  selected_for_reconciliation_id UUID,
  ...
);

-- Status values:
-- 'waiting'    → In waiting list, ready for selection
-- 'selected'   → Selected by admin but not yet in reconciliation (UNUSED)
-- 'reconciled' → Moved to reconciliation (OLD BEHAVIOR - NOT USED ANYMORE)
```

### New Behavior:
- **Before:** UPDATE status to 'reconciled', keep record
- **After:** DELETE record entirely

### Why DELETE instead of UPDATE?
1. **Simpler logic:** No need to track status
2. **Cleaner data:** No orphaned records
3. **Better performance:** Smaller table, faster queries
4. **No use case:** Reconciled orders don't need waiting list record
5. **Audit trail:** Already tracked in `system_reconciliation_items` and logs

---

## 📝 Future Improvements

### Optional: Add database constraint
```sql
-- Prevent duplicates at database level
CREATE UNIQUE INDEX idx_waiting_list_unique_conversion
ON reconciliation_waiting_list(conversion_id)
WHERE status = 'waiting';

-- This ensures a conversion_id can only appear once with status='waiting'
```

### Optional: Add validation in API
```javascript
// Before adding to waiting list, check if already in reconciliation
const existing = await pool.query(`
  SELECT COUNT(*) as count
  FROM system_reconciliation_items
  WHERE conversion_id = $1
`, [conversionId]);

if (existing.rows[0].count > 0) {
  throw new Error('Order already in a reconciliation period');
}
```

---

**Status:** ✅ Fixed & Tested
**Date:** 2026-01-02
**Cleanup:** 7 duplicate records removed
**Generated by:** Claude Code 🤖
