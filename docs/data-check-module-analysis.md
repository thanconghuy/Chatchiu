# Phân Tích Module Kiểm Tra Dữ Liệu (Data Check)

## Tóm Tắt Module Hiện Tại

Module "Kiểm Tra Dữ Liệu" được thiết kế để phát hiện các vấn đề về tính toàn vẹn dữ liệu trong hệ thống đối soát.

### Cấu Trúc Hiện Tại

```
┌─────────────────────────────────────────────────────┐
│ 1. Health Status Card                               │
│    - Hiển thị: ✅ Dữ Liệu Toàn Vẹn / ⚠️ Có X Vấn Đề │
│    - Thời gian kiểm tra                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 2. Issues Summary (3 thẻ tóm tắt)                   │
│    ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│    │ ✨ Đủ Điều   │ │ ⏰ Pending   │ │ ⚠️ Status  │ │
│    │ Kiện Chưa    │ │ Quá Lâu      │ │ Không Khớp │ │
│    │ Đối Soát     │ │              │ │            │ │
│    │ Count + ₫    │ │ Count + ₫    │ │ Count      │ │
│    └──────────────┘ └──────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 3. Actions - Sửa Lỗi Tự Động                        │
│    [Fix Trạng Thái] [Xóa Orphan] [...] [Sửa Tất Cả] │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 4. Kiểm Tra Từng Kỳ Đối Soát                        │
│    ┌─────────────────────────────────────────────┐  │
│    │ Kỳ | Status | Recorded | Actual | Match    │  │
│    ├─────────────────────────────────────────────┤  │
│    │ Tháng 1/2026 | finalized | 50 đơn | 50 | ✅│  │
│    │ Tháng 2/2026 | draft     | 30 đơn | 28 | ❌│  │
│    └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 5. Kiểm Tra Số Dư User                              │
│    [Email/User ID Input] [Kiểm Tra]                 │
│    → Hiển thị: Số dư khả dụng, đã rút, pending      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 6. [🔄 Kiểm Tra Lại]                                │
└─────────────────────────────────────────────────────┘
```

---

## Câu Hỏi 1: Tạo 2 Tab Mới để Hiển Thị Chi Tiết

### ❓ Vấn Đề Hiện Tại
- Chỉ hiển thị **CON SỐ** (31 vấn đề)
- Không có **DANH SÁCH CHI TIẾT** các đơn hàng có vấn đề
- Admin không thể xem và xử lý từng đơn hàng cụ thể

### ✅ Giải Pháp: Thêm 2 Tab Detail

```
[Tóm Tắt] [Đủ ĐK Chưa Đối Soát] [Pending Quá Lâu] [Status Không Khớp]
   (Tab 0)        (Tab 1)              (Tab 2)          (Tab 3)
```

#### **Tab 1: Đủ Điều Kiện Chưa Đối Soát**
- Hiển thị bảng với các cột:
  - Mã đơn hàng
  - User (email)
  - Merchant
  - Số tiền cashback
  - Ngày duyệt
  - Số ngày kể từ khi duyệt
  - Action: [Thêm vào đối soát]

#### **Tab 2: Pending Quá Lâu**
- Hiển thị bảng với các cột:
  - Mã đơn hàng
  - User (email)
  - Merchant
  - Số tiền cashback
  - Ngày đặt hàng
  - Số ngày chờ
  - Action: [Xem chi tiết] [Hủy đơn]

#### **Tab 3: Status Không Khớp** (Bonus)
- Hiển thị các đơn hàng có:
  - Đã có trong `system_reconciliation_items` nhưng status != 'reconciled'
  - Hoặc status conversion != 'approved'

---

## Câu Hỏi 2: Chức Năng "Kiểm Tra Từng Kỳ Đối Soát"

### 🎯 Mục Đích
Kiểm tra tính chính xác của **TỪNG KỲ ĐỐI SOÁT** đã tạo.

### 🔄 Cách Hoạt Động

