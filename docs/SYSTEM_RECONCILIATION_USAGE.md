# System Reconciliation Module - Hướng Dẫn Sử Dụng

## 📋 Tổng Quan

Module **System Reconciliation** giúp hệ thống cashback có thể trả tiền nhanh hơn cho user (tháng + 15 ngày) thay vì phải chờ 65-105 ngày từ AccessTrade API Reconciliation.

### So Sánh Timeline:

| Module | Thời Gian Rút Tiền | Độ Chính Xác | Mục Đích |
|--------|-------------------|--------------|----------|
| **System Reconciliation** | Tháng + 15 ngày | 85-90% | Rút nhanh, cải thiện UX |
| **API Reconciliation** | 65-105 ngày | 100% | Đối soát chính thức, điều chỉnh |

## 🚀 Khởi Động Server

```bash
node server-cashback.js
```

Server sẽ tự động:
- ✅ Load System Reconciliation routes
- ✅ Start 3 scheduled jobs (Daily Collection, Monthly Reconciliation, API Sync)
- ✅ Listen trên port 3007

## 📦 Cấu Trúc Database

### Tables Chính:

1. **system_reconciliations**: Các kỳ đối soát (tháng + 15 ngày)
2. **system_reconciliation_items**: Chi tiết đơn hàng trong mỗi kỳ
3. **user_system_balance**: Số dư của user (available, reserved, pending)
4. **user_balance_transactions**: Lịch sử thay đổi số dư

### Migration:

```bash
# Migration 014: System Reconciliation tables (đã chạy)
node backend/run-migration-014.js

# Migration 015: Balance transactions table
node backend/run-migration-015.js
```

## 👤 Hướng Dẫn Cho Admin

### 1. Đăng Nhập

- URL: http://localhost:3007/login
- Tài khoản test: `test@gmail.com`
- Role: `admin`

### 2. Truy Cập System Reconciliation

- URL: http://localhost:3007/admin/system-reconciliation
- Menu: **Đối soát hệ thống** (icon 🔄)

### 3. Tạo Kỳ Đối Soát Mới

**Thủ công:**
1. Chọn Tháng và Năm
2. Click **"Tạo Kỳ Đối Soát"**
3. Hệ thống sẽ:
   - Thu thập tất cả đơn hàng approved trong tháng đó
   - Tính toán risk score cho mỗi đơn
   - Tạo reconciliation period với status `draft`

**Tự động:**
- Cron job chạy vào **00:30 hàng ngày** (Daily Collection)
- Cron job chạy vào **02:00 ngày 15** hàng tháng (Monthly Reconciliation)

### 4. Finalize Reconciliation

1. Click nút **"Finalize"** trên reconciliation card
2. Xác nhận
3. Hệ thống sẽ:
   - Phân bổ cashback vào balance của user
   - Low-risk orders (score < 50): 100% vào `available_balance`
   - High-risk orders (score ≥ 50): 85% vào `available_balance`, 15% vào `reserved_balance`
   - Update status thành `finalized`

### 5. Đồng Bộ Với API

**Sau 65-105 ngày**, khi AccessTrade đã có kết quả đối soát chính thức:

1. Click nút **"🔄 Đồng bộ API"** trên reconciliation đã finalized
2. Xác nhận
3. Hệ thống sẽ:
   - So sánh trạng thái conversion với API
   - **Approved**: Giải phóng reserved → available
   - **Rejected**: Trừ từ reserved
   - **Pending**: Giữ nguyên

**Tự động:**
- Cron job chạy **mỗi 6 giờ** (API Sync)

### 6. Xem Thống Kê

Dashboard hiển thị:
- Tổng số reconciliations
- Số pending / finalized
- Tổng cashback đã phân bổ
- Balance statistics

## 👥 Hướng Dẫn Cho User

### 1. Xem Số Dư

