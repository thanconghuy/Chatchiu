# System Reconciliation Module - Thiết kế & Workflow

## 🎯 Mục tiêu

Tạo hệ thống đối soát nội bộ **nhanh hơn** API AccessTrade để cải thiện trải nghiệm người dùng:

- **API Reconciliation**: 65-105 ngày (chính thức, chính xác)
- **System Reconciliation**: Tháng phát sinh + 15 ngày (nhanh, có rủi ro)

## 📊 Luồng hoạt động

### 1. Thu thập đơn hàng (Auto Daily Job)

```
Mỗi ngày 00:00:
├─ Quét system_conversions
├─ Lọc đơn hàng status = 'approved'
├─ Chưa được đối soát hệ thống (api_reconciled = FALSE)
└─ Nhóm theo tháng phát sinh
```

**SQL Query mẫu:**
```sql
SELECT
  DATE_TRUNC('month', order_time) as order_month,
  COUNT(*) as total_orders,
  SUM(cashback_amount) as total_cashback,
  COUNT(DISTINCT user_id) as unique_users
FROM system_conversions
WHERE status = 'approved'
  AND api_reconciled = FALSE
  AND order_time >= '2025-10-01'
  AND order_time < '2025-11-01'
GROUP BY order_month;
```

### 2. Tạo kỳ đối soát hệ thống (15 ngày sau tháng)

**Ví dụ:**
- Đơn hàng tháng 10/2025: `2025-10-01` → `2025-10-31`
- Ngày đối soát: `2025-11-15` (31/10 + 15 ngày)

**Logic:**
```javascript
// Tự động tạo reconciliation period
function createSystemReconciliation(month, year) {
  const periodStart = new Date(year, month - 1, 1); // Ngày 1 tháng X
  const periodEnd = new Date(year, month, 0);        // Ngày cuối tháng X
  const reconciliationDate = new Date(periodEnd);
  reconciliationDate.setDate(periodEnd.getDate() + 15); // + 15 ngày

  return {
    period_label: `Tháng ${month}/${year}`,
    period_start: periodStart,
    period_end: periodEnd,
    reconciliation_date: reconciliationDate,
    status: 'draft'
  };
}
```

### 3. Tính toán rủi ro (Risk Assessment)

**Công thức tính tỷ lệ duyệt ước tính:**
```sql
-- Lấy tỷ lệ duyệt trong 3 tháng gần nhất
SELECT
  COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL /
  COUNT(*)::DECIMAL * 100 as approval_rate
FROM conversions
WHERE created_at >= NOW() - INTERVAL '3 months';
```

**Risk Score cho từng đơn:**
```javascript
function calculateRiskScore(conversion, user) {
  let score = 0;

  // User mới (tài khoản < 30 ngày)
  if (user.account_age_days < 30) score += 20;

  // Đơn hàng giá trị cao (> 5M)
  if (conversion.order_value > 5000000) score += 15;

  // Merchant mới
  if (conversion.merchant_first_order) score += 10;

  // Tỷ lệ reject cao của user
  if (user.rejection_rate > 0.2) score += 25;

  // Thời gian từ click đến order < 5 phút (suspicious)
  if (conversion.click_to_order_seconds < 300) score += 30;

  return Math.min(score, 100);
}
```

**Reserved Amount:**
```javascript
// Giữ lại % dự phòng cho đơn high-risk
const estimatedApprovalRate = 85.5; // 85.5% từ lịch sử
const rejectionRate = 100 - estimatedApprovalRate; // 14.5%

const totalCashback = 10000000; // 10M
const reservedAmount = totalCashback * (rejectionRate / 100);
// => 1,450,000 VND giữ lại dự phòng
```

### 4. Finalize Reconciliation (Xác nhận đối soát)

**Thời điểm:** Ngày `reconciliation_date` (period_end + 15)

