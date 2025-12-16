# 🔧 Fix: Auto-Sync Eligible Orders Query - Use system_conversions Only

## 🎯 Vấn Đề

**User Feedback (Verbatim):**
> "Auto sync đơn hàng đủ điều kiện đối soát nhưng sai điều kiện, chỉ tính đối soát với các đơn hàng của hệ thống cashback. bảng system_conversions chỉ lưu các đơn hàng của hệ thống. nhưng trong ảnh tôi cung cấp tôi thấy bạn đã load hết các đơn hàng của bản conversion, bổ sung thêm cột Aff Sid. Kiểm tra lại query xử lý đơn hàng đủ điều kiện."

### **Root Cause:**

Function `get_eligible_conversions_for_waiting_list()` đang query từ bảng **`conversions`** thay vì **`system_conversions`**.

**Bảng conversions vs system_conversions:**
- **`conversions`** - Lưu **TẤT CẢ** đơn hàng từ AccessTrade API:
  - ✅ Đơn hàng từ Affiliate Program (user tự click link)
  - ✅ Đơn hàng từ Cashback System (user click từ hệ thống)

- **`system_conversions`** - Chỉ lưu đơn hàng **Cashback System**:
  - ❌ Không có đơn hàng Affiliate Program
  - ✅ Chỉ có đơn hàng từ clicks được track bởi hệ thống

**Vấn đề:**
- Auto-Sync đang load đơn hàng từ `conversions` → bao gồm cả Affiliate Program
- Nhưng đối soát hệ thống chỉ nên xử lý `system_conversions` → chỉ Cashback System
- Kết quả: Có đơn hàng không thuộc hệ thống xuất hiện trong danh sách đủ điều kiện

**Missing Column:**
- User yêu cầu thêm cột **"Aff Sid"** để phân biệt nguồn click
- `aff_sid` là field trong bảng `clicks`, cần JOIN để lấy

---

## ✅ Giải Pháp

### **Backend Changes**

**File:** `backend/migrations/030_fix_autosync_system_conversions.sql`

#### **Change 1: Query from system_conversions Instead of conversions**

**BEFORE (Lines 51-52 in migration 029):**
```sql
FROM conversions c
LEFT JOIN users u ON c.user_id = u.id
```

**AFTER (Lines 54-56 in migration 030):**
```sql
FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN clicks cl ON sc.click_id = cl.id
```

**Why:**
- `system_conversions` chỉ chứa cashback orders
- Loại bỏ affiliate program orders
- JOIN với `clicks` để lấy `aff_sid`

---

#### **Change 2: Add aff_sid Column to Return Type**

**BEFORE (Lines 9-25 in migration 029):**
```sql
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
  user_email VARCHAR(255),
  user_full_name VARCHAR(255),
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  -- NO aff_sid!
  ...
)
```

**AFTER (Lines 10-26 in migration 030):**
```sql
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
  user_email VARCHAR(255),
  user_full_name VARCHAR(255),
  aff_sid VARCHAR(255),          -- ✅ NEW!
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  ...
)
```

---

#### **Change 3: Select aff_sid from clicks Table**

**ADDED (Line 35 in migration 030):**
```sql
SELECT
  sc.id::UUID as conversion_id,
  sc.user_id::UUID,
  u.email::VARCHAR(255) as user_email,
  u.full_name::VARCHAR(255) as user_full_name,
  COALESCE(cl.aff_sid, 'N/A')::VARCHAR(255) as aff_sid,  -- ✅ FROM clicks table
  ...
```

**Why:**
- `aff_sid` field tồn tại trong `clicks` table, không phải `system_conversions`
- LEFT JOIN với `clicks` để lấy aff_sid
- COALESCE để handle NULL values (hiển thị 'N/A')

---

#### **Change 4: Fix Column Name (order_value → order_amount)**

**BEFORE (Line 36 in initial draft):**
```sql
COALESCE(sc.order_value, 0)::DECIMAL(15,2) as order_amount,
```