User dashboard (http://localhost:3007/dashboard) hiển thị **System Balance Widget**:

- 💰 **Số dư khả dụng**: Có thể rút ngay
- 🔒 **Số dư dự trữ**: Chờ xác nhận API (high-risk)
- ⏳ **Số dư chờ xử lý**: Chưa đến kỳ đối soát

### 2. Xem Lịch Sử

URL: http://localhost:3007/system-balance-history

**2 tabs:**
- **Giao dịch số dư**: Mọi thay đổi số dư (tăng/giảm)
- **Lịch sử đối soát**: Chi tiết các kỳ đối soát user tham gia

### 3. Rút Tiền

Click nút **"💰 Rút tiền"** → Redirect đến Payment Requests

## 🔧 Test & Debug

### Test Jobs Thủ Công:

```bash
# Test Daily Collection
node backend/test-system-reconciliation-jobs.js daily

# Test Monthly Reconciliation
node backend/test-system-reconciliation-jobs.js monthly

# Test API Sync
node backend/test-system-reconciliation-jobs.js sync

# Test tất cả
node backend/test-system-reconciliation-jobs.js all
```

### Kiểm Tra Database:

```sql
-- Xem reconciliations
SELECT * FROM system_reconciliations
ORDER BY created_at DESC LIMIT 5;

-- Xem user balances
SELECT
  u.email,
  usb.available_balance,
  usb.reserved_balance,
  usb.pending_balance,
  usb.total_earned
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
ORDER BY usb.available_balance DESC
LIMIT 10;

-- Xem balance transactions
SELECT * FROM user_balance_transactions
ORDER BY created_at DESC LIMIT 20;

-- Xem reconciliation items
SELECT
  sri.id,
  sr.period_label,
  sri.cashback_amount,
  sri.is_high_risk,
  sri.risk_score,
  sri.conversion_status,
  sri.api_reconciled
FROM system_reconciliation_items sri
JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
ORDER BY sri.created_at DESC
LIMIT 10;
```

### API Endpoints:

**Admin:**
```bash
# Lấy stats
GET /api/admin/system-reconciliation/stats

# Danh sách reconciliations
GET /api/admin/system-reconciliation?page=1&limit=10

# Tạo mới
POST /api/admin/system-reconciliation/create
Body: {"month": 10, "year": 2024}

# Finalize
POST /api/admin/system-reconciliation/:id/finalize

# Sync với API
POST /api/admin/system-reconciliation/:id/sync

# Chạy job thủ công
POST /api/admin/system-reconciliation/jobs/run
Body: {"jobName": "daily|monthly|sync"}
```

**User:**
```bash
# Lấy balance
GET /api/user/system-reconciliation/balance

# Lịch sử đối soát
GET /api/user/system-reconciliation/history?page=1&limit=20

# Lịch sử giao dịch
GET /api/user/system-reconciliation/transactions?page=1&limit=20

# Thống kê
GET /api/user/system-reconciliation/summary
```

## 🎯 Workflow Hoàn Chỉnh

### Step-by-Step:

1. **User tạo click** → Conversion được tạo
2. **Conversion approved** → Status = 'approved'
3. **Daily Collection Job** (00:30 daily):
   - Thu thập approved conversions từ ngày hôm trước
   - Cập nhật `pending_balance` cho user
4. **Đến ngày 15 hàng tháng**:
   - **Monthly Reconciliation Job** (02:00):
     - Tạo reconciliation cho tháng trước
     - Status = 'draft'
5. **Admin finalize** (thủ công):
   - Phân bổ cashback vào available/reserved
   - Status = 'finalized'
   - User có thể rút tiền ngay
6. **Sau 65-105 ngày**:
   - **API Sync Job** (mỗi 6 giờ):
     - Đồng bộ với AccessTrade API
     - Release/deduct reserved balance
     - Update `api_reconciled` = true

## ⚠️ Lưu Ý

1. **Không xóa dữ liệu cũ**: Tất cả reconciliations và transactions được lưu permanent
2. **Không finalize nhiều lần**: Một reconciliation chỉ finalize 1 lần
3. **Risk management**: Chỉ high-risk orders mới có reserved balance
4. **API sync idempotent**: Có thể chạy nhiều lần, chỉ sync items chưa sync

## 🐛 Troubleshooting

### Vấn đề: "Đang tải..." mãi không load

**Nguyên nhân**: Token hết hạn hoặc không hợp lệ

**Giải pháp**:
1. Mở DevTools (F12) → Console
2. Nếu thấy "401 Unauthorized" → Đăng nhập lại
3. Refresh trang (F5)

### Vấn đề: "No items to sync"

**Nguyên nhân**: Chưa có conversion nào approved hoặc đã sync hết

**Giải pháp**: Đợi có thêm conversions hoặc kiểm tra database

### Vấn đề: Job không chạy

**Nguyên nhân**: Cron scheduler chưa start hoặc bị lỗi

**Giải pháp**:
1. Restart server
2. Kiểm tra logs khi server start
3. Chạy job thủ công để test

## 📞 Support

Nếu gặp vấn đề, kiểm tra:
1. Server logs (console output)
2. Browser console (F12)
3. Database data (SQL queries ở trên)

---

**Module hoàn thành**: Tất cả 6 phases ✅

Generated by Claude Code 🤖
