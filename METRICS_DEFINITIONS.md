# ĐỊNH NGHĨA SỐ LIỆU HỆ THỐNG CHATCHIU

## Mục lục
1. [Trạng thái đơn hàng (Conversion Status)](#1-trạng-thái-đơn-hàng-conversion-status)
2. [Số liệu của từng User](#2-số-liệu-của-từng-user)
3. [Số liệu của hệ thống (Admin)](#3-số-liệu-của-hệ-thống-admin)
4. [Công thức tính toán](#4-công-thức-tính-toán)
5. [Vấn đề hiện tại và đề xuất sửa](#5-vấn-đề-hiện-tại-và-đề-xuất-sửa)

---

## 1. Trạng thái đơn hàng (Conversion Status)

### 1.1. Trạng thái duyệt (`system_conversions.status`)
| Status | Vietnamese | Description |
|--------|------------|-------------|
| `pending` | Chờ duyệt | Đơn hàng chưa được AccessTrade xác nhận |
| `approved` | Đã duyệt | Đơn hàng đã được AccessTrade xác nhận |
| `rejected` | Đã hủy/Từ chối | Đơn hàng bị từ chối (hoàn tiền, gian lận, etc.) |

### 1.2. Trạng thái đối soát (`system_conversions.system_reconciliation_status`)
| Status | Vietnamese | Description |
|--------|------------|-------------|
| `NULL` | Chưa đối soát | Đơn hàng chưa vào kỳ đối soát |
| `reconciled` | Đã đối soát | Đơn hàng đã được vào kỳ đối soát (có thể rút) |

### 1.3. Trạng thái thanh toán (`system_conversions.payment_status`)
| Status | Vietnamese | Description |
|--------|------------|-------------|
| `NULL` / `unpaid` | Chưa thanh toán | Cashback chưa được trả cho user |
| `paid` | Đã thanh toán | Cashback đã được trả cho user |

### 1.4. Trạng thái yêu cầu thanh toán (`payment_requests.status`)
| Status | Vietnamese | Description |
|--------|------------|-------------|
| `pending` | Chờ xử lý | User vừa tạo, chờ admin xác nhận |
| `confirmed` | Đã xác nhận | Admin đã xác nhận, chờ thanh toán |
| `paid` | Đã thanh toán | Admin đã chuyển tiền |
| `rejected` | Từ chối | Admin từ chối yêu cầu |
| `cancelled` | Đã hủy | User tự hủy yêu cầu |

---

## 2. Số liệu của từng User

### 2.1. Bảng `user_system_balance`
| Column | Vietnamese | Formula/Source |
|--------|------------|----------------|
| `total_earned` | Tổng đã kiếm | SUM(cashback) WHERE status='approved' AND reconciled |
| `total_withdrawn` | Tổng đã rút | SUM(paid payment requests) |
| `pending_reserved` | Đang chờ xử lý | SUM(confirmed payment requests) |
| `debt_balance` | Nợ | Số tiền user nợ (nếu có) |
| `pending_balance` | Số dư chờ duyệt | (deprecated) |
| `reserved_balance` | Số dư dự trữ | (deprecated) |

### 2.2. Số liệu từ Conversions
| Metric | Vietnamese | Formula |
|--------|------------|---------|
| **all_cashback** | Tổng tất cả cashback | SUM(cashback) WHERE status IN ('pending', 'approved', 'rejected') |
| **pending_cashback** | Chờ duyệt | SUM(cashback) WHERE status='pending' |
| **approved_cashback** | Đã duyệt (tất cả) | SUM(cashback) WHERE status='approved' |
| **reconciled_cashback** | Đã đối soát | SUM(cashback) WHERE status='approved' AND reconciled |
| **unreconciled_cashback** | Chưa đối soát | SUM(cashback) WHERE status='approved' AND NOT reconciled |
| **rejected_cashback** | Đã hủy | SUM(cashback) WHERE status='rejected' |
| **paid_conversions_cashback** | Cashback đã TT (conversions) | SUM(cashback) WHERE payment_status='paid' |

### 2.3. Số liệu từ Payment Requests
| Metric | Vietnamese | Formula |
|--------|------------|---------|
| **pending_requests** | Yêu cầu chờ xử lý | SUM(amount) WHERE status='pending' |
| **confirmed_requests** | Yêu cầu đã xác nhận | SUM(amount) WHERE status='confirmed' |
| **paid_requests** | Đã thanh toán | SUM(amount) WHERE status='paid' |

### 2.4. Số liệu tính toán
| Metric | Vietnamese | Formula |
|--------|------------|---------|
| **available_balance** | Số dư khả dụng | reconciled_cashback (unpaid) - total_withdrawn - pending_reserved |
| **max_payable** | Số tiền tối đa có thể rút | floor(available_balance / min_amount) * min_amount |

---

## 3. Số liệu của hệ thống (Admin)

### 3.1. Tổng quan (Summary)
| Metric | Vietnamese | Formula |
|--------|------------|---------|
| **total_users** | Tổng số user | COUNT(users) |
| **total_cashback** | Tổng cashback | SUM(all_cashback) của tất cả users (pending + approved + rejected) |
| **total_paid** | Tổng đã thanh toán | SUM(paid payment requests) |
| **total_available** | Tổng số dư khả dụng | SUM(available_balance) của tất cả users |

### 3.2. Thống kê theo User (Cashback Stats)
| Column | Vietnamese | Current Formula | PROPOSED Formula |
|--------|------------|-----------------|------------------|
| Tổng Cashback | total_cashback | `usb.total_earned` (WRONG) | SUM(ALL conversions: pending + approved + rejected) |
| Chờ Duyệt | pending_cashback | SUM(pending conversions) | SUM(pending conversions) |
| Đã Duyệt | approved_cashback | SUM(approved, not paid) | SUM(approved NOT reconciled) |
| Đã Đối Soát | reconciled_cashback | (missing) | SUM(approved AND reconciled) |
| Đã Hủy | rejected_cashback | SUM(rejected) | SUM(rejected) |
| Đã Thanh Toán | paid_cashback | `usb.total_withdrawn` | `usb.total_withdrawn` |
| Số Dư Còn Lại | available_balance | CORRECT | CORRECT |

---

## 4. Công thức tính toán

### 4.1. Số dư khả dụng (Available Balance)
```sql
available_balance = GREATEST(0,
  (SELECT SUM(cashback_amount)
   FROM system_conversions
   WHERE user_id = $1
     AND status = 'approved'
     AND system_reconciliation_status = 'reconciled'
     AND (payment_status IS NULL OR payment_status = 'unpaid')
  ) - total_withdrawn - pending_reserved
)
```

### 4.2. Tổng đã kiếm (Total Earned) - trong user_system_balance
```sql
-- CHỈ tính từ conversions ĐÃ ĐỐI SOÁT
total_earned = SUM(cashback_amount)
  WHERE status = 'approved'
    AND system_reconciliation_status = 'reconciled'
```

### 4.3. Tổng đã rút (Total Withdrawn)
```sql
total_withdrawn = SUM(requested_amount)
  FROM payment_requests
  WHERE status = 'paid'
```

### 4.4. Đang chờ xử lý (Pending Reserved)
```sql
pending_reserved = SUM(requested_amount)
  FROM payment_requests
  WHERE status = 'confirmed'
```

### 4.5. Số tiền tối đa có thể rút (Max Payable)
```javascript
const minAmount = 50000; // VNĐ
const maxPayable = Math.floor(availableBalance / minAmount) * minAmount;
// Ví dụ: available = 238,500 → maxPayable = 200,000
```

---

## 5. Vấn đề hiện tại và đề xuất sửa

### 5.1. Vấn đề: "Tổng Cashback" < "Đã Duyệt"

**Nguyên nhân:**
- `total_cashback` dùng `usb.total_earned` = chỉ conversions ĐÃ ĐỐI SOÁT
- `approved_cashback` = TẤT CẢ approved conversions (bao gồm chưa đối soát)

**Ví dụ user ks.vinhle@gmail.com:**
- Tổng Cashback: 62,714đ (chỉ reconciled)
- Đã Duyệt: 65,510đ (tất cả approved)
- Chênh lệch 2,796đ = approved nhưng CHƯA reconciled

### 5.2. Đề xuất cấu trúc cột mới cho Cashback Stats

| # | Column Name | Vietnamese | Formula | Note |
|---|-------------|------------|---------|------|
| 1 | **total_cashback** | Tổng Cashback | SUM(ALL conversions) | = pending + approved + rejected |
| 2 | **pending_cashback** | Chờ Duyệt | SUM(pending conversions) | |
| 3 | **approved_cashback** | Đã Duyệt | SUM(ALL approved conversions) | Bao gồm đã đối soát và chưa đối soát |
| 4 | **rejected_cashback** | Đã Hủy | SUM(rejected conversions) | |
| 5 | **paid_cashback** | Đã Thanh Toán | total_withdrawn | Từ payment_requests |
| 6 | **available_balance** | Số Dư Còn Lại | reconciled_unpaid - withdrawn - pending_reserved | |

**QUAN TRỌNG:** Tổng Cashback = Chờ Duyệt + Đã Duyệt + Đã Hủy (1 = 2 + 3 + 4)

### 5.3. Công thức mới cho Cashback Stats

```sql
-- 1. Tổng Cashback = TẤT CẢ đơn hàng (pending + approved + rejected)
total_cashback = SUM(cashback_amount)
  -- Không filter theo status, lấy tất cả

-- 2. Chờ Duyệt
pending_cashback = SUM(cashback_amount)
  WHERE status = 'pending'

-- 3. Chưa Đối Soát (approved nhưng chưa reconciled)
unreconciled_cashback = SUM(cashback_amount)
  WHERE status = 'approved'
    AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')

-- 4. Đã Đối Soát
reconciled_cashback = SUM(cashback_amount)
  WHERE status = 'approved'
    AND system_reconciliation_status = 'reconciled'

-- 5. Đã Hủy
rejected_cashback = SUM(cashback_amount)
  WHERE status = 'rejected'

-- 6. Đã Thanh Toán = từ payment_requests
paid_cashback = total_withdrawn

-- 7. Số Dư Còn Lại (KHÔNG ĐỔI)
available_balance = reconciled_unpaid - total_withdrawn - pending_reserved
```

---

## 6. Các module cần kiểm tra/sửa

| Module | File | Vấn đề | Cần sửa |
|--------|------|--------|---------|
| Cashback Stats | `routes/cashbackStats.js` | total_cashback dùng total_earned | ✅ Cần sửa |
| Dashboard User | `routes/dashboard.js` | OK | - |
| Payment Stats | `routes/paymentStats.js` | OK | - |
| Payment Request | `services/paymentRequestService.js` | OK (đã sửa) | - |
| System Reconciliation | `routes/systemReconciliationAdmin.js` | OK | - |

---

## 7. Verification Query

Script để verify số liệu của một user:

```sql
SELECT
  u.email,
  -- Từ conversions
  COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.cashback_amount END), 0) as pending_cashback,
  COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.cashback_amount END), 0) as total_approved,
  COALESCE(SUM(CASE WHEN sc.status = 'approved' AND sc.system_reconciliation_status = 'reconciled' THEN sc.cashback_amount END), 0) as reconciled_cashback,
  COALESCE(SUM(CASE WHEN sc.status = 'approved' AND (sc.system_reconciliation_status IS NULL OR sc.system_reconciliation_status != 'reconciled') THEN sc.cashback_amount END), 0) as unreconciled_cashback,
  COALESCE(SUM(CASE WHEN sc.status = 'rejected' THEN sc.cashback_amount END), 0) as rejected_cashback,
  -- Từ user_system_balance
  usb.total_earned as db_total_earned,
  usb.total_withdrawn,
  usb.pending_reserved,
  -- Tính toán
  GREATEST(0,
    COALESCE(SUM(CASE WHEN sc.status = 'approved' AND sc.system_reconciliation_status = 'reconciled' AND (sc.payment_status IS NULL OR sc.payment_status = 'unpaid') THEN sc.cashback_amount END), 0)
    - COALESCE(usb.total_withdrawn, 0)
    - COALESCE(usb.pending_reserved, 0)
  ) as available_balance
FROM users u
LEFT JOIN system_conversions sc ON u.id = sc.user_id
LEFT JOIN user_system_balance usb ON u.id = usb.user_id
WHERE u.email = 'ks.vinhle@gmail.com'
GROUP BY u.email, usb.total_earned, usb.total_withdrawn, usb.pending_reserved;
```

---

**Tạo ngày:** 2026-02-02
**Cập nhật bởi:** Claude Code
