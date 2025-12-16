# 🔧 Fix: CSP Inline Event Handlers & Add Order Status Column

## 🎯 Vấn Đề

**2 vấn đề phát hiện từ screenshot:**

### 1. **CSP Errors trong Console**
```
Executing inline event handler violates the following Content Security Policy directive 'script-src-attr' 'none'
```

**Nguyên nhân:**
- Nhiều inline event handlers (`onclick`, `onchange`, `oninput`)
- Không tuân thủ Content Security Policy (CSP)
- Trình duyệt block execution → Features không hoạt động

**Ví dụ inline handlers:**
```html
<input onchange="toggleSelectAll(this)">
<input onchange="updateSelection()">
<button onclick="loadNewOrdersPreview()">
```

### 2. **Thiếu Cột "Trạng Thái" trong Modal "Thêm Đơn Hàng"**
- Modal hiển thị danh sách đơn hàng có thể thêm vào kỳ đối soát
- Không có cột hiển thị trạng thái API confirmation
- User không biết đơn nào đã được API xác nhận

---

## ✅ Giải Pháp

### **Fix 1: Remove All Inline Event Handlers**

Thay thế tất cả inline handlers bằng CSP-compliant event delegation.

#### **A. "Thêm Đơn Hàng" Modal - Available Orders Table**

**BEFORE:**
```html
<!-- Select All Checkbox -->
<input type="checkbox" id="selectAllOrders" onchange="toggleSelectAll(this)">

<!-- Individual Order Checkbox -->
<input type="checkbox" class="order-checkbox order-item-checkbox"
       value="${order.conversion_id}"
       onchange="toggleOrderSelection('${order.conversion_id}')">

<!-- Search Input -->
<input id="orderSearchInput" oninput="...">
```

**AFTER:**
```html
<!-- Select All Checkbox -->
<input type="checkbox" id="selectAllAvailableOrders"
       data-action="toggle-select-all-available">

<!-- Individual Order Checkbox -->
<input type="checkbox" class="order-checkbox order-item-checkbox"
       value="${order.conversion_id}"
       data-action="toggle-order-selection"
       data-order-id="${order.conversion_id}">

<!-- Search Input - handled by addEventListener('input') -->
<input id="orderSearchInput">
```

**Event Delegation Cases Added (Lines 3544-3550):**
```javascript
case 'toggle-select-all-available':
    toggleSelectAllAvailable(e.target);
    break;
case 'toggle-order-selection':
    const orderId = button.dataset.orderId;
    toggleOrderSelection(orderId);
    break;
```

**Search Handler (Lines 3567-3573):**
```javascript
document.addEventListener('input', (e) => {
    if (e.target.id === 'orderSearchInput') {
        clearTimeout(orderSearchTimeout);
        orderSearchTimeout = setTimeout(() => {
            currentAddOrdersPage = 1;
            loadAvailableOrders();
        }, 500);
    }
});
```

---

#### **B. Auto-Sync Tab - Eligible Orders Table**

**BEFORE:**
```html
<!-- Select All Checkbox -->
<input type="checkbox" id="selectAllOrders" onchange="toggleSelectAll(this)">

<!-- Individual Order Checkbox -->
<input type="checkbox" class="order-checkbox"
       value="${order.id}"
       data-cashback="${order.cashback}"
       onchange="updateSelection()">
```

**AFTER:**
```html
<!-- Select All Checkbox -->
<input type="checkbox" id="selectAllEligibleOrders"
       data-action="toggle-select-all-eligible">

<!-- Individual Order Checkbox -->
<input type="checkbox" class="order-checkbox eligible-order-checkbox"
       value="${order.id}"
       data-cashback="${order.cashback}"
       data-action="toggle-eligible-order">
```

**Event Delegation Cases Added (Lines 3552-3557):**
```javascript
case 'toggle-select-all-eligible':
    toggleSelectAllEligible(e.target);
    break;
case 'toggle-eligible-order':
    updateSelection();
    break;
```

**Function Updated (Lines 2344-2350):**
```javascript
// OLD: toggleSelectAll(checkbox)
// NEW: toggleSelectAllEligible(checkbox)
function toggleSelectAllEligible(checkbox) {
    const checkboxes = document.querySelectorAll('.eligible-order-checkbox:not([disabled])');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateSelection();
}
```