```javascript
async function loadReconciliationsCheck() {
    // 1. Lấy danh sách TẤT CẢ kỳ đối soát (limit=100)
    const response = await fetch('/api/admin/system-reconciliation?limit=100');

    // 2. Với mỗi kỳ đối soát:
    reconciliations.forEach(r => {
        // So sánh:
        const recordedOrders = r.total_orders;     // Số lưu trong reconciliation
        const actualOrders = r.actual_items;       // Số thực tế trong items
        const match = recordedOrders === actualOrders;  // Có khớp?

        // Hiển thị:
        // ✅ nếu khớp
        // ❌ nếu không khớp (có vấn đề)
    });
}
```

### 📊 Ý Nghĩa Các Cột

| Cột | Ý Nghĩa | Ví Dụ |
|-----|---------|-------|
| **Kỳ Đối Soát** | Tên kỳ (tháng/năm) | "Tháng 1/2026" |
| **Status** | Trạng thái | draft / finalized / paid |
| **Recorded** | Số đơn GHI trong bảng `system_reconciliations` | 50 đơn / 1,000,000đ |
| **Actual** | Số đơn THỰC TẾ trong bảng `system_reconciliation_items` | 48 đơn |
| **Match** | Có khớp không? | ✅ (khớp) hoặc ❌ (sai lệch) |

### ⚠️ Vấn Đề Khi **Match = ❌**
- **Nguyên nhân:**
  - Admin đã xóa một số items sau khi tạo kỳ đối soát
  - Có bug trong code tạo reconciliation
  - Database bị inconsistent

- **Hậu quả:**
  - Số liệu báo cáo không chính xác
  - Số tiền thanh toán cho user sai
  - Số dư user không đúng

### 🔍 Button "Chi tiết"
- Khi click vào button "Chi tiết" của 1 kỳ đối soát:
  - Gọi API: `/api/admin/system-reconciliation/data-check/reconciliation/:id`
  - Hiển thị popup với thông tin chi tiết:
    - Recorded vs Actual (đơn hàng, số tiền)
    - Danh sách các issues cụ thể
    - Gợi ý cách fix

---

## Câu Hỏi 3: Button "Kiểm Tra Lại"

### 🎯 Mục Đích
Refresh toàn bộ dữ liệu trong tab "Kiểm Tra Dữ Liệu"

### 🔄 Cách Hoạt Động

