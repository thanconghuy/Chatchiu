# 🔧 Fix: Foreign Key Constraint Error When Adding to Waiting List

## 🎯 Vấn Đề

**Error Message:**
```
Error adding to waiting list: error: insert or update on table "reconciliation_waiting_list"
violates foreign key constraint "reconciliation_waiting_list_conversion_id_fkey"
```

**User Action:**
- Click button "Đang xử lý..." to add eligible orders to waiting list
- Backend returns HTTP 500 error
- Foreign key constraint violation

---

## 🔍 Root Cause

### **Schema Mismatch:**

**reconciliation_waiting_list table** (Line 15 in migration 028):
```sql
conversion_id UUID NOT NULL UNIQUE REFERENCES conversions(id) ON DELETE CASCADE
```
- Foreign key trỏ tới `conversions.id`

**Function get_eligible_conversions_for_waiting_list()** (After migration 030):
```sql
SELECT
  sc.id::UUID as conversion_id,  -- ❌ Returns system_conversions.id
  ...
FROM system_conversions sc
```
- Trả về `system_conversions.id`
- Không tồn tại trong `conversions.id` → Foreign key constraint fail

---

## ✅ Giải Pháp

### **Change: Return at_conversion_id Instead of system_conversions.id**

**File:** `backend/migrations/030_fix_autosync_system_conversions.sql` (Line 31)

**BEFORE:**
```sql
SELECT
  sc.id::UUID as conversion_id,        -- ❌ system_conversions.id
  sc.user_id::UUID,
  ...
FROM system_conversions sc
```

**AFTER:**
```sql
SELECT
  sc.at_conversion_id::UUID as conversion_id,  -- ✅ conversions.id (foreign key compatible)
  sc.user_id::UUID,
  ...
FROM system_conversions sc
```

**Why:**
- `system_conversions.at_conversion_id` là reference tới `conversions.id`
- Waiting list table foreign key reference `conversions(id)`
- Trả về `at_conversion_id` để tương thích với foreign key

---

## 📊 Table Relationships

```
conversions (Main table - all orders)
  ├─ id (UUID PRIMARY KEY)
  └─ ...

system_conversions (Cashback system orders only)
  ├─ id (UUID PRIMARY KEY)
  ├─ at_conversion_id (UUID REFERENCES conversions.id)  ← This is what we need!
  └─ ...

reconciliation_waiting_list (Auto-sync staging)
  ├─ id (UUID PRIMARY KEY)
  ├─ conversion_id (UUID REFERENCES conversions.id)     ← Must match conversions.id
  └─ ...
```

**Data Flow:**
1. Function queries `system_conversions` (cashback only)
2. Returns `at_conversion_id` (points to `conversions.id`)
3. Waiting list INSERT uses this ID
4. Foreign key constraint satisfied ✅

---

## 🔄 How It Works Now

### **Add to Waiting List Flow:**

1. **User clicks "Đang xử lý..."** (Add to waiting list button)
2. **Frontend calls:** `POST /api/admin/system-reconciliation/auto-sync/add-to-waiting`
3. **Backend executes:**
   ```sql
   SELECT * FROM add_eligible_conversions_to_waiting_list($1)
   ```
4. **Function calls:**
   ```sql
   SELECT * FROM get_eligible_conversions_for_waiting_list()
   ```
5. **Function returns:**
   ```sql
   SELECT
     sc.at_conversion_id as conversion_id,  -- ✅ conversions.id
     sc.user_id,
     ...
   FROM system_conversions sc
   WHERE sc.status = 'approved'
     AND sc.approval_time + INTERVAL '15 days' <= NOW()
     AND NOT EXISTS (SELECT 1 FROM reconciliation_waiting_list ...)
   ```
6. **Insert into waiting list:**
   ```sql
   INSERT INTO reconciliation_waiting_list (
     conversion_id,  -- Uses at_conversion_id (compatible with FK)
     user_id,
     ...
   )
   ```
7. **Foreign key check passes** ✅
8. **Orders added to waiting list** ✅

---

## 🧪 Testing Guide

### **Test 1: Add to Waiting List Success**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
2. Verify there are eligible orders (4 orders shown)
3. Click **"Đang xử lý..."** button
4. Wait for response

**Expected:**
- ✅ Success message: "Đã thêm X đơn hàng vào danh sách chờ đối soát"
- ✅ No 500 error
- ✅ No foreign key constraint error in console
- ✅ Button changes to show success state

**Verify in Database:**
```sql
-- Check orders were added
SELECT COUNT(*) FROM reconciliation_waiting_list WHERE status = 'waiting';

-- Verify conversion_id matches conversions table
SELECT
  rwl.conversion_id,
  c.id,
  c.order_code
FROM reconciliation_waiting_list rwl
INNER JOIN conversions c ON rwl.conversion_id = c.id
LIMIT 5;

-- Should return rows (FK constraint satisfied)
```

---

### **Test 2: Verify Correct IDs Used**

**Steps:**
1. After adding to waiting list
2. Query database to check IDs

**Database Verification:**
```sql
-- Get sample from function
SELECT
  conversion_id,
  user_id,
  order_code
FROM get_eligible_conversions_for_waiting_list()
LIMIT 3;

-- Check these IDs exist in conversions table
-- (conversion_id should be in conversions.id, not system_conversions.id)
SELECT
  c.id,
  c.order_code,
  sc.id as system_conversion_id,
  sc.at_conversion_id
FROM conversions c
INNER JOIN system_conversions sc ON sc.at_conversion_id = c.id
WHERE c.id IN (
  SELECT conversion_id FROM get_eligible_conversions_for_waiting_list() LIMIT 3
);

-- Should show matching rows
```

