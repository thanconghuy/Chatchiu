# 📋 Auto-Sync Table View Update

## 🎯 Mục Tiêu Hoàn Thành

Thay đổi tab **Auto-Sync** từ hiển thị **thống kê tổng quan** sang **danh sách chi tiết đơn hàng** đủ điều kiện đối soát.

---

## ✅ Các Thay Đổi Đã Thực Hiện

### 1. **Database Migration** ✅

**File:** `backend/migrations/029_update_autosync_add_user_info.sql`

**Thay đổi:**
- Update function `get_eligible_conversions_for_waiting_list()`
- Thêm LEFT JOIN với bảng `users`
- Thêm 2 fields mới:
  - `user_email VARCHAR(255)`
  - `user_full_name VARCHAR(255)`

**Run migration:**
```bash
node run-autosync-migration-029.js
```

---

### 2. **Frontend HTML Updates** ✅

**File:** `frontend/admin/system-reconciliation.html`

**Thay đổi:**
- Thêm **Month Filter** dropdown (`#newOrdersMonthFilter`)
- Thêm **Refresh Button** (`#btnRefreshNewOrders`)
- Thêm **Summary Display** (`#newOrdersSummary`)

**HTML Structure:**
```html
<div style="margin-bottom: 20px; display: flex; gap: 12px;">
    <label><i class="fas fa-filter"></i> Lọc theo tháng:</label>
    <select id="newOrdersMonthFilter">
        <option value="">Tất cả</option>
    </select>
    <button id="btnRefreshNewOrders">
        <i class="fas fa-sync"></i> Làm mới
    </button>
    <div id="newOrdersSummary">
        <!-- Summary will be inserted here -->
    </div>
</div>
```

---

### 3. **JavaScript Functions** ✅

#### **A. Global Variables**
```javascript
let allEligibleOrders = []; // Store all orders for filtering
let selectedMonth = '';     // Currently selected month filter
```

#### **B. Updated `loadNewOrdersPreview(monthFilter)`**
**Thay đổi:**
- Nhận parameter `monthFilter` (optional)
- Lưu orders vào `allEligibleOrders`
- Populate month filter dropdown
- Filter orders theo month
- Update summary display
- Gọi `renderOrdersTable(filteredOrders)` thay vì render summary cards

**Logic Flow:**
```
1. Fetch API: /api/admin/system-reconciliation/auto-sync/preview
2. Extract: { summary, byMonth, orders }
3. Update month filter dropdown options
4. Filter orders by selected month
5. Calculate filtered summary
6. Render data table with filtered orders
```

#### **C. New Function: `renderOrdersTable(orders)`**
**Chức năng:**
- Render HTML table với 9 columns:
  1. # (STT)
  2. Ngày duyệt (DD/MM/YYYY)
  3. User (email hoặc full name)
  4. Merchant
  5. Mã đơn hàng
  6. Số tiền đơn
  7. Cashback
  8. Ngày đủ điều kiện (DD/MM/YYYY)
  9. Số ngày (days_since_approval)

**Styling:**
- Header: Gradient background (purple)
- Rows: Zebra striping (alternating colors)
- Responsive: Overflow-x scroll
- Font: Monospace for order codes
- Colors: Green for cashback, blue badge for days

#### **D. New Function: `formatDateVN(dateStr)`**
**Chức năng:**
- Convert ISO date → Vietnamese format `DD/MM/YYYY`

**Example:**
```javascript
formatDateVN('2025-11-15T10:00:00Z') // → "15/11/2025"
```

#### **E. Event Listeners Added**
```javascript
// Month filter change
newOrdersMonthFilter.addEventListener('change', (e) => {
    loadNewOrdersPreview(e.target.value);
});

// Refresh button
btnRefreshNewOrders.addEventListener('click', () => {
    loadNewOrdersPreview(selectedMonth);
});
```

---

## 📊 UI Before vs After

### **BEFORE:**
```
┌─────────────────────────────────┐
│ Tổng đơn hàng: 281              │
│ Tổng cashback: 3.190.249₫       │
│ Số tháng: 1                     │
│                                 │
│ 📅 Tháng 11/2025 - 281 đơn     │
│                                 │
│ [➕ Thêm vào danh sách chờ]    │
└─────────────────────────────────┘
```