---

#### **C. Error Retry Buttons**

**BEFORE:**
```html
<button onclick="loadNewOrdersPreview()">
    <i class="fas fa-sync"></i> Thử lại
</button>

<button onclick="loadWaitingList()">
    <i class="fas fa-sync"></i> Thử lại
</button>
```

**AFTER:**
```html
<button data-action="retry-load-new-orders">
    <i class="fas fa-sync"></i> Thử lại
</button>

<button data-action="retry-load-waiting-list">
    <i class="fas fa-sync"></i> Thử lại
</button>
```

**Event Delegation Cases Added (Lines 3558-3563):**
```javascript
case 'retry-load-new-orders':
    loadNewOrdersPreview();
    break;
case 'retry-load-waiting-list':
    loadWaitingList();
    break;
```

---

### **Fix 2: Add "Trạng Thái" Column to Available Orders Table**

**File:** `frontend/admin/system-reconciliation.html` (Lines 2650-2714)

**Added Column in Table Header (Line 2666):**
```html
<thead>
    <tr>
        <th style="width: 50px;">...</th>
        <th>Người dùng</th>
        <th>Order ID</th>
        <th>Ngày đặt hàng</th>
        <th>Thời gian duyệt</th>
        <th>Trạng thái</th>  <!-- ✅ NEW COLUMN -->
        <th>Giá trị đơn</th>
        <th>Cashback</th>
    </tr>
</thead>
```

**Added Status Badge Logic (Lines 2673-2679, 2706):**
```javascript
${orders.map(order => {
    // Determine order status
    let statusBadge = '';
    if (order.api_confirmed) {
        statusBadge = '<span class="badge badge-success">✓ Đã xác nhận</span>';
    } else {
        statusBadge = '<span class="badge badge-warning">⏳ Chờ xác nhận</span>';
    }

    return `
        <tr>
            <!-- ... other columns ... -->
            <td>${statusBadge}</td>  <!-- ✅ NEW COLUMN -->
            <td>${formatMoney(order.order_value)}</td>
            <td style="color: #10b981; font-weight: 600;">${formatMoney(order.cashback_amount)}</td>
        </tr>
    `;
}).join('')}
```

**Status Badge Styles:**
- **✓ Đã xác nhận** → Green badge (`badge-success`)
- **⏳ Chờ xác nhận** → Yellow badge (`badge-warning`)

---

## 🔄 Summary of Changes

### **Inline Handlers Removed:**
| Location | Old Handler | New Method |
|----------|-------------|------------|
| Available Orders - Select All | `onchange="toggleSelectAll(this)"` | `data-action="toggle-select-all-available"` |
| Available Orders - Checkbox | `onchange="toggleOrderSelection(...)"` | `data-action="toggle-order-selection"` |
| Available Orders - Search | `oninput="..."` | `addEventListener('input')` |
| Eligible Orders - Select All | `onchange="toggleSelectAll(this)"` | `data-action="toggle-select-all-eligible"` |
| Eligible Orders - Checkbox | `onchange="updateSelection()"` | `data-action="toggle-eligible-order"` |
| Retry Button (New Orders) | `onclick="loadNewOrdersPreview()"` | `data-action="retry-load-new-orders"` |
| Retry Button (Waiting List) | `onclick="loadWaitingList()"` | `data-action="retry-load-waiting-list"` |

### **Event Delegation Cases Added:**
1. ✅ `toggle-select-all-available` - Select all available orders
2. ✅ `toggle-order-selection` - Toggle individual order selection
3. ✅ `toggle-select-all-eligible` - Select all eligible orders
4. ✅ `toggle-eligible-order` - Toggle eligible order checkbox
5. ✅ `retry-load-new-orders` - Retry loading new orders
6. ✅ `retry-load-waiting-list` - Retry loading waiting list
7. ✅ Search input handler via `addEventListener('input')`

### **UI Enhancements:**
1. ✅ Added "Trạng thái" column to available orders table
2. ✅ Status badge shows API confirmation state
3. ✅ Green badge for confirmed orders
4. ✅ Yellow badge for pending confirmation

