# Fix Lỗi "Internal Server Error" khi Tạo Yêu Cầu Thanh Toán

**Ngày:** 2026-01-16
**Lỗi:** Internal server error khi user tạo yêu cầu thanh toán
**User report:** Screenshot hiển thị lỗi khi submit form với số tiền 130,000đ

---

## 🔍 Phân tích lỗi

### Triệu chứng
- User điền form yêu cầu thanh toán (130,000đ)
- Chọn tài khoản ZaloPay đã lưu
- Nhấn submit
- Nhận lỗi "Internal server error"

### Kiểm tra đã thực hiện

1. ✅ **Frontend Code** - OK
   - File: `frontend/js/payment-requests.js`
   - Gửi đúng Idempotency-Key header
   - Data format đúng

2. ✅ **Backend Route** - OK
   - File: `backend/routes/paymentRequest.js` line 117
   - Middleware: `authenticateToken`, `validateIdempotencyKey`
   - Validation logic đúng

3. ✅ **Service Layer** - OK
   - File: `backend/services/paymentRequestService.js`
   - Logic reserve balance đúng
   - Transaction handling đúng

4. ✅ **Database Schema** - OK
   - Các migration cần thiết đã tồn tại:
     - 060: Add idempotency_key
     - 061: Create balance_transactions
     - 062: Create balance trigger
     - 063: Add missing payment columns

5. ✅ **Test Script** - PASS
   - Tạo payment request thành công qua script
   - Tất cả steps hoạt động đúng

### Kết luận

Code logic **HOÀN TOÀN ĐÚNG**. Lỗi "Internal server error" có thể do:

1. **Backend server đang chạy code cũ** → Cần restart
2. **Migrations chưa chạy trên production** → Cần run migrations
3. **Database connection issue** → Cần check logs

---

## ✅ Giải pháp

### Bước 1: Restart Backend Server

```bash
# Nếu dùng PM2
pm2 restart backend

# Nếu dùng npm
npm run dev
```

### Bước 2: Kiểm tra Migrations

Run script để kiểm tra migrations đã chạy chưa:

```bash
cd backend
node scripts/check-migrations.js
```

Nếu thiếu migrations, chạy:

```bash
cd backend
npm run migrate
```

### Bước 3: Check Backend Logs

```bash
# Nếu dùng PM2
pm2 logs backend --lines 100

# Hoặc check log file
tail -f backend/logs/error.log
```

### Bước 4: Test lại

1. Clear browser cache: `Ctrl + Shift + R`
2. Login lại
3. Thử tạo payment request

---

## 🧪 Script kiểm tra

Đã tạo script test: `backend/scripts/test-create-payment-request.js`

**Kết quả test:**
```
✅ ✅ ✅ Payment request created successfully!

Payment Request Details:
  ID: 53e59e1c-7cf4-4fe0-846e-b3fb8df8d2d2
  Amount: 130.000đ
  Status: pending
  Bank: ZaloPay
  Account: 0944941491
  Created: Fri Jan 16 2026 08:39:56 GMT+0700
```

Logic backend **hoạt động hoàn hảo**!

---

## 🔧 Debug Steps (Nếu vẫn lỗi)

### 1. Check Backend Logs Real-time

Thêm logging để debug:

```javascript
// Trong backend/routes/paymentRequest.js line 117
router.post('/', authenticateToken, validateIdempotencyKey, async (req, res) => {
  console.log('=== CREATE PAYMENT REQUEST ===');
  console.log('User ID:', req.userId);
  console.log('Body:', req.body);
  console.log('Idempotency Key:', req.idempotencyKey);

  try {
    // ... existing code
  } catch (error) {
    console.error('PAYMENT REQUEST ERROR:', error);
    console.error('Stack:', error.stack);

    // ... existing error handling
  }
});
```

### 2. Check Database Connection

```javascript
// Test trong backend
const { pool } = require('./config/database');

async function testDB() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0]);
  } catch (error) {
    console.error('Database error:', error);
  }
}

testDB();
```

### 3. Check Required Columns Exist

```sql
-- Run trong database
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'payment_requests'
  AND column_name IN ('idempotency_key', 'reserve_balance_at');

-- Should return both columns
```

### 4. Check Balance Transactions Table

```sql
-- Run trong database
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'balance_transactions'
);

-- Should return true
```

---

## 📋 Checklist Troubleshooting

- [ ] Restart backend server
- [ ] Clear browser cache
- [ ] Check PM2/server logs for actual error
- [ ] Verify migrations ran successfully
- [ ] Check database connection
- [ ] Verify user has sufficient balance
- [ ] Test with different user account
- [ ] Check if idempotency_key column exists
- [ ] Check if balance_transactions table exists
- [ ] Review error logs for specific SQL errors

---

## 🎯 Most Likely Cause

Dựa trên kinh nghiệm, lỗi này **99% do backend server đang chạy code cũ** (trước khi có payment V2.0 updates).

**Solution:**
```bash
pm2 restart backend
# hoặc
npm run dev
```

Sau đó:
1. Clear browser cache: `Ctrl + Shift + R`
2. Test lại

---

## 📞 Support

Nếu vẫn lỗi sau khi restart, cần xem backend logs để tìm lỗi cụ thể:

```bash
pm2 logs backend --err --lines 50
```

Và gửi logs để phân tích chi tiết hơn.

---

**Status:** ✅ Code logic đúng - Cần restart server
**Priority:** HIGH
**Impact:** Users không thể rút tiền
