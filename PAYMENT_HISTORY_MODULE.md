# Module Lịch Sử Thanh Toán User - Hướng Dẫn Hoàn Chỉnh

## 📋 Tổng Quan

Module Lịch sử thanh toán cho phép user theo dõi các kỳ thanh toán cashback của họ, xem chi tiết từng conversion, và xuất báo cáo Excel.

## ✅ Đã Triển Khai Hoàn Chỉnh

### 1. Database Schema

#### Bảng `user_payment_history`
```sql
CREATE TABLE user_payment_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    payment_period VARCHAR(7),  -- YYYY-MM
    total_cashback DECIMAL(15,2),
    reconciliation_date TIMESTAMP,  -- Thời gian đối soát
    payment_date TIMESTAMP,         -- Thời gian thanh toán
    status VARCHAR(20),             -- pending, processing, paid, cancelled
    payment_method VARCHAR(50),
    payment_details JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### Bảng `user_payment_details`
```sql
CREATE TABLE user_payment_details (
    id UUID PRIMARY KEY,
    payment_history_id UUID REFERENCES user_payment_history(id),
    conversion_id UUID REFERENCES conversions(id),
    merchant_name VARCHAR(255),
    order_code VARCHAR(255),
    cashback_amount DECIMAL(15,2),
    reconciliation_month VARCHAR(7),  -- Tháng đối soát
    payment_month VARCHAR(7),         -- Tháng thanh toán
    status VARCHAR(20),               -- approved, rejected, pending, paid
    metadata JSONB,
    created_at TIMESTAMP
);
```

**Migrations:**
- ✅ `backend/migrations/021_create_user_payment_history.sql` - Đã chạy thành công
- ✅ `backend/migrations/022_create_user_payment_details.sql` - Đã chạy thành công

### 2. Backend API

#### Models

**`backend/models/UserPaymentHistory.js`**
- `getByUserId(userId, options)` - Lấy danh sách payment history của user
- `getById(id)` - Lấy payment history theo ID
- `getByUserAndPeriod(userId, period)` - Lấy payment history theo kỳ
- `create(data)` - Tạo payment history mới
- `update(id, data)` - Cập nhật payment history
- `delete(id)` - Xóa payment history
- `getSummary(userId)` - Lấy thống kê tổng quan
- `getAvailableYears(userId)` - Lấy danh sách năm có dữ liệu

**`backend/models/UserPaymentDetail.js`**
- `getByPaymentHistoryId(paymentHistoryId, options)` - Lấy chi tiết theo payment history
- `getById(id)` - Lấy chi tiết theo ID
- `create(data)` - Tạo detail mới
- `bulkCreate(details)` - Tạo nhiều details cùng lúc
- `update(id, data)` - Cập nhật detail
- `delete(id)` - Xóa detail
- `getStatistics(paymentHistoryId)` - Lấy thống kê
- `getMerchantBreakdown(paymentHistoryId)` - Lấy breakdown theo merchant

#### Routes - `backend/routes/userPaymentHistory.js`

**GET `/api/user/payment-history`**
- Lấy danh sách payment history
- Query params: `year`, `status`, `limit`, `offset`
- Response: Array of payment history records

**GET `/api/user/payment-history/summary`**
- Lấy thống kê tổng quan
- Response:
  ```json
  {
    "total_periods": 12,
    "total_cashback": 5000000,
    "paid_cashback": 4000000,
    "pending_cashback": 1000000,
    "processing_cashback": 0,
    "last_payment_date": "2024-11-20",
    "latest_period": "2024-11",
    "available_years": ["2024", "2023"]
  }
  ```

**GET `/api/user/payment-history/:period`**
- Lấy chi tiết payment theo kỳ
- Params: `period` (YYYY-MM)
- Query params: `status` (filter)
- Response:
  ```json
  {
    "payment_history": {...},
    "details": [...],
    "statistics": {
      "total_conversions": 45,
      "total_cashback": 1500000,
      "approved_count": 40,
      "rejected_count": 3,
      "pending_count": 2,
      "unique_merchants": 8
    },
    "merchant_breakdown": [...]
  }
  ```

**GET `/api/user/payment-history/:period/export`**
- Xuất file Excel/CSV
- Params: `period` (YYYY-MM)
- Query params: `format` (xlsx hoặc csv)
- Response: File download

**Đã đăng ký trong `server-cashback.js`:**
```javascript
const userPaymentHistoryRoutes = require('./backend/routes/userPaymentHistory');
app.use('/api/user', userPaymentHistoryRoutes);
```

### 3. Frontend Pages

#### Trang Tổng Quan - `frontend/user/payment-history.html`

**URL:** `http://localhost:3007/user/payment-history.html`

