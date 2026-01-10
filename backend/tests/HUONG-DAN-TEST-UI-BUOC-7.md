# 🎯 HƯỚNG DẪN TEST QUA UI - BƯỚC 7

**Server:** ✅ Running on  
**Test User:** exccbuy@gmail.com
**Current Balance:** 137,751đ
**Test Amount:** 50,000đ

---

## 📝 BƯỚC 1: GHI LẠI BALANCE BAN ĐẦU

Trước khi test, chúng ta cần ghi lại balance hiện tại để so sánh sau khi test.

**Mở terminal mới và chạy:**

```bash
cd f:/VSCODE/Chatchiu
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT u.email, usb.available_balance, usb.total_withdrawn FROM users u INNER JOIN user_system_balance usb ON usb.user_id = u.id WHERE u.email = \\'exccbuy@gmail.com\\'').then(r => { console.log(r.rows[0]); process.exit(0); })"
```

📝 **Ghi lại kết quả:**
```
Balance TRƯỚC test:
- available_balance: _______________
- total_withdrawn: _______________
```

---

## 📝 BƯỚC 2: ĐĂNG NHẬP VÀO HỆ THỐNG

### Option A: Đăng nhập USER (để tạo payment request mới)

1. **Mở trình duyệt:**
   ```
   http://localhost:3007
   ```

2. **Click "Đăng nhập" (hoặc Login)**

3. **Nhập thông tin:**
   - Email: `exccbuy@gmail.com`
   - Password: [Bạn cần password của user này]

4. ✅ **Verify:** Đăng nhập thành công, thấy tên "Mạnh Thuý" ở góc trên

### Option B: Nếu không có password

**Lấy password hash từ database và reset:**

```bash
# Xem password hash hiện tại
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT email, password_hash FROM users WHERE email = \\'exccbuy@gmail.com\\'').then(r => { console.log(r.rows[0]); process.exit(0); })"

# Hoặc reset password thành "Test123456"
node -e "const bcrypt = require('bcrypt'); const db = require('./backend/config/database'); bcrypt.hash('Test123456', 10).then(hash => { return db.pool.query('UPDATE users SET password_hash = \\$1 WHERE email = \\$2', [hash, 'exccbuy@gmail.com']); }).then(() => { console.log('Password reset to: Test123456'); process.exit(0); })"
```

Sau đó login với:
- Email: `exccbuy@gmail.com`
- Password: `Test123456`

---

## 📝 BƯỚC 3: TẠO PAYMENT REQUEST MỚI

### 3.1 Navigate to Payment Requests Page

1. **Trong menu bên trái, tìm:**
   - "Yêu cầu thanh toán" HOẶC
   - "Payment Requests" HOẶC
   - "Rút tiền"

2. **Click vào menu đó**

3. ✅ **Verify:** Thấy trang payment requests với:
   - Số dư khả dụng hiện tại: ~137,751đ
   - Button "Tạo yêu cầu thanh toán" hoặc "Request Payment"

### 3.2 Check Eligibility

**Trước khi tạo, verify user eligible:**

Trên trang payment requests, bạn sẽ thấy:
- ✅ "Bạn có thể tạo yêu cầu thanh toán" (màu xanh)
- ✅ Số dư khả dụng: 137,751đ

Hoặc nếu không eligible:
- ❌ "Bạn chưa đủ điều kiện" (màu đỏ)
- Lý do: Số dư < 10,000đ hoặc có request đang pending

📝 **Status eligibility:** _______________

### 3.3 Tạo Payment Request

1. **Click button "Tạo yêu cầu thanh toán"**

2. **Popup/Form hiện ra, điền:**
   - **Số tiền:** `50000` (50,000đ)
   - **Ngân hàng:** `Test Bank E2E`
   - **Số tài khoản:** `1234567890`
   - **Tên tài khoản:** `MANH THUY` (hoặc giữ nguyên)

3. **Click "Xác nhận" hoặc "Submit"**

4. ✅ **Expected:**
   - Thông báo thành công
   - Payment request xuất hiện trong danh sách
   - Status: **"Đang chờ xử lý"** hoặc **"Pending"**

