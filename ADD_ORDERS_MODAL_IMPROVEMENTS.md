# 🔧 Add Orders Modal Improvements

## 🎯 Vấn Đề

Từ user feedback và screenshot:

### 1. **Cột "Giá trị đơn" Không Cần Thiết**
- Cột hiển thị `order_value` không cần cho modal này
- User chỉ quan tâm cashback amount khi thêm vào đối soát
- Tạo ra bảng quá rộng không cần thiết

### 2. **Trạng Thái Đơn Hàng Hiển Thị Sai**
User feedback (verbatim):
> "Trạng thái đơn hàng là dữ liệu thực tế được lưu trong bản system_conversions được cập nhật thực tế từ API Accesstrade chứ không phải bạn tự thêm vào. Như hình ảnh bạn cung cấp là trạng thái bạn tự thêm vào. Mục tiêu là để biết là đơn hàng đó đã được duyệt chưa (TT Đơn hàng)."

**Vấn đề:**
- Frontend tự tạo badge dựa trên `order.api_confirmed`
- Không hiển thị status thực tế từ `system_conversions.status`
- Status badge không phản ánh trạng thái duyệt từ AccessTrade API

**BEFORE (Wrong):**
```javascript
if (order.api_confirmed) {
    statusBadge = '<span class="badge badge-success">✓ Đã xác nhận</span>';
} else {
    statusBadge = '<span class="badge badge-warning">⏳ Chờ xác nhận</span>';
}
```

### 3. **Cho Phép Chọn Đơn Đã Tồn Tại Trong Kỳ Đối Soát Khác**
User feedback (verbatim):
> "Kiểm tra lại điều kiện những đơn hàng nào đã tồn tại trong kỳ đối soát trước đó rồi thì không thêm vào. hoặc không cho chọn khi thêm đối soát."

**Vấn đề:**
- Backend query chỉ loại bỏ orders đã có trong kỳ **hiện tại**:
  ```sql
  AND (sc.system_reconciliation_id IS NULL OR sc.system_reconciliation_id != $3)
  ```
- Vẫn cho phép select orders đã có trong kỳ đối soát **khác**
- Có thể duplicate orders across reconciliations

---

## ✅ Giải Pháp

### **Fix 1: Removed "Giá trị đơn" Column**

**File:** `frontend/admin/system-reconciliation.html` (Lines 2651-2730)

**BEFORE (8 columns):**
```html
<thead>
    <tr>
        <th>☑️ Checkbox</th>
        <th>Người dùng</th>
        <th>Order ID</th>
        <th>Ngày đặt hàng</th>
        <th>Thời gian duyệt</th>
        <th>Trạng thái</th>
        <th>Giá trị đơn</th>  <!-- ❌ REMOVED -->
        <th>Cashback</th>
    </tr>
</thead>
```

**AFTER (7 columns):**
```html
<thead>
    <tr>
        <th>☑️ Checkbox</th>
        <th>Người dùng</th>
        <th>Order ID</th>
        <th>Ngày đặt hàng</th>
        <th>Thời gian duyệt</th>
        <th>Trạng thái</th>
        <th>Cashback</th>
    </tr>
</thead>
```

**Why:**
- User chỉ cần biết cashback khi thêm vào đối soát
- Order value không ảnh hưởng đến quyết định chọn
- Modal gọn gàng hơn

---

### **Fix 2: Show Real Order Status from Database**

**File:** `frontend/admin/system-reconciliation.html` (Lines 2673-2689)

**BEFORE (Self-generated status):**
```javascript
// ❌ WRONG: Using api_confirmed field
let statusBadge = '';
if (order.api_confirmed) {
    statusBadge = '<span class="badge badge-success">✓ Đã xác nhận</span>';
} else {
    statusBadge = '<span class="badge badge-warning">⏳ Chờ xác nhận</span>';
}
```