---

## 🧪 Testing Guide

### **Test 1: CSP Errors Gone**

**Steps:**
1. Hard refresh browser (Ctrl + Shift + R)
2. Open Console (F12)
3. Navigate to any page with modals/checkboxes

**Expected:**
- ❌ NO CSP errors about inline event handlers
- ✅ Console clean or only shows legitimate logs

**Before Fix:**
```
❌ Executing inline event handler violates CSP 'script-src-attr' 'none'
❌ Either the 'unsafe-inline' keyword, a hash ('sha256-...'), or a nonce is required
```

**After Fix:**
```
✅ [Event Delegation] Action: toggle-select-all-available
✅ [Event Delegation] Action: toggle-order-selection, ID: xxx
```

---

### **Test 2: "Thêm Đơn Hàng" Modal**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Danh Sách Đối Soát**
2. Click **⋮** on Draft reconciliation → **Thêm Đơn Hàng**
3. Check table columns and functionality

**Expected Table Columns:**
1. ☑️ Checkbox
2. 👤 Người dùng
3. 🆔 Order ID
4. 📅 Ngày đặt hàng
5. ⏰ Thời gian duyệt
6. ✅ **Trạng thái** ← NEW!
7. 💰 Giá trị đơn
8. 💵 Cashback

**Expected Status Badges:**
- ✅ **Đã xác nhận** (Green) for `api_confirmed = true`
- ⏳ **Chờ xác nhận** (Yellow) for `api_confirmed = false`

**Test Checkboxes:**
1. Click "Select All" checkbox → All orders selected ✅
2. Uncheck "Select All" → All orders deselected ✅
3. Click individual checkbox → Order selected/deselected ✅
4. Selected count updates correctly ✅
5. "Thêm X Đơn Hàng" button text updates ✅

**Test Search:**
1. Type in search box → Debounce 500ms → Results filter ✅
2. No CSP errors ✅

---

### **Test 3: Auto-Sync Tab - Eligible Orders**

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
2. Select month filter
3. Check table functionality

**Test Checkboxes:**
1. Click "Select All" checkbox → All non-disabled orders selected ✅
2. Uncheck "Select All" → All orders deselected ✅
3. Click individual checkbox → Selection count updates ✅
4. "Đã chọn: X đơn hàng" updates correctly ✅
5. "Tổng cashback: X đ" calculates correctly ✅

**Test Retry Button:**
1. If error occurs → Click "Thử lại" button
2. Function retries loading ✅
3. No CSP errors ✅

---

### **Test 4: Console Verification**

**Expected Console Logs:**
```javascript
// When clicking "Select All Available"
[Event Delegation] Action: toggle-select-all-available, ID: undefined

// When clicking individual checkbox
[Event Delegation] Action: toggle-order-selection, ID: f11a9d9f-...

// When typing in search
(After 500ms debounce, no logs - just fetches)

// When clicking retry button
[Event Delegation] Action: retry-load-new-orders, ID: undefined
```

**Should NOT See:**
```javascript
❌ Executing inline event handler violates CSP...
❌ script-src-attr 'none'
```

---

## 📋 Files Changed

| File | Lines | Change |
|------|-------|--------|
| `frontend/admin/system-reconciliation.html` | 2580-2585 | Removed `oninput` handler from search input |
| `frontend/admin/system-reconciliation.html` | 2650-2714 | Added "Trạng thái" column + status badge logic |
| `frontend/admin/system-reconciliation.html` | 2655-2660 | Changed checkbox ID + added `data-action` |
| `frontend/admin/system-reconciliation.html` | 2684-2691 | Added `data-action` + `data-order-id` to checkboxes |
| `frontend/admin/system-reconciliation.html` | 2725-2737 | Renamed function to `toggleSelectAllAvailable` |
| `frontend/admin/system-reconciliation.html` | 2275-2277 | Changed checkbox ID for eligible orders |
| `frontend/admin/system-reconciliation.html` | 2294-2299 | Added `data-action` to eligible order checkboxes |
| `frontend/admin/system-reconciliation.html` | 2344-2350 | Renamed function to `toggleSelectAllEligible` |
| `frontend/admin/system-reconciliation.html` | 3023 | Changed retry button to `data-action` |
| `frontend/admin/system-reconciliation.html` | 3320 | Changed retry button to `data-action` |
| `frontend/admin/system-reconciliation.html` | 3544-3563 | Added 6 new event delegation cases |
| `frontend/admin/system-reconciliation.html` | 3567-3573 | Added search input event listener |

