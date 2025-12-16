# 🔧 Fix: User & Aff Sid Columns Not Showing in Auto-Sync

## 🎯 Vấn Đề

Sau khi chạy migration 030 để fix Auto-Sync query, cột "User" vẫn hiển thị "N/A" thay vì user email/name.

**Screenshot shows:**
- Cột "User" = "N/A" cho tất cả rows
- Cột "Aff Sid" chưa được thêm vào table

**Root Cause:**

Backend route `/auto-sync/preview` SELECT query không lấy các fields mới từ function `get_eligible_conversions_for_waiting_list()`:
- ❌ Không SELECT `user_email`
- ❌ Không SELECT `user_full_name`
- ❌ Không SELECT `aff_sid`

Mặc dù function đã trả về các fields này (sau migration 030), nhưng endpoint không lấy chúng.

---

## ✅ Giải Pháp

### **Backend Fix 1: Add Missing Fields to /auto-sync/preview SELECT**

**File:** `backend/routes/systemReconciliationAdmin.js` (Lines 727-746)

**BEFORE:**
```javascript
const eligibleQuery = `
  SELECT
    conversion_id,
    user_id,
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    order_time,
    approval_time,
    eligible_date,
    approval_month,
    days_since_approval
  FROM get_eligible_conversions_for_waiting_list()
`;
```

**AFTER:**
```javascript
const eligibleQuery = `
  SELECT
    conversion_id,
    user_id,
    user_email,           // ✅ NEW!
    user_full_name,       // ✅ NEW!
    aff_sid,              // ✅ NEW!
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    order_time,
    approval_time,
    eligible_date,
    approval_month,
    days_since_approval
  FROM get_eligible_conversions_for_waiting_list()
`;
```

---

### **Backend Fix 2: Change /preview Endpoint to Use system_conversions**

**File:** `backend/routes/systemReconciliationAdmin.js` (Lines 113-184)

Endpoint `/preview` được dùng cho tab "Đơn Hàng Mới Đủ Điều Kiện" (filter by period). Cũng cần fix để query từ `system_conversions` thay vì `conversions`.

**Changes Made:**

1. **Count Query (Lines 119-128):**
```javascript
// BEFORE:
FROM conversions c
WHERE c.status = 'approved'
  AND c.order_time >= $1
  AND c.order_time <= $2
  AND c.aff_sid = '${affSid}'

// AFTER:
FROM system_conversions sc
LEFT JOIN clicks cl ON sc.click_id = cl.id
WHERE sc.status = 'approved'
  AND sc.order_time >= $1
  AND sc.order_time <= $2
  AND cl.aff_sid = '${affSid}'
```

2. **Summary Query (Lines 132-146):**
```javascript
// BEFORE:
FROM conversions c
WHERE c.status = 'approved'
  AND c.order_time >= $1
  AND c.order_time <= $2

// AFTER:
FROM system_conversions sc
LEFT JOIN clicks cl ON sc.click_id = cl.id
WHERE sc.status = 'approved'
  AND sc.order_time >= $1
  AND sc.order_time <= $2
```

3. **Main Orders Query (Lines 155-184):**
```javascript
// BEFORE:
SELECT
  c.id,
  c.user_id,
  COALESCE(u.full_name, u.username, 'N/A') as user_name,
  COALESCE(u.email, 'N/A') as user_email,
  c.merchant_id,
  ...
FROM conversions c
LEFT JOIN users u ON c.user_id = u.id
WHERE c.status = 'approved'

// AFTER:
SELECT
  sc.id,
  sc.user_id,
  COALESCE(u.full_name, u.username, 'N/A') as user_name,
  COALESCE(u.email, 'N/A') as user_email,
  COALESCE(cl.aff_sid, 'N/A') as aff_sid,  // ✅ NEW!
  sc.merchant_id,
  ...
FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN clicks cl ON sc.click_id = cl.id  // ✅ NEW JOIN!
WHERE sc.status = 'approved'
```

4. **Reconciliation Check (Lines 171-174):**
```javascript
// BEFORE:
WHEN EXISTS (
  SELECT 1 FROM system_reconciliation_items sri
  WHERE sri.conversion_id = c.id
) THEN true

// AFTER:
WHEN sc.system_reconciliation_id IS NOT NULL THEN true
```

**Why:**
- Simpler check using denormalized field
- Faster query (no subquery needed)
- Consistent with system_conversions design

---

## 🔄 How It Works Now

### **Auto-Sync Preview Flow:**

