# Hướng dẫn Kill Tất Cả và Khởi Động Lại Project

**Date:** 2026-01-16

---

## 🛑 Bước 1: Kill TẤT CẢ Node Processes

### Windows:

```bash
# Kill tất cả node.exe processes
taskkill /IM node.exe /F

# Kill PM2 (nếu có)
taskkill /IM pm2.exe /F
```

### Verify đã kill xong:

```bash
# Kiểm tra không còn process node nào
tasklist | findstr node

# Kiểm tra port 3007 đã free
netstat -ano | findstr :3007
```

**Kết quả mong đợi:** Không có kết quả nào = Đã clean ✅

---

## 🚀 Bước 2: Start Backend

### Option A: Start bằng npm (Recommended cho debugging)

```bash
# Mở terminal tại thư mục backend
cd f:\VSCODE\Chatchiu\backend

# Start backend
npm run dev
```

**Phải thấy trong console:**
```
Server running on port 3007
Database connected
```

**QUAN TRỌNG:** Giữ terminal này MỞ, KHÔNG đóng!

### Option B: Start bằng PM2

```bash
cd f:\VSCODE\Chatchiu\backend

# Delete old PM2 process (nếu có)
pm2 delete all

# Start mới
pm2 start server.js --name backend

# Xem logs
pm2 logs backend
```

---

## 🧪 Bước 3: Test Backend Đã Load Code Mới

### Mở terminal MỚI (terminal thứ 2):

```bash
cd f:\VSCODE\Chatchiu

# Chạy verification script
node verify-backend-code.js
```

### Kiểm tra terminal backend (terminal thứ 1):

**PHẢI THẤY:**
```
=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 100000,
  "bankName": "ZaloPay",
  ...
}
Idempotency Key: 3746287a-d036-44e6-8942-7abcd5cd7020
```

**NẾU THẤY LOGS TRÊN** → Backend đã load code mới ✅

**NẾU KHÔNG THẤY** → Backend vẫn chạy code cũ ❌ → Lặp lại từ Bước 1

---

## 🌐 Bước 4: Test trên Browser

### 1. Clear Browser Cache:

```
Ctrl + Shift + Delete
→ Chọn "Cached images and files"
→ Click "Clear data"

HOẶC

Ctrl + Shift + R (hard refresh)
```

### 2. Mở DevTools:

```
F12
→ Tab "Console"
→ Tab "Network"
```

### 3. Login và Test:

1. Truy cập: http://localhost:3007/payment-requests
2. Login với: testuser@test.com
3. Click "Tạo yêu cầu thanh toán"
4. Điền form:
   - Số tiền: 110000
   - Chọn tài khoản đã lưu (hoặc nhập thông tin mới)
5. Click "Tạo yêu cầu"

### 4. Kiểm tra Backend Console (terminal thứ 1):

**PHẢI THẤY:**
```
=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 110000,
  "bankName": "ACB Ngân Hàng Á Châu",
  "bankAccountNumber": "12234556",
  "bankAccountName": "Võ Thanh Phong",
  "bankBranch": "TÂN ĐỊNH - HỒ CHÍ MINH",
  "paymentAccountId": null
}
Idempotency Key: [UUID mới]
```

### 5. Kiểm tra Browser Console:

**NẾU THÀNH CÔNG:**
```
Create payment request response: {status: 200, statusText: 'OK', ok: true}
Create payment request result: {success: true, data: {...}}
```

**NẾU LỖI NHƯNG CÓ LOGS:**
```
=== CREATE PAYMENT REQUEST ERROR ===
Error: Số dư không đủ...
```

→ Đây là lỗi nghiệp vụ, có thể fix được

**NẾU VẪN 500 VÀ KHÔNG CÓ LOGS:**
→ Backend vẫn chưa load code mới → Lặp lại từ Bước 1

---

## 🔍 Troubleshooting

### Vấn đề 1: Không kill được node.exe

```bash
# Restart máy tính
# Hoặc dùng Task Manager:
Ctrl + Shift + Esc
→ Tab "Details"
→ Tìm "node.exe"
→ Right click → "End task"
```

### Vấn đề 2: Port 3007 vẫn bị chiếm

```bash
# Tìm PID đang dùng port 3007
netstat -ano | findstr :3007

# Kết quả: TCP 0.0.0.0:3007 ... LISTENING 12345
# Kill PID đó
taskkill /PID 12345 /F
```

### Vấn đề 3: Backend crash khi start

```bash
# Check logs
npm run dev

# Xem lỗi gì
# Thường là:
# - Database connection failed → Check .env
# - Missing dependencies → npm install
# - Syntax error → Check code
```

### Vấn đề 4: Vẫn không thấy logs mới

**Chắc chắn 100% bạn đang xem đúng terminal?**

- Nếu dùng npm run dev → Xem terminal đang chạy npm
- Nếu dùng PM2 → Chạy `pm2 logs backend --lines 0` để xem live logs

**Test:**
```bash
# Trong backend/server.js, thêm dòng này ở đầu file:
console.log('🚀🚀🚀 BACKEND STARTED WITH NEW CODE 🚀🚀🚀');

# Restart backend
# Phải thấy dòng này khi start → Code mới đã load
```

---

## ✅ Checklist

- [ ] Killed tất cả node.exe processes
- [ ] Verify port 3007 đã free
- [ ] Start backend (npm run dev hoặc PM2)
- [ ] Thấy "Server running on port 3007" trong console
- [ ] Chạy verify-backend-code.js
- [ ] Thấy logs "=== CREATE PAYMENT REQUEST START ===" trong backend console
- [ ] Clear browser cache
- [ ] Test tạo payment request trên UI
- [ ] Thấy logs trong backend console khi test trên UI
- [ ] Kiểm tra response trong browser console

---

## 🎯 Expected Result

### Backend Console:
```
Server running on port 3007
Database connected

=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 110000,
  "bankName": "ACB Ngân Hàng Á Châu",
  "bankAccountNumber": "12234556",
  "bankAccountName": "Võ Thanh Phong",
  "bankBranch": "TÂN ĐỊNH - HỒ CHÍ MINH",
  "paymentAccountId": null
}
Idempotency Key: [UUID]
```

### Browser Console:
```
Create payment request response: {status: 200, statusText: 'OK', ok: true}
Create payment request result: {success: true, data: {...}}
```

### Browser UI:
```
Toast thông báo: "Tạo yêu cầu thanh toán thành công!"
Modal đóng lại
Danh sách payment requests refresh và hiển thị request mới
```

---

**Lưu ý cuối cùng:**

Việc thấy logs `=== CREATE PAYMENT REQUEST START ===` trong backend console là **BẰNG CHỨNG DUY NHẤT** chứng minh backend đã load code mới.

Nếu không thấy logs này → 100% backend vẫn chạy code cũ → Phải kill và restart lại!
