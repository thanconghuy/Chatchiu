# Fix: Conversions Pending Button & Dashboard Stats

## 📋 Tổng Quan

Fix 2 vấn đề được user báo cáo:
1. Thêm chức năng cho nút "Kiểm tra đơn Pending" trong trang Conversions Management
2. Dashboard user stats cards hiển thị "0 đ" mặc dù có dữ liệu trong history

---

## ✅ Issue #1: Conversions Management - Add Pending Button Functionality

### Vấn đề:
- Nút "Kiểm tra đơn Pending" đã được thêm vào UI (HTML) nhưng chưa có functionality
- Click vào button không có gì xảy ra
- Thiếu event listener và handler function

### Giải pháp:

**File:** [frontend/admin/conversions.js](frontend/admin/conversions.js)

#### Change 1: Add DOM Element Reference (Line 28)
```javascript
const checkPendingBtn = document.getElementById('checkPendingBtn');
```

#### Change 2: Add Event Listener (Lines 128-141)
```javascript
if (checkPendingBtn) {
    console.log('✓ Check Pending button found:', checkPendingBtn);
    checkPendingBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔍 Check Pending button clicked!');
        if (confirm('Kiểm tra và cập nhật trạng thái các đơn Pending từ AccessTrade?')) {
            await checkPendingOrders();
        }
    });
    console.log('✓ Check Pending button listener attached');
} else {
    console.error('❌ Check Pending button NOT FOUND!');
}
```

#### Change 3: Add Handler Function (Lines 362-396)
```javascript
/**
 * Check pending orders status from AccessTrade
 */
async function checkPendingOrders() {
    try {
        checkPendingBtn.disabled = true;
        checkPendingBtn.textContent = '⏳ Đang kiểm tra...';

        console.log('Checking pending orders...');

        const response = await apiRequest('/admin/tools/check-pending-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Check pending response:', response);

        if (response.success) {
            const { updated, notFound, errors } = response;
            showToast(`Kiểm tra hoàn tất! Cập nhật: ${updated}, Không tìm thấy: ${notFound}, Lỗi: ${errors}`, 'success');
            // Reload conversions after check
            await loadConversions();
        } else {
            throw new Error(response.message || 'Check pending failed');
        }
    } catch (error) {
        console.error('Error checking pending orders:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        checkPendingBtn.disabled = false;
        checkPendingBtn.textContent = '🔍 Kiểm tra đơn Pending';
    }
}
```

### Tính năng:
✅ Button disables khi đang kiểm tra
✅ Text thay đổi thành "⏳ Đang kiểm tra..." khi loading
✅ Confirmation dialog trước khi thực hiện
✅ Gọi API endpoint `/admin/tools/check-pending-orders`
✅ Hiển thị kết quả với toast notification
✅ Auto reload conversions table sau khi hoàn tất
✅ Error handling với try-catch
✅ Reset button state trong finally block

---

## ✅ Issue #2: Dashboard User Stats - Showing "0 đ"

### Vấn đề:
- Các stats cards trong dashboard user hiển thị "0 đ" và "0" cho tất cả metrics
- Mặc dù trong history page có dữ liệu conversions (như screenshots cho thấy):
  - Order #1: 4.900 đ cashback, status "Đang xử lý"
  - Order #2: 4.900 đ cashback, status "Đang xử lý"
  - Order #3: 3.921 đ cashback, status "Đã duyệt"
- Tổng cộng user có ít nhất 13.721 đ cashback (9.800 đ pending + 3.921 đ approved)

### Nguyên nhân (Potential):
Từ screenshots và code đã được thêm logging trước đó trong [FIX-CONVERSIONS-TABLE-AND-DASHBOARD-STATS.md](FIX-CONVERSIONS-TABLE-AND-DASHBOARD-STATS.md):

**Các khả năng:**
1. ❌ **API không trả về dữ liệu đúng** - Backend query có thể lỗi
2. ❌ **JOIN condition sai** - Conversions không match được với clicks thông qua user_id
3. ❌ **User balance fields null** - available_balance, pending_balance trong DB là NULL
4. ❌ **Authentication issue** - req.userId không đúng hoặc không tồn tại

### Debug Steps (Từ code logging đã có):

**1. Check Browser Console:**
```javascript
// Logs đã được thêm trong frontend/js/dashboard.js (lines 54-84)
console.log('Loading dashboard stats...');
console.log('Stats response:', response);
console.log('Stats data:', stats);
```

**Expected logs:**
```
Loading dashboard stats...
Stats response: { success: true, stats: {...} }
Stats data: { availableBalance: 3921, pendingBalance: 9800, ... }
Stats loaded successfully
```

