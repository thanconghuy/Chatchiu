# 📊 QUY TRÌNH ĐỐI SOÁT HỆ THỐNG (SYSTEM RECONCILIATION)

## 🎯 Mục Đích
Đối soát nội bộ giúp **trả cashback nhanh hơn** cho user (Tháng + 15 ngày) thay vì chờ đối soát API chính thức từ AccessTrade (65-105 ngày).

## 📐 Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL                               │
│  1. Tạo Kỳ Đối Soát → 2. Hoàn Tất → 3. Đồng Bộ API         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE TABLES                             │
│  • system_reconciliations (kỳ đối soát)                     │
│  • system_reconciliation_items (đơn hàng trong kỳ)          │
│  • user_system_balance (số dư user)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    USER DASHBOARD                            │
│  → Xem lịch sử đối soát                                     │
│  → Xem số dư khả dụng                                       │
│  → Yêu cầu rút tiền                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 WORKFLOWS CHI TIẾT

### **BƯỚC 1: TẠO KỲ ĐỐI SOÁT**

#### 📍 Vị trí: Admin Panel → Đối soát hệ thống → "Tạo Kỳ Đối Soát Mới"

#### ⚙️ Chức năng:
1. **Chọn khoảng thời gian**: Từ ngày - Đến ngày
2. **Chọn nguồn đơn hàng**: Cashback System / All
3. **Đặt tên kỳ**: Ví dụ "Tháng 11/2025"
4. **Click "Lọc đơn hàng"**: Hệ thống sẽ tìm tất cả đơn hàng:
   - Đã được duyệt (`status = 'approved'`)
   - Trong khoảng thời gian đã chọn
   - Chưa được đối soát trước đó

#### 🎯 Kết quả:
- Hiển thị danh sách đơn hàng đủ điều kiện
- Admin **tick chọn** đơn hàng muốn đưa vào kỳ đối soát
- Click **"Tạo Kỳ Đối Soát"**

#### 💾 Dữ liệu lưu:
```sql
-- Tạo bản ghi trong system_reconciliations
INSERT INTO system_reconciliations (
  period_label,
  period_start,
  period_end,
  status,
  total_orders,
  total_cashback
) VALUES (
  'Tháng 11/2025',
  '2025-10-31',
  '2025-11-29',
  'draft',  -- Trạng thái: Nháp
  1,
  3921
);

-- Tạo các items
INSERT INTO system_reconciliation_items (
  system_reconciliation_id,
  conversion_id,
  user_id,
  cashback_amount,
  conversion_status  -- 'Đã duyệt'
) VALUES (...);
```

---

### **BƯỚC 2: HOÀN TẤT KỲ ĐỐI SOÁT**

#### 📍 Vị trí: Admin Panel → Chi tiết kỳ đối soát → Button "Hoàn Tất"

#### ⚠️ Lưu ý quan trọng:
- **KHÔNG THỂ HOÀN TÁC** sau khi hoàn tất
- Số dư user sẽ được cập nhật ngay lập tức

#### ⚙️ Chức năng:
Khi click "Hoàn Tất", hệ thống thực hiện:

1. **Tính toán Risk Score** cho từng đơn hàng:
   ```javascript
   // Đánh giá rủi ro dựa trên:
   - Thời gian tạo tài khoản user
   - Giá trị đơn hàng
   - Lịch sử giao dịch
   - Tỷ lệ approval rate lịch sử
   ```

2. **Phân chia số dư**:
   ```javascript
   Tổng Cashback = Số Dư Khả Dụng + Số Dư Dự Trữ

   // Công thức:
   rejectionRate = 1 - (approval_rate / 100)
   reserved = high_risk_cashback × rejectionRate
   available = total_cashback - reserved
   ```

3. **Cập nhật `user_system_balance`**:
   ```sql
   INSERT INTO user_system_balance (
     user_id,
     available_balance,  -- Số dư khả dụng (user có thể rút)
     reserved_balance,   -- Số dư dự trữ (giữ lại)
     total_earned
   ) VALUES (...);
   ```

4. **Cập nhật trạng thái kỳ đối soát**:
   ```sql
   UPDATE system_reconciliations
   SET status = 'finalized',
       finalized_at = NOW()
   WHERE id = ...;
   ```

#### 🎯 Kết quả:
- ✅ Kỳ đối soát chuyển sang **"Đã Hoàn Tất"**
- ✅ User thấy số dư cập nhật trên dashboard
- ✅ User có thể yêu cầu rút tiền (nếu đủ điều kiện)

---

### **BƯỚC 3: ĐỒNG BỘ VỚI API ACCESSTRADE**

#### 📍 Vị trí: Admin Panel → Chi tiết kỳ đối soát → Button "Đồng bộ API"

#### 🎯 Mục đích:
Kiểm tra xem đơn hàng có **thực sự được AccessTrade xác nhận** hay không để:
- Giải phóng số dư dự trữ (nếu đơn hàng vẫn approved)
- Trừ số dư (nếu đơn hàng bị reject)

#### ⚙️ Chức năng:
Khi click "Đồng bộ API", hệ thống:

1. **Gọi API AccessTrade** để lấy thông tin mới nhất của đơn hàng
2. **So sánh trạng thái**:
   ```javascript
   // Nếu đơn hàng VẪN approved:
   - Giữ nguyên số dư
   - Chuyển từ "reserved" → "available"
   - Đánh dấu: api_reconciled = true

   // Nếu đơn hàng BỊ REJECT:
   - Trừ từ reserved_balance
   - Nếu reserved không đủ → trừ available_balance
   - Ghi log cảnh báo admin
   ```

