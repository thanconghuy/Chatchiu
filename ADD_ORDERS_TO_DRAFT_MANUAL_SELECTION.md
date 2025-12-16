# 📝 Chức Năng: Thêm Đơn Hàng Vào Kỳ Đối Soát Nháp (Lựa Chọn Thủ Công)

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Implemented

---

## 🎯 Mô Tả

Chức năng cho phép admin **chủ động chọn** đơn hàng từ danh sách chờ đối soát và **chọn kỳ đối soát nháp** để thêm vào.

### Khác biệt với chức năng cũ:

| Chức năng cũ | Chức năng mới |
|--------------|---------------|
| Tự động phát hiện kỳ nháp khi click "Tạo Kỳ Đối Soát" | Cho phép chọn kỳ nháp từ dropdown |
| Tự động lấy TẤT CẢ đơn hàng trong danh sách chờ | Cho phép chọn từng đơn hàng hoặc chọn tất cả |
| Chỉ hiện dialog confirm | Có form đầy đủ với dropdown và checkboxes |

---

## 🎨 Giao Diện

### Vị trí: Tab "Danh Sách Chờ Đối Soát"

```
┌──────────────────────────────────────────────────────────────┐
│ 📝 Thêm Đơn Hàng Vào Kỳ Đối Soát Nháp                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Chọn kỳ đối soát nháp:                                      │
│ [Tháng 11/2025 - Đợt 1 (5 đơn, 12.000 đ) ▼]                │
│                                                               │
│ ☑ Chọn tất cả đơn hàng                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ 251106353HTKV8 - shopee - 1,157 đ                    │ │
│ │ ☑ 251106313Y4E8V - shopee - 4,426 đ                    │ │
│ │ ☑ 25110621TSXCCD - shopee - 1,908 đ                    │ │
│ │ ☐ 25110761KHBQ411 - shopee - 2,932 đ                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│          [✓ Thêm Vào Kỳ Đối Soát]                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔄 Luồng Hoạt Động

### 1. Load Dữ Liệu Ban Đầu

Khi mở tab "Danh Sách Chờ Đối Soát":

1. **Load danh sách kỳ đối soát nháp** vào dropdown
   - API: `GET /api/admin/system-reconciliation?status=draft&limit=50`
   - Hiển thị: `period_label (total_orders đơn, total_cashback)`

2. **Load danh sách đơn hàng chờ** thành checkboxes
   - API: `GET /api/admin/system-reconciliation/auto-sync/waiting-list`
   - Hiển thị mỗi đơn: `order_code - merchant_name - cashback_amount`

### 2. User Chọn Kỳ Đối Soát và Đơn Hàng

**Steps:**
1. Chọn kỳ đối soát từ dropdown (required)
2. Chọn đơn hàng:
   - Click checkbox "Chọn tất cả" → Chọn hết
   - Click từng checkbox đơn hàng → Chọn theo ý muốn

**Validation:**
- Button "Thêm Vào Kỳ Đối Soát" chỉ enabled khi:
  - Đã chọn kỳ đối soát (dropdown có value)
  - Đã chọn ít nhất 1 đơn hàng (checkbox checked)

### 3. Thêm Đơn Hàng Vào Kỳ Nháp

**Steps:**
1. Click button "Thêm Vào Kỳ Đối Soát"
2. Button changes to: "⏳ Đang thêm..."
3. Backend API call:
   ```javascript
   POST /api/admin/system-reconciliation/{reconciliationId}/add-orders
   Body: {
     orderIds: ["uuid1", "uuid2", ...]  // conversion_id array
   }
   ```

4. Backend xử lý:
   - Verify reconciliation exists and is draft
   - Add orders to reconciliation items
   - Update total_orders, total_cashback

5. Frontend cleanup:
   - Xóa đơn hàng đã thêm khỏi waiting list
   - Reload waiting list
   - Reload draft reconciliations dropdown
   - Reload reconciliations main list
   - Reset form

6. Toast thông báo:
   - Success: "Đã thêm X đơn hàng vào kỳ đối soát"
   - Error: Error message từ backend

---

## 📋 Implementation Details

### Frontend Changes

**File:** `frontend/admin/system-reconciliation.html`

#### 1. UI Form (Lines 1193-1218)

```html
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); ...">
    <h3>📝 Thêm Đơn Hàng Vào Kỳ Đối Soát Nháp</h3>

    <!-- Dropdown select kỳ nháp -->
    <select id="draftReconciliationSelect">
        <option value="">-- Chọn kỳ đối soát --</option>
    </select>

    <!-- Checkbox chọn tất cả -->
    <input type="checkbox" id="selectAllWaitingOrders">
    Chọn tất cả đơn hàng

    <!-- List checkboxes đơn hàng -->
    <div id="waitingOrdersCheckboxList">
        <!-- Dynamically populated -->
    </div>

    <!-- Button submit -->
    <button id="btnAddToDraftRecon" disabled>
        ✓ Thêm Vào Kỳ Đối Soát
    </button>
