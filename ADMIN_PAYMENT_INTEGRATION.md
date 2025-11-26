# Tích Hợp Admin - Tự Động Tạo Payment History và Thanh Toán

## 📋 Tổng Quan

Module này cho phép Admin:
1. **Tự động tạo payment history** từ conversions đã approve cho kỳ đối soát
2. **Xác nhận thanh toán** và tự động trừ số dư khả dụng của user
3. **Quản lý toàn bộ** payment history của tất cả users

## ✅ Đã Triển Khai Hoàn Chỉnh

### 1. Backend Service - `paymentHistoryService.js`

#### Method: `createPaymentHistoryForPeriod(paymentPeriod, options)`

**Chức năng:** Tạo payment history tự động cho tất cả users có conversions approved trong kỳ

**Input:**
```javascript
paymentPeriod: "2024-11"  // YYYY-MM format
options: {
  reconciliationDate: new Date(),  // Ngày đối soát
  status: 'pending'                // Trạng thái ban đầu
}
```

**Process Flow:**
```
1. Query tất cả conversions với status = 'approved' trong kỳ
2. Group conversions theo user_id
3. Tính tổng cashback cho mỗi user
4. Tạo user_payment_history record
5. Tạo user_payment_details cho từng conversion
6. Return kết quả
```

**Output:**
```javascript
{
  success: true,
  message: "Đã tạo 25 payment records cho kỳ 2024-11",
  created: 25,      // Số payment history đã tạo
  skipped: 2,       // Số payment history bị skip (đã tồn tại)
  totalAmount: 15000000,  // Tổng số tiền
  users: [          // Chi tiết từng user
    {
      userId: "uuid",
      fullName: "Nguyễn Văn A",
      email: "a@example.com",
      conversionsCount: 10,
      totalCashback: 500000
    },
    // ...
  ]
}
```

**SQL Query Logic:**
```sql
-- Lấy conversions đã approve trong kỳ, chưa có trong payment history
SELECT
  c.user_id,
  c.id as conversion_id,
  c.commission_amount,
  m.name as merchant_name,
  u.full_name,
  u.email
FROM conversions c
INNER JOIN users u ON u.id = c.user_id
INNER JOIN merchants m ON m.id = c.merchant_id
WHERE c.status = 'approved'
  AND c.confirmed_at IS NOT NULL
  AND TO_CHAR(c.confirmed_at, 'YYYY-MM') = '2024-11'
  AND NOT EXISTS (
    SELECT 1 FROM user_payment_details upd
    WHERE upd.conversion_id = c.id
  )
ORDER BY c.user_id, c.confirmed_at
```

#### Method: `processPayment(paymentHistoryId, paymentInfo)`

**Chức năng:** Xác nhận thanh toán, trừ số dư khả dụng của user

**Input:**
```javascript
paymentHistoryId: "uuid"
paymentInfo: {
  paymentMethod: 'bank_transfer',  // hoặc 'momo', 'zalopay'
  paymentDetails: {
    transaction_id: 'TXN123456',
    bank_name: 'Vietcombank',
    account_number: '123456789',
    notes: 'Thanh toán kỳ 11/2024'
  }
}
```

**Process Flow:**
```
1. Kiểm tra payment history tồn tại và chưa thanh toán
2. Lock user_system_balance record (FOR UPDATE)
3. Kiểm tra available_balance >= total_cashback
4. Trừ available_balance
5. Tăng total_withdrawn
6. Tạo balance transaction log
7. Update payment_history status = 'paid', payment_date = NOW()
8. Update tất cả payment_details status = 'paid'
9. Commit transaction
```

**Balance Update Logic:**
```sql
UPDATE user_system_balance
SET
  available_balance = available_balance - $1,  -- Trừ số tiền thanh toán
  total_withdrawn = total_withdrawn + $1,      -- Cộng vào tổng đã rút
  updated_at = NOW()
WHERE user_id = $2
RETURNING available_balance, total_withdrawn
```

**Transaction Log:**
```sql
INSERT INTO user_balance_transactions (
  user_id,
  transaction_type,          -- 'payment_deducted'
  amount,                    -- Số tiền trừ
  balance_before,            -- Số dư trước
  balance_after,             -- Số dư sau
  description,               -- 'Thanh toán kỳ YYYY-MM'
  metadata                   -- JSON chứa payment info
) VALUES (...)
```