1. **User opens Auto-Sync tab**
2. **Click "Xem đơn hàng đủ điều kiện"**
3. **Frontend calls:** `GET /api/admin/system-reconciliation/auto-sync/preview`
4. **Backend executes:**
   ```sql
   SELECT
     conversion_id,
     user_id,
     user_email,        -- ✅ Now returned
     user_full_name,    -- ✅ Now returned
     aff_sid,           -- ✅ Now returned
     merchant_id,
     merchant_name,
     ...
   FROM get_eligible_conversions_for_waiting_list()
   ```
5. **Function queries:**
   ```sql
   SELECT
     sc.id as conversion_id,
     sc.user_id,
     u.email as user_email,
     u.full_name as user_full_name,
     COALESCE(cl.aff_sid, 'N/A') as aff_sid,
     ...
   FROM system_conversions sc
   LEFT JOIN users u ON sc.user_id = u.id
   LEFT JOIN clicks cl ON sc.click_id = cl.id
   WHERE sc.status = 'approved'
     AND sc.approval_time + INTERVAL '15 days' <= NOW()
     AND NOT EXISTS (SELECT 1 FROM reconciliation_waiting_list ...)
   ```
6. **Frontend displays:**
   - User column: Shows `user_full_name` or `user_email`
   - Aff Sid column: Shows `aff_sid` from clicks table
   - Only system_conversions (no affiliate program orders)

---

## 🧪 Testing Guide

### **Test 1: User Column Shows Data**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
2. Click **"Xem đơn hàng đủ điều kiện"**
3. Check "User" column

**Expected:**
- ✅ User column shows email or full name
- ❌ NOT "N/A" for all rows

**Verify Data:**
```sql
-- Check function returns user info
SELECT
  conversion_id,
  user_email,
  user_full_name,
  aff_sid
FROM get_eligible_conversions_for_waiting_list()
LIMIT 5;

-- Should show real email addresses and names
```

---

### **Test 2: Aff Sid Column Shows Data**

**Steps:**
1. Same as Test 1
2. Check "Aff Sid" column (should be between "User" and "Merchant")

**Expected:**
- ✅ Column header "Aff Sid" exists
- ✅ Shows aff_sid values from clicks table
- ⚠️ May show "N/A" for orders without click_id (acceptable)

**Verify Data:**
```sql
-- Check clicks have aff_sid
SELECT
  sc.id,
  sc.order_code,
  cl.aff_sid,
  sc.click_id
FROM system_conversions sc
LEFT JOIN clicks cl ON sc.click_id = cl.id
WHERE sc.status = 'approved'
LIMIT 10;
```

---

### **Test 3: Only System Conversions Shown**

**Steps:**
1. Check orders displayed in Auto-Sync preview
2. Verify they're from `system_conversions` not `conversions`

**Database Verification:**
```sql
-- Count system_conversions
SELECT COUNT(*) FROM system_conversions WHERE status = 'approved';

-- Count all conversions
SELECT COUNT(*) FROM conversions WHERE status = 'approved';

-- Auto-sync preview count should match system_conversions count
-- (or less, if some already in reconciliation)
```

---

### **Test 4: Preview Endpoint Also Fixed**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Danh Sách Đối Soát**
2. Click **"Đơn Hàng Mới Đủ Điều Kiện"**
3. Select date range
4. Click **"Làm mới"**

**Expected:**
- ✅ Shows only system_conversions orders
- ✅ User column populated
- ✅ Aff Sid column shows (if frontend updated to display it)

---

## 📋 Files Changed

| File | Lines | Change |
|------|-------|--------|
| `backend/routes/systemReconciliationAdmin.js` | 727-746 | Added `user_email`, `user_full_name`, `aff_sid` to `/auto-sync/preview` SELECT |
| `backend/routes/systemReconciliationAdmin.js` | 113-117 | Changed aff_sid filter from `c.aff_sid` to `cl.aff_sid` |
| `backend/routes/systemReconciliationAdmin.js` | 119-128 | Changed count query from `conversions` to `system_conversions` |
| `backend/routes/systemReconciliationAdmin.js` | 132-146 | Changed summary query from `conversions` to `system_conversions` |
| `backend/routes/systemReconciliationAdmin.js` | 155-184 | Changed main query from `conversions` to `system_conversions`, added aff_sid, added clicks JOIN |

---

## 🗂️ Related Files

### **Migration 030** (Already Applied)
- File: `backend/migrations/030_fix_autosync_system_conversions.sql`
- Changed function to query `system_conversions`
- Added `aff_sid` to return type
- Added LEFT JOIN with `clicks` table

### **Frontend** (Already Updated)
- File: `frontend/admin/system-reconciliation.html`
- Lines 2280: Added "Aff Sid" column header
- Lines 2306-2310: Display aff_sid value

---

## 🚀 Deployment

### **1. Restart Backend**

Backend code đã được cập nhật, cần restart:

