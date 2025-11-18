# Module Thống Kê Cashback của User - Admin

## 📊 Phân tích Database

### **Bảng liên quan:**

#### 1. **users** - Thông tin user
```sql
- id UUID (PRIMARY KEY)
- email VARCHAR(255)
- username VARCHAR(100)
- full_name VARCHAR(255)
- available_balance DECIMAL(15, 2)
- pending_balance DECIMAL(15, 2)
- total_cashback DECIMAL(15, 2)
- created_at TIMESTAMP
```

#### 2. **system_conversions** - Đơn hàng đã match
```sql
- id UUID (PRIMARY KEY)
- user_id UUID (FOREIGN KEY -> users.id)
- merchant_id VARCHAR(50)
- merchant_name VARCHAR(255)
- order_code VARCHAR(100)
- order_amount DECIMAL(15, 2)      -- Tổng tiền đơn hàng
- commission DECIMAL(15, 2)         -- Hoa hồng từ merchant
- cashback_amount DECIMAL(15, 2)   -- Tiền cashback cho user
- status ENUM('pending', 'approved', 'rejected')
- order_time TIMESTAMP              -- Thời gian đặt hàng
- approval_time TIMESTAMP
- matched_at TIMESTAMP
- created_at TIMESTAMP
```

#### 3. **clicks** - Lượt click tạo link
```sql
- id UUID
- user_id UUID
- merchant_id VARCHAR(50)
- clicked_at TIMESTAMP
- affiliate_url TEXT
```

---

## 🎯 Yêu cầu Module

### **Tính năng chính:**
1. **Thống kê cashback theo user** trong khoảng thời gian
2. **Bộ lọc**: From Date, To Date (mặc định: 30 ngày gần nhất)
3. **Phân trang**: 10, 20, 50, 100 items/page
4. **Hiển thị**:
   - Username / Email
   - Tổng tiền đơn hàng (order_amount)
   - Tổng tiền cashback (cashback_amount)
   - Tổng số đơn hàng
   - Action: Xem chi tiết

---

## 📝 Thiết kế SQL Query

### **Query chính (với date range filter):**

```sql
SELECT
  u.id AS user_id,
  u.username,
  u.email,
  u.full_name,
  u.available_balance,
  u.pending_balance,
  u.total_cashback,

  -- Stats trong khoảng thời gian
  COUNT(DISTINCT sc.id) AS total_orders,
  COALESCE(SUM(sc.order_amount), 0) AS total_order_value,
  COALESCE(SUM(sc.cashback_amount), 0) AS total_cashback_earned,

  -- Breakdown by status
  COUNT(DISTINCT CASE WHEN sc.status = 'approved' THEN sc.id END) AS approved_orders,
  COUNT(DISTINCT CASE WHEN sc.status = 'pending' THEN sc.id END) AS pending_orders,
  COUNT(DISTINCT CASE WHEN sc.status = 'rejected' THEN sc.id END) AS rejected_orders,

  COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.cashback_amount ELSE 0 END), 0) AS approved_cashback,
  COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.cashback_amount ELSE 0 END), 0) AS pending_cashback

FROM users u
LEFT JOIN system_conversions sc
  ON sc.user_id = u.id
  AND sc.order_time >= $1  -- from_date
  AND sc.order_time <= $2  -- to_date

WHERE u.is_admin = false

GROUP BY
  u.id, u.username, u.email, u.full_name,
  u.available_balance, u.pending_balance, u.total_cashback

ORDER BY total_cashback_earned DESC

LIMIT $3 OFFSET $4;
```

### **Query đếm tổng số users (cho pagination):**

```sql
SELECT COUNT(DISTINCT u.id) as total_users
FROM users u
LEFT JOIN system_conversions sc
  ON sc.user_id = u.id
  AND sc.order_time >= $1
  AND sc.order_time <= $2
WHERE u.is_admin = false;
```

---

## 🏗️ Kiến trúc Implementation

### **1. Backend API Endpoint**

**File**: `backend/routes/admin.js`

**Endpoint**: `GET /api/admin/users/cashback-stats`

**Query Parameters:**
```javascript
{
  from_date: "2024-01-01",      // Default: 30 ngày trước
  to_date: "2024-01-31",        // Default: hôm nay
  page: 0,                      // Default: 0
  limit: 20,                    // Default: 20
  sort_by: "cashback_desc"      // Optional: cashback_desc, orders_desc, username_asc
}
```

**Response:**
```json
{
  "success": true,
  "stats": [
    {
      "userId": "uuid",
      "username": "user123",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "availableBalance": 500000,
      "pendingBalance": 200000,
      "totalCashbackAllTime": 1500000,

      "periodStats": {
        "totalOrders": 25,
        "totalOrderValue": 50000000,
        "totalCashbackEarned": 800000,

        "approvedOrders": 20,
        "approvedCashback": 600000,

        "pendingOrders": 3,
        "pendingCashback": 150000,

        "rejectedOrders": 2
      }
    }
  ],
  "pagination": {
    "currentPage": 0,
    "limit": 20,
    "totalUsers": 150,
    "totalPages": 8
  },
  "dateRange": {
    "fromDate": "2024-01-01",
    "toDate": "2024-01-31"
  }
}
```

---

### **2. Frontend Admin Page**

**File structure:**
```
frontend/admin/
  ├── user-cashback-stats.html
  ├── js/
  │   └── user-cashback-stats.js
  └── css/
      └── (reuse existing admin styles)
```

**Layout wireframe:**

