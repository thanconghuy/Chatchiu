# Hướng Dẫn Test Payment Module V2.0

**Ngày:** 10/01/2026
**Trạng thái:** ✅ **HOÀN TẤT - SẴN SÀNG TEST**

---

## 🎯 Tóm Tắt Thay Đổi

### Vấn Đề Cũ:
- ❌ Tạo yêu cầu thanh toán KHÔNG trừ số dư → user có thể spam request vượt quá số dư
- ❌ Hủy yêu cầu KHÔNG hoàn lại số dư → user mất tiền
- ❌ Đánh dấu đã thanh toán MỚI trừ số dư → trừ 2 lần, lỗi logic

### Logic Mới (Đúng):
- ✅ **Tạo request** → TRỪ số dư ngay (reserve/khóa tiền)
- ✅ **Hủy request** → HOÀN lại số dư (release/mở khóa)
- ✅ **Đánh dấu đã thanh toán** → CHỈ ghi nhận (không trừ nữa, đã trừ lúc tạo)

---

## 📋 Các Thay Đổi Chính

### 1. Database (Migrations Đã Chạy Thành Công)

**Migration 060:** Thêm idempotency vào payment_requests
- Cột `idempotency_key` (UUID) - Ngăn tạo trùng
- Cột `reserve_balance_at` - Thời điểm khóa tiền
- Cột `release_balance_at` - Thời điểm mở khóa

**Migration 061:** Tạo bảng balance_transactions
- Ghi lại TOÀN BỘ thay đổi số dư
- Audit trail đầy đủ
- Các loại: payment_reserved, payment_released, payment_withdrawn, reconciliation_earned

**Migration 062:** Tạo trigger tự động log
- Tự động ghi log khi số dư thay đổi
- Không cần code thủ công

### 2. Backend Code

**Middleware Mới:**
- `idempotency.js` - Kiểm tra Idempotency-Key header

**Services Viết Lại:**
- `BalanceManagementService.js` - 3 methods mới:
  - `reserveBalance()` - Khóa tiền khi tạo request
  - `releaseBalance()` - Mở khóa khi hủy/reject
  - `recordWithdrawal()` - Ghi nhận khi đã thanh toán

- `PaymentRequestService.js` - Toàn bộ logic mới:
  - `createPaymentRequest()` - Tạo + khóa tiền
  - `cancelPaymentRequest()` - Hủy + hoàn tiền
  - `markAsPaid()` - Đánh dấu đã thanh toán (không trừ tiền)
  - `confirmPaymentRequest()` - Xác nhận (không đổi số dư)
  - `rejectPaymentRequest()` - Từ chối + hoàn tiền

**Routes Cập Nhật:**
- POST `/api/payment-requests` - Yêu cầu Idempotency-Key header
- DELETE `/api/payment-requests/:id` - Tự động hoàn tiền khi hủy

### 3. Frontend

**File:** `frontend/js/payment-requests.js`
- Tự động sinh UUID cho mỗi request
- Gửi `Idempotency-Key` header

---

## 🧪 Test Cases

### TC1: Tạo Yêu cầu Thanh Toán

**Các bước:**
1. Login vào tài khoản user
2. Vào trang "Yêu cầu thanh toán"
3. Kiểm tra số dư khả dụng hiện tại (VD: 100,000đ)
4. Tạo yêu cầu mới: 50,000đ

**Kết quả mong đợi:**
- ✅ Request tạo thành công
- ✅ Số dư khả dụng giảm xuống 50,000đ (100,000 - 50,000)
- ✅ Trong database:
  ```sql
  -- Kiểm tra payment_requests
  SELECT idempotency_key, reserve_balance_at FROM payment_requests WHERE id = '[request_id]';
  -- Phải có idempotency_key và reserve_balance_at

  -- Kiểm tra balance_transactions
  SELECT * FROM balance_transactions WHERE payment_request_id = '[request_id]';
  -- Phải có 1 record: transaction_type = 'payment_reserved', amount = -50000
  ```

---

### TC2: Ngăn Tạo Trùng (Idempotency)

**Các bước:**
1. Mở Developer Tools (F12) → Network tab
2. Tạo request thanh toán
3. Trong Network tab, tìm request POST `/api/payment-requests`
4. Click chuột phải → Copy → Copy as fetch
5. Paste vào Console và chạy lại (hoặc dùng Postman với cùng Idempotency-Key)