**AFTER (Real database status):**
```javascript
// ✅ CORRECT: Using system_conversions.status from database
let statusBadge = '';
const status = order.status || 'pending';

switch(status.toLowerCase()) {
    case 'approved':
        statusBadge = '<span class="badge badge-success">✓ Đã duyệt</span>';
        break;
    case 'pending':
        statusBadge = '<span class="badge badge-warning">⏳ Chờ duyệt</span>';
        break;
    case 'rejected':
        statusBadge = '<span class="badge badge-danger">✗ Từ chối</span>';
        break;
    default:
        statusBadge = `<span class="badge badge-secondary">${escapeHtml(status)}</span>`;
}
```

**Backend Already Returns This Field:**
```javascript
// backend/services/systemReconciliation/SystemReconciliationService.js:504
sc.status,  // ✅ Real status from system_conversions table
```

**Status Values:**
| Value | Badge | Meaning |
|-------|-------|---------|
| `approved` | ✅ Green "Đã duyệt" | Approved by AccessTrade API |
| `pending` | ⏳ Yellow "Chờ duyệt" | Waiting for approval |
| `rejected` | ✗ Red "Từ chối" | Rejected by AccessTrade |
| Other | Gray with value | Custom status |

---

### **Fix 3: Disable Orders Already in Reconciliation**

#### **A. Backend Changes**

**File:** `backend/services/systemReconciliation/SystemReconciliationService.js`

**Change 1: Remove Reconciliation ID Filter (Lines 462-489)**

**BEFORE:**
```javascript
const queryParams = [recon.period_start, recon.period_end, reconciliationId];

const countQuery = `
  SELECT COUNT(*) as total
  FROM system_conversions sc
  ...
  WHERE sc.status = 'approved'
    AND sc.order_time >= $1
    AND sc.order_time <= $2
    AND (sc.system_reconciliation_id IS NULL OR sc.system_reconciliation_id != $3)  -- ❌ WRONG
    AND (sc.system_reconciliation_status IS NULL
         OR sc.system_reconciliation_status NOT IN ('reconciled', 'paid'))
`;
```

**AFTER:**
```javascript
const queryParams = [recon.period_start, recon.period_end];  // ✅ Removed reconciliationId

const countQuery = `
  SELECT COUNT(*) as total
  FROM system_conversions sc
  ...
  WHERE sc.status = 'approved'
    AND sc.order_time >= $1
    AND sc.order_time <= $2
    -- ✅ Show ALL approved orders in period, let frontend disable existing ones
`;
```

**Change 2: Add Reconciliation Status Fields (Lines 494-527)**

**Added to SELECT:**
```javascript
SELECT
  sc.at_conversion_id as conversion_id,
  ...
  sc.status,                            // ✅ Real order status
  sc.system_reconciliation_id,          // ✅ NEW: Which reconciliation this order is in
  sc.system_reconciliation_status,      // ✅ NEW: Reconciliation status
  ...
  CASE
    WHEN sc.system_reconciliation_id IS NOT NULL THEN true
    ELSE false
  END as is_in_reconciliation           // ✅ NEW: Boolean flag
```

**Why:**
- Show ALL approved orders in the period
- Frontend disables orders already in reconciliation
- User can see which orders are unavailable
- Prevents duplicate orders across reconciliations

---

#### **B. Frontend Changes**

**File:** `frontend/admin/system-reconciliation.html` (Lines 2691-2726)

**Added Logic:**
```javascript
// Check if order is already in ANY reconciliation
const isInReconciliation = order.is_in_reconciliation || false;
const isDisabled = isInReconciliation;

return `
  <tr ${isDisabled ? 'style="opacity: 0.5; background: #f9fafb;"' : ''}>
    <td>
      <input
        type="checkbox"
        class="order-checkbox order-item-checkbox"
        value="${order.conversion_id}"
        data-action="toggle-order-selection"
        data-order-id="${order.conversion_id}"
        ${selectedOrderIds.has(order.conversion_id) ? 'checked' : ''}
        ${isDisabled ? 'disabled title="Đã tồn tại trong kỳ đối soát khác"' : ''}
      >
    </td>
    ...
    <td>
      ${statusBadge}
      ${isInReconciliation ? '<div style="margin-top: 4px;"><small style="color: #f59e0b;">⚠️ Đã trong kỳ DS khác</small></div>' : ''}
    </td>
    ...
  </tr>