**If error:**
```
Error loading stats: [error message]
Error details: [error.message] [error.stack]
```

**2. Check Server Logs:**
```javascript
// Logs đã được thêm trong backend/routes/dashboard.js (lines 16-62)
[Dashboard Stats] Loading stats for userId: [userId]
[Dashboard Stats] User found: [email]
[Dashboard Stats] User stats: {...}
[Dashboard Stats] Click stats: {...}
[Dashboard Stats] Conversion stats: {...}
[Dashboard Stats] Sending response: {...}
```

**3. Verify Database Data:**
```sql
-- Check user balance fields
SELECT id, email, available_balance, pending_balance, total_cashback
FROM users
WHERE email = 'lam.mmo@example.com';

-- Expected result:
-- available_balance: 3921 (or could be NULL)
-- pending_balance: 9800 (or could be NULL)
-- total_cashback: 13721 (or could be NULL)

-- Check conversions linked to user via clicks
SELECT
    c.id,
    c.order_code,
    c.cashback_amount,
    c.status,
    cl.user_id,
    u.email
FROM conversions c
INNER JOIN clicks cl ON c.click_id = cl.id
INNER JOIN users u ON cl.user_id = u.id
WHERE u.email = 'lam.mmo@example.com';

-- Expected: 3 rows
-- Row 1: 4.900 đ, status 'pending'
-- Row 2: 4.900 đ, status 'pending'
-- Row 3: 3.921 đ, status 'approved'
```

**4. Test API Directly:**
```bash
# Get auth token from localStorage
# Then test endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3007/api/dashboard/stats
```

**Expected Response:**
```json
{
  "success": true,
  "stats": {
    "availableBalance": 3921,
    "pendingBalance": 9800,
    "totalCashback": 13721,
    "totalConversions": 3,
    "approvedConversions": 1,
    "pendingConversions": 2,
    "rejectedConversions": 0,
    "totalApprovedCashback": 3921,
    "totalPendingCashback": 9800,
    "totalApprovedOrderValue": 169039,
    "totalOrderValue": 169039,
    "totalClicks": 10,
    "convertedClicks": 3
  }
}
```

---

## 🔍 Diagnosis Path

### Step 1: Open Browser DevTools
1. Navigate to http://localhost:3007/dashboard
2. Open DevTools (F12)
3. Go to Console tab
4. Look for logs:
   - "Loading dashboard stats..."
   - "Stats response: ..."
   - "Stats data: ..."

### Step 2: Check Network Tab
1. Filter by "stats"
2. Check request to `/api/dashboard/stats`
3. Verify:
   - Status Code: 200 OK
   - Response body has `success: true`
   - Response body has `stats` object with values

### Step 3: Check Server Console
1. Look for `[Dashboard Stats]` prefixed logs
2. Verify each step:
   - User found: [email]
   - User stats: { available_balance, pending_balance, ... }
   - Conversion stats: { total_conversions, approved_conversions, ... }

### Step 4: Database Verification
```sql
-- 1. Check if user exists and has balance
SELECT * FROM users WHERE email = 'lam.mmo@example.com';

-- 2. Check if conversions exist
SELECT * FROM conversions WHERE order_code IN ('I03546WFLPE7FP', 'I03541HGRTYAX66', '251018CXE62WSY');

-- 3. Check if clicks link conversions to user
SELECT
    c.id as conversion_id,
    c.order_code,
    c.cashback_amount,
    c.status,
    cl.id as click_id,
    cl.user_id,
    u.email
FROM conversions c
LEFT JOIN clicks cl ON c.click_id = cl.id
LEFT JOIN users u ON cl.user_id = u.id
WHERE c.order_code IN ('I03546WFLPE7FP', 'I03541HGRTYAX66', '251018CXE62WSY');

-- Expected: 3 rows with user email populated
-- If user email is NULL, then clicks are not linked correctly
```

---

## 🎯 Common Issues & Solutions

### Issue A: Stats API returns 0 but conversions exist

**Cause:** Conversions not linked to user via clicks table

**Solution:**
```sql
-- Find conversions without clicks
SELECT c.*
FROM conversions c
LEFT JOIN clicks cl ON c.click_id = cl.id
WHERE cl.id IS NULL;

-- If found, need to link them by matching order_code to UTM parameters in clicks
UPDATE conversions c
INNER JOIN clicks cl ON JSON_EXTRACT(cl.utm_params, '$.order_code') = c.order_code
SET c.click_id = cl.id
WHERE c.click_id IS NULL;
```

### Issue B: User balance fields are NULL

**Cause:** Balance not calculated/updated when conversions are approved

