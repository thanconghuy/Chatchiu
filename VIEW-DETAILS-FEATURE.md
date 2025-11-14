# View Conversion Details Feature

## 📝 Tổng quan

Feature "Xem chi tiết" đơn hàng đã được thêm vào **Conversions Management** module.

---

## ✅ Đã implement

### **1. Backend API** ✨

**File:** `backend/routes/admin.js` (Lines 203-244)

**Endpoint:** `GET /api/admin/conversion/:id`

**Authentication:** Requires admin token

**Query:**
```sql
SELECT
  sc.*,
  u.username,
  u.email,
  u.full_name,
  m.logo_url as merchant_logo
FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN merchants m ON sc.merchant_id = m.id
WHERE sc.id = $1
```

**Response:**
```json
{
  "success": true,
  "conversion": {
    "id": 123,
    "user_id": 45,
    "username": "user123",
    "email": "user@example.com",
    "full_name": "Nguyen Van A",
    "merchant_name": "Shopee",
    "merchant_logo": "https://...",
    "order_code": "SP123456",
    "click_id": "abc123",
    "order_amount": 100000,
    "commission": 5000,
    "cashback_amount": 2500,
    "status": "pending",
    "is_confirmed": 0,
    "order_time": "2025-11-13T10:00:00Z",
    "confirmed_time": null,
    "created_at": "2025-11-13T10:00:00Z",
    "utm_source": "facebook",
    "utm_campaign": "sale_2025"
  }
}
```

### **2. Frontend - Dropdown Menu Update** 🎯

**File:** `frontend/admin/conversions.js` (Lines 203-226)

**Changes:**
```javascript
// Before: Dropdown chỉ hiện cho pending orders
if (conv.status === 'pending') {
    actions = `...dropdown...`;
}

// After: Dropdown luôn hiện cho TẤT CẢ orders
actions = `
    <div class="action-dropdown">
        <button class="action-dropdown-btn" onclick="toggleActionMenu(event)">⋮</button>
        <div class="action-dropdown-menu">
            <!-- ALWAYS SHOW -->
            <button class="action-item action-view" onclick="viewConversionDetails('${conv.id}')">
                <span class="action-icon">👁</span>
                <span>Xem chi tiết</span>
            </button>

            <!-- CONDITIONAL: Only for pending -->
            ${conv.status === 'pending' ? `
                <button class="action-item action-approve">...</button>
                <button class="action-item action-reject">...</button>
            ` : ''}
        </div>
    </div>
`;
```

**Kết quả:**
- ✅ "Xem chi tiết" hiển thị cho TẤT CẢ orders
- ✅ "Duyệt đơn" / "Từ chối" chỉ hiện khi status = pending

### **3. Detail Modal UI** 🎨

**File:** `frontend/admin/conversions.js` (Lines 340-479)

**Function:** `viewConversionDetails(conversionId)`

**Modal Structure:**
```
┌────────────────────────────────────────────┐
│ 📋 Chi tiết đơn hàng              [✕]      │
├────────────────────────────────────────────┤
│                                            │
│ 👤 Thông tin người dùng                    │
│ ┌─────────────┬──────────────────────┐    │
│ │ Username    │ user123              │    │
│ │ Email       │ user@example.com     │    │
│ │ Full Name   │ Nguyen Van A         │    │
│ └─────────────┴──────────────────────┘    │
│                                            │
│ 🏪 Thông tin đơn hàng                      │
│ ┌─────────────┬──────────────────────┐    │
│ │ Merchant    │ Shopee               │    │
│ │ Order Code  │ SP123456             │    │
│ │ Click ID    │ abc123               │    │
│ └─────────────┴──────────────────────┘    │
│                                            │
│ 💰 Thông tin tài chính                     │
│ ┌─────────────┬──────────────────────┐    │
│ │ Order Amt   │ 100.000₫             │    │
│ │ Commission  │ 5.000₫               │    │
│ │ Cashback    │ 2.500₫               │    │
│ └─────────────┴──────────────────────┘    │
│                                            │
│ 📅 Thời gian                               │
│ 📊 Trạng thái & UTM                        │
│                                            │
├────────────────────────────────────────────┤
│                              [Đóng]        │
└────────────────────────────────────────────┘
```

**5 Sections:**
1. 👤 **Thông tin người dùng**: username, email, full_name
2. 🏪 **Thông tin đơn hàng**: merchant, order code, click ID
3. 💰 **Thông tin tài chính**: order amount, commission, cashback (highlighted)
4. 📅 **Thời gian**: order time, confirmed time, created at
5. ℹ️ **Trạng thái & UTM**: status badge, is_confirmed, utm_source, utm_campaign

### **4. Modal Styling** 💅

**File:** `frontend/admin/conversions.html` (Lines 200-321)

**Key Features:**
- ✅ **Fullscreen overlay** with dark backdrop (z-index: 10000)
- ✅ **Centered modal** (max-width: 800px, max-height: 90vh)
- ✅ **Sticky header & footer** - always visible when scrolling
- ✅ **Responsive grid** - auto-fit minmax(250px, 1fr)
- ✅ **Smooth animations** - fade in/out
- ✅ **Mobile friendly** - scrollable content