**Workflow:**
```
1. Admin review kỳ đối soát (status = 'draft')
   ├─ Kiểm tra total_orders
   ├─ Kiểm tra high_risk_orders
   └─ Xác nhận reserved_amount hợp lý

2. Finalize (status = 'finalized')
   ├─ Lock dữ liệu (không cho sửa)
   ├─ Cập nhật user_system_balance:
   │  ├─ available_balance += (total_cashback - reserved_amount)
   │  ├─ reserved_balance += reserved_amount
   │  └─ pending_balance = 0
   └─ Ghi log: system_reconciliation_logs

3. User có thể tạo payment request từ available_balance
```

**SQL Update:**
```sql
-- Cập nhật balance cho tất cả users trong kỳ đối soát
WITH recon_summary AS (
  SELECT
    user_id,
    SUM(cashback_amount) as user_cashback,
    SUM(CASE WHEN is_high_risk THEN cashback_amount ELSE 0 END) as user_reserved
  FROM system_reconciliation_items
  WHERE system_reconciliation_id = $1
  GROUP BY user_id
)
INSERT INTO user_system_balance (user_id, available_balance, reserved_balance)
SELECT
  user_id,
  user_cashback - user_reserved,  -- Available
  user_reserved                    -- Reserved
FROM recon_summary
ON CONFLICT (user_id) DO UPDATE SET
  available_balance = user_system_balance.available_balance + EXCLUDED.available_balance,
  reserved_balance = user_system_balance.reserved_balance + EXCLUDED.reserved_balance,
  updated_at = CURRENT_TIMESTAMP;
```

### 5. Đối chiếu với API Reconciliation (Sau 65-105 ngày)

**Khi API reconciliation xong:**
```
1. So sánh system_reconciliation_items với reconciliation_items (API)

2. TH1: Đơn được API confirm approved
   ├─ Update: api_reconciled = TRUE
   ├─ Update: api_reconciliation_id = xxx
   └─ Chuyển reserved_balance → available_balance

3. TH2: Đơn bị API reject
   ├─ Update: conversion_status = 'rejected'
   ├─ Trừ reserved_balance
   └─ Ghi log adjustment

4. TH3: Đơn vẫn pending ở API
   └─ Giữ nguyên reserved_balance
```

**SQL Sync:**
```sql
-- Cập nhật các đơn đã được API confirm
UPDATE system_reconciliation_items sri
SET
  api_reconciled = TRUE,
  api_reconciliation_id = ri.reconciliation_id,
  conversion_status = c.status
FROM reconciliation_items ri
JOIN conversions c ON ri.conversion_id = c.id
WHERE sri.conversion_id = ri.conversion_id
  AND c.status IN ('approved', 'rejected');

-- Giải phóng reserved amount cho approved orders
WITH approved_reserved AS (
  SELECT
    user_id,
    SUM(cashback_amount) as release_amount
  FROM system_reconciliation_items
  WHERE api_reconciled = TRUE
    AND conversion_status = 'approved'
    AND is_high_risk = TRUE
  GROUP BY user_id
)
UPDATE user_system_balance usb
SET
  available_balance = usb.available_balance + ar.release_amount,
  reserved_balance = usb.reserved_balance - ar.release_amount
FROM approved_reserved ar
WHERE usb.user_id = ar.user_id;
```

### 6. Payment Integration

**Điều kiện rút tiền:**
```javascript
function canUserRequestPayment(userId) {
  const balance = getUserSystemBalance(userId);
  const minAmount = 100000; // 100k VND

  return {
    eligible: balance.available_balance >= minAmount,
    available: balance.available_balance,
    pending: balance.pending_balance,
    reserved: balance.reserved_balance,
    message: balance.available_balance < minAmount
      ? `Cần tối thiểu ${formatMoney(minAmount)}`
      : 'Đủ điều kiện rút tiền'
  };
}
```

