# 📖 Hướng Dẫn Sử Dụng Chức Năng Auto-Sync

## 🎯 Mục Đích

Chức năng **Auto-Sync** giúp admin tự động quản lý các đơn hàng đã duyệt và đủ điều kiện để đối soát, giảm thiểu thao tác thủ công.

---

## 📍 Truy Cập

1. Đăng nhập vào **Admin Panel**
2. Vào menu **Đối Soát Hệ Thống**
3. Click tab **Auto-Sync**

URL: `https://chatchiu.online/admin/system-reconciliation` → Tab **Auto-Sync**

---

## 🔄 Quy Trình Hoạt Động

### 1️⃣ **Đơn Hàng Mới Đủ Điều Kiện**

**Điều kiện:**
- ✅ Đơn hàng có status = `approved`
- ✅ Đã có `approval_time`
- ✅ Đã qua **15 ngày** kể từ ngày duyệt (`approval_time + 15 days <= NOW()`)
- ✅ Chưa nằm trong danh sách chờ
- ✅ Chưa được đối soát hoặc thanh toán

**Hiển thị:**
```
┌─────────────────────────────────────┐
│  📦 Đơn Hàng Mới Đủ Điều Kiện      │
├─────────────────────────────────────┤
│  • Tổng đơn hàng: 45                │
│  • Tổng cashback: 1,234,567₫        │
│  • Số tháng: 3                      │
│                                     │
│  [➕ Thêm vào danh sách chờ]       │
└─────────────────────────────────────┘
```

**Nếu không có đơn hàng:**
```
┌─────────────────────────────────────┐
│           ✅                        │
│  Không có đơn hàng mới đủ điều kiện │
│                                     │
│  Các đơn hàng đã duyệt + 15 ngày    │
│  sẽ xuất hiện ở đây                 │
└─────────────────────────────────────┘
```

---

### 2️⃣ **Thêm Vào Danh Sách Chờ**

**Cách thực hiện:**
1. Click nút **"➕ Thêm vào danh sách chờ"**
2. Hệ thống tự động:
   - ✅ Lấy tất cả đơn hàng đủ điều kiện
   - ✅ Thêm vào bảng `reconciliation_waiting_list`
   - ✅ Nhóm theo tháng duyệt (`approval_month`)
3. Hiển thị thông báo: "Đã thêm X đơn hàng vào danh sách chờ"

---

### 3️⃣ **Danh Sách Chờ**

**Chức năng:**
- Xem các đơn hàng đang chờ đối soát
- Nhóm theo tháng duyệt
- Lọc theo tháng cụ thể

**Hiển thị:**
```
┌─────────────────────────────────────────────────┐
│  📋 Danh Sách Chờ                               │
│  ┌─────────────────────────────────────────┐   │
│  │ 🔍 Lọc theo tháng: [Tất cả ▼]          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  📅 Tháng 11/2024 (23 đơn) - 567,890₫          │
│  ┌─────────────────────────────────────────┐   │
│  │ [🗓️ Tạo kỳ đối soát]                   │   │
│  │ ─────────────────────────────────────── │   │
│  │ #   Merchant  Order Code   Cashback    │   │
│  │ 1   Shopee    SP123456     12,345₫     │   │
│  │ 2   Lazada    LZ789012     23,456₫  [❌]│   │
│  │ ...                                     │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Nếu danh sách trống:**
```
┌─────────────────────────────────────┐
│           📥                        │
│     Danh sách chờ trống             │
└─────────────────────────────────────┘
```

---

### 4️⃣ **Tạo Kỳ Đối Soát Từ Danh Sách Chờ**

**Cách thực hiện:**
1. Click nút **"🗓️ Tạo kỳ đối soát"** ở tháng muốn tạo
2. Xác nhận: "Tạo kỳ đối soát 'Tháng 11/2024'?"
3. Hệ thống tự động:
   - ✅ Tạo bản ghi trong `system_reconciliation`
   - ✅ Gán tất cả đơn hàng của tháng đó vào kỳ đối soát
   - ✅ Xóa các đơn hàng khỏi danh sách chờ
   - ✅ Cập nhật `system_reconciliation_id` trong bảng `conversions`

**Kết quả:**
- Kỳ đối soát mới xuất hiện ở tab **"Danh Sách Đối Soát"**
- Status ban đầu: `draft`

---

### 5️⃣ **Xóa Đơn Hàng Khỏi Danh Sách Chờ**

**Khi nào cần:**
- Đơn hàng không hợp lệ
- Cần loại bỏ trước khi tạo kỳ đối soát

**Cách thực hiện:**
1. Click icon **❌** bên cạnh đơn hàng
2. Xác nhận: "Xóa đơn hàng khỏi danh sách chờ?"
3. Đơn hàng sẽ biến mất khỏi danh sách chờ
4. Đơn hàng vẫn tồn tại trong bảng `conversions` (không bị xóa)

---

## 🚨 Xử Lý Lỗi

### ❌ **Lỗi: "Không thể tải dữ liệu"**

**Nguyên nhân:**
- API trả về `success: false`

**Hiển thị:**
```
⚠️ Không thể tải dữ liệu
Vui lòng thử lại sau
```

**Giải pháp:**
1. Kiểm tra console backend (`server-cashback.js`)
2. Kiểm tra kết nối database
3. Click **"Thử lại"**

---

### ❌ **Lỗi: "Lỗi cơ sở dữ liệu: Chưa chạy migration"**

**Nguyên nhân:**
- Database function `get_eligible_conversions_for_waiting_list()` không tồn tại
- Chưa chạy migration `028_create_reconciliation_waiting_list.sql`

**Hiển thị:**
```
❌ Lỗi khi tải dữ liệu
Lỗi cơ sở dữ liệu: Chưa chạy migration cho Auto-Sync