**CSS Highlights:**
```css
.detail-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.detail-modal {
    background: white;
    border-radius: 16px;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.detail-modal-header {
    position: sticky;
    top: 0;
    background: white;
    z-index: 1;
}

.detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
}

.detail-value.highlight {
    color: var(--primary);
    font-weight: 700;
    font-size: 1.1rem;
}
```

### **5. Close Modal Function** 🚪

**File:** `frontend/admin/conversions.js` (Lines 471-479)

```javascript
function closeDetailModal() {
    const modal = document.querySelector('.detail-modal-overlay');
    if (modal) {
        modal.remove();
    }
}
```

**3 Ways to Close:**
1. Click button "Đóng" in footer
2. Click ✕ button in header
3. Click outside modal (on overlay)

---

## 🎯 User Experience Flow

```
1. User clicks (⋮) in Actions column
   ↓
2. Dropdown menu appears
   ↓
3. User clicks "👁 Xem chi tiết"
   ↓
4. API call: GET /api/admin/conversion/:id
   ↓
5. Modal appears with full details
   ↓
6. User reviews information
   ↓
7. User closes modal (3 ways)
   ↓
8. Back to table view
```

---

## 🔧 Technical Implementation

### **API Call:**
```javascript
const response = await apiRequest(`/admin/conversion/${conversionId}`);
```

**Note:** `apiRequest()` từ `auth.js` tự động thêm:
- JWT token in Authorization header
- `/api` prefix
- Error handling

### **Dynamic HTML Injection:**
```javascript
const modalContent = `<div class="detail-modal-overlay">...</div>`;
document.body.insertAdjacentHTML('beforeend', modalContent);
```

### **Data Formatting:**
```javascript
formatDate(conv.order_time, true)      // 13/11/2025 14:30
formatCurrency(conv.order_amount)      // 100.000₫
getStatusBadge(conv.status)            // <span class="status-badge ...">
```

---

## ✅ Testing Checklist

- [x] Backend API endpoint works
- [x] Auth middleware requires admin token
- [x] Query returns all necessary fields
- [x] Frontend calls correct endpoint
- [x] Modal displays all sections correctly
- [x] Data formatting works (date, currency)
- [x] Status badge renders correctly
- [x] Modal is scrollable with long content
- [x] Sticky header/footer work
- [x] Close button (✕) works
- [x] Close on overlay click works
- [x] "Đóng" button works
- [x] No console errors
- [x] Mobile responsive layout

---

## 📊 Data Fields Displayed

### **User Info (3 fields):**
- `username`
- `email`
- `full_name`

### **Order Info (3 fields):**
- `merchant_name`
- `order_code`
- `click_id`

### **Financial Info (3 fields):**
- `order_amount` (highlighted)
- `commission`
- `cashback_amount` (highlighted)

### **Time Info (3 fields):**
- `order_time` (with time)
- `confirmed_time` (with time, nullable)
- `created_at` (with time)

### **Status & UTM (4 fields):**
- `status` (badge)
- `is_confirmed` (✅/❌)
- `utm_source`
- `utm_campaign`

**Total: 16 fields displayed**

---

## 🚀 Future Enhancements

### **Possible additions to modal:**

1. **Action buttons in modal:**
```javascript
<div class="detail-modal-footer">
    ${conv.status === 'pending' ? `
        <button class="btn btn-success" onclick="approveConversion('${conv.id}')">
            ✓ Duyệt ngay
        </button>
        <button class="btn btn-danger" onclick="rejectConversion('${conv.id}')">
            ✗ Từ chối
        </button>
    ` : ''}
    <button class="btn btn-secondary" onclick="closeDetailModal()">
        Đóng
    </button>
</div>
```

2. **Transaction history:**
```javascript
<div class="detail-section">
    <h3>📜 Lịch sử thay đổi</h3>
    <div class="timeline">
        <div class="timeline-item">
            <span>13/11/2025 10:00</span>
            <span>Đơn hàng được tạo</span>
        </div>
        <div class="timeline-item">
            <span>14/11/2025 15:30</span>
            <span>Admin duyệt đơn</span>
        </div>
    </div>
</div>
```

3. **Copy to clipboard:**
```javascript
<button onclick="copyToClipboard('${conv.order_code}')">
    📋 Copy Order Code
</button>
```

---

## 📝 Files Changed

1. **[backend/routes/admin.js](file:///f:/VSCODE/Chatchiu/backend/routes/admin.js#L203-L244)** - New API endpoint
2. **[frontend/admin/conversions.js](file:///f:/VSCODE/Chatchiu/frontend/admin/conversions.js#L203-L226)** - Dropdown update
3. **[frontend/admin/conversions.js](file:///f:/VSCODE/Chatchiu/frontend/admin/conversions.js#L340-L479)** - View details function
4. **[frontend/admin/conversions.html](file:///f:/VSCODE/Chatchiu/frontend/admin/conversions.html#L191-L321)** - Modal CSS

---

**Last Updated:** 2025-11-13
**Status:** ✅ Fully Implemented
**Version:** 1.0.0
