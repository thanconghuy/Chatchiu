# 🧪 Auto-Sync Testing Guide

**Quick reference for testing all Auto-Sync features**

---

## ✅ Pre-Testing Setup

1. **Backend server running:**
   ```bash
   cd backend
   npm run dev
   ```
   Verify: `🚀 Cashback Server is running` at http://localhost:3007

2. **Hard refresh browser:**
   - Press `Ctrl + Shift + R` (Windows/Linux)
   - Press `Cmd + Shift + R` (Mac)

3. **Login to admin panel:**
   - Navigate to: http://localhost:3007/admin/login.html
   - Login with admin credentials

---

## 🧪 Test 1: User Column Display

**Goal:** Verify user column shows email/name instead of "N/A"

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync** tab
2. Click **"Xem đơn hàng đủ điều kiện"** button

**Expected Results:**
- ✅ Table loads with orders
- ✅ "User" column shows email addresses or full names
- ❌ NOT "N/A" for all rows
- ✅ "Aff Sid" column visible (between User and Merchant)
- ✅ Only system_conversions orders shown (no affiliate program orders)

**Database Verification:**
```sql
-- Check function returns user info
SELECT
  conversion_id,
  user_email,
  user_full_name,
  aff_sid
FROM get_eligible_conversions_for_waiting_list()
LIMIT 5;
```

---

## 🧪 Test 2: Add to Waiting List

**Goal:** Verify orders can be added to waiting list without FK errors

**Steps:**
1. Stay on Auto-Sync tab
2. If no eligible orders shown, create test data (approved orders 15+ days old)
3. Click **"Đang xử lý..."** button (below eligible orders table)
4. Wait for response

**Expected Results:**
- ✅ Button changes to "Đang xử lý..." with spinner
- ✅ Success toast appears: "Đã thêm X đơn hàng vào danh sách chờ đối soát"
- ✅ NO 500 error
- ✅ NO foreign key constraint error in console
- ✅ Button text resets after operation
- ✅ Button disabled state managed correctly
- ✅ Orders moved from "Eligible" to "Waiting List" section

**Browser Console Check:**
- Open DevTools (F12)
- Check Network tab: POST to `/add-to-waiting` should return 200
- Check Console tab: No red errors

**Database Verification:**
```sql
-- Check orders added to waiting list
SELECT COUNT(*) FROM reconciliation_waiting_list WHERE status = 'waiting';

-- Verify conversion_id matches conversions table (FK valid)
SELECT
  rwl.conversion_id,
  c.id,
  c.order_code
FROM reconciliation_waiting_list rwl
INNER JOIN conversions c ON rwl.conversion_id = c.id
LIMIT 5;

-- Should return rows without errors
```

---

## 🧪 Test 3: Button State Management

**Goal:** Verify button state resets correctly after operations

**Steps:**
1. Add orders to waiting list (Test 2)
2. Observe button behavior

**Expected Results:**
- ✅ **During operation:** Button shows "Đang xử lý..." with spinner
- ✅ **On success (orders remain):** Button text shows "Đang xử lý..." (still has orders to add)
- ✅ **On success (no orders left):** Button disabled with appropriate text
- ✅ **On error:** Button text restores to original, re-enabled
- ❌ Button should NOT stay stuck in "processing" state

---

## 🧪 Test 4: Create Reconciliation - No Draft Exists

**Goal:** Verify creating reconciliation when no draft exists for the period

**Prerequisites:**
- Ensure no draft reconciliations exist for the target month
- Have orders in waiting list

**Steps:**
1. Navigate to **Auto-Sync** tab → **Danh Sách Chờ** section
2. Find a month group with orders (e.g., "Tháng 11/2025")
3. Click **"Tạo Kỳ Đối Soát"** button next to month label

**Expected Results:**
- ✅ Confirm dialog appears: "Tạo kỳ đối soát \"Tháng 11/2025\"?"
- ✅ Shows order count and total cashback
- ✅ Click OK → Success toast: "Đã tạo kỳ đối soát với X đơn hàng"
- ✅ Orders removed from waiting list
- ✅ New draft reconciliation created
- ✅ Reconciliation appears in main list with status "Nháp"