**Kết quả mong đợi:**
- ✅ Request thứ 2 trả về CÙNG 1 payment request
- ✅ KHÔNG tạo record mới
- ✅ KHÔNG trừ tiền thêm lần nữa

---

### TC3: Ngăn Request Vượt Số Dư

**Các bước:**
1. Kiểm tra số dư khả dụng (VD: 100,000đ)
2. Thử tạo request: 150,000đ (lớn hơn số dư)

**Kết quả mong đợi:**
- ✅ Lỗi: "Số dư không đủ. Khả dụng: 100,000đ, Yêu cầu: 150,000đ"
- ✅ Không tạo được request
- ✅ Số dư không đổi

---

### TC4: Hủy Yêu Cầu

**Các bước:**
1. Tạo request: 50,000đ
2. Kiểm tra số dư giảm xuống
3. Click nút "Hủy" yêu cầu vừa tạo
4. Xác nhận hủy

**Kết quả mong đợi:**
- ✅ Request chuyển sang trạng thái "Đã hủy"
- ✅ Số dư khả dụng TĂNG lên 50,000đ (hoàn tiền)
- ✅ Trong database:
  ```sql
  SELECT * FROM balance_transactions
  WHERE payment_request_id = '[request_id]'
  ORDER BY created_at DESC;
  -- Phải có 2 records:
  -- 1. payment_reserved: -50000
  -- 2. payment_released: +50000
  ```

---

### TC5: Không Thể Hủy Request Đã Xác Nhận

**Các bước:**
1. User tạo request
2. Admin xác nhận request (status = confirmed)
3. User thử hủy

**Kết quả mong đợi:**
- ✅ Lỗi: "Chỉ có thể hủy yêu cầu đang chờ xử lý. Trạng thái hiện tại: confirmed"

---

### TC6: Admin Đánh Dấu Đã Thanh Toán

**Các bước:**
1. User tạo request: 50,000đ
2. Ghi nhớ:
   - `available_balance` (đã giảm 50,000)
   - `total_withdrawn` (chưa đổi)
3. Admin vào admin panel
4. Đánh dấu request là "Đã thanh toán"
5. Nhập mã giao dịch ngân hàng

**Kết quả mong đợi:**
- ✅ Request chuyển sang "Đã thanh toán"
- ✅ `available_balance` KHÔNG ĐỔI (đã trừ lúc tạo request)
- ✅ `total_withdrawn` TĂNG 50,000đ
- ✅ Các conversion được đánh dấu paid theo FIFO
- ✅ Email gửi cho user
- ✅ Trong database:
  ```sql
  SELECT * FROM balance_transactions
  WHERE payment_request_id = '[request_id]'
  AND transaction_type = 'payment_withdrawn';
  -- Phải có 1 record
  ```

---

### TC7: Admin Xác Nhận Request

**Các bước:**
1. User tạo request (status = pending)
2. Admin xác nhận

**Kết quả mong đợi:**
- ✅ Status → confirmed
- ✅ Số dư KHÔNG ĐỔI (đã reserve lúc tạo)
- ✅ Email xác nhận gửi cho user

---

### TC8: Admin Từ Chối Request

**Các bước:**
1. User tạo request: 50,000đ (số dư giảm)
2. Admin từ chối với lý do
3. Kiểm tra số dư user

**Kết quả mong đợi:**
- ✅ Status → rejected
- ✅ Số dư TĂNG lên 50,000đ (hoàn tiền)
- ✅ Email từ chối gửi cho user
- ✅ Database có log payment_released

---

### TC9: Kiểm Tra Audit Trail

**Các bước:**
1. Thực hiện chuỗi: Tạo → Hủy → Tạo lại → Đánh dấu đã thanh toán
2. Query database:
  ```sql
  SELECT
    transaction_type,
    amount,
    balance_before,
    balance_after,
    created_at
  FROM balance_transactions
  WHERE user_id = '[user_id]'
  ORDER BY created_at DESC;
  ```

**Kết quả mong đợi:**
- ✅ Thấy đầy đủ lịch sử:
  1. payment_reserved: -50000
  2. payment_released: +50000
  3. payment_reserved: -50000
  4. payment_withdrawn: -50000
- ✅ balance_before và balance_after đúng
- ✅ Running total khớp với số dư hiện tại

---

### TC10: Trigger Tự Động Log