**Tạo payment request:**
```sql
-- Kiểm tra balance trước khi tạo request
INSERT INTO payment_requests (user_id, amount, type, notes)
SELECT
  $1, -- user_id
  $2, -- amount
  'system_reconciliation',
  'Thanh toán từ đối soát hệ thống'
WHERE EXISTS (
  SELECT 1 FROM user_system_balance
  WHERE user_id = $1
    AND available_balance >= $2
);

-- Trừ balance ngay khi tạo request
UPDATE user_system_balance
SET available_balance = available_balance - $2
WHERE user_id = $1;
```

## 🔄 Workflow tổng quan

```
┌─────────────────────────────────────────────────────────┐
│  1. User tạo đơn hàng (Click → Order)                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  2. AccessTrade API cập nhật status = 'approved'        │
│     (Thông qua auto-sync job)                           │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  3. Daily Job: Thu thập approved orders                 │
│     - Nhóm theo tháng                                   │
│     - Tính risk score                                   │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  4. Tháng kết thúc + 15 ngày                            │
│     → Tạo System Reconciliation (status = 'draft')      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  5. Admin Review & Finalize                             │
│     - Kiểm tra high-risk orders                         │
│     - Xác nhận reserved amount                          │
│     - Finalize → Update user_system_balance             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  6. User tạo Payment Request                            │
│     - Rút từ available_balance                          │
│     - Reserved balance giữ lại                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  7. API Reconciliation hoàn tất (65-105 ngày sau)       │
│     - Đối chiếu với system reconciliation               │
│     - Confirm: Chuyển reserved → available              │
│     - Reject: Trừ reserved balance                      │
└─────────────────────────────────────────────────────────┘
```

## 📈 Lợi ích

### So với hệ thống cũ (chỉ API Reconciliation):

| Tiêu chí | API Only | System + API |
|----------|----------|--------------|
| **Thời gian chờ** | 65-105 ngày | 15 ngày + reserved |
| **Rủi ro** | 0% (chờ API confirm) | 10-15% (tỷ lệ reject) |
| **Trải nghiệm** | ❌ Chậm | ✅ Nhanh hơn 4-7x |
| **Thanh khoản** | Thấp | Cao (rút sớm 80-90%) |

### Ví dụ thực tế:

**Scenario:**
- User có đơn hàng tháng 10/2025: **1,000,000 VND** cashback
- Tỷ lệ duyệt lịch sử: **85%**

**Timeline:**

| Ngày | Sự kiện | Available | Reserved |
|------|---------|-----------|----------|
| 31/10 | Tháng 10 kết thúc | 0 | 0 |
| 15/11 | System recon finalize | **850,000** | 150,000 |
| 15/11 | User rút tiền | 0 | 150,000 |
| 15/01 | API confirm approved | **150,000** | 0 |
| 15/01 | User rút phần còn lại | 0 | 0 |

**Kết quả:**
- User rút được **85%** sau **15 ngày** (thay vì đợi 65+ ngày)
- **15%** giữ lại đến khi API confirm (bảo vệ hệ thống)

## ⚠️ Risk Management

### 1. Reserved Amount Calculation

```javascript
// Tính reserved amount dựa trên historical data
async function calculateReservedAmount(reconciliationId) {
  // Lấy tỷ lệ reject 3 tháng gần nhất
  const historicalRate = await getHistoricalRejectionRate(3); // e.g., 12%

  // Thêm buffer 20% cho an toàn
  const bufferRate = historicalRate * 1.2; // 12% * 1.2 = 14.4%

  // Tính tổng high-risk orders
  const highRiskTotal = await getHighRiskOrdersTotal(reconciliationId);

  // Reserved = high-risk total * buffer rate
  return highRiskTotal * (bufferRate / 100);
}
```

### 2. High-Risk Detection Rules