5. 📝 **Ghi lại Payment Request ID:**

   **Cách 1:** Từ URL
   ```
   http://localhost:3007/payment-requests/details/[PAYMENT-REQUEST-ID]
   ```

   **Cách 2:** Từ database
   ```bash
   node -e "const db = require('./backend/config/database'); db.pool.query('SELECT id, requested_amount, status, created_at FROM payment_requests WHERE user_id = (SELECT id FROM users WHERE email = \\'exccbuy@gmail.com\\') ORDER BY created_at DESC LIMIT 1').then(r => { console.log(r.rows[0]); process.exit(0); })"
   ```

   **Payment Request ID:** _______________

---

## 📝 BƯỚC 4: ADMIN XÁC NHẬN (CONFIRM) PAYMENT REQUEST

### 4.1 Đăng xuất User, Đăng nhập Admin

1. **Đăng xuất:** Click vào tên user → Đăng xuất

2. **Đăng nhập lại với tài khoản Admin:**
   - URL: http://localhost:3007/admin/login
   - Email: [admin email - có thể là một trong các admin users]
   - Password: [admin password]

**Nếu không biết admin account:**

```bash
# Liệt kê admin users
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT id, email, full_name, is_admin FROM users WHERE is_admin = true LIMIT 5').then(r => { console.table(r.rows); process.exit(0); })"

# Hoặc tạo admin mới (nếu cần)
node -e "const bcrypt = require('bcrypt'); const db = require('./backend/config/database'); bcrypt.hash('Admin123456', 10).then(hash => { return db.pool.query('INSERT INTO users (email, username, password_hash, full_name, is_admin) VALUES (\\'admin@test.com\\', \\'admin_test\\', \\$1, \\'Admin Test\\', true) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id, email', [hash]); }).then(r => { console.log('Admin created/updated:', r.rows[0]); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); })"
```

3. ✅ **Verify:** Đăng nhập admin thành công, thấy Admin Panel

### 4.2 Navigate to Payment Requests Management

1. **Trong Admin Panel, tìm menu:**
   - "Quản lý thanh toán" HOẶC
   - "Payment Requests" HOẶC
   - "Yêu cầu rút tiền"

2. **Click vào menu đó**

3. ✅ **Verify:** Thấy danh sách payment requests

### 4.3 Tìm Payment Request vừa tạo

1. **Filter theo:**
   - Status: "Pending" hoặc "Đang chờ"
   - User: "exccbuy@gmail.com" hoặc "Mạnh Thuý"
   - Hoặc sắp xếp theo Created Date (mới nhất)

2. **Tìm request:**
   - Amount: 50,000đ
   - Bank: Test Bank E2E
   - Created: Vừa mới

3. ✅ **Verify:** Tìm thấy request, status là "Pending"

### 4.4 Confirm Payment Request

1. **Click vào request để xem chi tiết**

2. **Tìm button "Xác nhận" hoặc "Confirm"**

3. **Click button "Xác nhận"**

4. ✅ **Expected:**
   - Thông báo "Xác nhận thành công"
   - Status đổi thành **"Đã xác nhận"** hoặc **"Confirmed"**
   - Button mới xuất hiện: **"Đánh dấu đã thanh toán"** hoặc **"Mark as Paid"**

📝 **Status sau confirm:** _______________

---

## 🎯 BƯỚC 5: ADMIN MARK AS PAID (⚠️ CRITICAL - CODE MỚI CHẠY Ở ĐÂY!)

### ⚠️ Đây là bước QUAN TRỌNG NHẤT!

Khi admin click "Mark as Paid", code mới sẽ:
1. ✅ Khấu trừ balance từ user_system_balance
2. ✅ Ghi log vào user_balance_transactions
3. ✅ Cập nhật system_conversions.payment_status = 'paid'

### 5.1 Click "Mark as Paid"

1. **Trên trang chi tiết payment request**

2. **Click button "Đánh dấu đã thanh toán" hoặc "Mark as Paid"**

3. **Popup hiện ra, điền thông tin:**
   - **Transaction Reference:** `E2E-TEST-001`
   - **Admin Notes:** `Test payment for BƯỚC 7 E2E verification`

4. **Click "Xác nhận" hoặc "Submit"**

### 5.2 Expected Results

✅ **Immediately after clicking:**
- Thông báo "Thanh toán thành công" hoặc "Payment marked as paid"
- Status đổi thành **"Đã thanh toán"** hoặc **"Paid"**
- Hiện thông tin: paid_at timestamp
- Hiện thông tin: Transaction Reference = E2E-TEST-001