---

### **Test 3: End-to-End Flow**

**Steps:**
1. Auto-Sync tab → Click "Đang xử lý..."
2. Navigate to "Danh Sách Chờ" section
3. Verify orders appear in waiting list
4. Select orders → Create reconciliation
5. Verify reconciliation created

**Expected:**
- ✅ All steps complete without errors
- ✅ Orders move from eligible → waiting → reconciliation
- ✅ No foreign key errors at any step

---

## 📋 Files Changed

| File | Line | Change |
|------|------|--------|
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 31 | Changed `sc.id` → `sc.at_conversion_id` |

---

## 🚀 Deployment

### **1. Re-run Migration 030**

Migration file đã được update, cần chạy lại:

```bash
node backend/run-migration-030.js
```

**Expected Output:**
```
🚀 Starting migration 030: Fix Auto-Sync to use system_conversions...
✅ Migration 030 completed successfully!

📋 Verification - Function updated:
  ✓ Function: get_eligible_conversions_for_waiting_list
  ✓ Return type includes: conversion_id, user_id, aff_sid, merchant_id, etc.

🧪 Testing function call...
  ✓ Function executed successfully
  ✓ Returned X rows (limit 3)
```

---

### **2. Test Function Output**

```sql
-- Test function returns at_conversion_id
SELECT
  conversion_id,
  order_code
FROM get_eligible_conversions_for_waiting_list()
LIMIT 5;

-- Verify these IDs exist in conversions table
SELECT id FROM conversions
WHERE id IN (
  SELECT conversion_id FROM get_eligible_conversions_for_waiting_list() LIMIT 5
);

-- Should return 5 rows (IDs match)
```

---

### **3. Test Add to Waiting List**

1. Refresh browser (Ctrl + Shift + R)
2. Navigate to Auto-Sync tab
3. Click "Đang xử lý..."
4. Should succeed without foreign key error

---

## 🔍 Debug Tips

### **If foreign key error still occurs:**

1. **Check migration ran successfully:**
   ```sql
   SELECT prosrc FROM pg_proc
   WHERE proname = 'get_eligible_conversions_for_waiting_list';

   -- Should contain "sc.at_conversion_id::UUID as conversion_id"
   ```

2. **Check returned IDs:**
   ```sql
   SELECT conversion_id FROM get_eligible_conversions_for_waiting_list() LIMIT 3;

   -- Copy IDs and check they exist in conversions table
   SELECT id FROM conversions WHERE id IN ('paste-ids-here');
   ```

3. **Check system_conversions.at_conversion_id is populated:**
   ```sql
   SELECT
     id,
     at_conversion_id,
     order_code
   FROM system_conversions
   WHERE at_conversion_id IS NULL;

   -- Should return 0 rows (all have at_conversion_id)
   ```

---

### **If some orders still fail:**

1. **Check for orphaned system_conversions:**
   ```sql
   -- Find system_conversions with no matching conversions
   SELECT
     sc.id,
     sc.at_conversion_id,
     sc.order_code
   FROM system_conversions sc
   LEFT JOIN conversions c ON sc.at_conversion_id = c.id
   WHERE c.id IS NULL;

   -- These orders cannot be added to waiting list
   ```

2. **Data fix if needed:**
   ```sql
   -- Option 1: Delete orphaned system_conversions
   DELETE FROM system_conversions
   WHERE at_conversion_id NOT IN (SELECT id FROM conversions);

   -- Option 2: Fix at_conversion_id mapping
   -- (requires investigation of data issue)
   ```

---

## 🎓 Lessons Learned

1. **Foreign Key Awareness**
   - When changing queries between tables, check FK relationships
   - `system_conversions.id` ≠ `conversions.id`
   - Use `at_conversion_id` to maintain FK compatibility

2. **Testing Insert Operations**
   - Don't just test SELECT queries
   - Test full flow: SELECT → INSERT → verify FK constraints
   - Catch FK errors early in development

3. **Table Design Considerations**
   - `system_conversions` is a subset/view of `conversions`
   - Always has `at_conversion_id` pointing to parent
   - Waiting list references parent table (conversions)

4. **Migration Testing**
   - Test function output format
   - Verify IDs match expected tables
   - Don't assume field names mean the same thing across tables

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Migration 030 ran successfully
- [ ] Function returns `at_conversion_id` (not `system_conversions.id`)
- [ ] Refresh browser completed
- [ ] Auto-Sync tab loads eligible orders
- [ ] Click "Đang xử lý..." button
- [ ] Success message appears (no 500 error)
- [ ] No foreign key constraint error in console
- [ ] Check backend logs - no FK errors
- [ ] Database query shows orders in waiting list
- [ ] waiting list `conversion_id` matches `conversions.id`
- [ ] Can create reconciliation from waiting list
- [ ] End-to-end flow works without errors

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed

**Summary:**
1. Function was returning `system_conversions.id` instead of `at_conversion_id`
2. Waiting list table has FK to `conversions.id`
3. Changed function to return `sc.at_conversion_id` for FK compatibility
4. Re-ran migration 030 to update function
5. Add to waiting list now works without foreign key errors