**Features:**
- 📊 Summary cards: Đã thanh toán, Chờ xử lý, Tổng cộng
- 🔍 Filters: Lọc theo năm, trạng thái
- 📋 Bảng danh sách các kỳ thanh toán với:
  - Kỳ đối soát
  - Cashback (số tiền)
  - Số conversions
  - Thời gian đối soát
  - Thời gian thanh toán
  - Trạng thái (badge màu)
  - Nút "Chi tiết"

**UI Design:**
- Responsive, mobile-friendly
- Modern card-based layout
- Color-coded status badges
- Empty state handling
- Loading states

#### Trang Chi Tiết - `frontend/user/payment-detail.html`

**URL:** `http://localhost:3007/user/payment-detail.html?period=2024-11`

**Features:**
- 🔙 Breadcrumb navigation
- 📄 Header với tóm tắt kỳ thanh toán:
  - Kỳ đối soát
  - Tổng Cashback
  - Thời gian đối soát
  - Thời gian thanh toán
  - Trạng thái
- 📊 Statistics cards:
  - Đã duyệt
  - Từ chối
  - Chờ xử lý
  - Số merchant
- 📋 Bảng chi tiết từng conversion:
  - STT
  - Merchant (với logo)
  - Mã đơn hàng
  - Cashback
  - Tháng đối soát
  - Tháng thanh toán
  - Trạng thái
  - Ngày tạo
- 🎯 Thống kê theo merchant (breakdown)
- 📥 Nút xuất Excel
- 🔍 Filter theo trạng thái

**UI Design:**
- Professional, data-focused layout
- Merchant logos display
- Color-coded amounts
- Export functionality
- Responsive design

### 4. Export Functionality

**ExcelJS Package:** ✅ Đã cài đặt (`npm install exceljs`)

**Export Features:**
- Xuất file Excel (.xlsx)
- Xuất file CSV (.csv)
- Header với tiêu đề kỳ đối soát
- Summary section (Tổng Cashback, Trạng thái)
- Formatted table với columns:
  - STT
  - Merchant
  - Mã đơn hàng
  - Cashback (formatted as currency)
  - Tháng đối soát
  - Tháng thanh toán
  - Trạng thái (Vietnamese)
  - Ngày tạo
- Proper column widths
- Currency formatting (VND)
- Professional styling

## 🚀 Cách Sử Dụng

### Chạy Migrations (Đã hoàn thành)

```bash
node run-payment-history-migrations.js
```

✅ **Kết quả:** Đã tạo thành công 2 bảng:
- `user_payment_history`
- `user_payment_details`

### Restart Server

```bash
# Kill process đang dùng port 3007 (nếu cần)
taskkill //F //IM node.exe

# Start server
npm start
# hoặc
node server-cashback.js
```

### Truy Cập Module

1. **Login:** `http://localhost:3007/login.html`
2. **Lịch sử thanh toán:** `http://localhost:3007/user/payment-history.html`
3. **Chi tiết kỳ:** `http://localhost:3007/user/payment-detail.html?period=YYYY-MM`

## 📝 Data Flow

### Tạo Payment History (Dự kiến - Chưa implement)

Khi admin chạy đối soát và thanh toán:

1. **System tính toán:** Lấy tất cả conversions đã được approve trong kỳ
2. **Tạo Payment History:**
   ```javascript
   const paymentHistory = await UserPaymentHistory.create({
     userId: user.id,
     paymentPeriod: '2024-11',
     totalCashback: 1500000,
     reconciliationDate: new Date(),
     status: 'pending'
   });
   ```

3. **Tạo Payment Details:**
   ```javascript
   const details = conversions.map(conv => ({
     paymentHistoryId: paymentHistory.id,
     conversionId: conv.id,
     merchantName: conv.merchant_name,
     orderCode: conv.order_id,
     cashbackAmount: conv.cashback_amount,
     reconciliationMonth: '2024-11',
     status: 'approved'
   }));

   await UserPaymentDetail.bulkCreate(details);
   ```

4. **Cập nhật trạng thái khi thanh toán:**
   ```javascript
   await UserPaymentHistory.update(paymentHistory.id, {
     status: 'paid',
     paymentDate: new Date(),
     paymentMethod: 'bank_transfer',
     paymentDetails: { transaction_id: 'TXN123' }
   });
   ```

## 🔗 Integration Points

### Cần Tích Hợp

1. **Admin Module - Tạo Payment History:**
   - Khi admin chạy đối soát hệ thống
   - Auto-generate payment records theo kỳ
   - Location: `backend/routes/admin.js` hoặc dedicated payment processing service

2. **Dashboard - Link từ User Dashboard:**
   - Thêm menu item "Lịch sử thanh toán"
   - Thêm widget summary trên dashboard
   - Location: `frontend/user/dashboard.html`

3. **Notification - Thông báo khi có payment mới:**
   - Email notification khi payment được tạo
   - Email notification khi payment được thanh toán
   - Location: `backend/services/notificationService.js`