</div>
```

#### 2. JavaScript Functions

**Load Draft Reconciliations (Lines 3393-3430):**
```javascript
async function loadDraftReconciliations() {
    // GET /api/admin/system-reconciliation?status=draft&limit=50
    // Populate dropdown with draft reconciliations
}
```

**Update Checkbox List (Lines 3432-3459):**
```javascript
function updateWaitingOrdersCheckboxList(orders) {
    // Render checkboxes for each waiting order
    // Each checkbox has:
    //   - value: waiting_list.id
    //   - data-conversion-id: conversion_id
}
```

**Update Button State (Lines 3461-3468):**
```javascript
function updateAddToDraftButton() {
    // Enable button only if:
    //   - Reconciliation selected
    //   - At least one order checked
}
```

**Add Orders to Draft (Lines 3470-3535):**
```javascript
async function addOrdersToDraftReconciliation() {
    // 1. Validate selections
    // 2. Show loading state
    // 3. Call API to add orders
    // 4. Remove from waiting list
    // 5. Reload data
    // 6. Reset form
}
```

**Remove from Waiting List (Lines 3537-3556):**
```javascript
async function removeAddedOrdersFromWaitingList(waitingListIds) {
    // DELETE /api/admin/system-reconciliation/auto-sync/waiting-list/{id}
    // For each added order
}
```

#### 3. Event Listeners (Lines 3853-3901)

```javascript
document.addEventListener('DOMContentLoaded', () => {
    // Load drafts when Auto-Sync tab is clicked
    // Handle dropdown change
    // Handle "Select All" checkbox
    // Handle individual checkboxes
    // Handle button click
});
```

---

### Backend Endpoints (Already Exist)

#### 1. Get Draft Reconciliations
```
GET /api/admin/system-reconciliation?status=draft&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reconciliations": [
      {
        "id": "uuid",
        "period_label": "Tháng 11/2025 - Đợt 1",
        "total_orders": 5,
        "total_cashback": 12000,
        "status": "draft"
      }
    ]
  }
}
```

#### 2. Add Orders to Reconciliation
```
POST /api/admin/system-reconciliation/{id}/add-orders
```

**Request Body:**
```json
{
  "orderIds": ["conversion-uuid-1", "conversion-uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã thêm 2 đơn hàng vào kỳ đối soát",
  "data": {
    "added_count": 2,
    "total_orders": 7,
    "total_cashback": 22423
  }
}
```

#### 3. Delete from Waiting List
```
DELETE /api/admin/system-reconciliation/auto-sync/waiting-list/{id}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã xóa đơn hàng khỏi danh sách chờ"
}
```

---

## 🧪 Testing Guide

### Test 1: Load Draft Reconciliations

**Steps:**
1. Tạo 2 kỳ đối soát nháp trước (via create reconciliation)
2. Navigate to **Auto-Sync** tab → **Danh Sách Chờ Đối Soát**
3. Check dropdown "Chọn kỳ đối soát nháp"

**Expected:**
- ✅ Dropdown shows 2 draft reconciliations
- ✅ Format: "Tháng X/YYYY - Đợt Y (Z đơn, ABC đ)"
- ✅ Button "Thêm Vào Kỳ Đối Soát" is disabled (no selection)

---

### Test 2: Load Waiting Orders as Checkboxes

**Steps:**
1. Ensure có đơn hàng trong waiting list (4 orders from screenshot)
2. Check section checkboxes

**Expected:**
- ✅ Shows 4 checkboxes (one per order)
- ✅ Each checkbox shows: order_code - merchant - cashback
- ✅ "Chọn tất cả" checkbox visible
- ✅ Button still disabled (no reconciliation selected)

---

### Test 3: Select All Orders

**Steps:**
1. Click checkbox "Chọn tất cả đơn hàng"

**Expected:**
- ✅ All 4 order checkboxes get checked
- ✅ Button still disabled (no reconciliation selected)

**Steps:**
2. Unclick "Chọn tất cả"

**Expected:**
- ✅ All 4 order checkboxes get unchecked

---

### Test 4: Enable Button

**Steps:**
1. Select dropdown: "Tháng 11/2025 - Đợt 1"
2. Check 2 order checkboxes

**Expected:**
- ✅ Button "Thêm Vào Kỳ Đối Soát" becomes enabled
- ✅ Button has green background

---

### Test 5: Add Orders Successfully

**Prerequisites:**
- Draft reconciliation "Tháng 11/2025 - Đợt 1" has 5 orders
- 4 orders in waiting list

**Steps:**
1. Select dropdown: "Tháng 11/2025 - Đợt 1"
2. Check 2 orders (e.g., first 2)
3. Click "Thêm Vào Kỳ Đối Soát"

**Expected:**
- ✅ Button shows: "⏳ Đang thêm..."
- ✅ Success toast: "Đã thêm 2 đơn hàng vào kỳ đối soát"
- ✅ 2 đơn hàng đã chọn biến mất khỏi waiting list
- ✅ Waiting list còn 2 đơn (4 - 2)
- ✅ Checkbox list updates (chỉ còn 2 checkboxes)
- ✅ Dropdown refreshes (total_orders updates to 7 = 5 + 2)
- ✅ Form resets (all checkboxes unchecked, button disabled)

**Database Verification:**
```sql
SELECT id, period_label, total_orders, total_cashback
FROM system_reconciliations
WHERE period_label = 'Tháng 11/2025 - Đợt 1';

