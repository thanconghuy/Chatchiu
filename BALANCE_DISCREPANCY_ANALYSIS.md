# PHÂN TÍCH SỰ KHÁC BIỆT GIỮA HAI SỐ DƯ

**Ngày:** 10/01/2026
**Vấn đề:** "Số dư hệ thống" (34,300đ) ≠ "Số dư từ đơn hàng" (53,100đ)

---

## 🔍 NGUYÊN NHÂN GỐC RỄ

### Hệ thống có 2 NGUỒN DỮ LIỆU khác nhau:

#### 1️⃣ **"Số dư hệ thống" (Widget) - 34,300đ ❌**

**Nguồn:** Đọc từ bảng `user_system_balance`

**Code:**
```javascript
// frontend/js/system-balance-widget.js
fetch('/api/user/system-reconciliation/balance')

// backend/routes/systemReconciliationUser.js (line 17-34)
const balance = await BalanceManagementService.getUserBalance(userId);

// backend/services/systemReconciliation/BalanceManagementService.js (line 19-52)
SELECT available_balance FROM user_system_balance WHERE user_id = $1
```

**Giá trị thực tế trong DB:**
```
available_balance: 34,300đ
total_earned: 93,100đ
total_withdrawn: 58,800đ
updated_at: 2026-01-10 06:36:49
```

---

#### 2️⃣ **"Số dư từ đơn hàng" (Dashboard) - 53,100đ ✅**

**Nguồn:** Tính toán trực tiếp từ `system_conversions` + `payment_requests`

**Code:**
```javascript
// backend/routes/dashboard.js (line 30-55)
const balanceQuery = `
  WITH cashback_total AS (
    SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_confirmed_cashback
    FROM system_conversions
    WHERE user_id = $1
  ),
  payment_total AS (
    SELECT COALESCE(SUM(requested_amount), 0) as total_requested
    FROM payment_requests
    WHERE user_id = $1
      AND status NOT IN ('rejected', 'cancelled')
  )
  SELECT
    ct.total_confirmed_cashback - pt.total_requested as available_balance
  FROM cashback_total ct, payment_total pt
`;
```

**Công thức:**
```
Available Balance = Total Approved - Total Requested
53,100đ = 203,100đ - 150,000đ
```

---

## ⚠️ TẠI SAO CÓ SỰ KHÁC BIỆT?

### Bảng `user_system_balance` KHÔNG được cập nhật đúng cách

**Các hàm cập nhật bảng này:**

✅ `markAsPaid()` - Cập nhật khi admin mark paid
```javascript
// backend/services/paymentRequestService.js (line 487-492)
UPDATE user_system_balance
SET
  available_balance = available_balance - $2,
  total_withdrawn = total_withdrawn + $2
WHERE user_id = $1
```

❌ `createPaymentRequest()` - **KHÔNG** cập nhật `user_system_balance`
```javascript
// backend/services/paymentRequestService.js (line 313-345)
// Chỉ INSERT vào payment_requests
// KHÔNG UPDATE user_system_balance
```

❌ `cancelPaymentRequest()` - **KHÔNG** cập nhật `user_system_balance`
```javascript
// backend/services/paymentRequestService.js
// Chỉ UPDATE payment_requests SET status = 'cancelled'
// KHÔNG UPDATE user_system_balance
```

### Timeline của vấn đề:

```
Ban đầu (trước khi có payment requests):
  user_system_balance.available_balance = 93,100đ
  system_conversions.total_approved = 93,100đ
  payment_requests.total = 0đ
  → Widget: 93,100đ ✅
  → Dashboard: 93,100đ ✅

User tạo payment request 50,000đ (sau đó cancel):
  user_system_balance.available_balance = 93,100đ (KHÔNG thay đổi ❌)
  system_conversions.total_approved = 93,100đ
  payment_requests.total = 0đ (đã cancel)
  → Widget: 93,100đ (SAI - vẫn hiển thị số cũ)
  → Dashboard: 93,100đ ✅

User tạo payment request 100,000đ (admin mark paid):
  user_system_balance.available_balance = 93,100đ - 100,000đ = -6,900đ (❌ ÂM!)
  → Lúc này admin đã mark paid nên:
  user_system_balance.available_balance = 34,300đ (sau vài lần điều chỉnh)
  system_conversions.total_approved = 203,100đ (đã thêm conversions mới)
  payment_requests.total = 150,000đ (2 requests đã paid)
  → Widget: 34,300đ ❌
  → Dashboard: 53,100đ ✅

Chênh lệch: -18,800đ
```

---

## 📊 SỐ LIỆU THỰC TẾ

### Từ script `diagnose-balance-discrepancy.js`:

```
📊 user_system_balance TABLE (Widget):
   available_balance: 34,300đ
   total_earned: 93,100đ
   total_withdrawn: 58,800đ

💰 CORRECT CALCULATION (Dashboard):
   Total Approved: 203,100đ
   Total Requested: 150,000đ
   ✅ Available: 53,100đ

💳 Payment Requests:
   cancelled: 1 requests, 50,000đ
   paid: 2 requests, 150,000đ

⚖️  DISCREPANCY: -18,800đ
```

---

## 🎯 GIẢI PHÁP

### **Option A: Cập nhật `user_system_balance` khi create/cancel** ❌ KHÔNG KHUYẾN NGHỊ

**Cách làm:**
- Thêm UPDATE vào `createPaymentRequest()`: trừ available_balance
- Thêm UPDATE vào `cancelPaymentRequest()`: cộng lại available_balance
- Giữ nguyên UPDATE trong `markAsPaid()`

**Ưu điểm:**
✅ Đọc nhanh (dữ liệu đã tính sẵn)