```javascript
// HTML
<button onclick="loadDataCheck()">
    <i class="fas fa-refresh"></i> Kiểm Tra Lại
</button>

// JavaScript
async function loadDataCheck() {
    try {
        // 1. Hiển thị loading
        document.getElementById('dataCheckStatus').innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang kiểm tra...</p>
        `;

        // 2. Gọi API kiểm tra
        const response = await fetch('/api/admin/system-reconciliation/data-check');
        const result = await response.json();

        // 3. Hiển thị kết quả:
        const {summary, total_issues, is_healthy} = result.data;

        // 3a. Health status
        document.getElementById('dataCheckStatus').innerHTML = `
            ${is_healthy ? '✅ Dữ Liệu Toàn Vẹn' : '⚠️ Có ' + total_issues + ' Vấn Đề'}
        `;

        // 3b. 3 thẻ tóm tắt
        document.getElementById('dataCheckIssues').innerHTML = `
            [Đủ Điều Kiện: ${summary.eligible_orders.count}]
            [Pending Quá Lâu: ${summary.pending_too_long.count}]
            [Status Không Khớp: ${summary.status_mismatch.count}]
        `;

        // 3c. Load bảng kỳ đối soát
        await loadReconciliationsCheck();

    } catch (error) {
        console.error('Error:', error);
    }
}
```

### 📝 Khi Nào Dùng?
- **Sau khi sửa lỗi:** Admin vừa sửa một số vấn đề bằng tay → Click "Kiểm Tra Lại" để xem còn lỗi không
- **Nghi ngờ có lỗi mới:** Có thay đổi trong hệ thống → Click "Kiểm Tra Lại" để kiểm tra
- **Định kỳ:** Mỗi sáng admin vào hệ thống → Click "Kiểm Tra Lại" để xem có vấn đề gì không

---

## Câu Hỏi 4: Chức Năng "Kiểm Tra Số Dư User"

### 🎯 Mục Đích Chính
Khi user khiếu nại về số dư sai, admin có thể:
1. Nhập email hoặc user ID
2. Xem chi tiết số dư:
   - **Total Earned:** Tổng tiền đã kiếm được
   - **Total Withdrawn:** Tổng tiền đã rút
   - **Pending Reserved:** Tiền đang chờ xử lý
   - **Available Balance:** Số dư khả dụng (có thể rút)
3. So sánh với tính toán thủ công để phát hiện sai sót

### 🔄 Cách Hoạt Động

```javascript
async function checkUserBalance() {
    // 1. Lấy email/user ID từ input
    const emailOrId = document.getElementById('userCheckEmail').value;

    // 2. Gọi API kiểm tra
    const response = await fetch(
        `/api/admin/system-reconciliation/data-check/user-balance?query=${emailOrId}`
    );
    const result = await response.json();

    // 3. Hiển thị kết quả
    const user = result.data;
    document.getElementById('userCheckResult').innerHTML = `
        <h4>User: ${user.email}</h4>
        <p>Total Earned: ${formatCurrency(user.total_earned)}đ</p>
        <p>Total Withdrawn: ${formatCurrency(user.total_withdrawn)}đ</p>
        <p>Pending Reserved: ${formatCurrency(user.pending_reserved)}đ</p>
        <p>Available Balance: ${formatCurrency(user.available_balance)}đ</p>

        <!-- Công thức kiểm tra -->
        <p style="color: gray;">
            Available = Earned - Withdrawn - Reserved<br>
            ${user.available_balance} = ${user.total_earned} - ${user.total_withdrawn} - ${user.pending_reserved}
        </p>
    `;
}
```

### 🔍 Use Cases Thực Tế

#### **Case 1: User khiếu nại "Tôi đã rút 500k nhưng số dư vẫn hiển thị chưa trừ"**
```
Admin:
1. Nhập email user vào ô "Kiểm Tra Số Dư User"
2. Click "Kiểm Tra"
3. Xem kết quả:
   - Total Withdrawn: 500,000đ ✅ (Đã được ghi nhận)
   - Available Balance: 1,200,000đ
   - → Kiểm tra frontend có cập nhật đúng không

Kết luận: Bug ở frontend, cần clear cache
```

#### **Case 2: User khiếu nại "Đơn hàng đã duyệt 20 ngày nhưng vẫn chưa có tiền"**
```
Admin:
1. Nhập email user
2. Click "Kiểm Tra"
3. Xem kết quả:
   - Total Earned: 0đ ❌ (Chưa được cập nhật)

Nguyên nhân:
- Đơn hàng chưa được đối soát
- Hoặc đối soát nhưng chưa finalize

Giải pháp:
- Admin vào tab "Đủ Điều Kiện Chưa Đối Soát"
- Tìm đơn hàng của user
- Thêm vào kỳ đối soát → Finalize
```

#### **Case 3: Phát hiện số dư âm**
```
Admin: Kiểm tra random một số user
User A:
- Total Earned: 500,000đ
- Total Withdrawn: 600,000đ
- Available: -100,000đ ❌❌❌

Vấn đề: Hệ thống cho phép rút quá số dư!

