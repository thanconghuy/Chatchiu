# Hướng dẫn Restart Backend Server - Chi tiết từng bước

**Date:** 2026-01-16
**Issue:** Backend không load code mới sau khi restart
**Evidence:** Không thấy logs mới trong console (`=== CREATE PAYMENT REQUEST START ===`)

---

## 🔍 Kiểm tra Backend đang chạy

### Bước 1: Tìm process đang chạy trên port 3007

**Windows:**
```bash
netstat -ano | findstr :3007
```

Kết quả sẽ hiển thị:
```
TCP    0.0.0.0:3007    0.0.0.0:0    LISTENING    12345
```

→ Số `12345` là PID (Process ID)

**macOS/Linux:**
```bash
lsof -i :3007
```

Kết quả:
```
COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 user   23u  IPv4 0x1234      0t0  TCP *:3007 (LISTEN)
```

### Bước 2: Kill process hiện tại

**Windows:**
```bash
taskkill /PID 12345 /F
```

**macOS/Linux:**
```bash
kill -9 12345
```

### Bước 3: Verify port đã free

Chạy lại lệnh ở Bước 1. Nếu không còn kết quả → Port đã free ✅

---

## 🚀 Start Backend với Code Mới

### Option 1: Start bằng PM2 (Recommended)

```bash
cd f:\VSCODE\Chatchiu\backend

# Start với PM2
pm2 start server.js --name backend

# Xem logs real-time
pm2 logs backend
```

**Hoặc restart nếu đã có:**
```bash
pm2 restart backend

# Xem logs
pm2 logs backend --lines 100
```

### Option 2: Start bằng npm/node

```bash
cd f:\VSCODE\Chatchiu\backend

# Option A: npm
npm run dev

# Option B: node trực tiếp
node server.js
```

---

## ✅ Verify Backend đã load code mới

### Test 1: Check Server Startup Logs

Sau khi start, console phải hiển thị:
```
Server running on port 3007
Database connected
```

### Test 2: Tạo Payment Request và Check Logs

**2.1. Mở Backend Console/Terminal**
- Nếu dùng PM2: `pm2 logs backend --lines 0` (live logs)
- Nếu dùng npm/node: Console sẽ hiển thị trực tiếp

**2.2. Mở Browser và Tạo Request**
1. Mở http://localhost:3007/payment-requests
2. Login
3. Điền form tạo yêu cầu thanh toán
4. Click "Tạo yêu cầu"

**2.3. Kiểm tra Backend Console**

**NẾU CODE MỚI ĐÃ LOAD** → Bạn sẽ thấy:
```
=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 100000,
  "bankName": "ZaloPay",
  "bankAccountNumber": "0944941491",
  ...
}
Idempotency Key: 179f2e0e-9cbd-43c2-b699-668ef7b85a82
```

**NẾU CODE CŨ VẪN ĐANG CHẠY** → Không thấy logs trên ❌

---

## 🔧 Troubleshooting

### Vấn đề 1: Port 3007 bị chiếm bởi process khác

**Triệu chứng:**
```
Error: listen EADDRINUSE: address already in use :::3007
```

**Giải pháp:**
1. Tìm và kill process đang dùng port 3007 (xem Bước 1-2 ở trên)
2. Hoặc đổi port trong `.env`:
```env
PORT=3008
```

### Vấn đề 2: Backend crash ngay sau khi start

**Check:**
```bash
pm2 logs backend --err --lines 50
```

**Lỗi thường gặp:**
- Database connection failed → Check `.env` DATABASE_URL
- Missing dependencies → Chạy `npm install`
- Syntax error → Check code có lỗi cú pháp

### Vấn đề 3: PM2 không tìm thấy backend

```bash
# List tất cả PM2 processes
pm2 list

# Nếu không có 'backend', start mới
pm2 start server.js --name backend

# Nếu có nhiều processes tên 'backend', xóa tất cả và start lại
pm2 delete backend
pm2 start server.js --name backend
```

---

## 📋 Checklist Verify Code Mới

- [ ] Kill process cũ đang chạy port 3007
- [ ] Verify port 3007 đã free
- [ ] Start backend bằng PM2 hoặc npm
- [ ] Thấy "Server running on port 3007" trong console
- [ ] Thấy "Database connected" trong console
- [ ] Clear browser cache: `Ctrl + Shift + R`
- [ ] Mở backend console/logs
- [ ] Tạo payment request trên UI
- [ ] **THẤY LOGS** `=== CREATE PAYMENT REQUEST START ===` ✅

---

## 🎯 Expected Result

**Backend Console sau khi tạo request:**
```
=== CREATE PAYMENT REQUEST START ===
User ID: a73b55e7-a176-4299-b4aa-387c5ee4488c
Request body: {
  "requestedAmount": 100000,
  "bankName": "ZaloPay",
  "bankAccountNumber": "0944941491",
  "bankAccountName": "LÊ TRỌNG MẠNH",
  "bankBranch": null,
  "paymentAccountId": "abc123"
}
Idempotency Key: 179f2e0e-9cbd-43c2-b699-668ef7b85a82
```

**Browser Console (nếu thành công):**
```
Create payment request response: {status: 200, statusText: 'OK', ok: true}
Create payment request result: {success: true, data: {...}}
```

**Browser Console (nếu lỗi nhưng có logs):**
```
=== CREATE PAYMENT REQUEST ERROR ===
Error: Số dư không đủ...
Stack: ...
Code: ...
```

→ Nếu thấy error logs → Backend đã load code mới, lỗi là do logic nghiệp vụ
→ Nếu KHÔNG thấy logs gì → Backend vẫn chạy code cũ ❌

---

## 📞 Nếu vẫn không thấy logs

**Bước 1: Kill TẤT CẢ node processes**

**Windows:**
```bash
taskkill /IM node.exe /F
```

**macOS/Linux:**
```bash
pkill -9 node
```

**Bước 2: Verify không còn process nào**
```bash
# Windows
tasklist | findstr node

# macOS/Linux
ps aux | grep node
```

**Bước 3: Start lại từ đầu**
```bash
cd f:\VSCODE\Chatchiu\backend
node server.js
```

**Bước 4: Test ngay**
- Tạo payment request
- Phải thấy logs ngay lập tức

---

**QUAN TRỌNG:**
- Logs `=== CREATE PAYMENT REQUEST START ===` là **PROOF** backend đã load code mới
- Nếu không thấy logs này → Backend 100% vẫn đang chạy code cũ
- Không cần test gì khác, chỉ cần nhìn có log này là đủ!
