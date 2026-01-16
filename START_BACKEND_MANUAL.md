# Hướng dẫn Start Backend và Xem Logs Trực Tiếp

**QUAN TRỌNG:** Backend cần chạy trên terminal/CMD của BẠN để xem logs!

---

## Cách 1: Dùng Script Tự Động (RECOMMENDED)

### Chạy file batch:
```bash
# Mở CMD hoặc PowerShell tại thư mục project
cd f:\VSCODE\Chatchiu

# Chạy script
restart-server.bat
```

Script sẽ:
1. Kill tất cả node processes
2. Verify port 3007 free
3. Start backend
4. Hiển thị logs TRỰC TIẾP trong cửa sổ

**→ GIỮ CỬA SỔ NÀY MỞ!**

---

## Cách 2: Chạy Thủ Công (Nếu script không work)

### Bước 1: Kill tất cả node processes

**PowerShell:**
```powershell
taskkill /IM node.exe /F
```

**CMD:**
```cmd
taskkill /IM node.exe /F
```

### Bước 2: Start backend

```bash
cd f:\VSCODE\Chatchiu
node server-cashback.js
```

**→ GIỮ CỬA SỔ NÀY MỞ!**

---

## ✅ Xác nhận Backend đã chạy đúng

Bạn phải thấy:
```
============================================================
🚀 Cashback Server is running
📍 URL: http://localhost:3007
🗄️  Database: Connected
🔑 JWT Secret: Configured ✅
============================================================
```

---

## 🧪 Test Payment Request

### Bước 1: Mở browser
- Truy cập: http://localhost:3007/payment-requests
- Login với testuser@test.com

### Bước 2: Tạo payment request
- Click "Tạo yêu cầu thanh toán"
- Số tiền: 100000
- Chọn tài khoản ACB
- Click "Tạo yêu cầu"

### Bước 3: XEM CỬA SỔ BACKEND TERMINAL

**NẾU CODE MỚI ĐÃ LOAD** → Bạn sẽ thấy NGAY LẬP TỨC:
```
=== CREATE PAYMENT REQUEST START ===
User ID: f7721918-7f35-41a8-90dd-df47deb13d4e
Request body: {
  "requestedAmount": 100000,
  "bankName": "ACB Ngân Hàng Á Châu",
  "bankAccountNumber": "12234556",
  "bankAccountName": "Võ Thanh Phong",
  "bankBranch": "TÂN ĐỊNH - HỒ CHÍ MINH",
  "paymentAccountId": null
}
Idempotency Key: [UUID]
```

**NẾU CODE CŨ VẪN CHẠY** → Không thấy logs trên ❌

---

## 🔍 Nếu thấy logs debug

### ✅ Nếu request THÀNH CÔNG:
- Browser sẽ hiển thị: "Tạo yêu cầu thanh toán thành công!"
- Modal đóng lại
- Danh sách refresh

### ❌ Nếu có LỖI:
Backend sẽ hiển thị:
```
=== CREATE PAYMENT REQUEST ERROR ===
Error: [Chi tiết lỗi]
Stack: [Stack trace]
Code: [Error code]
```

→ Chụp màn hình backend logs và gửi cho tôi!

---

## 📋 Checklist

- [ ] Kill tất cả node.exe processes
- [ ] Chạy `restart-server.bat` HOẶC `node server-cashback.js`
- [ ] Thấy "Server running on port 3007" ✅
- [ ] Thấy "Database: Connected" ✅
- [ ] GIỮ cửa sổ terminal/CMD MỞ
- [ ] Hard refresh browser (Ctrl + Shift + R)
- [ ] Tạo payment request trên UI
- [ ] NHÌN VÀO CỬA SỔ TERMINAL - Phải thấy logs `=== CREATE PAYMENT REQUEST START ===`

---

## ⚠️ LƯU Ý QUAN TRỌNG

1. **KHÔNG ĐÓNG** cửa sổ terminal/CMD đang chạy backend!
2. **PHẢI NHÌN** vào cửa sổ đó khi test để xem logs real-time
3. Logs `=== CREATE PAYMENT REQUEST START ===` là **BẰNG CHỨNG DUY NHẤT** code mới đã load
4. Nếu không thấy logs → Backend vẫn chạy code cũ → Phải restart lại

---

## 🎯 Expected Result

**Cửa sổ Terminal Backend:**
```
🚀 Cashback Server is running
📍 URL: http://localhost:3007
🗄️  Database: Connected

[Khi bạn click "Tạo yêu cầu"...]

=== CREATE PAYMENT REQUEST START ===
User ID: f7721918-7f35-41a8-90dd-df47deb13d4e
Request body: {
  "requestedAmount": 100000,
  ...
}
Idempotency Key: [UUID]
```

**Browser Console:**
```
Create payment request response: {status: 200, statusText: 'OK', ok: true}
```

**Browser UI:**
```
✅ Toast: "Tạo yêu cầu thanh toán thành công!"
```