Action:
- Lock tài khoản user
- Điều tra log rút tiền
- Fix bug trong payment request validation
```

---

## 💡 Đề Xuất: Thêm 2 Tab Chi Tiết

### API Endpoints Cần Tạo

#### **1. GET /api/admin/system-reconciliation/data-check/eligible-orders**
```javascript
// Trả về danh sách đơn hàng đủ điều kiện chưa đối soát
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_code": "2602062PA3R7SS",
        "user_email": "user@example.com",
        "merchant_name": "Shopee",
        "cashback_amount": 15000,
        "approval_time": "2026-01-15T10:30:00Z",
        "days_since_approval": 23
      },
      // ... more orders
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150
    }
  }
}
```

#### **2. GET /api/admin/system-reconciliation/data-check/pending-orders**
```javascript
// Trả về danh sách đơn hàng pending quá lâu
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_code": "260205VX369W41",
        "user_email": "user@example.com",
        "merchant_name": "Tiki",
        "cashback_amount": 25000,
        "order_time": "2025-12-10T08:00:00Z",
        "days_pending": 58
      },
      // ... more orders
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 80
    }
  }
}
```

### Frontend: Thêm Tab Navigation

```html
<!-- Tab Navigation -->
<div class="tab-navigation" style="margin-bottom: 20px;">
    <button class="tab-btn active" data-detail-tab="summary">
        📊 Tóm Tắt
    </button>
    <button class="tab-btn" data-detail-tab="eligible">
        ✨ Đủ ĐK Chưa Đối Soát (<span id="eligibleCount">0</span>)
    </button>
    <button class="tab-btn" data-detail-tab="pending">
        ⏰ Pending Quá Lâu (<span id="pendingCount">0</span>)
    </button>
    <button class="tab-btn" data-detail-tab="mismatch">
        ⚠️ Status Không Khớp (<span id="mismatchCount">0</span>)
    </button>
</div>

<!-- Tab Content: Summary (Hiện tại) -->
<div id="detailTab-summary" class="detail-tab-content">
    <!-- 3 thẻ tóm tắt hiện tại -->
</div>

<!-- Tab Content: Eligible Orders -->
<div id="detailTab-eligible" class="detail-tab-content" style="display: none;">
    <table class="table">
        <thead>
            <tr>
                <th>Mã Đơn</th>
                <th>User</th>
                <th>Merchant</th>
                <th>Cashback</th>
                <th>Ngày Duyệt</th>
                <th>Số Ngày</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody id="eligibleOrdersTable">
            <!-- Data will be loaded here -->
        </tbody>
    </table>
    <div id="eligiblePagination"></div>
</div>

<!-- Tab Content: Pending Orders -->
<div id="detailTab-pending" class="detail-tab-content" style="display: none;">
    <table class="table">
        <thead>
            <tr>
                <th>Mã Đơn</th>
                <th>User</th>
                <th>Merchant</th>
                <th>Cashback</th>
                <th>Ngày Đặt</th>
                <th>Số Ngày Chờ</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody id="pendingOrdersTable">
            <!-- Data will be loaded here -->
        </tbody>
    </table>
    <div id="pendingPagination"></div>
</div>
```

---

## 📌 Tổng Kết

### Module Data Check Hiện Tại:
1. ✅ **Health Status:** Hiển thị tổng số vấn đề
2. ✅ **3 Thẻ Tóm Tắt:** Con số tổng hợp
3. ✅ **Kiểm Tra Từng Kỳ Đối Soát:** Phát hiện sai lệch trong reconciliation
4. ✅ **Kiểm Tra Số Dư User:** Debug khi user khiếu nại
5. ✅ **Button Kiểm Tra Lại:** Refresh dữ liệu

### Cần Bổ Sung:
1. ❌ **Tab Chi Tiết Eligible Orders:** Xem danh sách đơn đủ điều kiện chưa đối soát
2. ❌ **Tab Chi Tiết Pending Orders:** Xem danh sách đơn pending quá lâu
3. ❌ **Tab Chi Tiết Status Mismatch:** Xem danh sách đơn status không khớp
4. ❌ **Action Buttons:** Thêm vào đối soát, hủy đơn, xem chi tiết

### Lợi Ích Khi Bổ Sung:
- Admin có thể **XEM CHI TIẾT** từng đơn hàng có vấn đề
- Admin có thể **XỬ LÝ** trực tiếp từ giao diện
- Không cần phải vào database để tìm đơn hàng
- Tăng hiệu suất làm việc