**Output:**
```javascript
{
  success: true,
  message: 'Thanh toán thành công',
  payment_history_id: "uuid",
  user_id: "uuid",
  amount: 500000,
  previous_balance: 1000000,  // Số dư trước khi trừ
  new_balance: 500000,        // Số dư sau khi trừ
  details_updated: 10         // Số payment details đã update
}
```

**Error Cases:**
```javascript
// Case 1: Payment đã thanh toán
throw new Error('Payment đã được thanh toán trước đó')

// Case 2: Payment đã hủy
throw new Error('Payment đã bị hủy')

// Case 3: Số dư không đủ
throw new Error('Số dư khả dụng không đủ. Hiện có: 300000, cần: 500000')
```

#### Method: `cancelPayment(paymentHistoryId, reason)`

**Chức năng:** Hủy payment history (không hoàn tiền, chỉ đánh dấu cancelled)

**Process:**
- Update status = 'cancelled'
- Lưu lý do hủy vào payment_details JSON
- Update tất cả payment_details status = 'cancelled'

### 2. Admin API Endpoints

#### POST `/api/admin/payment-history/create-period`
**Tạo payment history cho kỳ đối soát**

Request:
```json
{
  "payment_period": "2024-11",
  "reconciliation_date": "2024-11-25T00:00:00Z",
  "status": "pending"
}
```

Response:
```json
{
  "success": true,
  "message": "Đã tạo 25 payment records cho kỳ 2024-11",
  "created": 25,
  "skipped": 2,
  "totalAmount": 15000000,
  "users": [...]
}
```

#### GET `/api/admin/payment-history`
**Lấy danh sách payment history với filters**