**Các bước:**
1. Vào database, chạy:
  ```sql
  UPDATE user_system_balance
  SET available_balance = available_balance + 10000
  WHERE user_id = '[user_id]';
  ```
2. Kiểm tra `balance_transactions`

**Kết quả mong đợi:**
- ✅ Trigger tự động tạo log entry
- ✅ Auto-detect đúng transaction_type

---

## 📊 Công Thức Số Dư

### Trước Đây (SAI):
```
available_balance = total_earned - total_withdrawn
❌ Không tính pending requests → user spam được
```

### Bây Giờ (ĐÚNG):
```
available_balance = total_earned - total_withdrawn - pending_reserved

Cách hoạt động:
1. Tạo request → available_balance -= amount (khóa)
2. Hủy request → available_balance += amount (mở khóa)
3. Đã thanh toán → total_withdrawn += amount (available không đổi)
```

---

## 🔍 Câu Lệnh SQL Hữu Ích

### Kiểm tra số dư user
```sql
SELECT
  user_id,
  available_balance,
  total_earned,
  total_withdrawn,
  (total_earned - total_withdrawn) as should_be_available
FROM user_system_balance
WHERE user_id = '[user_id]';
```

### Xem tất cả transactions của user
```sql
SELECT
  transaction_type,
  amount,
  balance_before,
  balance_after,
  payment_request_id,
  description,
  created_at
FROM balance_transactions
WHERE user_id = '[user_id]'
ORDER BY created_at DESC;
```

### Kiểm tra pending requests
```sql
SELECT
  id,
  requested_amount,
  status,
  reserve_balance_at,
  release_balance_at,
  created_at
FROM payment_requests
WHERE user_id = '[user_id]'
AND status IN ('pending', 'confirmed')
ORDER BY created_at DESC;
```

### Tính tổng pending amount
```sql
SELECT
  COUNT(*) as pending_count,
  COALESCE(SUM(requested_amount), 0) as pending_amount
FROM payment_requests
WHERE user_id = '[user_id]'
AND status IN ('pending', 'confirmed')
AND cancelled_at IS NULL;
```

---

## 🎯 Checklist Test

Đánh dấu khi đã test xong:

- [ ] TC1: Tạo request → số dư giảm ngay
- [ ] TC2: Idempotency ngăn duplicate
- [ ] TC3: Không cho request vượt số dư
- [ ] TC4: Hủy request → hoàn tiền
- [ ] TC5: Không hủy được request đã confirm
- [ ] TC6: Admin mark paid → total_withdrawn tăng, available không đổi
- [ ] TC7: Admin confirm → không đổi số dư
- [ ] TC8: Admin reject → hoàn tiền
- [ ] TC9: Audit trail đầy đủ
- [ ] TC10: Trigger tự động log

---

## 📁 Files Đã Thay Đổi

### Backend
- `backend/migrations/060_add_idempotency_to_payment_requests.sql` ✅
- `backend/migrations/061_create_balance_transactions.sql` ✅
- `backend/migrations/062_create_balance_trigger.sql` ✅
- `backend/middleware/idempotency.js` ✅ NEW
- `backend/services/systemReconciliation/BalanceManagementService.js` ✅ REDESIGNED
- `backend/services/paymentRequestService.js` ✅ REDESIGNED
- `backend/routes/paymentRequest.js` ✅ UPDATED

### Frontend
- `frontend/js/payment-requests.js` ✅ UPDATED

### Backups (Có thể rollback)
- `backend/services/systemReconciliation/BalanceManagementService.OLD.js`
- `backend/services/paymentRequestService.OLD.js`

### Git Backup
- Tag: `v2.0.0-before-payment-redesign`
- Commit: `8410400`

---

## 🚨 Rollback Nếu Cần

Nếu có vấn đề nghiêm trọng:

```bash
# 1. Rollback code
git reset --hard v2.0.0-before-payment-redesign

# 2. Rollback database (cẩn thận!)
# Chạy các migration ngược lại (tạo file rollback nếu cần)
```

---

## ✅ Kết Luận

**Tất cả đã hoàn tất và sẵn sàng test!**

Logic mới đảm bảo:
- ✅ Số dư khóa ngay khi tạo request
- ✅ Hoàn tiền khi hủy/reject
- ✅ Không trừ 2 lần
- ✅ Ngăn duplicate requests
- ✅ Audit trail đầy đủ
- ✅ ACID transactions

---

**Chúc test thành công! 🎉**