**AFTER (Line 39 in migration 030):**
```sql
COALESCE(sc.order_amount, 0)::DECIMAL(15,2) as order_amount,
```

**Why:**
- `system_conversions` table uses `order_amount` not `order_value`
- Different naming convention from `conversions` table

---

### **Frontend Changes**

**File:** `frontend/admin/system-reconciliation.html` (Lines 2270-2337)

#### **Add "Aff Sid" Column to Table Header**

**BEFORE:**
```html
<thead>
    <tr>
        <th>☑️</th>
        <th>Người dùng</th>
        <th>Nhà bán hàng</th>
        <th>Mã đơn</th>
        ...
    </tr>
</thead>
```

**AFTER (Line 2280):**
```html
<thead>
    <tr>
        <th>☑️</th>
        <th>Người dùng</th>
        <th>Aff Sid</th>  <!-- ✅ NEW COLUMN -->
        <th>Nhà bán hàng</th>
        <th>Mã đơn</th>
        ...
    </tr>
</thead>
```

---

#### **Display aff_sid in Table Body**

**ADDED (Lines 2306-2310):**
```html
<td>
    <code style="background: #fef3c7; padding: 4px 8px; border-radius: 4px; font-size: 0.875rem; color: #92400e;">
        ${escapeHtml(order.aff_sid || 'N/A')}
    </code>
</td>
```