**Database Verification:**
```sql
SELECT * FROM system_reconciliations
WHERE status = 'draft'
ORDER BY created_at DESC
LIMIT 1;
```

---

## 🧪 Test 5: Add to Existing Draft

**Goal:** Verify adding orders to existing draft reconciliation

**Prerequisites:**
1. Create a draft reconciliation with some orders (Test 4)
2. Add more orders to waiting list for the same month

**Steps:**
1. Navigate to **Auto-Sync** tab
2. Add new orders to waiting list (should be same month as existing draft)
3. Navigate to **Danh Sách Chờ** section
4. Click **"Tạo Kỳ Đối Soát"** button for the month

**Expected Results:**
- ✅ Dialog appears showing existing draft:
  ```
  Đã tìm thấy 1 kỳ đối soát nháp trong cùng khoảng thời gian:

  1. Tháng 11/2025 - Đợt 1 (5 đơn hàng, 12.000 đ)

  Bạn muốn:
  - Chọn "OK" để THÊM vào kỳ nháp đầu tiên
  - Chọn "Cancel" để TẠO MỚI kỳ đối soát
  ```
- ✅ Click **OK** (Add to existing)
- ✅ Success toast: "Đã thêm X đơn hàng vào kỳ đối soát \"Tháng 11/2025 - Đợt 1\""
- ✅ Orders removed from waiting list
- ✅ Draft reconciliation total_orders increases (e.g., 5 → 9)
- ✅ Reconciliation list refreshes automatically

**Database Verification:**
```sql
-- Check draft has more orders now
SELECT id, period_label, total_orders, total_cashback
FROM system_reconciliations
WHERE status = 'draft'
  AND period_label LIKE '%Tháng 11/2025%'
ORDER BY created_at DESC;

-- Should show increased order count
```

---

## 🧪 Test 6: Create New Despite Draft Exists

**Goal:** Verify creating new reconciliation even when draft exists

**Prerequisites:** Same as Test 5

**Steps:**
1-4. Same as Test 5
5. Click **Cancel** (Create new) instead of OK

**Expected Results:**
- ✅ Success toast: "Đã tạo kỳ đối soát \"Tháng 11/2025\" với X đơn hàng"
- ✅ Orders removed from waiting list
- ✅ New draft reconciliation created
- ✅ Now have 2 draft reconciliations for same month:
  - Old: "Tháng 11/2025 - Đợt 1" (5 orders)
  - New: "Tháng 11/2025" (4 orders)

**Database Verification:**
```sql
SELECT id, period_label, total_orders, status, created_at
FROM system_reconciliations
WHERE status = 'draft'
  AND DATE_TRUNC('month', period_start) = '2025-11-01'
ORDER BY created_at DESC;

-- Should return 2 rows
```

---

## 🧪 Test 7: Cannot Add to Finalized Reconciliation

**Goal:** Verify system prevents adding to non-draft reconciliations

**Prerequisites:**
1. Create and finalize a reconciliation
2. Add orders to waiting list for same period

**Steps:**
1. Navigate to reconciliation list
2. Find a draft, finalize it (status = 'finalized')
3. Add orders to waiting list for same month
4. Try to create reconciliation from waiting list

**Expected Results:**
- ✅ Dialog does NOT show finalized reconciliation
- ✅ Only shows drafts (if any)
- ✅ If no drafts exist → Creates new
- ✅ Backend validation prevents adding to non-draft

**Backend Validation:**
```javascript
if (reconCheck.rows[0].status !== 'draft') {
  return res.status(400).json({
    message: 'Chỉ có thể thêm đơn hàng vào kỳ đối soát ở trạng thái Nháp'
  });
}
```

---

## 🧪 Test 8: End-to-End Flow

**Goal:** Complete workflow from eligible orders to reconciliation

**Steps:**
1. **Add to waiting list:**
   - View eligible orders
   - Click "Đang xử lý..."
   - Verify orders moved to waiting list

2. **Create reconciliation (no draft):**
   - Click "Tạo Kỳ Đối Soát"
   - Confirm creation
   - Verify draft created

3. **Add more orders:**
   - Add new eligible orders to waiting list
   - Click "Tạo Kỳ Đối Soát" again
   - Choose to add to existing draft

