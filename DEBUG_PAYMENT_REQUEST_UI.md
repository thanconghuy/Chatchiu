# Debug Payment Request UI Error - Hướng dẫn chi tiết

**Date:** 2026-01-16
**Issue:** Không tạo được payment request từ UI (localhost:3007/payment-requests)

---

## 🔍 Tình trạng hiện tại

- ✅ Backend logic hoạt động (đã test bằng script)
- ✅ Frontend code có vẻ đúng
- ❌ UI không tạo được request (không có error message rõ ràng)
- ✅ Có 3 requests đang "Chờ duyệt" (40,000đ mỗi cái)

---

## 📝 Đã thêm Debug Logging

### 1. Frontend (payment-requests.js)

**File:** `frontend/js/payment-requests.js`

**Đã thêm:**
```javascript
// Log response
console.log('Create payment request response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok
});

// Log result
console.log('Create payment request result:', result);

// Log error details
console.error('Error creating request:', error);
console.error('Error stack:', error.stack);
```

### 2. Backend (paymentRequest.js)

**File:** `backend/routes/paymentRequest.js`

**Đã thêm:**
```javascript
// Log request
console.log('=== CREATE PAYMENT REQUEST START ===');
console.log('User ID:', req.userId);
console.log('Request body:', JSON.stringify(req.body, null, 2));
console.log('Idempotency Key:', req.idempotencyKey);

// Log error
console.error('=== CREATE PAYMENT REQUEST ERROR ===');
console.error('Error:', error.message);
console.error('Stack:', error.stack);
console.error('Code:', error.code);
```

---

## 🚀 Các bước Debug

### Bước 1: Restart Backend với Logging

```bash
# Stop backend hiện tại
pm2 stop backend
# Hoặc Ctrl+C nếu đang chạy npm run dev

# Start lại để load code mới
pm2 start backend
# Hoặc
npm run dev

# Xem logs real-time
pm2 logs backend
# Hoặc nếu dùng npm thì logs sẽ hiển thị trực tiếp
```

### Bước 2: Test trên UI và Xem Logs

**2.1. Mở Browser Console**
- Nhấn `F12` hoặc `Ctrl + Shift + I`
- Chọn tab "Console"
- Clear console: Click icon Clear hoặc nhấn `Ctrl + L`

**2.2. Refresh Page**
```
Ctrl + Shift + R (hard refresh)
```

**2.3. Tạo Payment Request**
- Điền số tiền (ví dụ: 100000)
- Chọn tài khoản thanh toán
- Click "Tạo yêu cầu"

**2.4. Quan sát Logs**

**Trong Browser Console, bạn sẽ thấy:**
```javascript
Create payment request response: {
    status: 400,  // hoặc 500, 200, etc.
    statusText: "Bad Request",
    ok: false
}

Create payment request result: {
    success: false,
    message: "Lỗi cụ thể ở đây"
}
```

**Trong Backend Terminal, bạn sẽ thấy:**
```
=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 100000,
  "bankName": "ZaloPay",
  ...
}
Idempotency Key: 179f2e0e-9cbd-43c2-b699-668ef7b85a82

[Nếu có lỗi:]
=== CREATE PAYMENT REQUEST ERROR ===
Error: Lỗi cụ thể
Stack: ...
```

---

## 🔧 Các Lỗi Thường Gặp & Giải Pháp

### Lỗi 1: "Insufficient Balance"
```
Error: Số dư không đủ. Khả dụng: 7.751đ, Yêu cầu: 100.000đ
```

**Nguyên nhân:** User không đủ số dư khả dụng

**Giải pháp:**
- Kiểm tra số dư: Xem phần "Số dư khả dụng" trên UI
- Hoặc query database:
```sql
SELECT * FROM user_system_balance
WHERE user_id = 'USER_ID_Ở_ĐÂY';
```

### Lỗi 2: "Below Min Amount"
```
Error: Số tiền tối thiểu là 50.000đ
```

**Nguyên nhân:** Số tiền yêu cầu < min_withdrawal_amount

**Giải pháp:** Nhập số tiền >= 50,000đ

### Lỗi 3: "Column does not exist"
```
Error: column "idempotency_key" does not exist
```

**Nguyên nhân:** Migration chưa chạy

**Giải pháp:**
```bash
cd backend
node migrations/run-migrations.js
```

### Lỗi 4: "Missing Idempotency-Key"
```
Error: Missing idempotency key header
```

**Nguyên nhân:** Frontend không gửi header

**Kiểm tra:** Xem Network tab trong browser DevTools
- Tab "Network"
- Click vào request "payment-requests"
- Tab "Headers"
- Xem có "idempotency-key" không

**Giải pháp:** Clear cache: `Ctrl + Shift + R`

### Lỗi 5: "User balance not found"
```
Error: Bạn chưa có số dư. Vui lòng chờ đối soát hoàn tất.
```

**Nguyên nhân:** User chưa có record trong `user_system_balance`

**Giải pháp:**
```sql
-- Tạo record balance cho user
INSERT INTO user_system_balance (
  user_id,
  available_balance,
  pending_balance,
  total_earned,
  total_withdrawn
) VALUES (
  'USER_ID',
  0,
  0,
  0,
  0
) ON CONFLICT (user_id) DO NOTHING;
```

---

## 📊 Kiểm Tra Database

### Check User Balance
```sql
SELECT
  u.id,
  u.full_name,
  u.email,
  usb.available_balance,
  usb.pending_balance,
  usb.total_earned,
  usb.total_withdrawn
FROM users u
LEFT JOIN user_system_balance usb ON u.id = usb.user_id
WHERE u.email = 'testuser@test.com';
```

### Check Payment Requests
```sql
SELECT
  id,
  user_id,
  requested_amount,
  status,
  bank_name,
  bank_account_number,
  created_at
FROM payment_requests
WHERE user_id = 'USER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Balance Transactions
```sql
SELECT
  transaction_type,
  amount,
  balance_before,
  balance_after,
  description,
  created_at
FROM balance_transactions
WHERE user_id = 'USER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 📋 Checklist Debug

- [ ] Backend đã restart với code mới
- [ ] Browser đã clear cache (Ctrl + Shift + R)
- [ ] Browser console đã mở (F12)
- [ ] Backend terminal/logs đang hiển thị
- [ ] Đã thử tạo payment request trên UI
- [ ] Đã xem logs trong browser console
- [ ] Đã xem logs trong backend terminal
- [ ] Đã kiểm tra user balance trong database
- [ ] Đã kiểm tra migrations đã chạy
- [ ] Đã kiểm tra network tab trong DevTools

---

## 📸 Screenshot Logs Cần Gửi

Nếu vẫn lỗi, gửi cho tôi:

1. **Browser Console Logs:**
   - Screenshot console khi tạo request
   - Toàn bộ error stack

2. **Backend Logs:**
   - Output từ terminal
   - Hoặc `pm2 logs backend --lines 100`

3. **Network Tab:**
   - Screenshot request/response
   - Headers
   - Response body

4. **User Balance:**
   - Screenshot "Số dư khả dụng" trên UI
   - Hoặc kết quả query user_system_balance

---

## 🎯 Expected Result

Sau khi debug, logs sẽ chỉ rõ:
- Request gửi đi có gì?
- Backend nhận được gì?
- Lỗi xảy ra ở bước nào?
- Thông báo lỗi cụ thể là gì?

→ Từ đó fix chính xác vấn đề!

---

**Next Steps:**
1. Restart backend
2. Clear browser cache
3. Mở browser console + backend logs
4. Thử tạo request
5. Screenshot logs
6. Gửi cho tôi để phân tích