## 🎨 Design System

### Colors
- Primary: `#4F46E5` (Indigo)
- Success: `#10B981` (Green)
- Warning: `#F59E0B` (Amber)
- Danger: `#EF4444` (Red)
- Gray scale: 50-900

### Status Colors
- **Pending:** Yellow/Amber (#FEF3C7)
- **Processing:** Blue (#DBEAFE)
- **Paid:** Green (#D1FAE5)
- **Cancelled:** Red (#FEE2E2)
- **Approved:** Green (#D1FAE5)
- **Rejected:** Red (#FEE2E2)

### Typography
- Font: System font stack (SF Pro, Segoe UI, etc.)
- Sizes: 0.75rem - 1.875rem

## 🧪 Testing

### Manual Testing Steps

1. **Test Summary API:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3007/api/user/payment-history/summary
   ```

2. **Test List API:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "http://localhost:3007/api/user/payment-history?year=2024&status=paid"
   ```

3. **Test Detail API:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3007/api/user/payment-history/2024-11
   ```

4. **Test Export:**
   - Navigate to detail page
   - Click "Xuất Excel" button
   - Verify file downloads with correct data

### Test Data Creation

```javascript
// Create test payment history
const testPayment = await UserPaymentHistory.create({
  userId: 'USER_UUID',
  paymentPeriod: '2024-11',
  totalCashback: 1500000,
  reconciliationDate: new Date('2024-11-20'),
  paymentDate: new Date('2024-11-25'),
  status: 'paid',
  paymentMethod: 'bank_transfer',
  paymentDetails: { bank: 'Vietcombank', account: '123456' }
});

// Create test details
await UserPaymentDetail.bulkCreate([
  {
    paymentHistoryId: testPayment.id,
    conversionId: 'CONVERSION_UUID_1',
    merchantName: 'Shopee',
    orderCode: 'SP123456',
    cashbackAmount: 50000,
    reconciliationMonth: '2024-11',
    paymentMonth: '2024-11',
    status: 'approved'
  },
  // ... more test data
]);
```

## 📚 API Documentation

### Authentication
All endpoints require JWT authentication:
```
Authorization: Bearer <token>
```

### Response Format
```json
{
  "success": true,
  "data": {...},
  "message": "Optional message"
}
```

### Error Format
```json
{
  "success": false,
  "message": "Error description"
}
```

## 🔒 Security

- ✅ JWT authentication required for all endpoints
- ✅ User can only access their own payment history
- ✅ SQL injection prevention via parameterized queries
- ✅ Input validation (period format, status values)
- ✅ Proper error handling without exposing sensitive info

## 📊 Performance

- ✅ Database indexes on:
  - `user_id`
  - `payment_period`
  - `status`
  - `payment_history_id`
  - `conversion_id`
  - Composite indexes for common queries
- ✅ Pagination support (limit/offset)
- ✅ Efficient queries with JOINs
- ✅ Transaction support for bulk operations

## 🐛 Known Issues

1. **Server Port Conflict:** Port 3007 có thể bị conflict. Cần kill process trước khi restart.
2. **No Admin Integration:** Chưa có tích hợp tự động tạo payment history từ admin module.
3. **No Email Notifications:** Chưa có email notification khi payment được tạo/thanh toán.

## 📈 Future Enhancements

1. **Auto Payment History Generation:** Tự động tạo payment history khi admin chạy đối soát
2. **Payment Request Integration:** Liên kết với payment request module
3. **Email Notifications:** Gửi email khi có payment mới hoặc payment được thanh toán
4. **PDF Export:** Thêm xuất file PDF ngoài Excel/CSV
5. **Payment History Calendar View:** Xem payment history dạng lịch
6. **Payment Analytics:** Biểu đồ thống kê payment theo thời gian
7. **Dispute System:** User có thể dispute payment nếu có vấn đề

## 📞 Support

Nếu gặp vấn đề, kiểm tra:
1. ✅ Database migrations đã chạy thành công
2. ✅ ExcelJS package đã được cài đặt
3. ✅ Server đang chạy và không có lỗi
4. ✅ JWT token hợp lệ trong localStorage
5. ✅ API endpoints đã được đăng ký đúng trong server-cashback.js

## ✅ Implementation Status

- [x] Database schema design
- [x] Database migrations
- [x] Backend models (UserPaymentHistory, UserPaymentDetail)
- [x] Backend routes and API endpoints
- [x] Frontend overview page (payment-history.html)
- [x] Frontend detail page (payment-detail.html)
- [x] Export Excel/CSV functionality
- [x] ExcelJS package installation
- [x] Route registration in server
- [ ] Admin integration (auto-create payment history)
- [ ] Email notifications
- [ ] Dashboard widget integration
- [ ] Test data creation script