4. **Finalize:**
   - Review reconciliation details
   - Finalize the draft
   - Verify status changes to 'finalized'

**Expected Results:**
- ✅ All steps complete without errors
- ✅ Orders flow: eligible → waiting → draft → finalized
- ✅ No FK constraint errors at any step
- ✅ UI updates correctly after each operation
- ✅ Toast messages appear for all actions

---

## 🐛 Common Issues & Fixes

### Issue: User column shows "N/A"
**Check:**
1. Backend server restarted?
2. API response includes `user_email`, `user_full_name`?
3. Browser hard-refreshed?

**Fix:**
```bash
# Restart backend
cd backend
npm run dev
```

---

### Issue: Foreign Key Error
**Error:** "violates foreign key constraint reconciliation_waiting_list_conversion_id_fkey"

**Check:**
1. Migration 030 ran successfully?
2. Function returns `at_conversion_id`?

**Fix:**
```bash
# Re-run migration
node backend/run-migration-030.js
```

**Database Check:**
```sql
-- Verify function code
SELECT prosrc FROM pg_proc
WHERE proname = 'get_eligible_conversions_for_waiting_list';

-- Should contain: "sc.at_conversion_id::UUID as conversion_id"
```

---

### Issue: Button stuck in "Đang xử lý..."
**Check:**
1. JavaScript errors in console?
2. `loadNewOrdersPreview()` completed?

**Fix:**
- Hard refresh browser (Ctrl + Shift + R)
- Check if orders were actually added (may be UI issue only)

---

### Issue: Draft check doesn't find existing drafts
**Check:**
1. Network tab shows `/check-draft-reconciliation` API call?
2. API response has `has_draft: true`?
3. Drafts exist in database?

**Database Check:**
```sql
SELECT * FROM system_reconciliations
WHERE status = 'draft'
  AND period_start <= '2025-11-30'
  AND period_end >= '2025-11-01';
```

---

## 📊 Database Queries for Verification

### Check Eligible Orders
```sql
SELECT * FROM get_eligible_conversions_for_waiting_list()
ORDER BY approval_time DESC;
```

### Check Waiting List
```sql
SELECT
  rwl.*,
  c.order_code,
  u.email
FROM reconciliation_waiting_list rwl
LEFT JOIN conversions c ON rwl.conversion_id = c.id
LEFT JOIN users u ON rwl.user_id = u.id
WHERE rwl.status = 'waiting'
ORDER BY rwl.approval_month, rwl.approval_time;
```

### Check Draft Reconciliations
```sql
SELECT
  sr.id,
  sr.period_label,
  sr.period_start,
  sr.period_end,
  sr.total_orders,
  sr.total_cashback,
  sr.status,
  sr.created_at,
  COUNT(sri.id) as actual_order_count
FROM system_reconciliations sr
LEFT JOIN system_reconciliation_items sri ON sri.system_reconciliation_id = sr.id
WHERE sr.status = 'draft'
GROUP BY sr.id, sr.period_label, sr.period_start, sr.period_end,
         sr.total_orders, sr.total_cashback, sr.status, sr.created_at
ORDER BY sr.created_at DESC;
```

### Check for FK Issues
```sql
-- Find orders in waiting list without matching conversion
SELECT rwl.*
FROM reconciliation_waiting_list rwl
LEFT JOIN conversions c ON rwl.conversion_id = c.id
WHERE c.id IS NULL;

-- Should return 0 rows
```

---

## ✅ Success Criteria

All tests pass when:

- [ ] User column displays email/name
- [ ] Aff Sid column displays values
- [ ] Add to waiting list works without FK errors
- [ ] Button state resets correctly
- [ ] Can create reconciliation when no draft exists
- [ ] Can add to existing draft
- [ ] Can create new despite draft exists
- [ ] Cannot add to finalized reconciliation
- [ ] End-to-end flow completes without errors
- [ ] All toast messages display correctly
- [ ] UI updates after each operation
- [ ] No JavaScript errors in console
- [ ] No SQL errors in backend logs

---

**Last Updated:** 2025-12-13
**Status:** ✅ Ready for Testing