-- Should show total_orders = 7 (was 5, added 2)
```

---

### Test 6: Add All Orders

**Prerequisites:**
- Draft reconciliation exists
- 4 orders in waiting list

**Steps:**
1. Select dropdown
2. Click "Chọn tất cả đơn hàng"
3. Click "Thêm Vào Kỳ Đối Soát"

**Expected:**
- ✅ All 4 orders added
- ✅ Waiting list becomes empty
- ✅ Message: "Chưa có đơn hàng trong danh sách chờ"
- ✅ Checkbox section shows: "Chưa có đơn hàng trong danh sách chờ"
- ✅ Button disabled (no orders left)

---

### Test 7: Validation - No Reconciliation Selected

**Steps:**
1. Don't select dropdown
2. Check some orders
3. Try to click button

**Expected:**
- ✅ Button remains disabled
- ❌ Cannot click

---

### Test 8: Validation - No Orders Selected

**Steps:**
1. Select dropdown
2. Don't check any orders
3. Try to click button

**Expected:**
- ✅ Button remains disabled
- ❌ Cannot click

---

### Test 9: Error Handling - Cannot Add to Finalized

**Steps:**
1. Finalize a reconciliation (status = 'finalized')
2. Try to add orders to it

**Expected:**
- ✅ Backend returns error: "Chỉ có thể thêm đơn hàng vào kỳ đối soát DRAFT"
- ✅ Toast shows error message
- ✅ Orders NOT added
- ✅ Button resets

---

## 📊 Database Schema

### Tables Used

**system_reconciliations:**
```sql
id UUID PRIMARY KEY
period_label VARCHAR
total_orders INTEGER
total_cashback DECIMAL
status VARCHAR  -- 'draft', 'finalized', 'paid'
```

**reconciliation_waiting_list:**
```sql
id UUID PRIMARY KEY
conversion_id UUID REFERENCES conversions(id)
order_code VARCHAR
merchant_name VARCHAR
cashback_amount DECIMAL
status VARCHAR  -- 'waiting'
```

**system_reconciliation_items:**
```sql
id UUID PRIMARY KEY
system_reconciliation_id UUID REFERENCES system_reconciliations(id)
conversion_id UUID REFERENCES conversions(id)
cashback_amount DECIMAL
```

---

## 🎓 User Workflow

### Scenario: Thêm 2 đơn hàng mới vào kỳ nháp hiện có

**Context:**
- Kỳ "Tháng 11/2025 - Đợt 1" đã có 5 đơn hàng
- Vừa có 4 đơn hàng mới được duyệt và đủ điều kiện
- Muốn thêm vào kỳ nháp thay vì tạo kỳ mới

**Steps:**
1. Navigate to **Đối Soát Hệ Thống** → **Auto-Sync**
2. Click tab **"Danh Sách Chờ Đối Soát"**
3. Trong form **"Thêm Đơn Hàng Vào Kỳ Đối Soát Nháp"**:
   - Chọn dropdown: **"Tháng 11/2025 - Đợt 1 (5 đơn, 12.000 đ)"**
   - Click checkbox: **"Chọn tất cả đơn hàng"** (hoặc chọn từng đơn)
4. Click button **"✓ Thêm Vào Kỳ Đối Soát"**
5. Đợi toast success: **"Đã thêm 4 đơn hàng vào kỳ đối soát"**
6. Verify:
   - Danh sách chờ trống
   - Dropdown updates: **"Tháng 11/2025 - Đợt 1 (9 đơn, 22.423 đ)"**

---

## ✅ Advantages of This Approach

1. **User Control**: Admin chủ động chọn kỳ nháp và đơn hàng
2. **Flexibility**: Có thể chọn một số đơn, không nhất thiết phải tất cả
3. **Visibility**: Thấy rõ số đơn và tổng cashback của từng kỳ
4. **Multi-Draft Support**: Có thể có nhiều kỳ nháp và chọn kỳ phù hợp
5. **Safety**: Validation prevents adding to finalized reconciliations

---

## 🔍 Troubleshooting

### Issue: Dropdown trống (không có kỳ nháp)

**Check:**
1. Có kỳ đối soát nào ở trạng thái 'draft' không?
   ```sql
   SELECT * FROM system_reconciliations WHERE status = 'draft';
   ```
2. API `/api/admin/system-reconciliation?status=draft` returns data?

**Fix:**
- Tạo ít nhất 1 kỳ đối soát nháp trước

---

### Issue: Checkboxes trống

**Check:**
1. Có đơn hàng trong waiting list không?
   ```sql
   SELECT * FROM reconciliation_waiting_list WHERE status = 'waiting';
   ```
2. Function `updateWaitingOrdersCheckboxList` được gọi sau `loadWaitingList`?

**Fix:**
- Thêm đơn hàng vào waiting list (via "Đang xử lý..." button)

---

### Issue: Button không enable

**Check:**
1. Dropdown có value không? (`draftReconciliationSelect.value`)
2. Có checkbox nào được check không? (`.waiting-order-checkbox:checked`)

**Fix:**
- Chọn cả dropdown VÀ ít nhất 1 checkbox

---

### Issue: Error khi thêm

**Common Errors:**
1. **"Chỉ có thể thêm đơn hàng vào kỳ đối soát DRAFT"**
   - Kỳ đã finalized/paid
   - Fix: Chọn kỳ nháp khác

2. **"orderIds phải là mảng và không được rỗng"**
   - Frontend không gửi đúng format
   - Fix: Check `orderIds` array in request body

3. **"Kỳ đối soát không tồn tại"**
   - Reconciliation ID không hợp lệ
   - Fix: Reload draft reconciliations dropdown

---

## 📝 Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `frontend/admin/system-reconciliation.html` | 1193-1218 | Added UI form (dropdown, checkboxes, button) |
| `frontend/admin/system-reconciliation.html` | 3388-3389 | Call `updateWaitingOrdersCheckboxList` after loadWaitingList |
| `frontend/admin/system-reconciliation.html` | 3393-3430 | Added `loadDraftReconciliations()` function |
| `frontend/admin/system-reconciliation.html` | 3432-3459 | Added `updateWaitingOrdersCheckboxList()` function |
| `frontend/admin/system-reconciliation.html` | 3461-3468 | Added `updateAddToDraftButton()` function |
| `frontend/admin/system-reconciliation.html` | 3470-3535 | Added `addOrdersToDraftReconciliation()` function |
| `frontend/admin/system-reconciliation.html` | 3537-3556 | Added `removeAddedOrdersFromWaitingList()` function |
| `frontend/admin/system-reconciliation.html` | 3853-3901 | Added event listeners for new controls |

**Backend:** No changes needed (all endpoints already exist)

---

## 🚀 Deployment

### 1. Frontend Already Updated
- Changes applied to `system-reconciliation.html`
- No build needed (static HTML)

### 2. Test Feature
1. Hard refresh browser (Ctrl + Shift + R)
2. Navigate to **Auto-Sync** → **Danh Sách Chờ**
3. See new form at top
4. Test adding orders to draft

---

**Created:** 2025-12-13
**Status:** ✅ Ready for Testing
**Implemented by:** Claude Sonnet 4.5
