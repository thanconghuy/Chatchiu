# Fix Button "Tạo yêu cầu thanh toán" bị Disabled

**Date:** 2026-01-16
**Issue:** Button tạo yêu cầu thanh toán bị disable dù số dư khả dụng đủ
**Root Cause:** Logic eligibility check sai - chặn tạo request mới khi có pending requests

---

## 🐛 Vấn đề

### Triệu chứng
- User có số dư khả dụng: **114,300đ**
- Đã tối thiểu: **50,000đ**
- Có 3 yêu cầu đang pending (40,000đ x 3 = 120,000đ)
- Button "Tạo yêu cầu thanh toán" bị **DISABLED**
- Lý do hiển thị: "Có 3 yêu cầu đang chờ xử lý"

### Tại sao sai?

**Logic CŨ (SAI):**
```javascript
const isEligible = (
  availableBalance >= minAmount &&
  debt === 0 &&
  pendingCount === 0  // ← SAI: Chặn vì có pending requests
);
```

**Vấn đề:**
- Khi tạo pending request, balance **ĐÃ ĐƯỢC RESERVE**
- `available_balance` đã **TRỪ ĐI** số tiền pending
- Ví dụ:
  - Total earned: 234,300đ
  - Pending reserved: 120,000đ (3 requests x 40,000đ)
  - Available balance: 114,300đ ✅ (đã trừ pending)

→ Không cần check `pendingCount === 0` vì `available_balance` đã phản ánh đúng số dư có thể rút!

---

## ✅ Giải pháp

### File: `backend/services/paymentRequestService.js`

**Dòng 658-666: Updated Logic**

**BEFORE (SAI):**
```javascript
const isEligible = (
  availableBalance >= minAmount &&
  debt === 0 &&
  pendingCount === 0  // ← Chặn vì có pending requests
);
```

**AFTER (ĐÚNG):**
```javascript
// FIXED: Cho phép tạo request mới nếu còn đủ số dư khả dụng
// Không chặn vì có pending requests (vì balance đã được reserve)
const isEligible = (
  availableBalance >= minAmount &&
  debt === 0
  // REMOVED: pendingCount === 0
  // Lý do: Balance đã được reserve khi tạo pending request,
  // nên available_balance đã phản ánh đúng số dư có thể rút
);
```

**Dòng 687-691: Updated Reasons**

**BEFORE:**
```javascript
reasons: isEligible ? [] : [
  availableBalance < minAmount && `Số dư khả dụng thấp hơn mức tối thiểu...`,
  debt > 0 && `Có khoản nợ chưa thanh toán...`,
  pendingCount > 0 && `Có ${pendingCount} yêu cầu đang chờ xử lý`  // ← XÓA
].filter(Boolean)
```

**AFTER:**
```javascript
reasons: isEligible ? [] : [
  availableBalance < minAmount && `Số dư khả dụng thấp hơn mức tối thiểu...`,
  debt > 0 && `Có khoản nợ chưa thanh toán...`
  // REMOVED: pendingCount check from reasons
].filter(Boolean)
```

---

## 🧪 Test Scenario

### Scenario 1: User có pending requests

**User Balance:**
- Total earned: 234,300đ
- Pending reserved: 120,000đ (3 requests @ 40,000đ)
- Available: 114,300đ

**Old Logic:**
- `pendingCount = 3` → **isEligible = false** ❌
- Button: **DISABLED**
- Reason: "Có 3 yêu cầu đang chờ xử lý"

**New Logic:**
- `availableBalance = 114,300đ >= 50,000đ` → **isEligible = true** ✅
- Button: **ENABLED**
- User có thể tạo request mới (ví dụ: 100,000đ)

### Scenario 2: User không đủ số dư

**User Balance:**
- Total earned: 234,300đ
- Pending reserved: 190,000đ
- Available: 44,300đ

**Logic:**
- `availableBalance = 44,300đ < 50,000đ` → **isEligible = false** ✅
- Button: **DISABLED** (đúng)
- Reason: "Số dư khả dụng thấp hơn mức tối thiểu (50,000đ)"

### Scenario 3: User có nợ

**User Balance:**
- Available: 200,000đ
- Debt: 10,000đ