### 5.3 Check Server Logs (Optional)

**Mở terminal chạy server, xem logs:**

Bạn sẽ thấy logs như:
```
[INFO] Marking payment request as paid: <payment-request-id>
[INFO] Deducting balance: 50000 from user: <user-id>
[INFO] Balance deducted successfully
[INFO] Updated 2 conversions with payment_status = paid
[INFO] Payment request marked as paid successfully
```

Hoặc nếu có lỗi:
```
[ERROR] Failed to mark payment as paid
[ERROR] ROLLBACK executed
```

📝 **Có thông báo lỗi không?** _______________

---

## ✅ BƯỚC 6: VERIFY KẾT QUẢ

### 6.1 Chạy Verification Script

**Mở terminal mới:**

```bash
cd f:/VSCODE/Chatchiu
node backend/tests/step7-e2e-verify.js <PAYMENT-REQUEST-ID>
```

**Thay `<PAYMENT-REQUEST-ID>` bằng ID thực tế từ BƯỚC 3.**

### 6.2 Expected Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 BƯỚC 7: E2E Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Payment request status is "paid" with valid paid_at timestamp

✅ total_withdrawn increased by requested amount

✅ Found valid payment_deducted log with correct amount

✅ All conversions marked as paid!

✅ Conversions will NOT be included in future reconciliations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 ALL CHECKS PASSED!

✅ This payment was processed with the NEW code.
✅ All fixes are working correctly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.3 If Output Shows "ALL CHECKS PASSED"

🎉 **CONGRATULATIONS!**

BƯỚC 7 HOÀN THÀNH THÀNH CÔNG!

Code mới hoạt động đúng:
- ✅ Balance đã được khấu trừ
- ✅ Transaction đã được ghi log
- ✅ Conversions đã được đánh dấu paid
- ✅ Đơn đã paid sẽ không xuất hiện trong reconciliation tiếp theo

**→ Tiếp tục BƯỚC 8: Fix historical data**

### 6.4 If Output Shows "SOME CHECKS FAILED"

❌ Có vấn đề! Cần debug.

Kiểm tra:
1. Server logs có lỗi gì không?
2. Code có đúng không? (re-check BƯỚC 6)
3. Database triggers có hoạt động không?

**→ Debug và fix trước khi tiếp tục**

---

## 📊 BƯỚC 7: MANUAL VERIFICATION (Optional nhưng Recommended)

### 7.1 Check Balance Đã Thay Đổi

```bash
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT u.email, usb.available_balance, usb.total_withdrawn FROM users u INNER JOIN user_system_balance usb ON usb.user_id = u.id WHERE u.email = \\'exccbuy@gmail.com\\'').then(r => { console.log('AFTER:', r.rows[0]); process.exit(0); })"
```

**So sánh với BƯỚC 1:**
- available_balance GIẢM 50,000đ ✅
- total_withdrawn TĂNG 50,000đ ✅

### 7.2 Check Transaction Log

```bash
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT transaction_type, amount, balance_before, balance_after, created_at FROM user_balance_transactions WHERE payment_request_id = \\'<PAYMENT-REQUEST-ID>\\' ORDER BY created_at DESC').then(r => { console.table(r.rows); process.exit(0); })"
```

Expected:
- 1 row với transaction_type = 'payment_deducted' ✅
- amount = -50000 ✅

### 7.3 Check Conversions Marked

```bash
node -e "const db = require('./backend/config/database'); db.pool.query('SELECT sc.id, sc.payment_status, sc.payment_request_id FROM system_conversions sc INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id WHERE prm.payment_request_id = \\'<PAYMENT-REQUEST-ID>\\'').then(r => { console.table(r.rows); process.exit(0); })"
```

Expected:
- Tất cả rows có payment_status = 'paid' ✅
- Tất cả rows có payment_request_id = <your-id> ✅

---

## 🎯 SUCCESS CRITERIA CHECKLIST

**Để PASS BƯỚC 7, cần tất cả điều sau:**

- [ ] Payment request status = 'paid' ✅
- [ ] paid_at timestamp được set ✅
- [ ] available_balance GIẢM 50,000đ ✅
- [ ] total_withdrawn TĂNG 50,000đ ✅
- [ ] Có transaction log type 'payment_deducted' ✅
- [ ] system_conversions có payment_status = 'paid' ✅
- [ ] Verification script hiện "ALL CHECKS PASSED" ✅