[🔄 Thử lại]
```

**Giải pháp:**
```bash
# Chạy migration
cd backend/migrations
psql -U your_user -d your_db -f 028_create_reconciliation_waiting_list.sql

# Hoặc sử dụng script
node apply-auto-sync-migration.js
```

---

### ❌ **Lỗi: "Lỗi server: Vui lòng kiểm tra console backend"**

**Nguyên nhân:**
- Lỗi 500 Internal Server Error
- Bug trong code backend

**Giải pháp:**
1. Kiểm tra console backend:
   ```bash
   npm run dev
   ```
2. Xem logs lỗi chi tiết
3. Fix bug theo error message

---

### ❌ **Lỗi: "Lỗi xác thực: Vui lòng đăng nhập lại"**

**Nguyên nhân:**
- Token hết hạn (HTTP 401)
- Không có quyền admin (HTTP 403)

**Giải pháp:**
1. Đăng xuất
2. Đăng nhập lại với tài khoản admin

---

## 📊 Thống Kê & Báo Cáo

### **Tổng Quan Theo Tháng**

```
┌──────────────────────────────────┐
│ 📅 Tháng 11/2024                 │
│ • 23 đơn hàng                    │
│ • 567,890₫ tổng cashback         │
│ [🗓️ Tạo kỳ đối soát]            │
└──────────────────────────────────┘
```

### **Trạng Thái Đơn Hàng**

| Trạng Thái | Mô Tả |
|-----------|-------|
| `waiting` | Đang chờ trong danh sách |
| `added_to_reconciliation` | Đã thêm vào kỳ đối soát |
| `removed` | Đã xóa khỏi danh sách chờ |

---

## 🔍 Kiểm Tra Database

### **Xem đơn hàng đủ điều kiện:**
```sql
SELECT * FROM get_eligible_conversions_for_waiting_list();
```

### **Xem danh sách chờ:**
```sql
SELECT * FROM reconciliation_waiting_list
WHERE status = 'waiting'
ORDER BY approval_month DESC;
```

### **Xem đơn hàng theo tháng:**
```sql
SELECT
  approval_month,
  COUNT(*) as count,
  SUM(cashback_amount) as total_cashback
FROM reconciliation_waiting_list
WHERE status = 'waiting'
GROUP BY approval_month
ORDER BY approval_month DESC;
```

---

## ✅ Checklist Sử Dụng

- [ ] Đã chạy migration `028_create_reconciliation_waiting_list.sql`
- [ ] Có đơn hàng `approved` đã qua 15 ngày
- [ ] Đăng nhập với tài khoản admin
- [ ] Vào tab Auto-Sync trong Đối Soát Hệ Thống
- [ ] Kiểm tra "Đơn Hàng Mới Đủ Điều Kiện"
- [ ] Thêm vào danh sách chờ
- [ ] Kiểm tra danh sách chờ
- [ ] Tạo kỳ đối soát theo tháng
- [ ] Kiểm tra kỳ đối soát đã tạo ở tab "Danh Sách Đối Soát"

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra console browser (F12)
2. Kiểm tra console backend
3. Xem file log `AUTO_SYNC_COMPLETE.md`
4. Liên hệ dev team

---

**Cập nhật lần cuối:** 2024-12-13
**Phiên bản:** 1.0