3. **Cập nhật database**:
   ```sql
   -- Cập nhật item
   UPDATE system_reconciliation_items
   SET api_reconciled = true,
       api_status = 'confirmed',
       reconciled_at = NOW()
   WHERE ...;

   -- Cập nhật balance
   UPDATE user_system_balance
   SET available_balance = available_balance + released_amount,
       reserved_balance = reserved_balance - released_amount
   WHERE ...;
   ```

#### 🎯 Kết quả:
- ✅ Đơn hàng được xác nhận với API
- ✅ Số dư dự trữ được giải phóng → Khả dụng
- ✅ User có thể rút thêm tiền

#### ⏰ Tự động:
- API Sync Job chạy **mỗi 6 giờ** tự động
- Admin có thể chạy thủ công bất cứ lúc nào

---

## 🔍 CHI TIẾT CÁC BUTTON

### 1. **"Lọc Đơn Hàng"** (Preview Orders)
- **Endpoint**: `GET /api/admin/system-reconciliation/preview`
- **Chức năng**: Tìm đơn hàng đủ điều kiện để đối soát
- **Khi nào dùng**: Trước khi tạo kỳ đối soát mới

### 2. **"Tạo Kỳ Đối Soát"** (Create Reconciliation)
- **Endpoint**: `POST /api/admin/system-reconciliation/create`
- **Chức năng**: Tạo kỳ đối soát với trạng thái "Nháp"
- **Khi nào dùng**: Sau khi đã chọn đơn hàng

### 3. **"Hoàn Tất"** (Finalize)
- **Endpoint**: `POST /api/admin/system-reconciliation/:id/finalize`
- **Chức năng**: Cập nhật số dư user
- **⚠️ Cảnh báo**: KHÔNG THỂ HOÀN TÁC
- **Khi nào dùng**: Khi đã kiểm tra kỹ danh sách đơn hàng

### 4. **"Đồng Bộ API"** (Sync API)
- **Endpoint**: `POST /api/admin/system-reconciliation/:id/sync`
- **Chức năng**: Xác nhận với AccessTrade API
- **Khi nào dùng**:
  - Sau khi hoàn tất ít nhất 3-7 ngày
  - Hoặc khi cần kiểm tra trạng thái mới nhất

### 5. **"Xem Chi Tiết"** (View Details)
- **Endpoint**: `GET /api/admin/system-reconciliation/:id`
- **Chức năng**: Xem thông tin chi tiết kỳ đối soát
- **Khi nào dùng**: Theo dõi, kiểm tra

---

## 📊 TRẠNG THÁI KỲ ĐỐI SOÁT

| Trạng thái | Màu | Ý nghĩa | Hành động tiếp theo |
|------------|-----|---------|---------------------|
| **draft** | 🟡 Vàng | Nháp, chưa hoàn tất | → Click "Hoàn Tất" |
| **finalized** | 🟢 Xanh | Đã hoàn tất, user đã nhận tiền | → Click "Đồng Bộ API" |
| **paid** | 💰 Xanh đậm | Đã thanh toán, đã rút tiền | → Hoàn thành |

---

## 🔐 BẢO MẬT & PHÂN QUYỀN

- ✅ Chỉ **ADMIN** mới được truy cập module này
- ✅ Mọi thao tác được ghi log với `performed_by`
- ✅ User chỉ có thể **XEM** kỳ đối soát của mình

---

## 📈 BEST PRACTICES

### ✅ NÊN:
1. Tạo kỳ đối soát **đều đặn hàng tháng**
2. Chờ **ít nhất 3-7 ngày** sau khi hoàn tất trước khi đồng bộ API
3. Kiểm tra kỹ danh sách đơn hàng trước khi click "Hoàn Tất"
4. Chạy "Đồng Bộ API" định kỳ để giải phóng số dự trữ

### ❌ KHÔNG NÊN:
1. Hoàn tất kỳ đối soát khi còn nghi ngờ về đơn hàng
2. Tạo nhiều kỳ đối soát chồng chéo thời gian
3. Bỏ qua việc đồng bộ API (dẫn đến dự trữ không được giải phóng)

---

## 🆘 XỬ LÝ LỖI THƯỜNG GẶP

### Lỗi: "Không có đơn hàng nào được duyệt"
**Nguyên nhân**: Không có đơn hàng approved trong khoảng thời gian
**Giải pháp**: Mở rộng khoảng thời gian hoặc kiểm tra lại trạng thái đơn hàng

### Lỗi: "Kỳ đối soát đã tồn tại"
**Nguyên nhân**: Đã có kỳ đối soát với cùng thời gian
**Giải pháp**: Xem lại danh sách kỳ đối soát hoặc điều chỉnh thời gian

### Lỗi: "pool.connect is not a function"
**Nguyên nhân**: Lỗi import database
**Giải pháp**: Kiểm tra `const { pool } = require('../config/database')`

---

## 📞 HỖ TRỢ

Nếu cần hỗ trợ, liên hệ dev team hoặc xem code tại:
- **Service**: `backend/services/systemReconciliation/SystemReconciliationService.js`
- **Routes**: `backend/routes/systemReconciliationAdmin.js`
- **Jobs**: `backend/jobs/systemReconciliation/APISyncJob.js`