**Styling:**
- Yellow background (#fef3c7) to distinguish from order_code (gray background)
- Code tag for monospace font
- Fallback to 'N/A' if aff_sid is null

---

## 🔄 How It Works Now

### **User Flow:**

1. **User navigates to Auto-Sync tab**
2. **Clicks "Xem đơn hàng đủ điều kiện"**
3. **Backend calls** `get_eligible_conversions_for_waiting_list()`
4. **Function queries system_conversions:**
   ```sql
   SELECT * FROM system_conversions sc
   LEFT JOIN users u ON sc.user_id = u.id
   LEFT JOIN clicks cl ON sc.click_id = cl.id
   WHERE sc.status = 'approved'
     AND sc.approval_time + INTERVAL '15 days' <= NOW()
     AND NOT EXISTS (SELECT 1 FROM reconciliation_waiting_list ...)
     AND (sc.system_reconciliation_status IS NULL OR ...)
   ```
5. **Returns only cashback system orders** (not affiliate program)
6. **Frontend displays table with:**
   - Checkbox
   - Người dùng
   - **Aff Sid** (NEW!)
   - Nhà bán hàng
   - Mã đơn
   - Giá trị đơn
   - Hoa hồng
   - Cashback
   - TT đơn hàng
   - TT đối soát
   - Thời gian

---

## 🧪 Testing Guide

### **Test 1: Only System Conversions Displayed**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
2. Click **"Xem đơn hàng đủ điều kiện"**
3. Check displayed orders

**Expected:**
- ✅ Only shows orders from `system_conversions` table
- ✅ NO affiliate program orders
- ✅ All orders have corresponding clicks in `clicks` table

**Verify in Database:**
```sql
-- Check function returns only system_conversions
SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list();

-- Compare with total conversions
SELECT COUNT(*) FROM conversions WHERE status = 'approved';

-- Count should be LESS if there are affiliate orders
```

---

### **Test 2: Aff Sid Column Displayed**

**Steps:**
1. Open Auto-Sync eligible orders table
2. Check column headers
3. Check data rows

**Expected Table Structure:**
| Column | Data Example |
|--------|--------------|
| ☑️ | Checkbox |
| Người dùng | test@example.com |
| **Aff Sid** | **abc123xyz** (yellow badge) |
| Nhà bán hàng | Shopee |
| Mã đơn | ORDER123 (gray badge) |
| ... | ... |

**Visual Check:**
- ✅ "Aff Sid" column exists between "Người dùng" and "Nhà bán hàng"
- ✅ Values displayed in yellow code badge
- ✅ Shows 'N/A' if aff_sid is null

---

### **Test 3: Data Accuracy**

**Steps:**
1. Select an order from eligible list
2. Note the conversion_id
3. Verify in database

**Database Verification:**
```sql
-- Check order is in system_conversions
SELECT
  sc.id,
  sc.order_code,
  sc.merchant_name,
  sc.cashback_amount,
  cl.aff_sid,
  u.email
FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN clicks cl ON sc.click_id = cl.id
WHERE sc.id = 'conversion_id_here';

-- Verify it's NOT an affiliate order
-- (Should have click_id that exists in clicks table)
```

**Expected:**
- ✅ Order exists in `system_conversions`
- ✅ Has `click_id` linking to `clicks` table
- ✅ `aff_sid` matches what's displayed in UI
- ✅ User email matches

---

### **Test 4: Create Reconciliation from Auto-Sync**

**Steps:**
1. Select some eligible orders
2. Click **"Tạo Kỳ Đối Soát"**
3. Verify reconciliation created

**Expected:**
- ✅ Reconciliation created successfully
- ✅ Only selected orders added
- ✅ All orders are from `system_conversions`
- ✅ No affiliate program orders included

---

## 📋 Files Changed

| File | Lines | Change |
|------|-------|--------|
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 1-80 | Created new migration |
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 54-56 | Changed FROM conversions → system_conversions, added clicks JOIN |
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 10-26 | Added aff_sid to RETURNS TABLE |
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 35 | SELECT aff_sid from clicks table |
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 39 | Fixed order_value → order_amount |
| `backend/run-migration-030.js` | 1-75 | Created migration runner script |
| `frontend/admin/system-reconciliation.html` | 2280 | Added "Aff Sid" column header |
| `frontend/admin/system-reconciliation.html` | 2306-2310 | Added aff_sid display in tbody |

---

## 🗂️ Database Schema

### **Tables Used:**

#### **system_conversions** (Main table)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (conversion_id) |
| user_id | UUID | User who made the order |
| click_id | UUID | Link to clicks table |
| merchant_id | VARCHAR | Merchant ID |
| merchant_name | VARCHAR | Merchant name |
| order_code | VARCHAR | Order code |
| order_amount | DECIMAL | Order value |
| commission | DECIMAL | Commission amount |
| cashback_amount | DECIMAL | Cashback amount |
| status | VARCHAR | approved/pending/rejected |
| order_time | TIMESTAMPTZ | Order date |
| approval_time | TIMESTAMPTZ | Approval date |
| system_reconciliation_status | VARCHAR | Reconciliation status |
| system_reconciliation_id | UUID | Which reconciliation owns this |

#### **clicks** (For aff_sid)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User who clicked |
| aff_sid | VARCHAR | Affiliate SID |
| merchant_id | VARCHAR | Merchant ID |
| created_at | TIMESTAMPTZ | Click time |

#### **users** (For user info)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR | User email |
| full_name | VARCHAR | User full name |

---

## 🚀 Deployment

### **1. Run Migration**

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

📊 Sample data columns:
    - conversion_id
    - user_id
    - user_email
    - user_full_name
    - aff_sid
    - merchant_id
    - merchant_name
    - order_code
    - order_amount
    - commission
    - cashback_amount
    - order_time
    - approval_time
    - eligible_date
    - approval_month
    - days_since_approval

✨ Migration 030 verification completed!

⚠️  IMPORTANT: Function now queries system_conversions table (cashback orders only)
   - Added aff_sid column to return type
   - Only returns orders from system (not affiliate program)
```

---

### **2. Deploy Frontend**

```bash
# Hard refresh browser
Ctrl + Shift + R  # Windows/Linux
Cmd + Shift + R   # Mac
```

---

### **3. Test**

1. Open **Đối Soát Hệ Thống** → **Auto-Sync**
2. Click **"Xem đơn hàng đủ điều kiện"**
3. Verify:
   - ✅ Only system conversions shown
   - ✅ "Aff Sid" column exists
   - ✅ aff_sid values displayed correctly

---

## 🔍 Debug Tips

### **If orders still show affiliate program:**

1. **Check migration ran successfully:**
   ```sql
   -- In database:
   SELECT proname, prosrc
   FROM pg_proc
   WHERE proname = 'get_eligible_conversions_for_waiting_list';

   -- Should show query with "FROM system_conversions"
   ```

2. **Test function directly:**
   ```sql
   SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 5;
   ```

3. **Compare counts:**
   ```sql
   -- System conversions count
   SELECT COUNT(*) FROM system_conversions WHERE status = 'approved';

   -- Function result count
   SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list();

   -- Should be less than or equal to system_conversions count
   ```

---

### **If aff_sid column doesn't show:**

1. **Check browser cache:**
   - Hard refresh (Ctrl + Shift + R)
   - Clear cache completely
   - Try incognito window

2. **Check API response:**
   - Open Network tab
   - Check `/eligible-conversions` response
   - Verify `aff_sid` field exists in JSON

3. **Check function return type:**
   ```sql
   SELECT pg_get_function_result(oid)
   FROM pg_proc
   WHERE proname = 'get_eligible_conversions_for_waiting_list';

   -- Should include "aff_sid character varying(255)"
   ```

---

### **If aff_sid shows 'N/A' for all orders:**

1. **Check clicks table has data:**
   ```sql
   SELECT COUNT(*) FROM clicks WHERE aff_sid IS NOT NULL;
   ```

2. **Check system_conversions.click_id is populated:**
   ```sql
   SELECT COUNT(*) FROM system_conversions WHERE click_id IS NOT NULL;
   ```

3. **Check JOIN works:**
   ```sql
   SELECT
     sc.id,
     sc.order_code,
     cl.aff_sid
   FROM system_conversions sc
   LEFT JOIN clicks cl ON sc.click_id = cl.id
   WHERE sc.status = 'approved'
   LIMIT 10;
   ```

---

## 📊 Before vs After Comparison

### **BEFORE (Migration 029):**
- ❌ Queries `conversions` table → includes affiliate orders
- ❌ No `aff_sid` column
- ❌ Shows orders not belonging to cashback system
- ❌ User confused why affiliate orders appear

### **AFTER (Migration 030):**
- ✅ Queries `system_conversions` table → only cashback orders
- ✅ Has `aff_sid` column from clicks JOIN
- ✅ Only shows orders from cashback system
- ✅ Clear distinction between system and affiliate orders

---

## 🎓 Lessons Learned

1. **Table Naming Matters**
   - `conversions` = All orders (affiliate + cashback)
   - `system_conversions` = Only cashback system orders
   - Always check which table to query based on business logic

2. **JOIN for Related Data**
   - `aff_sid` is in `clicks` table, not `conversions` or `system_conversions`
   - Need LEFT JOIN to get aff_sid
   - COALESCE for NULL handling

3. **Column Name Differences**
   - `conversions.order_amount` vs `system_conversions.order_amount`
   - Always verify column names when changing tables

4. **Migration Testing**
   - Always test function call after migration
   - Verify return type matches expectations
   - Check sample data before deployment

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Migration 030 ran successfully
- [ ] Function `get_eligible_conversions_for_waiting_list()` queries `system_conversions`
- [ ] Function returns `aff_sid` field
- [ ] Frontend displays "Aff Sid" column
- [ ] Only cashback system orders shown in eligible list
- [ ] NO affiliate program orders appear
- [ ] aff_sid values display correctly (not all 'N/A')
- [ ] Can create reconciliation from eligible orders
- [ ] Created reconciliation only contains system conversions
- [ ] No JavaScript errors in console
- [ ] No SQL errors in backend logs

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed

**Summary:**
1. Changed `get_eligible_conversions_for_waiting_list()` to query `system_conversions` instead of `conversions`
2. Added `aff_sid` column to function return type
3. Added LEFT JOIN with `clicks` table to get `aff_sid`
4. Fixed column name `order_value` → `order_amount`
5. Frontend displays "Aff Sid" column in eligible orders table
6. Only cashback system orders shown in Auto-Sync (no affiliate program orders)