`;
```

**Visual Indicators:**
- ✅ Disabled checkbox with tooltip: "Đã tồn tại trong kỳ đối soát khác"
- ✅ Row opacity 50% with gray background
- ✅ Warning message below status badge: "⚠️ Đã trong kỳ DS khác"

**Updated Toggle Select All (Lines 2742-2755):**
```javascript
function toggleSelectAllAvailable(checkbox) {
    // Only select/deselect enabled checkboxes (not disabled ones)
    const checkboxes = document.querySelectorAll('.order-item-checkbox:not([disabled])');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const orderId = cb.value;
        if (checkbox.checked) {
            selectedOrderIds.add(orderId);
        } else {
            selectedOrderIds.delete(orderId);
        }
    });
    updateAddOrdersButton();
}
```

**Why:**
- Select All skips disabled checkboxes
- User can't accidentally select already-reconciled orders
- Clear visual feedback about availability

---

## 🔄 How It Works Now

### **User Flow:**

1. **User clicks "Thêm Đơn Hàng" on draft reconciliation**
2. **Modal opens** with title: "Thêm Đơn Hàng - {Period Label}"
3. **Backend fetches ALL approved orders** in reconciliation period
4. **Table displays 7 columns:**
   - ☑️ Checkbox (disabled if in other reconciliation)
   - 👤 Người dùng
   - 🆔 Order ID
   - 📅 Ngày đặt hàng
   - ⏰ Thời gian duyệt
   - ✅ **Trạng thái** (Real status from DB: approved/pending/rejected)
   - 💵 Cashback

5. **Orders already in reconciliation:**
   - Checkbox disabled with tooltip
   - Row grayed out (opacity 50%)
   - Warning: "⚠️ Đã trong kỳ DS khác"

6. **User selects available orders** → Click "Thêm Đơn Hàng"
7. **Backend validates** orders not in other reconciliations
8. **Orders added** to current reconciliation

---

## 🧪 Testing Guide

### **Test 1: Column Count**

**Steps:**
1. Open modal "Thêm Đơn Hàng"
2. Count table columns

**Expected:**
- ✅ **7 columns total** (not 8)
- ✅ No "Giá trị đơn" column
- ✅ Columns: Checkbox | Người dùng | Order ID | Ngày đặt | Thời gian duyệt | Trạng thái | Cashback

---

### **Test 2: Real Order Status**

**Steps:**
1. Open modal "Thêm Đơn Hàng"
2. Check "Trạng thái" column

**Expected Status Badges:**
- ✅ **"Đã duyệt"** (Green) - for status='approved'
- ⏳ **"Chờ duyệt"** (Yellow) - for status='pending'
- ✗ **"Từ chối"** (Red) - for status='rejected'

**Should NOT See:**
- ❌ "Đã xác nhận" / "Chờ xác nhận" (old fake statuses)

**Verify in Database:**
```sql
SELECT id, order_code, status FROM system_conversions WHERE status = 'approved' LIMIT 5;
```

Compare with modal display - should match exactly!

---

### **Test 3: Disabled Orders Already in Reconciliation**

**Setup:**
1. Create reconciliation A (Đợt 1)
2. Add 5 orders to reconciliation A
3. Create reconciliation B (Đợt 2 - same period)
4. Open "Thêm Đơn Hàng" for reconciliation B