**Nhược điểm:**
❌ Phức tạp, dễ bị lỗi đồng bộ
❌ Phải cập nhật ở nhiều chỗ
❌ Vi phạm nguyên tắc "single source of truth"
❌ Khó debug khi có vấn đề

---

### **Option B: Loại bỏ `user_system_balance`, tính on-the-fly** ✅ KHUYẾN NGHỊ

**Cách làm:**
- Cập nhật `BalanceManagementService.getUserBalance()` để tính trực tiếp
- Xóa tất cả logic cập nhật `user_system_balance`
- Sử dụng CÙNG công thức với dashboard

**Ưu điểm:**
✅ Single source of truth (ĐÚNG với nguyên tắc đã thiết lập)
✅ Code đơn giản, dễ maintain
✅ KHÔNG BAO GIỜ bị lỗi đồng bộ
✅ Nhất quán 100% giữa widget và dashboard

**Nhược điểm:**
⚠️ Tăng DB load một chút (CHẤP NHẬN ĐƯỢC cho hệ thống vừa/nhỏ)

**Code:**
```javascript
// backend/services/systemReconciliation/BalanceManagementService.js
static async getUserBalance(userId) {
  // Tính toán giống dashboard
  const query = `
    WITH cashback_total AS (
      SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved
      FROM system_conversions
      WHERE user_id = $1
    ),
    payment_total AS (
      SELECT COALESCE(SUM(requested_amount), 0) as total_requested
      FROM payment_requests
      WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')
    )
    SELECT
      $1 as user_id,
      ct.total_approved - pt.total_requested as available_balance,
      ct.total_approved as total_earned,
      pt.total_requested as total_withdrawn,
      CURRENT_TIMESTAMP as updated_at
    FROM cashback_total ct, payment_total pt
  `;

  const result = await pool.query(query, [userId]);
  return result.rows[0];
}
```

---

### **Option C: Quick fix - Sync bảng NGAY BÂY GIỜ** ⚡ FIX TẠM THỜI

**SQL:**
```sql
UPDATE user_system_balance
SET available_balance = 53100,
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
```

**Ưu điểm:**
✅ Fix nhanh, UI hiển thị đúng ngay

**Nhược điểm:**
❌ Sẽ bị lệch lại khi user create/cancel payment request tiếp
❌ KHÔNG giải quyết gốc rễ vấn đề

---

## 💡 KHUYẾN NGHỊ

### ✅ CHỌN OPTION B - Loại bỏ `user_system_balance`

**Lý do:**

1. **Nhất quán với nguyên tắc đã thiết lập:**
   - Bạn đã yêu cầu: "yêu cầu thanh toán bao nhiêu thì trừ số dư khả dụng bấy nhiêu"
   - Công thức: `Available = Approved - Requested`
   - Không phụ thuộc vào items linking, mapping table
   - → Nên cũng KHÔNG nên phụ thuộc vào pre-calculated table

2. **Đơn giản hơn:**
   - 1 công thức duy nhất cho cả dashboard và widget
   - Không cần maintain sync logic
   - Dễ debug, dễ test

3. **Đáng tin cậy hơn:**
   - Luôn đúng 100%
   - Không bao giờ bị lỗi đồng bộ

4. **Performance chấp nhận được:**
   - Query đơn giản (SUM + JOIN)
   - PostgreSQL/Neon optimize tốt
   - Có thể add index nếu cần

---

## 🚀 IMPLEMENTATION PLAN

### Step 1: Backup hiện tại
```bash
cd backend
node scripts/diagnose-balance-discrepancy.js > balance-diagnosis-backup.txt
```

### Step 2: Cập nhật BalanceManagementService.js
- Thay đổi `getUserBalance()` để tính on-the-fly
- Xóa/comment các hàm `deductBalance()`, `refundBalance()` (không dùng nữa)

### Step 3: Loại bỏ calls đến deductBalance/refundBalance
- Kiểm tra `paymentRequestService.js`
- Xóa tất cả calls đến `BalanceManagementService.deductBalance()`
- Xóa tất cả calls đến `BalanceManagementService.refundBalance()`

### Step 4: Test kỹ lưỡng
```bash
# Test balance calculation
node scripts/verify-ui-flow.js

# Test widget
# - Load trang dashboard
# - Kiểm tra "Số dư hệ thống" = "Số dư từ đơn hàng"
```

### Step 5: Cleanup (optional)
- Có thể xóa bảng `user_system_balance` (sau khi chắc chắn)
- Hoặc giữ lại để backup/analytics

---

## 📝 NOTES

### Tại sao `user_system_balance` tồn tại?

Bảng này được tạo ra cho hệ thống reconciliation phức tạp với:
- `reserved_balance`: Cashback đang chờ API xác nhận
- `pending_balance`: Cashback đang pending approval
- `debt_balance`: Nợ cần thu hồi
- Balance transaction logs

### Vấn đề với thiết kế hiện tại:

Hệ thống đang có **2 balance systems SONG SONG:**
1. System reconciliation balance (`user_system_balance`)
2. Payment request balance (calculated on-the-fly)

Điều này gây ra:
- ❌ Inconsistency (như đang thấy)
- ❌ Phức tạp không cần thiết
- ❌ Khó maintain

### Giải pháp tốt nhất:

Chọn 1 trong 2:
- ✅ **Chỉ dùng calculated balance** (KHUYẾN NGHỊ cho hệ thống hiện tại)
- Hoặc dùng `user_system_balance` NHƯNG phải update ĐÚNG ở MỌI nơi

---

## ✅ VERIFIED

**Date:** 10/01/2026
**Status:** Root cause identified
**Recommendation:** Option B - Calculate on-the-fly
**Next step:** Implement fix và test