```
┌────────────────────────────────────────────────────────┐
│  Admin > Thống Kê Cashback Của User                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  📅 Từ ngày: [2024-01-01]  Đến ngày: [2024-01-31]    │
│      [Áp dụng]  [30 ngày gần nhất]  [Tháng này]      │
│                                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Hiển thị: [20 ▼]                    🔍 Tìm: [____]  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Username │ Email │ Tổng đơn │ Tổng $ │ Cashback │ │
│  ├──────────────────────────────────────────────────┤ │
│  │ user123  │ u@... │ 25 đơn   │ 50tr  │ 800k  [>]│ │
│  │ user456  │ v@... │ 18 đơn   │ 35tr  │ 650k  [>]│ │
│  │ ...                                              │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  « Trước    Trang 1 / 8    Sau »                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Bảng columns:**
1. **Username** - Click để xem chi tiết user
2. **Email**
3. **Tổng đơn hàng** - Số lượng + tooltip breakdown (approved/pending/rejected)
4. **Tổng giá trị đơn** - Format currency
5. **Tổng Cashback** - Format currency + tooltip breakdown
6. **Action** - Button "Xem chi tiết" → Modal hoặc navigate

---

### **3. Modal Chi Tiết User**

**Khi click "Xem chi tiết" hoặc username:**

```
┌──────────────────────────────────────────────┐
│  Chi Tiết Cashback - user123                │
│                                              │
│  Email: user@example.com                    │
│  Họ tên: Nguyễn Văn A                       │
│  Số dư khả dụng: 500,000đ                   │
│  Số dư chờ duyệt: 200,000đ                  │
│                                              │
│  ──────────────────────────────────────────  │
│                                              │
│  📊 Thống kê trong khoảng: 01/01 - 31/01   │
│                                              │
│  ✅ Đã duyệt:    20 đơn - 600,000đ         │
│  ⏳ Chờ duyệt:   3 đơn  - 150,000đ         │
│  ❌ Đã hủy:      2 đơn  - 0đ               │
│                                              │
│  💰 Tổng cashback: 800,000đ                │
│  🛒 Tổng giá trị: 50,000,000đ              │
│                                              │
│  [Xem danh sách đơn hàng]                  │
│                                [Đóng]       │
└──────────────────────────────────────────────┘
```

---

## 🚀 Plan Triển Khai (Step by Step)

### **Phase 1: Backend API** ✅

1. ✅ Phân tích database schema
2. ⏳ Tạo SQL query với date range filter
3. ⏳ Implement endpoint `/api/admin/users/cashback-stats`
4. ⏳ Test với Postman/curl
5. ⏳ Optimize query performance (indexes)

### **Phase 2: Frontend Page** 📱

1. ⏳ Tạo `user-cashback-stats.html` (copy từ template admin)
2. ⏳ Implement date range picker
3. ⏳ Render table với data từ API
4. ⏳ Implement pagination (reuse component)
5. ⏳ Add sort functionality
6. ⏳ Add search/filter by username/email

### **Phase 3: Chi Tiết & Polish** ✨

1. ⏳ Modal chi tiết user
2. ⏳ Export to CSV/Excel (optional)
3. ⏳ Chart visualization (optional)
4. ⏳ Real-time stats (optional)

### **Phase 4: Testing** 🧪

1. ⏳ Test với data thật
2. ⏳ Test pagination
3. ⏳ Test date range filters
4. ⏳ Performance testing với large dataset

---

## 📦 Files sẽ tạo/sửa

### **Backend:**
- `backend/routes/admin.js` - Thêm endpoint mới

### **Frontend:**
- `frontend/admin/user-cashback-stats.html` - Page mới
- `frontend/admin/js/user-cashback-stats.js` - Logic mới
- `frontend/admin/index.html` - Thêm menu link

### **Optional:**
- `backend/utils/export-csv.js` - Export functionality
- `frontend/admin/css/stats.css` - Custom styles nếu cần

---

## 🎨 UI Components Reuse

Sử dụng lại components đã có:
- ✅ Pagination component (10, 20, 50, 100)
- ✅ Table styles từ merchants/conversions
- ✅ Modal component
- ✅ Date picker (có thể dùng HTML5 `<input type="date">`)
- ✅ Toast notifications

---

## 🔒 Security & Performance

### **Security:**
- ✅ Require `authenticateAdmin` middleware
- ✅ Validate date range (không quá 1 năm)
- ✅ Sanitize inputs
- ✅ Rate limiting

### **Performance:**
- ✅ Index trên `system_conversions(user_id, order_time, status)` - ĐÃ CÓ
- ✅ Limit max results per page: 100
- ✅ Cache results (optional, Redis)
- ✅ Aggregate query optimization

---

## 📈 Future Enhancements

1. **Charts & Visualization:**
   - Line chart: Cashback theo thời gian
   - Pie chart: Breakdown by merchant
   - Bar chart: Top users

2. **Export:**
   - CSV export
   - Excel export with formatting
   - PDF report

3. **Advanced Filters:**
   - Filter by merchant
   - Filter by status
   - Min/max cashback amount

4. **Real-time:**
   - WebSocket updates
   - Auto-refresh stats

---

## ✅ Checklist Trước Khi Deploy

- [ ] SQL query tested với sample data
- [ ] API endpoint returns correct data structure
- [ ] Pagination works correctly
- [ ] Date range filter validates inputs
- [ ] Frontend table renders data correctly
- [ ] Sort functionality works
- [ ] Mobile responsive
- [ ] Error handling for edge cases
- [ ] Loading states implemented
- [ ] Performance acceptable (<500ms for 1000 users)

---

## 🤝 Bạn muốn tôi bắt đầu implement từ đâu?

1. **Backend API first** - Tạo endpoint và test
2. **Frontend first** - Tạo UI với mock data
3. **End-to-end** - Làm từng feature hoàn chỉnh

Hãy cho tôi biết bạn muốn bắt đầu từ đâu! 🚀