**Expected:**
- ✅ All approved orders in period shown
- ✅ **5 orders from Đợt 1:**
  - Checkbox disabled ☑️
  - Row grayed out (opacity 50%, background #f9fafb)
  - Tooltip: "Đã tồn tại trong kỳ đối soát khác"
  - Warning below status: "⚠️ Đã trong kỳ DS khác"

- ✅ **Other orders:**
  - Checkbox enabled ☑️
  - Normal appearance
  - Can be selected

**Test Select All:**
- ✅ Click "Select All" checkbox
- ✅ Only enabled checkboxes get selected
- ✅ Disabled checkboxes remain unchecked

---

### **Test 4: Prevent Duplicate Addition**

**Steps:**
1. Try to check a disabled order (should be impossible)
2. Select only available orders
3. Click "Thêm Đơn Hàng"

**Expected:**
- ✅ Only enabled orders can be selected
- ✅ Backend validation passes
- ✅ Success message: "Đã thêm X đơn hàng vào kỳ đối soát"
- ✅ No duplicate errors

---

## 📋 Files Changed

| File | Lines | Change |
|------|-------|--------|
| `backend/services/systemReconciliation/SystemReconciliationService.js` | 462-489 | Removed reconciliation ID filter from count query |
| `backend/services/systemReconciliation/SystemReconciliationService.js` | 494-527 | Added `system_reconciliation_id`, `system_reconciliation_status`, `is_in_reconciliation` fields |
| `frontend/admin/system-reconciliation.html` | 2663-2669 | Removed "Giá trị đơn" column header |
| `frontend/admin/system-reconciliation.html` | 2673-2689 | Changed to real database status with switch/case |
| `frontend/admin/system-reconciliation.html` | 2691-2726 | Added disabled state for orders in reconciliation |
| `frontend/admin/system-reconciliation.html` | 2742-2755 | Updated toggle select all to skip disabled checkboxes |

---

## 🗂️ Database Fields Used

### **system_conversions Table:**

| Field | Type | Purpose | Used For |
|-------|------|---------|----------|
| `status` | VARCHAR | Order approval status | Show real "Trạng thái" badge |
| `system_reconciliation_id` | UUID | Which reconciliation owns this order | Check if in reconciliation |
| `system_reconciliation_status` | VARCHAR | Reconciliation status | Additional validation |
| `cashback_amount` | DECIMAL | Cashback amount | Display in modal |
| `order_time` | TIMESTAMP | Order date | Filter by period |
| `approval_time` | TIMESTAMP | Approval date | Sort orders |

---

## 🚀 Deployment

### **1. Backend Changes**
- Modified SQL query logic
- No database migration needed
- Restart backend server

### **2. Frontend Changes**
```bash
# Hard refresh browser
Ctrl + Shift + R  # Windows/Linux
Cmd + Shift + R   # Mac
```

### **3. Test**
1. Open "Thêm Đơn Hàng" modal
2. Verify 7 columns (not 8)
3. Verify real status badges
4. Verify disabled orders

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Modal opens successfully
- [ ] **7 columns displayed** (no "Giá trị đơn")
- [ ] "Trạng thái" shows real DB status:
  - [ ] "Đã duyệt" for approved orders
  - [ ] "Chờ duyệt" for pending orders
  - [ ] "Từ chối" for rejected orders
- [ ] Orders already in reconciliation:
  - [ ] Checkbox disabled
  - [ ] Row grayed out
  - [ ] Warning message shown
  - [ ] Tooltip on hover
- [ ] "Select All" skips disabled checkboxes
- [ ] Can only select available orders
- [ ] Backend accepts only valid orders
- [ ] No duplicate orders across reconciliations

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed

**Summary:**
1. Removed unnecessary "Giá trị đơn" column
2. Fixed status display to show real `system_conversions.status` from database
3. Added check to disable orders already in ANY reconciliation
4. Backend returns `is_in_reconciliation` flag
5. Frontend disables checkboxes with visual indicators
6. Prevents duplicate orders across reconciliations
