# PHÂN TÍCH LỖI LOGIC HỆ THỐNG

**Ngày:** 10/01/2026
**Vấn đề:** Logic xử lý payment request SAI HOÀN TOÀN

---

## ❌ LOGIC SAI (HIỆN TẠI)

### Flow hiện tại:

```
1. User tạo payment request 100,000đ
   → INSERT payment_requests (requested_amount = 100,000đ)
   → ❌ KHÔNG trừ user_system_balance

2. Admin mark as paid
   → ✅ TRỪ user_system_balance: available -= 100,000đ
   → ✅ TĂNG total_withdrawn: += 100,000đ
   → ✅ UPDATE system_conversions: payment_status = 'paid' (FIFO)
```

### Vấn đề với logic này:

#### ❌ Vấn đề 1: User có thể tạo NHIỀU requests vượt quá số dư!

**Ví dụ:**
```
Số dư khả dụng: 100,000đ

User tạo request #1: 80,000đ
→ Validation: 80,000đ <= 100,000đ ✅ PASS
→ available_balance = 100,000đ (KHÔNG đổi)

User tạo request #2: 80,000đ (NGAY SAU ĐÓ)
→ Validation: 80,000đ <= 100,000đ ✅ PASS (vì balance chưa trừ!)
→ available_balance = 100,000đ (KHÔNG đổi)

User tạo request #3: 80,000đ
→ Validation: 80,000đ <= 100,000đ ✅ PASS
→ available_balance = 100,000đ (KHÔNG đổi)

Tổng requests: 240,000đ (> 100,000đ số dư!) ❌❌❌

Admin mark paid request #1: 80,000đ
→ available_balance = 20,000đ ✅

Admin mark paid request #2: 80,000đ
→ available_balance = -60,000đ ❌❌❌ ÂM RỒI!
```

#### ❌ Vấn đề 2: Số dư hiển thị KHÔNG ĐÚNG cho user

```
User có: 100,000đ
User tạo request: 80,000đ
→ User NGHĨ rằng còn: 20,000đ (đã lock 80,000đ)
→ Nhưng UI vẫn hiển thị: 100,000đ ❌

→ User bối rối, không biết còn bao nhiêu để dùng
```

#### ❌ Vấn đề 3: Cancel request KHÔNG có tác dụng

```
User tạo request: 80,000đ
→ Balance không đổi

User cancel request:
→ Balance không đổi

→ Chức năng cancel VÔ NGHĨA!
```

---

## ✅ LOGIC ĐÚNG (NÊN LÀM)

### Option A: RESERVE khi tạo request (KHUYẾN NGHỊ)

```
1. User tạo payment request 100,000đ
   → INSERT payment_requests (requested_amount = 100,000đ)
   → ✅ TRỪ available_balance: -= 100,000đ
   → ✅ CỘNG reserved_balance: += 100,000đ (hoặc chỉ trừ available)
   → Status: pending

2. Admin mark as paid
   → ✅ TRỪ reserved_balance: -= 100,000đ (nếu có dùng reserved)
   → ✅ TĂNG total_withdrawn: += 100,000đ
   → ✅ UPDATE system_conversions: payment_status = 'paid'
   → Status: paid

3. User cancel request
   → ✅ CỘNG lại available_balance: += 100,000đ
   → ✅ TRỪ reserved_balance: -= 100,000đ (nếu có dùng reserved)
   → Status: cancelled
```

**Ưu điểm:**
- ✅ User KHÔNG THỂ tạo requests vượt quá số dư
- ✅ Số dư hiển thị CHÍNH XÁC (đã trừ requests pending)
- ✅ Cancel có tác dụng (trả lại số dư)
- ✅ Admin mark paid chỉ là chuyển trạng thái

**Code cần sửa:**

```javascript
// 1. CREATE REQUEST: Phải TRỪ balance
async createPaymentRequest() {
  // Validate
  const balance = await BalanceManagementService.getUserBalance(userId);
  if (requestedAmount > balance.available_balance) {
    throw Error('Số dư không đủ');
  }

  await client.query('BEGIN');

  // CREATE request
  const paymentRequest = await PaymentRequest.create({...});

  // 🔥 TRỪ BALANCE NGAY
  await client.query(`
    UPDATE user_system_balance
    SET available_balance = available_balance - $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
  `, [userId, requestedAmount]);

  await client.query('COMMIT');
}

// 2. MARK AS PAID: Chỉ update status + conversions
async markAsPaid() {
  await client.query('BEGIN');

  // Update payment_requests status
  UPDATE payment_requests SET status = 'paid' WHERE id = ...

  // ❌ KHÔNG TRỪ balance (đã trừ lúc create rồi!)
  // Nhưng phải update total_withdrawn
  await client.query(`
    UPDATE user_system_balance
    SET total_withdrawn = total_withdrawn + $2
    WHERE user_id = $1
  `, [userId, requestedAmount]);

  // Update conversions payment_status
  UPDATE system_conversions SET payment_status = 'paid' WHERE ...

  await client.query('COMMIT');
}

// 3. CANCEL REQUEST: Phải HOÀN TRẢ balance
async cancelPaymentRequest() {
  const paymentRequest = await PaymentRequest.findById(id);

  if (paymentRequest.status !== 'pending') {
    throw Error('Chỉ hủy được request pending');
  }

  await client.query('BEGIN');

  // Update status
  UPDATE payment_requests SET status = 'cancelled' WHERE id = ...

  // 🔥 HOÀN TRẢ BALANCE
  await client.query(`
    UPDATE user_system_balance
    SET available_balance = available_balance + $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
  `, [userId, paymentRequest.requested_amount]);

  await client.query('COMMIT');
}
```