**Logic:**
- `debt = 10,000đ > 0` → **isEligible = false** ✅
- Button: **DISABLED** (đúng)
- Reason: "Có khoản nợ chưa thanh toán (10,000đ)"

---

## 📊 Impact Analysis

### Trước khi fix (OLD)

| Total Earned | Pending Reserved | Available | Pending Count | isEligible | Button |
|-------------|------------------|-----------|---------------|-----------|---------|
| 234,300đ | 0đ | 234,300đ | 0 | ✅ TRUE | ENABLED |
| 234,300đ | 120,000đ | 114,300đ | 3 | ❌ FALSE | **DISABLED** |
| 100,000đ | 60,000đ | 40,000đ | 2 | ❌ FALSE | **DISABLED** |

→ User không thể tạo request mới nếu có bất kỳ pending request nào!

### Sau khi fix (NEW)

| Total Earned | Pending Reserved | Available | Pending Count | isEligible | Button |
|-------------|------------------|-----------|---------------|-----------|---------|
| 234,300đ | 0đ | 234,300đ | 0 | ✅ TRUE | ENABLED |
| 234,300đ | 120,000đ | 114,300đ | 3 | ✅ TRUE | **ENABLED** ✓ |
| 100,000đ | 60,000đ | 40,000đ | 2 | ❌ FALSE | DISABLED |

→ User có thể tạo request mới miễn là còn đủ available balance!

---

## 🔐 Reserve/Release Pattern Validation

### Flow hiện tại (CORRECT)

1. **User tạo payment request (40,000đ):**
   ```sql
   available_balance = available_balance - 40,000
   pending_balance = pending_balance + 40,000
   ```
   - Available: 234,300đ → 194,300đ ✓
   - Pending: 0đ → 40,000đ ✓

2. **User tạo request thứ 2 (40,000đ):**
   ```sql
   available_balance = available_balance - 40,000
   pending_balance = pending_balance + 40,000
   ```
   - Available: 194,300đ → 154,300đ ✓
   - Pending: 40,000đ → 80,000đ ✓

3. **User tạo request thứ 3 (40,000đ):**
   ```sql
   available_balance = available_balance - 40,000
   pending_balance = pending_balance + 40,000
   ```
   - Available: 154,300đ → 114,300đ ✓
   - Pending: 80,000đ → 120,000đ ✓

4. **User muốn tạo request thứ 4 (100,000đ):**
   - Available: 114,300đ >= 50,000đ → **CAN CREATE** ✅
   - After reserve: 114,300đ → 14,300đ
   - Pending: 120,000đ → 220,000đ

5. **Admin từ chối request thứ 2 (40,000đ):**
   ```sql
   available_balance = available_balance + 40,000  -- RELEASE
   pending_balance = pending_balance - 40,000
   ```
   - Available: 14,300đ → 54,300đ ✓
   - Pending: 220,000đ → 180,000đ ✓

→ Balance được quản lý chính xác với reserve/release pattern!

---

## 🚀 Deployment Steps

### 1. Restart Backend

```bash
pm2 restart backend
# Hoặc
npm run dev
```

### 2. Clear Browser Cache

```
Ctrl + Shift + R
```

### 3. Test

1. Login với user có pending requests
2. Kiểm tra "Số dư khả dụng"
3. Button "Tạo yêu cầu thanh toán" phải **ENABLED** nếu:
   - Available balance >= 50,000đ
   - Không có nợ

---

## 📋 Verification Checklist

- [ ] Backend code updated
- [ ] Backend restarted
- [ ] Browser cache cleared
- [ ] Test với user có pending requests
- [ ] Test với user không đủ số dư
- [ ] Test với user có nợ
- [ ] Verify balance reserve/release vẫn hoạt động đúng

---

## 🎯 Expected Result

**User với:**
- Available: 114,300đ
- Pending: 3 requests (120,000đ)
- Debt: 0đ

→ Button "Tạo yêu cầu thanh toán" = **ENABLED** ✅
→ User có thể tạo request mới (tối đa 114,300đ)

---

**Status:** ✅ FIXED
**Files Changed:**
- `backend/services/paymentRequestService.js` (lines 658-691)

**Impact:** HIGH - Unblocks users from creating new requests