```javascript
const RISK_RULES = {
  // User-based
  NEW_USER_DAYS: 30,           // Account < 30 days
  HIGH_REJECTION_RATE: 0.2,    // > 20% reject rate

  // Order-based
  HIGH_VALUE_THRESHOLD: 5000000,  // > 5M VND
  QUICK_ORDER_SECONDS: 300,       // Order < 5 min after click

  // Merchant-based
  NEW_MERCHANT_ORDERS: 5,         // Merchant's first 5 orders

  // Pattern-based
  MULTIPLE_ORDERS_HOURS: 24,      // > 3 orders in 24h
  DUPLICATE_IP: true,             // Same IP, different users
};
```

### 3. Auto-adjust Reserved Rate

```sql
-- Cập nhật estimated_approval_rate mỗi tháng
WITH monthly_stats AS (
  SELECT
    DATE_TRUNC('month', finalized_at) as month,
    SUM(total_cashback) as total,
    SUM(CASE WHEN api_reconciled THEN cashback_amount END) as confirmed,
    (SUM(CASE WHEN api_reconciled THEN cashback_amount END) / SUM(total_cashback) * 100) as actual_rate
  FROM system_reconciliations sr
  JOIN system_reconciliation_items sri ON sr.id = sri.system_reconciliation_id
  WHERE finalized_at >= NOW() - INTERVAL '3 months'
  GROUP BY month
)
SELECT AVG(actual_rate) as suggested_approval_rate
FROM monthly_stats;
```

## 🛠️ API Endpoints (Đề xuất)

### Admin APIs

```javascript
// POST /api/admin/system-reconciliation/create
// Tạo kỳ đối soát mới cho tháng X
{
  "month": 10,
  "year": 2025
}

// POST /api/admin/system-reconciliation/:id/finalize
// Xác nhận và finalize kỳ đối soát
{
  "notes": "Đối soát tháng 10/2025 - 150 đơn hàng"
}

// POST /api/admin/system-reconciliation/:id/sync-api
// Đối chiếu với API reconciliation
{
  "api_reconciliation_id": "uuid"
}

// GET /api/admin/system-reconciliation/:id/stats
// Thống kê chi tiết kỳ đối soát
```

### User APIs

```javascript
// GET /api/user/system-balance
// Xem balance từ system reconciliation
Response: {
  available_balance: 1500000,
  pending_balance: 500000,
  reserved_balance: 200000,
  can_withdraw: true,
  min_withdrawal: 100000
}

// GET /api/user/system-reconciliation-history
// Lịch sử đối soát của user
```

## 📝 Implementation Checklist

- [ ] Migration 014: Tạo tables (đã có)
- [ ] Backend Services:
  - [ ] SystemReconciliationService
  - [ ] RiskAssessmentService
  - [ ] BalanceManagementService
- [ ] Scheduled Jobs:
  - [ ] DailyCollectionJob (00:00)
  - [ ] MonthlyReconciliationJob (15th)
  - [ ] APISyncJob (khi API recon xong)
- [ ] Admin UI:
  - [ ] System Reconciliation List
  - [ ] Create/Finalize Reconciliation
  - [ ] Risk Assessment Dashboard
- [ ] User UI:
  - [ ] System Balance Widget
  - [ ] Reconciliation History
  - [ ] Payment Request (updated)
- [ ] Testing:
  - [ ] Unit tests
  - [ ] Integration tests
  - [ ] Load testing (1000+ users)

## 🎓 Kết luận

Module **System Reconciliation** giúp:
- ✅ Giảm thời gian chờ từ **65+ ngày** xuống **15 ngày**
- ✅ User rút được **80-90%** tiền ngay lập tức
- ✅ Hệ thống vẫn an toàn với **reserved amount**
- ✅ Tự động đối chiếu với API sau này

**Trade-off:**
- Cần quản lý rủi ro tốt (risk score, reserved amount)
- Admin phải review kỹ trước khi finalize
- Cần monitor rejection rate để điều chỉnh

Bạn muốn tôi triển khai phần nào trước? Backend service, Admin UI, hay User UI?