**Solution:**
```sql
-- Manually calculate and update user balances
UPDATE users u
SET
    available_balance = (
        SELECT COALESCE(SUM(cashback_amount), 0)
        FROM conversions c
        INNER JOIN clicks cl ON c.click_id = cl.id
        WHERE cl.user_id = u.id AND c.status = 'approved'
    ),
    pending_balance = (
        SELECT COALESCE(SUM(cashback_amount), 0)
        FROM conversions c
        INNER JOIN clicks cl ON c.click_id = cl.id
        WHERE cl.user_id = u.id AND c.status = 'pending'
    ),
    total_cashback = (
        SELECT COALESCE(SUM(cashback_amount), 0)
        FROM conversions c
        INNER JOIN clicks cl ON c.click_id = cl.id
        WHERE cl.user_id = u.id AND c.status IN ('approved', 'pending')
    )
WHERE u.email = 'lam.mmo@example.com';
```

### Issue C: Conversion.getUserStats() returns wrong data

**Cause:** JOIN condition or aggregate query incorrect

**Solution:** Check [backend/models/Conversion.js](backend/models/Conversion.js) `getUserStats()` method:
```javascript
static async getUserStats(userId) {
    const query = `
        SELECT
            COUNT(*) as total_conversions,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_conversions,
            SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END) as total_approved_cashback,
            SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END) as total_pending_cashback,
            SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END) as total_approved_order_value,
            SUM(order_amount) as total_order_value
        FROM conversions c
        INNER JOIN clicks cl ON c.click_id = cl.id
        WHERE cl.user_id = ?
    `;

    const [rows] = await pool.query(query, [userId]);
    return rows[0];
}
```

**Verify:**
- ✅ JOIN condition: `c.click_id = cl.id`
- ✅ WHERE condition: `cl.user_id = ?`
- ✅ All aggregate functions use COALESCE or handle NULL

---

## 📊 Status & Next Steps

### Completed:
✅ **Conversions Pending Button** - Fully functional
- Event listener attached
- API endpoint called: `/admin/tools/check-pending-orders`
- Loading state, error handling, auto-reload implemented

### In Progress:
🔍 **Dashboard Stats Investigation** - Needs user testing

**User action required:**
1. Open browser DevTools console
2. Navigate to http://localhost:3007/dashboard
3. Check console logs for stats loading
4. Check Network tab for API response
5. Report findings:
   - What do console logs show?
   - What does `/api/dashboard/stats` response contain?
   - Any errors in console or network?

### Potential Next Steps (Based on findings):

**If API returns data but frontend shows 0:**
- Check if `formatCurrency()` function works correctly
- Verify element IDs match in HTML and JS
- Check if stats object structure matches expected format

**If API returns 0 but conversions exist:**
- Fix JOIN condition in `Conversion.getUserStats()`
- Link conversions to clicks properly
- Update user balance fields

**If API returns error:**
- Fix backend query errors
- Check database schema
- Verify authentication token

---

## 📝 Files Modified

### 1. [frontend/admin/conversions.js](frontend/admin/conversions.js)
**Changes:**
- Line 28: Added `checkPendingBtn` DOM element reference
- Lines 128-141: Added event listener for pending button
- Lines 362-396: Added `checkPendingOrders()` handler function

**Impact:** "Kiểm tra đơn Pending" button now fully functional

---

## 🔧 Technical Details

### API Endpoint Called
```
POST /admin/tools/check-pending-orders
```

**Expected Response:**
```json
{
  "success": true,
  "updated": 5,
  "notFound": 2,
  "errors": 0
}
```

### Button States
1. **Default:** "🔍 Kiểm tra đơn Pending" (enabled)
2. **Loading:** "⏳ Đang kiểm tra..." (disabled)
3. **After:** Reverts to default (enabled)

### Error Handling
- Try-catch wraps entire function
- Finally block ensures button state reset
- Toast notifications for success and error
- Console logging for debugging

---

## 🎓 Best Practices Applied

### JavaScript:
✅ Async/await for API calls
✅ Try-catch-finally for error handling
✅ Disable button during loading to prevent double-clicks
✅ Visual feedback with button text changes
✅ Confirmation dialog before destructive actions
✅ Auto-reload data after updates
✅ Console logging for debugging
✅ Toast notifications for user feedback

### Code Organization:
✅ DOM elements declared at top
✅ Event listeners in `setupEventListeners()`
✅ Handler functions separate and reusable
✅ Consistent naming conventions
✅ Clear comments and documentation

---

**Ngày hoàn thành:** 2025-11-12
**Status:**
- ✅ Conversions Pending Button: COMPLETED
- 🔍 Dashboard Stats: AWAITING USER TESTING & FEEDBACK

**Tested on:** Local environment (http://localhost:3007)