```bash
# Stop current backend
Ctrl + C

# Start backend
npm run dev
```

**Verify:**
```
✅ Server is running
✅ No error messages
```

---

### **2. Test API Response**

```bash
# Test auto-sync preview endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/system-reconciliation/auto-sync/preview
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "summary": [
      {
        "month": "2025-11-01",
        "label": "Tháng 11/2025",
        "count": 4,
        "cashback": 10423,
        "orders": [
          {
            "conversion_id": "xxx",
            "user_id": "xxx",
            "user_email": "test@example.com",    // ✅ Should exist
            "user_full_name": "Test User",       // ✅ Should exist
            "aff_sid": "abc123xyz",              // ✅ Should exist
            "merchant_name": "Shopee",
            ...
          }
        ]
      }
    ]
  }
}
```

---

### **3. Test Frontend**

1. Hard refresh browser (Ctrl + Shift + R)
2. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
3. Click **"Xem đơn hàng đủ điều kiện"**
4. Verify:
   - ✅ User column shows email/name (not "N/A")
   - ✅ Aff Sid column exists and shows values
   - ✅ Only 4 orders shown (matching system_conversions)

---

## 🔍 Debug Tips

### **If User Column Still Shows "N/A":**

1. **Check API response:**
   - Open Browser DevTools → Network
   - Click "Xem đơn hàng đủ điều kiện"
   - Check response from `/auto-sync/preview`
   - Verify `user_email` and `user_full_name` fields exist

2. **Check function output:**
   ```sql
   SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 1;
   ```
   - Should show `user_email` and `user_full_name` columns

3. **Check users table:**
   ```sql
   SELECT id, email, full_name FROM users LIMIT 5;
   ```
   - Verify users have email and full_name populated

---

### **If Aff Sid Column Empty:**

1. **Check clicks table:**
   ```sql
   SELECT COUNT(*) FROM clicks WHERE aff_sid IS NOT NULL;
   ```
   - If 0, then no clicks have aff_sid

2. **Check system_conversions.click_id:**
   ```sql
   SELECT
     sc.id,
     sc.click_id,
     cl.aff_sid
   FROM system_conversions sc
   LEFT JOIN clicks cl ON sc.click_id = cl.id
   WHERE sc.status = 'approved'
   LIMIT 10;
   ```
   - Verify JOIN works
   - Check if click_id is populated

---

### **If Still Shows Affiliate Orders:**

1. **Verify migration 030 ran:**
   ```sql
   SELECT prosrc
   FROM pg_proc
   WHERE proname = 'get_eligible_conversions_for_waiting_list';
   ```
   - Should contain `FROM system_conversions`

2. **Compare counts:**
   ```sql
   -- Function result
   SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list();

   -- System conversions
   SELECT COUNT(*) FROM system_conversions WHERE status = 'approved';

   -- All conversions
   SELECT COUNT(*) FROM conversions WHERE status = 'approved';
   ```
   - Function count should match system_conversions, NOT all conversions

---

## 📊 Summary of All Fixes

### **Problem Chain:**
1. ❌ Function queried `conversions` → included affiliate orders
2. ❌ Function didn't return `user_email`, `user_full_name`, `aff_sid`
3. ❌ Endpoint didn't SELECT the new fields
4. ❌ Frontend showed "N/A" for user

### **Solution Chain:**
1. ✅ Migration 030: Changed function to query `system_conversions`
2. ✅ Migration 030: Added `user_email`, `user_full_name`, `aff_sid` to return type
3. ✅ Route fix: Added new fields to SELECT query
4. ✅ Route fix: Changed `/preview` endpoint to also use `system_conversions`
5. ✅ Frontend: Already has "Aff Sid" column from previous fix

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Backend restarted successfully
- [ ] API endpoint `/auto-sync/preview` returns `user_email`, `user_full_name`, `aff_sid`
- [ ] Frontend Auto-Sync tab displays user names (not "N/A")
- [ ] Frontend displays "Aff Sid" column
- [ ] Only 4 orders shown (matching screenshot count)
- [ ] Orders are from `system_conversions` only
- [ ] No affiliate program orders appear
- [ ] Can create reconciliation from eligible orders
- [ ] No JavaScript errors in console
- [ ] No SQL errors in backend logs

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed

**Summary:**
1. Added `user_email`, `user_full_name`, `aff_sid` to `/auto-sync/preview` SELECT query
2. Changed `/preview` endpoint to query `system_conversions` instead of `conversions`
3. Added LEFT JOIN with `clicks` table to get `aff_sid`
4. User column now shows email/name instead of "N/A"
5. Aff Sid column displays values from clicks table
6. Only cashback system orders shown (no affiliate program)