---

## 🚀 Deployment

### **1. No Backend Changes**
- Frontend-only fix
- No database migration needed

### **2. Deploy Frontend**
```bash
# CRITICAL: Hard refresh to clear cached JavaScript
Ctrl + Shift + R  # Windows/Linux
Cmd + Shift + R   # Mac
```

### **3. Verify CSP Compliance**
1. Open Console (F12)
2. Navigate to reconciliation page
3. Should see NO CSP errors
4. All checkboxes and buttons work

---

## 🔍 Debug Tips

### **If CSP Errors Still Appear:**

1. **Check for missed inline handlers:**
   ```bash
   # Search for remaining inline handlers
   grep -n "onclick=" system-reconciliation.html
   grep -n "onchange=" system-reconciliation.html
   grep -n "oninput=" system-reconciliation.html
   ```

2. **Verify hard refresh:**
   - Clear browser cache completely
   - Try incognito/private window
   - Check DevTools → Network → Disable cache

3. **Check CSP header:**
   ```javascript
   // In Console:
   document.querySelector('meta[http-equiv="Content-Security-Policy"]')
   // Should include: script-src-attr 'none'
   ```

### **If Checkboxes Don't Work:**

1. **Check event delegation:**
   ```javascript
   // In Console:
   document.querySelector('[data-action="toggle-select-all-available"]')
   // Should return checkbox element
   ```

2. **Check console logs:**
   ```
   [Event Delegation] Action: toggle-select-all-available
   ```
   - If you see this → Event triggered ✅
   - If you don't → Check `data-action` attribute

### **If Status Column Doesn't Show:**

1. **Check API response:**
   - Open Network tab
   - Check `/available-orders` response
   - Verify `api_confirmed` field exists in order objects

2. **Check badge rendering:**
   ```javascript
   // In Console:
   document.querySelectorAll('.badge-success, .badge-warning')
   // Should return badge elements
   ```

---

## 🎓 Lessons Learned

1. **CSP Compliance is Critical**
   - Modern browsers enforce CSP strictly
   - Inline handlers violate `script-src-attr 'none'`
   - Always use event delegation with `data-action`

2. **Event Delegation Best Practices**
   - Use descriptive action names (`toggle-select-all-available` not just `toggle`)
   - Pass data via `data-*` attributes
   - Handle all events in centralized listener

3. **Checkbox Management**
   - Use unique IDs for different contexts (`selectAllAvailable` vs `selectAllEligible`)
   - Use distinct class names (`order-item-checkbox` vs `eligible-order-checkbox`)
   - Prevents conflicts and selector issues

4. **Status Display**
   - Always show order confirmation status to users
   - Use color-coded badges for quick visual scanning
   - Green = Good, Yellow = Pending, Red = Error

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Hard refresh browser completed
- [ ] Console shows NO CSP errors
- [ ] "Thêm Đơn Hàng" modal opens
- [ ] Modal shows 8 columns (including "Trạng thái")
- [ ] Status badges display correctly (Green/Yellow)
- [ ] "Select All" checkbox works
- [ ] Individual checkboxes work
- [ ] Search box filters orders (no CSP errors)
- [ ] Selected count updates
- [ ] "Thêm X Đơn Hàng" button text updates
- [ ] Auto-Sync eligible orders checkboxes work
- [ ] Retry buttons work (if error occurs)
- [ ] Console shows `[Event Delegation] Action:` logs
- [ ] No inline handler CSP violations

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed

**Summary:**
1. Removed all inline event handlers (`onclick`, `onchange`, `oninput`) → CSP compliant
2. Added 6 new event delegation cases for checkboxes and buttons
3. Added "Trạng thái" column to available orders table with API confirmation badges
4. Renamed functions for clarity (`toggleSelectAllAvailable`, `toggleSelectAllEligible`)
5. All features now work without CSP violations