Query params:
- `period` - Kỳ thanh toán (YYYY-MM)
- `status` - pending, processing, paid, cancelled
- `user_id` - UUID của user
- `limit` - Giới hạn kết quả (default: 100)
- `offset` - Offset cho pagination

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "full_name": "Nguyễn Văn A",
      "email": "a@example.com",
      "payment_period": "2024-11",
      "total_cashback": 500000,
      "conversions_count": 10,
      "status": "pending",
      "reconciliation_date": "2024-11-25",
      "payment_date": null,
      "created_at": "2024-11-25T10:00:00Z"
    }
  ],
  "count": 25
}
```

#### GET `/api/admin/payment-history/summary`
**Lấy thống kê tổng quan**

Response:
```json
{
  "success": true,
  "data": [
    {
      "payment_period": "2024-11",
      "status": "pending",
      "records_count": 20,
      "users_count": 20,
      "total_amount": 10000000
    },
    {
      "payment_period": "2024-11",
      "status": "paid",
      "records_count": 5,
      "users_count": 5,
      "total_amount": 3000000
    }
  ]
}
```

#### GET `/api/admin/payment-history/:id`
**Lấy chi tiết payment history theo ID**

#### POST `/api/admin/payment-history/:id/process`
**Xác nhận thanh toán (trừ số dư user)**

Request:
```json
{
  "payment_method": "bank_transfer",
  "payment_details": {
    "transaction_id": "TXN123456",
    "bank_name": "Vietcombank",
    "account_number": "123456789",
    "notes": "Thanh toán kỳ 11/2024"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Thanh toán thành công",
  "amount": 500000,
  "previous_balance": 1000000,
  "new_balance": 500000
}
```

#### POST `/api/admin/payment-history/:id/cancel`
**Hủy payment history**

Request:
```json
{
  "reason": "User yêu cầu hủy do chưa muốn rút"
}
```

#### PUT `/api/admin/payment-history/:id`
**Cập nhật payment history**

#### DELETE `/api/admin/payment-history/:id`
**Xóa payment history (không cho xóa nếu đã paid)**

### 3. Frontend Admin - `payment-history.html`

**URL:** `http://localhost:3007/admin/payment-history.html`

**Features:**

#### 1. Tạo Kỳ Thanh Toán Mới
- Form input: Kỳ thanh toán (month picker), Ngày đối soát, Trạng thái ban đầu
- Click "Tạo Kỳ Thanh Toán"
- Hiển thị kết quả: Số payment đã tạo, Tổng số tiền
- Auto refresh danh sách sau khi tạo

#### 2. Summary Statistics
- 4 cards hiển thị:
  - **Chờ Thanh Toán:** Tổng số tiền pending + processing
  - **Đã Thanh Toán:** Tổng số tiền paid
  - **Tổng Records:** Tổng số payment history records
  - **Tổng Users:** Tổng số users có payment

#### 3. Filters
- Kỳ thanh toán (month picker)
- Trạng thái (dropdown)
- User ID (text input)
- Auto-reload khi thay đổi filter

#### 4. Bảng Danh Sách
Columns:
- Kỳ
- User (Full name + Email)
- Số Tiền (formatted VND)
- Conversions (số lượng)
- Trạng Thái (badge màu)
- Ngày Đối Soát
- Ngày Thanh Toán
- Thao Tác (buttons)

#### 5. Actions
**Với payment status = pending/processing:**
- ✅ **Thanh Toán:** Mở modal nhập thông tin thanh toán
  - Phương thức thanh toán (dropdown)
  - Mã giao dịch (text input)
  - Ghi chú (textarea)
  - Confirm: Gọi API `/process`, auto reload
- ❌ **Hủy:** Mở modal nhập lý do hủy
  - Lý do hủy (textarea, required)
  - Confirm: Gọi API `/cancel`, auto reload

**Tất cả payment:**
- 👁️ **Chi Tiết:** View detail (placeholder, có thể navigate to detail page)

### 4. Activity Logging

Tất cả actions đều được log vào `user_activity_logs`:

```javascript
// Activity types added:
ACTIVITY_TYPES.PAYMENT_HISTORY_CREATED
ACTIVITY_TYPES.PAYMENT_PROCESSED
ACTIVITY_TYPES.PAYMENT_CANCELLED
ACTIVITY_TYPES.PAYMENT_UPDATED
ACTIVITY_TYPES.PAYMENT_DELETED
```

Log example:
```sql
INSERT INTO user_activity_logs (
  user_id,              -- Admin user ID
  activity_type,        -- 'PAYMENT_PROCESSED'
  description,          -- 'Xác nhận thanh toán ID: uuid'
  metadata,             -- JSON: {payment_history_id, amount, payment_method}
  ip_address,
  user_agent,
  created_at
) VALUES (...)
```

## 🔄 Complete Flow Example

### Scenario: Admin tạo và thanh toán kỳ 11/2024

#### Step 1: Tạo Payment History
```javascript
// Admin chọn kỳ 11/2024 trong form
// Click "Tạo Kỳ Thanh Toán"

POST /api/admin/payment-history/create-period
{
  "payment_period": "2024-11",
  "reconciliation_date": "2024-11-25",
  "status": "pending"
}

// Backend thực hiện:
// 1. Query tất cả conversions approved trong tháng 11/2024
// 2. Tìm thấy 50 conversions từ 10 users
// 3. Group theo user_id
// 4. Tạo 10 payment_history records
// 5. Tạo 50 payment_details records
// 6. Return kết quả

Response:
{
  "success": true,
  "created": 10,
  "totalAmount": 5000000,
  "users": [
    {
      "userId": "user-1",
      "fullName": "Nguyễn Văn A",
      "conversionsCount": 8,
      "totalCashback": 800000
    },
    // ... 9 users khác
  ]
}

// Frontend hiển thị:
// Alert: "Thành công! Đã tạo 10 payment records\nTổng số tiền: 5.000.000 ₫"
// Auto refresh: Stats cards + Table
```

#### Step 2: Admin Review
```javascript
// Admin xem bảng, thấy 10 payment với status "Chờ Xử Lý"
// Kiểm tra chi tiết từng payment
// Xác nhận số liệu đúng
```

#### Step 3: Thanh Toán cho User
```javascript
// Admin click button "Thanh Toán" ở row user Nguyễn Văn A
// Modal mở ra

// Admin nhập:
// - Phương thức: Chuyển Khoản Ngân Hàng
// - Mã GD: TXN2024112501
// - Ghi chú: Thanh toán kỳ 11/2024 - User A

// Click "Xác Nhận"
// Confirm dialog: "Xác nhận thanh toán? Hành động này sẽ trừ số dư khả dụng của user."

POST /api/admin/payment-history/{payment-id}/process
{
  "payment_method": "bank_transfer",
  "payment_details": {
    "transaction_id": "TXN2024112501",
    "notes": "Thanh toán kỳ 11/2024 - User A"
  }
}

// Backend thực hiện (trong transaction):
```

**Backend Transaction Details:**
```sql
BEGIN;

-- 1. Kiểm tra payment
SELECT * FROM user_payment_history WHERE id = 'payment-id' FOR UPDATE;
-- Result: payment_period = '2024-11', total_cashback = 800000, status = 'pending'

-- 2. Lock user balance
SELECT available_balance FROM user_system_balance WHERE user_id = 'user-1' FOR UPDATE;
-- Result: available_balance = 1500000

-- 3. Kiểm tra đủ tiền (1500000 >= 800000) ✅

-- 4. Trừ balance
UPDATE user_system_balance
SET available_balance = 1500000 - 800000,  -- = 700000
    total_withdrawn = total_withdrawn + 800000,
    updated_at = NOW()
WHERE user_id = 'user-1'
RETURNING available_balance, total_withdrawn;

-- 5. Log transaction
INSERT INTO user_balance_transactions (
  user_id,
  transaction_type,
  amount,
  balance_before,
  balance_after,
  description,
  metadata
) VALUES (
  'user-1',
  'payment_deducted',
  800000,
  1500000,
  700000,
  'Thanh toán kỳ 2024-11',
  '{"payment_history_id": "payment-id", "transaction_id": "TXN2024112501"}'
);

-- 6. Update payment_history
UPDATE user_payment_history
SET status = 'paid',
    payment_date = NOW(),
    payment_method = 'bank_transfer',
    payment_details = '{"transaction_id": "TXN2024112501", "notes": "..."}'
WHERE id = 'payment-id';

-- 7. Update payment_details
UPDATE user_payment_details
SET status = 'paid',
    payment_month = '2024-11'
WHERE payment_history_id = 'payment-id';
-- 8 rows updated

COMMIT;
```

**Response:**
```json
{
  "success": true,
  "message": "Thanh toán thành công",
  "amount": 800000,
  "previous_balance": 1500000,
  "new_balance": 700000,
  "details_updated": 8
}
```

**Frontend:**
```javascript
// Alert: "Thanh toán thành công!"
// Modal đóng
// Auto refresh: Stats cards + Table
// Row của User A giờ có status "Đã Thanh Toán" (màu xanh)
// Buttons "Thanh Toán" và "Hủy" biến mất
```

#### Step 4: User Kiểm Tra
```javascript
// User Nguyễn Văn A login vào hệ thống
// Vào trang "Lịch sử thanh toán"
// Thấy kỳ 2024-11 với:
// - Cashback: 800.000 ₫
// - 8 conversions
// - Trạng thái: Đã Thanh Toán
// - Thời gian thanh toán: 25/11/2024

// Click "Chi tiết"
// Xem breakdown 8 conversions từ các merchants
// Click "Xuất Excel" để tải báo cáo
```

## 🔒 Security & Validation

### 1. Authorization
- ✅ Tất cả endpoints yêu cầu `authenticateAdmin` middleware
- ✅ Activity logging ghi lại admin nào thực hiện action

### 2. Data Validation
- ✅ Payment period format: YYYY-MM (regex validation)
- ✅ Payment status: chỉ cho phép pending, processing, paid, cancelled
- ✅ Amount validation: phải > 0
- ✅ Balance check: available_balance >= total_cashback

### 3. Transaction Safety
- ✅ Tất cả operations critical dùng database transactions
- ✅ FOR UPDATE lock để tránh race conditions
- ✅ Rollback nếu có lỗi bất kỳ
- ✅ Không cho xóa payment đã paid

### 4. Audit Trail
- ✅ Balance transactions table log tất cả thay đổi balance
- ✅ Activity logs log tất cả admin actions
- ✅ Payment details lưu metadata chi tiết

## 📊 Database Impact

### Tables Modified:

#### 1. `user_system_balance`
```sql
-- Mỗi lần process payment:
UPDATE user_system_balance
SET available_balance = available_balance - amount,
    total_withdrawn = total_withdrawn + amount
WHERE user_id = ?
```

#### 2. `user_balance_transactions`
```sql
-- Mỗi lần process payment tự động insert 1 record:
INSERT INTO user_balance_transactions (
  transaction_type: 'payment_deducted',
  amount,
  balance_before,
  balance_after,
  ...
)
```

#### 3. `user_payment_history`
```sql
-- Mỗi kỳ tạo payment: 1 record per user có conversions
-- Mỗi lần thanh toán: UPDATE status, payment_date, payment_details
```

#### 4. `user_payment_details`
```sql
-- Mỗi kỳ tạo payment: 1 record per conversion
-- Mỗi lần thanh toán: UPDATE status = 'paid' cho tất cả details
```

#### 5. `user_activity_logs`
```sql
-- Mỗi admin action: 1 log record
```

### Performance Considerations

**Indexes Đã Có:**
- ✅ `user_payment_history(user_id, payment_period)` - Unique
- ✅ `user_payment_details(payment_history_id, conversion_id)` - Unique
- ✅ `user_balance_transactions(user_id)`
- ✅ `user_system_balance(user_id)` - Primary key

**Query Performance:**
- Create payment period: O(n) where n = số conversions trong kỳ
- Process payment: O(1) - chỉ update 1 user balance
- List payments: O(log n) với indexes

## 🧪 Testing Guide

### Manual Testing

#### Test 1: Create Payment Period
```bash
# 1. Tạo test conversions
# Đảm bảo có ít nhất 5 conversions với status='approved' trong tháng 11/2024

# 2. Login admin
# Navigate to: http://localhost:3007/admin/payment-history.html

# 3. Click "Tạo Kỳ Thanh Toán"
# Input: 2024-11
# Submit

# Expected:
# - Alert thành công với số lượng payments created
# - Table reload hiển thị payment mới
# - Stats cards update
```

#### Test 2: Process Payment
```bash
# 1. Kiểm tra balance trước khi thanh toán
SELECT available_balance FROM user_system_balance WHERE user_id = 'test-user-id';
# Ghi nhớ số này

# 2. Trong admin panel, click "Thanh Toán"
# Nhập payment info
# Submit

# Expected:
# - Alert "Thanh toán thành công"
# - Balance đã giảm đúng số tiền
SELECT available_balance FROM user_system_balance WHERE user_id = 'test-user-id';

# 3. Kiểm tra transaction log
SELECT * FROM user_balance_transactions
WHERE user_id = 'test-user-id'
ORDER BY created_at DESC LIMIT 1;

# Expected: transaction_type = 'payment_deducted'
```

#### Test 3: Insufficient Balance
```bash
# 1. Tạo payment với total_cashback lớn hơn available_balance

# 2. Try process payment
# Expected: Error "Số dư khả dụng không đủ"
```

#### Test 4: User View
```bash
# 1. Login as user
# Navigate to: http://localhost:3007/user/payment-history.html

# Expected:
# - Thấy kỳ vừa tạo
# - Status correct
# - Số tiền correct
# - Click "Chi tiết" thấy breakdown
```

### API Testing with curl

```bash
# Test create period
curl -X POST http://localhost:3007/api/admin/payment-history/create-period \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payment_period": "2024-11"}'

# Test list
curl http://localhost:3007/api/admin/payment-history?period=2024-11 \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Test process
curl -X POST http://localhost:3007/api/admin/payment-history/{id}/process \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": "bank_transfer",
    "payment_details": {"transaction_id": "TEST123"}
  }'
```

## 📝 Next Steps

### Recommended Enhancements

1. **Email Notifications:**
   - Gửi email cho user khi có payment mới được tạo
   - Gửi email khi payment được thanh toán
   - Template: "Kỳ thanh toán XX/YYYY của bạn đã sẵn sàng"

2. **Batch Payment:**
   - Tính năng thanh toán nhiều payments cùng lúc
   - Select multiple checkboxes
   - Bulk process với cùng payment method

3. **Payment Request Integration:**
   - Link với payment_requests table
   - User request payment → Admin approve → Auto create payment history

4. **Report Export:**
   - Admin xuất báo cáo tổng hợp tất cả payments trong kỳ
   - Excel/PDF với chi tiết từng user

5. **Dashboard Widget:**
   - Thêm widget "Pending Payments" vào admin dashboard
   - Quick actions từ dashboard

## 🎯 Summary

✅ **Hoàn Thành:**
- Service tự động tạo payment history từ conversions
- API endpoints đầy đủ cho CRUD operations
- Logic trừ cashback khả dụng khi thanh toán
- Frontend admin quản lý payment history
- Activity logging
- Transaction safety
- Balance transaction audit trail

✅ **Tested:**
- Create payment period flow
- Process payment flow
- Balance deduction logic
- Transaction rollback on error
- Admin UI functionality

✅ **Ready for Production:**
- Error handling comprehensive
- Security validated
- Performance optimized
- Documentation complete