**Nếu TẤT CẢ đều pass:**

🎉 **BƯỚC 7 HOÀN THÀNH!**

**Next:** BƯỚC 8 - Fix historical data (payment cũ từ trước khi fix)

---

## ❌ TROUBLESHOOTING

### Issue 1: Không đăng nhập được user

**Solution:**
```bash
# Reset password
node -e "const bcrypt = require('bcrypt'); const db = require('./backend/config/database'); bcrypt.hash('Test123456', 10).then(hash => { return db.pool.query('UPDATE users SET password_hash = \\$1 WHERE email = \\$2', [hash, 'exccbuy@gmail.com']); }).then(() => { console.log('Password reset to: Test123456'); process.exit(0); })"
```

### Issue 2: Không đăng nhập được admin

**Solution:**
```bash
# Tạo admin test
node -e "const bcrypt = require('bcrypt'); const db = require('./backend/config/database'); const crypto = require('crypto'); const userId = crypto.randomUUID(); bcrypt.hash('Admin123456', 10).then(hash => { return db.pool.query('INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at) VALUES (\\$1, \\'admin@test.com\\', \\'admin_test\\', \\$2, \\'Admin Test\\', true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = true RETURNING id, email', [userId, hash]); }).then(r => { console.log('Admin ready:', r.rows[0], '\\nPassword: Admin123456'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); })"
```

### Issue 3: Button "Mark as Paid" không hiện

**Possible causes:**
- Request chưa ở status "confirmed"
- Admin không có quyền
- Frontend cache

**Solution:**
- Verify status trong database
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)

### Issue 4: Click "Mark as Paid" nhưng có lỗi

**Check server logs:**
```bash
# Read last 50 lines of output
tail -50 C:\Users\Z420\AppData\Local\Temp\claude\f--VSCODE-Chatchiu\tasks\bdb530f.output
```

Common errors:
- "Insufficient balance" → Balance không đủ (không nên xảy ra vì đã check)
- "Transaction rolled back" → Có lỗi trong quá trình xử lý
- "Cannot find module" → Thiếu dependencies

### Issue 5: Verification script báo FAIL

**Debug steps:**

1. **Check payment request:**
   ```bash
   node -e "const db = require('./backend/config/database'); db.pool.query('SELECT * FROM payment_requests WHERE id = \\'<ID>\\'').then(r => { console.log(r.rows[0]); process.exit(0); })"
   ```

2. **Check balance:**
   ```bash
   node -e "const db = require('./backend/config/database'); db.pool.query('SELECT * FROM user_system_balance WHERE user_id = (SELECT user_id FROM payment_requests WHERE id = \\'<ID>\\')').then(r => { console.log(r.rows[0]); process.exit(0); })"
   ```

3. **Check transaction log:**
   ```bash
   node -e "const db = require('./backend/config/database'); db.pool.query('SELECT * FROM user_balance_transactions WHERE payment_request_id = \\'<ID>\\'').then(r => { console.table(r.rows); process.exit(0); })"
   ```

---

## 📝 TEST RESULT FORM

**Ngày test:** _______________
**Người test:** _______________

### Test Results:

**Payment Request ID:** _______________

**Balance Before:**
- available_balance: _______________
- total_withdrawn: _______________

**Balance After:**
- available_balance: _______________
- total_withdrawn: _______________

**Verification Script Result:**
- [ ] ✅ ALL CHECKS PASSED
- [ ] ❌ SOME CHECKS FAILED

**Các bước đã hoàn thành:**
- [ ] Đăng nhập user thành công
- [ ] Tạo payment request thành công
- [ ] Admin confirm thành công
- [ ] Admin mark as paid thành công
- [ ] Verification script chạy thành công
- [ ] Balance đã thay đổi đúng
- [ ] Transaction log tồn tại
- [ ] Conversions đã marked

**Kết luận:**
- [ ] PASS - BƯỚC 7 hoàn thành, tiếp tục BƯỚC 8
- [ ] FAIL - Cần debug và test lại

**Ghi chú:**
_______________
_______________
_______________

---

*Created: 2026-01-09*
*Server: http://localhost:3007*
*Test User: exccbuy@gmail.com*
