# Hướng Dẫn Test Chức Năng Đối Soát

## Tổng quan
Chức năng đối soát cho phép admin tạo các kỳ đối soát cashback định kỳ (theo tháng) để thanh toán cho users.

## Điều kiện để đơn hàng được đối soát

Một đơn hàng sẽ được tính vào kỳ đối soát khi:
1. ✅ **is_confirmed = 1** - Đã được AccessTrade xác nhận thanh toán
2. ✅ **status = 'approved'** - Đã được admin duyệt
3. ✅ **confirmed_time** - Nằm trong khoảng thời gian đối soát
4. ✅ **utm_source** - Khớp với filter (mặc định "chatchiu")
5. ✅ **Chưa nằm trong kỳ đối soát nào** - Tránh trùng lặp

## Workflow Test

### Bước 1: Import dữ liệu các tháng trước
Vì dữ liệu mới chưa có `is_confirmed = 1`, bạn cần import dữ liệu các tháng trước:

1. Vào **Admin > Tools**
2. Chọn khoảng thời gian các tháng trước (VD: 01/09/2024 → 30/09/2024)
3. Click **"📥 Import Conversions from AccessTrade"**
4. Đợi import hoàn tất

**Lý do**: Các đơn hàng cũ thường đã có `is_confirmed = 1` vì AT đã xác nhận thanh toán.

### Bước 2: Kiểm tra dữ liệu đã import
1. Vào **Admin > Dữ liệu đơn AT**
2. Xem các đơn hàng vừa import
3. Chú ý cột **"TT Đối soát"**:
   - ✅ **Đã đối soát** (is_confirmed = 1) - Có thể dùng để đối soát
   - ⏳ **Chưa đối soát** (is_confirmed = 0) - Chưa thể dùng

### Bước 3: Test Preview Đối Soát

1. Vào **Admin > Đối soát**
2. Chọn khoảng thời gian (VD: 01/09/2024 → 30/09/2024)
3. Chọn **UTM Source**:
   - **chatchiu** - Chỉ lọc đơn từ chatchiu
   - **Tất cả** - Lọc tất cả UTM sources
4. Click **"🔍 Preview"**

**Kết quả preview sẽ hiển thị**:
- Số đơn hàng eligible (đủ điều kiện)
- Tổng cashback phải trả
- Tổng giá trị đơn hàng
- Số đơn đã đối soát trước đó (nếu có)
- **Bảng chi tiết các đơn hàng** (mới thêm):
  - User info
  - Merchant
  - Order code
  - Cashback amount
  - UTM Source
  - Confirmed time

### Bước 4: Tạo Kỳ Đối Soát

1. Sau khi preview, nhập **Nhãn kỳ đối soát** (VD: "Tháng 9/2024")
2. Nhập **Ghi chú** (tùy chọn)
3. Click **"✅ Tạo Kỳ Đối Soát"**

**Kết quả**:
- Tạo 1 record trong bảng `reconciliations`
- Tạo N records trong bảng `reconciliation_items` (N = số đơn eligible)
- Trạng thái mặc định: **Nháp**

### Bước 5: Quản lý Kỳ Đối Soát

Workflow trạng thái:
1. **Nháp** → Có thể xem, sửa, xóa
2. **Đã xác nhận** → Chốt số liệu, không sửa được
3. **Đã thanh toán** → Hoàn thành
4. **Đã hủy** → Hủy kỳ này

Thao tác:
- **Xem chi tiết** - View tất cả đơn hàng trong kỳ
- **Export CSV** - Tải danh sách đơn hàng
- **Xác nhận** - Chuyển từ Nháp → Đã xác nhận
- **Đánh dấu đã thanh toán** - Chuyển từ Đã xác nhận → Đã thanh toán
- **Hủy** - Hủy kỳ đối soát

## Các Cải Tiến Mới

### 1. Filter UTM Source
- **chatchiu** - Lọc chỉ đơn từ chatchiu (mặc định)
- **Tất cả** - Lọc tất cả UTM sources để test

### 2. Bảng Chi Tiết Preview
- Hiển thị **tất cả đơn hàng eligible** trong preview
- Có thể **thu gọn/mở rộng** để xem chi tiết
- Hiển thị UTM Source của từng đơn
- Hiển thị thời gian confirmed

### 3. UI Cải Tiến
- Layout single-row cho form
- Gradient design hiện đại
- Empty state chuyên nghiệp
- Responsive trên mobile

## Troubleshooting

### Không có đơn hàng eligible?
**Nguyên nhân**:
- Chưa có đơn nào với `is_confirmed = 1` trong khoảng thời gian
- Các đơn đã nằm trong kỳ đối soát trước đó
- UTM Source không khớp

**Giải pháp**:
1. Import dữ liệu các tháng trước (tháng 9, 10)
2. Kiểm tra cột "TT Đối soát" trong module AT Orders
3. Thử filter với "Tất cả" UTM sources

### Lỗi "No eligible conversions found"?
- Không có đơn nào đủ điều kiện trong khoảng thời gian
- Thử chọn khoảng thời gian khác
- Import thêm dữ liệu cũ

## Backend Endpoints

### Preview Reconciliation
```
POST /api/reconciliation/preview
Body: {
  "userId": null,           // null = all users
  "periodStart": "2024-09-01",
  "periodEnd": "2024-09-30",
  "utmSource": "chatchiu"   // null = all sources
}
```

### Create Reconciliation
```
POST /api/reconciliation/create
Body: {
  "userId": null,
  "periodStart": "2024-09-01",
  "periodEnd": "2024-09-30",
  "periodLabel": "Tháng 9/2024",
  "notes": "Optional notes",
  "utmSource": "chatchiu"
}
```

### Get Reconciliations List
```
GET /api/reconciliation/list?limit=50&offset=0&latestOnly=true
```

### Update Status
```
PATCH /api/reconciliation/:id/status
Body: {
  "status": "confirmed" | "paid" | "cancelled"
}
```

## Database Schema

### reconciliations
```sql
- id (UUID, PK)
- user_id (UUID, nullable) - null = all users
- period_start (DATE)
- period_end (DATE)
- period_label (VARCHAR)
- status (ENUM: draft, confirmed, paid, cancelled)
- total_orders (INT)
- total_order_amount (DECIMAL)
- total_cashback (DECIMAL)
- version (INT)
- is_latest (BOOLEAN)
- parent_reconciliation_id (UUID, nullable)
- created_by (UUID) - Admin user
- notes (TEXT)
- created_at, updated_at
```

### reconciliation_items
```sql
- id (UUID, PK)
- reconciliation_id (UUID, FK)
- conversion_id (UUID, FK) - Link to conversions table
- user_id (UUID)
- click_id (UUID)
- order_code (VARCHAR)
- merchant_name (VARCHAR)
- order_amount (DECIMAL)
- commission (DECIMAL)
- cashback_amount (DECIMAL)
- order_time (TIMESTAMP)
- confirmed_time (TIMESTAMP)
- created_at
```

## Tips

1. **Test với dữ liệu cũ**: Import các tháng 9, 10, 11 năm 2024 để có đủ dữ liệu test
2. **Kiểm tra is_confirmed**: Luôn check cột "TT Đối soát" trước khi tạo kỳ
3. **Tránh trùng lặp**: Mỗi đơn chỉ được đối soát 1 lần
4. **Export để kiểm tra**: Sau khi tạo, export CSV để review offline
5. **Workflow tuần tự**: Draft → Confirmed → Paid (không được skip)