### **AFTER:**
```
┌───────────────────────────────────────────────────────────────────┐
│ 🔍 Lọc theo tháng: [Tháng 11/2025 (281 đơn) ▼] [🔄 Làm mới]     │
│ 📦 281 đơn hàng | 💰 3.190.249₫                                  │
├───────────────────────────────────────────────────────────────────┤
│ # │ Ngày duyệt │ User           │ Merchant │ Mã đơn   │ Cashback │
├───────────────────────────────────────────────────────────────────┤
│ 1 │ 01/11/2025 │ user@email.com │ Shopee   │ SP123456 │ 12,345₫  │
│ 2 │ 02/11/2025 │ Nguyễn Văn A   │ Lazada   │ LZ789012 │ 23,456₫  │
│ 3 │ 03/11/2025 │ user2@test.com │ Tiki     │ TK345678 │ 15,789₫  │
│ ...                                                                │
├───────────────────────────────────────────────────────────────────┤
│ [➕ Thêm vào danh sách chờ]                                      │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Filter Flow

### **Use Case 1: Load All Orders**
```javascript
loadNewOrdersPreview(''); // monthFilter = ''
// → Shows all eligible orders across all months
```

### **Use Case 2: Filter by Month**
```javascript
// User selects "Tháng 11/2025" from dropdown
loadNewOrdersPreview('2025-11-01');
// → Shows only orders with approval_month = '2025-11-01'
```

### **Use Case 3: Refresh Current Filter**
```javascript
// User clicks "Làm mới" button
loadNewOrdersPreview(selectedMonth); // Reuses last selected month
```

---

## 🗂️ Table Columns Detail

| Column | Field | Format | Example |
|--------|-------|--------|---------|
| # | index | Number | 1, 2, 3... |
| Ngày duyệt | `approval_time` | DD/MM/YYYY | 15/11/2025 |
| User | `user_full_name` or `user_email` | Text | user@email.com |
| Merchant | `merchant_name` | Text | Shopee |
| Mã đơn | `order_code` | Monospace | SP123456 |
| Số tiền đơn | `order_amount` | Currency | 1,234,567₫ |
| Cashback | `cashback_amount` | Currency (green) | 12,345₫ |
| Ngày đủ ĐK | `eligible_date` | DD/MM/YYYY | 30/11/2025 |
| Số ngày | `days_since_approval` | Badge (blue) | 20 ngày |

---

## 🧪 Testing Checklist

### **1. Database Migration**
- [ ] Run `node run-autosync-migration-029.js`
- [ ] Verify function returns `user_email` and `user_full_name`
- [ ] Test query: `SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 5`

### **2. Frontend - Initial Load**
- [ ] Navigate to `/admin/system-reconciliation`
- [ ] Click tab **Auto-Sync**
- [ ] Verify month filter dropdown appears
- [ ] Verify summary shows: "X đơn hàng | Y₫"
- [ ] Verify data table displays (not summary cards)

### **3. Month Filter**
- [ ] Select "Tất cả" → Shows all orders
- [ ] Select specific month → Shows only that month's orders
- [ ] Verify summary updates correctly
- [ ] Verify table re-renders

### **4. Refresh Button**
- [ ] Click **Làm mới**
- [ ] Verify data reloads
- [ ] Verify month filter persists

### **5. Table Display**
- [ ] Verify 9 columns appear
- [ ] Verify dates format DD/MM/YYYY
- [ ] Verify user email/name displays
- [ ] Verify cashback is green and bold
- [ ] Verify "Số ngày" has blue badge

### **6. Empty State**
- [ ] Filter by month with 0 orders
- [ ] Verify shows: "Không có đơn hàng mới đủ điều kiện"

### **7. Responsive**
- [ ] Desktop: Table fits width
- [ ] Mobile: Horizontal scroll appears
- [ ] All columns readable

### **8. Error Handling**
- [ ] API returns error → Shows error message
- [ ] Database function missing → Shows migration hint
- [ ] Network error → Shows retry button

---

## 📝 API Response Structure

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_count": 281,
      "total_cashback": 3190249,
      "month_count": 1
    },
    "byMonth": [
      {
        "approval_month": "2025-11-01",
        "period_label": "Tháng 11/2025",
        "order_count": 281,
        "total_cashback": 3190249
      }
    ],
    "orders": [
      {
        "conversion_id": "uuid",
        "user_id": "uuid",
        "user_email": "user@example.com",
        "user_full_name": "Nguyễn Văn A",
        "merchant_id": "shopee",
        "merchant_name": "Shopee",
        "order_code": "SP123456",
        "order_amount": "1234567.00",
        "commission": "123456.00",
        "cashback_amount": "12345.00",
        "order_time": "2025-11-01T10:00:00Z",
        "approval_time": "2025-11-05T10:00:00Z",
        "eligible_date": "2025-11-20",
        "approval_month": "2025-11-01",
        "days_since_approval": 20
      }
    ]
  }
}
```

---

## 🚀 Deployment Steps

### **1. Run Migration**
```bash
node run-autosync-migration-029.js
```

### **2. Verify Migration**
```sql
SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 5;
-- Should return user_email and user_full_name columns
```

### **3. Deploy Frontend**
```bash
# No build needed, just refresh browser
# Hard refresh: Ctrl + Shift + R
```

### **4. Test**
- Navigate to Auto-Sync tab
- Verify table displays
- Test month filter
- Test refresh button

---

## 📚 Files Changed

| File | Type | Description |
|------|------|-------------|
| `backend/migrations/029_update_autosync_add_user_info.sql` | Database | Add user info to function |
| `run-autosync-migration-029.js` | Script | Migration runner |
| `frontend/admin/system-reconciliation.html` | Frontend | HTML + JS updates |
| `AUTO_SYNC_TABLE_VIEW_UPDATE.md` | Docs | This file |

---

## 🔍 Debug Tips

### **If table doesn't show:**
1. Check console: `[Auto-Sync] API Response`
2. Verify `orders` array exists
3. Check `renderOrdersTable()` is called

### **If user info is NULL:**
1. Check migration ran successfully
2. Verify conversions have valid `user_id`
3. Check users exist in `users` table

### **If filter doesn't work:**
1. Check event listener attached
2. Console log `monthFilter` value
3. Verify `approval_month` format matches

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Completed