---

### Option B: Tính available_balance trừ requests pending

```javascript
// Không đổi flow create/cancel/markpaid
// Nhưng đổi cách TÍNH available_balance

static async getUserBalance(userId) {
  const query = `
    SELECT
      usb.total_earned,
      usb.total_withdrawn,
      -- Trừ cả requests đang pending/confirmed
      COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'confirmed')
      ), 0) as pending_withdrawal,
      usb.total_earned - usb.total_withdrawn - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'confirmed')
      ), 0) as available_balance
    FROM user_system_balance usb
    WHERE usb.user_id = $1
  `;

  const result = await pool.query(query, [userId]);
  return result.rows[0];
}
```

**Ưu điểm:**
- ✅ Không cần UPDATE user_system_balance khi create/cancel
- ✅ Đơn giản hơn

**Nhược điểm:**
- ❌ Phức tạp khi query
- ❌ Khó verify consistency

---

## 🔍 PHÂN TÍCH DỮ LIỆU HIỆN TẠI

### Từ kết quả verify script:

```
user_system_balance:
  available_balance: 34,300đ
  total_earned: 93,100đ
  total_withdrawn: 58,800đ

payment_requests:
  paid: 2 requests, 150,000đ
  cancelled: 1 request, 50,000đ

system_conversions:
  approved + NULL payment_status: 70,000đ
  approved + paid payment_status: 133,100đ
```

### Vấn đề phát hiện:

#### ❌ total_withdrawn ≠ payment_requests(paid)

```
total_withdrawn = 58,800đ
payment_requests(paid) = 150,000đ
Chênh lệch: -91,200đ
```

**Nguyên nhân:**
- Code HIỆN TẠI trong `markAsPaid()` có gọi `deductBalance()`
- Nhưng có thể:
  1. Một số requests được mark paid TRƯỚC KHI có code deductBalance
  2. Code có bug không update total_withdrawn đúng
  3. Có manual update database

### ✅ Công thức ĐÚNG phải thỏa mãn:

```
available_balance = total_earned - total_withdrawn - pending_requests

Hoặc nếu reserve khi create:
available_balance = total_earned - total_withdrawn - pending_requests
total_withdrawn chỉ tăng khi mark paid
```

**Verification:**
```
34,300đ = 93,100đ - 58,800đ - 0đ ✅ (không có pending)

Nhưng:
total_withdrawn (58,800đ) ≠ sum(paid_requests) (150,000đ) ❌❌❌
```

→ Có requests được mark paid KHÔNG UPDATE total_withdrawn đúng!

---

## 📌 KẾT LUẬN

### Logic SAI:

1. ❌ Tạo request KHÔNG trừ balance → User có thể spam requests
2. ❌ Mark paid mới trừ balance → Quá muộn, user đã nhầm lẫn
3. ❌ Cancel không trả lại balance → Vô nghĩa
4. ❌ total_withdrawn không khớp payment_requests(paid) → Data inconsistent

### Logic ĐÚNG phải là:

```
✅ CREATE request → TRỪ available_balance (reserve/lock)
✅ CANCEL request → CỘNG lại available_balance (release)
✅ MARK PAID → Update total_withdrawn, update conversions payment_status
✅ available_balance = Số dư THỰC SỰ có thể dùng (đã trừ requests pending)
```

### Database phải đảm bảo:

```
✅ total_withdrawn = SUM(payment_requests WHERE status = 'paid')
✅ available_balance = total_earned - total_withdrawn - SUM(payment_requests WHERE status IN ('pending', 'confirmed'))
✅ system_conversions(paid) amount ≈ total_withdrawn (có thể chênh vì rounding)
```

---

## 🚀 HÀNH ĐỘNG CẦN LÀM

### 1. FIX DATA (cleanup hiện tại)

```sql
-- Tính lại total_withdrawn từ payment_requests
UPDATE user_system_balance usb
SET total_withdrawn = (
  SELECT COALESCE(SUM(requested_amount), 0)
  FROM payment_requests
  WHERE user_id = usb.user_id
    AND status = 'paid'
),
available_balance = total_earned - (
  SELECT COALESCE(SUM(requested_amount), 0)
  FROM payment_requests
  WHERE user_id = usb.user_id
    AND status = 'paid'
)
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
```

### 2. FIX CODE (sửa logic)

**File cần sửa:**
- `backend/services/paymentRequestService.js`:
  - `createPaymentRequest()`: Thêm UPDATE user_system_balance (trừ available)
  - `cancelPaymentRequest()`: Thêm UPDATE user_system_balance (cộng lại available)
  - `markAsPaid()`: BỎ `deductBalance()`, CHỈ update total_withdrawn

- `backend/services/systemReconciliation/BalanceManagementService.js`:
  - `getUserBalance()`: Có thể giữ nguyên hoặc thêm trừ pending requests

### 3. TEST kỹ lưỡng

Test cases:
1. User tạo request → Balance giảm
2. User tạo request thứ 2 → Validate đúng (balance đã giảm)
3. User cancel request → Balance tăng lại
4. Admin mark paid → total_withdrawn tăng, conversions updated
5. Verify: total_withdrawn = SUM(paid requests)

---

**Date:** 10/01/2026
**Status:** ❌ LOGIC SAI - CẦN FIX TOÀN BỘ
**Severity:** CRITICAL - Ảnh hưởng trực tiếp đến tiền
**Recommendation:** FIX NGAY theo Option A (Reserve khi create)
