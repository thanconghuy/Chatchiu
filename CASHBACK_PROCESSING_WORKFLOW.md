# Quy Trình Xử Lý Cashback - Từ Đơn Hàng Đến Thanh Toán

**Tài liệu này mô tả chi tiết quy trình xử lý cashback cho đơn hàng đã được đối soát thành công và thanh toán**

---

## 📋 Mục lục

1. [Tổng quan quy trình](#1-tổng-quan-quy-trình)
2. [Bước 1: Tracking và Tạo Conversion](#2-bước-1-tracking-và-tạo-conversion)
3. [Bước 2: Đối Soát Hệ Thống (System Reconciliation)](#3-bước-2-đối-soát-hệ-thống-system-reconciliation)
4. [Bước 3: Tạo Yêu Cầu Thanh Toán (Payment Request)](#4-bước-3-tạo-yêu-cầu-thanh-toán-payment-request)
5. [Bước 4: Admin Xác Nhận và Thanh Toán](#5-bước-4-admin-xác-nhận-và-thanh-toán)
6. [Bước 5: Tự Động Cập Nhật Trạng Thái](#6-bước-5-tự-động-cập-nhật-trạng-thái)
7. [Bước 6: Lịch Sử Thanh Toán User](#7-bước-6-lịch-sử-thanh-toán-user)
8. [Các Bảng Database Liên Quan](#8-các-bảng-database-liên-quan)
9. [Timeline và SLA](#9-timeline-và-sla)
10. [Xử lý Exception và Edge Cases](#10-xử-lý-exception-và-edge-cases)

---

## 1. Tổng quan quy trình

### Sơ đồ tổng quan

```
┌─────────────────┐
│  User Click     │
│  Affiliate Link │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User đặt hàng  │
│  tại Merchant   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  AccessTrade    │      │  Conversion được │
│  gửi conversion │─────▶│  match với click │
│  webhook        │      │  (system_        │
└─────────────────┘      │  conversions)    │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Conversion     │
                         │  Status:        │
                         │  pending →      │
                         │  approved       │
                         └────────┬────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────┐
│  SYSTEM RECONCILIATION (Đối soát hệ thống)           │
│  - Chạy tự động ngày 15 hàng tháng                   │
│  - Thu thập tất cả đơn approved của tháng trước      │
│  - Tính toán rủi ro và dự trữ                        │
│  - Tạo kỳ đối soát (system_reconciliations)         │
│  - Tạo items (system_reconciliation_items)          │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  Admin review │
                 │  and finalize │
                 │  reconciliation│
                 └───────┬───────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  PAYMENT REQUEST (Yêu cầu thanh toán)                │
│  - User tạo yêu cầu thanh toán                       │
│  - Auto-select items theo FIFO                       │
│  - 3-layer validation                                │
│  - Link payment với items                            │
│  - Update payment_status = 'pending'                 │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  Admin xác    │
                 │  nhận payment │
                 │  Status:      │
                 │  pending →    │
                 │  confirmed    │
                 └───────┬───────┘
                         │
                         ▼  Auto update
                 ┌───────────────────┐
                 │  Items status:    │
                 │  pending →        │
                 │  confirmed        │
                 └───────┬───────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  Admin đánh   │
                 │  dấu đã trả   │
                 │  Status:      │
                 │  confirmed →  │
                 │  paid         │
                 └───────┬───────┘
                         │
                         ▼  Auto update
                 ┌───────────────────┐
                 │  Items status:    │
                 │  confirmed → paid │
                 └───────┬───────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  USER PAYMENT HISTORY (Lịch sử thanh toán)          │
│  - Tạo record trong user_payment_history            │
│  - Tạo details trong user_payment_details           │
│  - User có thể xem và export                         │
└──────────────────────────────────────────────────────┘
```

---

## 2. Bước 1: Tracking và Tạo Conversion

### 2.1. User click vào affiliate link

**File:** `backend/services/accessTradeLink.js`

Khi user click vào link affiliate từ Chatchiu:

```javascript
// Link có dạng:
https://fast.accesstrade.com.vn/deep_link/...?
  utm_source=chatchiu&
  utm_medium=cashback&
  utm_campaign=general&
  utm_content={clickId}&
  aff_sid={clickType}&
  sub1={userId}&
  sub2={clickId}&      // ⚠️ CRITICAL: Backup tracking
  sub3={clickType}&
  sub4=oneatweb
```

**Tracking parameters quan trọng:**
- `utm_content` và `sub2` = `clickId` (dùng để match conversion)
- `sub1` = `userId` (backup tracking)
- Tất cả tracking params được **GIỮ NGUYÊN** để phân biệt với hệ thống khác

**Database:**
- Lưu click vào bảng `clicks` với `id` = clickId
- Lưu `user_id`, `merchant_id`, `click_type`, timestamp

### 2.2. User đặt hàng và conversion được tạo

**Khi user hoàn tất đơn hàng:**

1. AccessTrade gửi webhook về conversion
2. Hệ thống match conversion với click thông qua `utm_content` hoặc `sub2`
3. Nếu match thành công → tạo record trong `system_conversions`

**Database: `system_conversions`**

```sql
INSERT INTO system_conversions (
  at_conversion_id,    -- ID từ AccessTrade
  user_id,             -- ID user (từ click)
  click_id,            -- ID click đã match
  merchant_id,
  merchant_name,
  order_code,
  order_amount,
  commission,
  cashback_amount,     -- Commission * tỷ lệ chia sẻ
  status,              -- 'pending' ban đầu
  order_time,
  approval_time        -- NULL khi mới tạo
)
```

### 2.3. Conversion được approve

**Khi merchant xác nhận đơn hàng:**

AccessTrade update status → `approved` và set `approval_time`

```javascript
// File: backend/models/SystemConversion.js
await SystemConversion.updateStatusByATConversionId(
  atConversionId,
  'approved',
  new Date()  // approval_time
);
```

**Lúc này:**
- `status` = `'approved'`
- `approval_time` ≠ NULL
- `system_reconciliation_status` = NULL (chưa đối soát)
- `payment_status` = NULL (chưa thanh toán)

---

## 3. Bước 2: Đối Soát Hệ Thống (System Reconciliation)

### 3.1. Tạo kỳ đối soát tự động

**File:** `backend/jobs/systemReconciliation/MonthlyReconciliationJob.js`

**Thời gian:** Ngày 15 hàng tháng lúc 2:00 AM

**Quy trình tự động:**

```javascript
// 1. Tính toán kỳ đối soát (tháng trước)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const month = lastMonth.getMonth() + 1;
const year = lastMonth.getFullYear();

// 2. Tạo reconciliation period
const reconciliation = await SystemReconciliationService.createReconciliation({
  month,
  year,
  createdBy: null  // System auto-create
});

// 3. Thu thập tất cả approved conversions của tháng đó
// 4. Tạo system_reconciliation_items cho mỗi conversion
// 5. Tính toán rủi ro và reserved amount
// 6. Gửi notification cho admin
```

**Database: `system_reconciliations`**

```sql
INSERT INTO system_reconciliations (
  period_start,        -- Ngày 1 của tháng đối soát
  period_end,          -- Ngày cuối của tháng
  period_label,        -- "Tháng 12/2024"
  status,              -- 'draft'
  total_orders,        -- Tổng số đơn
  total_users,         -- Số lượng users
  total_cashback,      -- Tổng cashback
  reserved_amount,     -- Số tiền dự trữ (rủi ro cao)
  high_risk_count,     -- Số đơn rủi ro cao
  reconciliation_date  -- Ngày đối soát
)
```

### 3.2. Tạo reconciliation items

**Mỗi conversion approved trong tháng → 1 item**

**Database: `system_reconciliation_items`**

```sql
INSERT INTO system_reconciliation_items (
  system_reconciliation_id,  -- FK đến kỳ đối soát
  conversion_id,             -- FK đến system_conversions.at_conversion_id
  user_id,
  merchant_id,
  merchant_name,
  order_time,
  approval_time,
  order_value,
  commission_amount,
  cashback_amount,
  conversion_status,         -- 'approved'
  api_reconciled,            -- false (chưa đối soát API)
  is_high_risk,              -- true/false (đánh giá rủi ro)
  risk_score,                -- 0-100
  reconciled_at              -- Timestamp
)
```

**Đồng thời update `system_conversions`:**

```sql
UPDATE system_conversions
SET
  system_reconciliation_status = 'reconciled',
  system_reconciliation_id = {reconciliation_id},
  system_reconciled_at = NOW()
WHERE at_conversion_id = {conversion_id}
```

### 3.3. Admin review và finalize

**Admin dashboard:**
- Xem danh sách items trong kỳ đối soát
- Review các đơn hàng rủi ro cao
- Xác nhận các số liệu

**Khi admin finalize:**

```sql
UPDATE system_reconciliations
SET
  status = 'finalized',
  finalized_at = NOW(),
  finalized_by = {admin_id}
WHERE id = {reconciliation_id}
```

**⚠️ Quan trọng:** Chỉ khi status = `'finalized'`, items mới khả dụng cho payment request!

---

## 4. Bước 3: Tạo Yêu Cầu Thanh Toán (Payment Request)

### 4.1. User tạo payment request

**File:** `backend/services/paymentRequestService.js`

**Frontend:** User vào trang "Yêu cầu thanh toán", nhập:
- Số tiền yêu cầu rút
- Thông tin ngân hàng
- Ghi chú (optional)

### 4.2. 3-Layer Validation System

#### **LAYER 1: Pre-request Validation**

**File:** `backend/services/paymentSystemReconciliationService.js:46`

```javascript
const validation = await PaymentSystemReconciliationService.validatePaymentRequest(
  userId,
  requestedAmount,
  context
);

// Kiểm tra:
// ✓ User có pending request chưa?
// ✓ Số tiền >= minimum amount (100,000 VND)
// ✓ Số dư khả dụng đủ không?
// ✓ Có items finalized không?

if (!validation.isValid) {
  throw new Error(validation.errorMessage);
}
```

**Database Function:** `validate_payment_request_creation(userId, amount)`

**Trả về:**
```javascript
{
  is_valid: true/false,
  error_code: 'INSUFFICIENT_BALANCE' | 'HAS_PENDING_REQUEST' | 'BELOW_MIN_AMOUNT',
  error_message: "...",
  available_balance: 500000,
  has_pending_request: false,
  min_amount: 100000
}
```

**Audit Log:**
```sql
INSERT INTO payment_validation_audit_log (
  user_id,
  requested_amount,
  validation_passed,
  error_code,
  available_balance,
  ip_address,
  user_agent
) VALUES (...)
```

#### **LAYER 2: Auto-select Items with Database Locking**

**File:** `backend/services/paymentSystemReconciliationService.js:88`

**Quy tắc FIFO (First In, First Out):**

```javascript
const result = await PaymentSystemReconciliationService.autoSelectItemsForPayment(
  userId,
  requestedAmount,
  useDbLocking: true  // ✓ Sử dụng SELECT FOR UPDATE
);

// Database Function: get_and_lock_available_items_for_payment(userId, amount)
```

**Database Query (simplified):**

```sql
SELECT
  sri.id as item_id,
  sri.system_reconciliation_id,
  sri.conversion_id,
  sri.cashback_amount,
  sri.merchant_name,
  sri.order_time,
  sr.period_label
FROM system_reconciliation_items sri
INNER JOIN system_reconciliations sr
  ON sr.id = sri.system_reconciliation_id
WHERE sri.user_id = $1
  AND sr.status = 'finalized'              -- ✓ Đã finalize
  AND sri.api_reconciled = false           -- ✓ Chưa đối soát API
  AND NOT EXISTS (                         -- ✓ Chưa được link
    SELECT 1
    FROM payment_system_reconciliation_mapping psrm
    WHERE psrm.system_reconciliation_item_id = sri.id
  )
ORDER BY sri.order_time ASC                -- ✓ FIFO: đơn cũ nhất trước
FOR UPDATE                                 -- ✓ Lock để tránh race condition
```

**Logic chọn items:**

```javascript
const selectedItems = [];
let currentTotal = 0;

for (const item of availableItems) {
  if (currentTotal >= requestedAmount) break;

  selectedItems.push({
    itemId: item.item_id,
    systemReconciliationId: item.system_reconciliation_id,
    conversionId: item.conversion_id,
    cashbackAmount: parseFloat(item.cashback_amount),
    merchantName: item.merchant_name,
    orderTime: item.order_time
  });

  currentTotal += parseFloat(item.cashback_amount);
}

// Validation: Đủ số dư không?
if (currentTotal < requestedAmount) {
  throw new Error('INSUFFICIENT_BALANCE');
}
```

#### **LAYER 3: Verify Items Before Linking**

**File:** `backend/services/paymentSystemReconciliationService.js:187`

```javascript
// Double-check items vẫn còn available (race condition protection)
const verification = await PaymentSystemReconciliationService.verifyItemsAvailability(
  itemIds
);

if (!verification.allAvailable) {
  throw new Error('ITEMS_NO_LONGER_AVAILABLE');
}
```

**Database Function:** `verify_items_still_available(itemIds[])`

### 4.3. Tạo Payment Request

**Database: `payment_requests`**

```sql
INSERT INTO payment_requests (
  user_id,
  requested_amount,
  bank_name,
  bank_account_number_encrypted,  -- ⚠️ Encrypted
  bank_account_name_encrypted,    -- ⚠️ Encrypted
  bank_branch,
  status,                         -- 'pending'
  notes,
  created_at
) VALUES (...)
RETURNING id
```

### 4.4. Link Payment với Items

**Database: `payment_system_reconciliation_mapping`**

```sql
-- Tạo mapping cho từng item đã chọn
INSERT INTO payment_system_reconciliation_mapping (
  payment_request_id,              -- FK đến payment_requests
  system_reconciliation_id,        -- FK đến system_reconciliations
  system_reconciliation_item_id,   -- FK đến system_reconciliation_items
  conversion_id,                   -- FK đến system_conversions.at_conversion_id
  user_id,
  cashback_amount,
  merchant_name,
  order_time,
  linked_at                        -- NOW()
) VALUES (...) × N items
```

### 4.5. Update payment_status trong system_conversions

**File:** `backend/services/paymentSystemReconciliationService.js:289`

**⚠️ Quan trọng:** Ngay khi link payment với items, update `payment_status`:

```sql
UPDATE system_conversions
SET
  payment_status = 'pending',        -- Theo payment request status
  payment_request_id = {payment_id}, -- Link đến payment request
  payment_linked_at = NOW()
WHERE at_conversion_id IN (
  SELECT conversion_id
  FROM payment_system_reconciliation_mapping
  WHERE payment_request_id = {payment_id}
)
```

**Lúc này conversion có:**
- `system_reconciliation_status` = `'reconciled'` ✓
- `system_reconciliation_id` = (kỳ đối soát) ✓
- `payment_status` = `'pending'` ✓
- `payment_request_id` = (ID payment request) ✓

---

## 5. Bước 4: Admin Xác Nhận và Thanh Toán

### 5.1. Admin confirm payment request

**File:** `backend/models/PaymentRequest.js` (method: `confirmPaymentRequest`)

**Admin dashboard:**
- Xem danh sách pending payment requests
- Review thông tin user và items
- Xác nhận payment request

**Action:**

```sql
UPDATE payment_requests
SET
  status = 'confirmed',
  confirmed_at = NOW(),
  admin_id = {admin_id},
  admin_notes = '...'
WHERE id = {payment_id}
```

### 5.2. ⚙️ AUTO UPDATE: Items status → 'confirmed'

**File:** `backend/models/PaymentRequest.js:415`

**⚠️ CRITICAL: Tự động cập nhật, KHÔNG cần manual intervention!**

```javascript
// Khi payment status thay đổi → AUTO sync đến tất cả linked conversions
static async updateStatus(id, status, additionalFields = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update payment request status
    await client.query(`
      UPDATE payment_requests
      SET status = $1, ...
      WHERE id = $2
    `, [status, id]);

    // 2. AUTO UPDATE: Sync payment_status to system_conversions
    await client.query(`
      UPDATE system_conversions sc
      SET
        payment_status = $1,        -- ✓ Auto update
        updated_at = NOW()
      FROM payment_system_reconciliation_mapping psrm
      WHERE psrm.payment_request_id = $2
        AND sc.at_conversion_id = psrm.conversion_id
    `, [status, id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

**Kết quả:**
- Payment request: `status` = `'confirmed'` ✓
- Tất cả linked conversions: `payment_status` = `'confirmed'` ✓
- User có thể thấy items đã được xác nhận

### 5.3. Admin marks as paid (Đã thanh toán)

**File:** `backend/models/PaymentRequest.js` (method: `markAsPaid`)

**Sau khi admin thực sự chuyển tiền:**

```sql
UPDATE payment_requests
SET
  status = 'paid',
  paid_at = NOW(),
  transaction_reference = '...',  -- Mã giao dịch ngân hàng
  admin_notes = 'Đã chuyển khoản...'
WHERE id = {payment_id}
```

### 5.4. ⚙️ AUTO UPDATE: Items status → 'paid'

**AGAIN: Tự động thông qua `updateStatus()` method!**

```sql
-- ✓ Tự động chạy khi payment status = 'paid'
UPDATE system_conversions sc
SET
  payment_status = 'paid',        -- ✓ Auto update
  updated_at = NOW()
FROM payment_system_reconciliation_mapping psrm
WHERE psrm.payment_request_id = {payment_id}
  AND sc.at_conversion_id = psrm.conversion_id
```

**Kết quả cuối cùng:**
- Payment request: `status` = `'paid'` ✓
- Tất cả linked conversions: `payment_status` = `'paid'` ✓
- User đã nhận được tiền ✓

---

## 6. Bước 5: Tự Động Cập Nhật Trạng Thái

### Summary: Flow tự động

```
User tạo payment request
  └─▶ payment_requests.status = 'pending'
      └─▶ AUTO: system_conversions.payment_status = 'pending'

Admin confirms
  └─▶ payment_requests.status = 'confirmed'
      └─▶ AUTO: system_conversions.payment_status = 'confirmed'

Admin marks as paid
  └─▶ payment_requests.status = 'paid'
      └─▶ AUTO: system_conversions.payment_status = 'paid'
```

### Code implementation

**File:** `backend/models/PaymentRequest.js:415`

**Key method:** `updateStatus(id, status, additionalFields)`

```javascript
// Mọi thay đổi status đều qua method này
static async updateStatus(id, status, additionalFields = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update payment request
    const updateQuery = `
      UPDATE payment_requests
      SET status = $1, updated_at = NOW(), ...
      WHERE id = $2
      RETURNING *
    `;
    await client.query(updateQuery, [status, id, ...]);

    // 2. ✓ AUTO UPDATE MAGIC: Sync to all linked conversions
    await client.query(`
      UPDATE system_conversions sc
      SET
        payment_status = $1,
        updated_at = NOW()
      FROM payment_system_reconciliation_mapping psrm
      WHERE psrm.payment_request_id = $2
        AND sc.at_conversion_id = psrm.conversion_id
    `, [status, id]);

    // 3. Log activity
    await this.logActivity(id, 'status_changed', {
      old_status: ...,
      new_status: status
    });

    await client.query('COMMIT');

    return result;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Được gọi từ:**
- `confirmPaymentRequest()` → status = `'confirmed'`
- `markAsPaid()` → status = `'paid'`
- `rejectPaymentRequest()` → status = `'rejected'`
- `cancelPaymentRequest()` → status = `'cancelled'`

**⚠️ Không có database trigger!** Tất cả logic nằm trong application code.

---

## 7. Bước 6: Lịch Sử Thanh Toán User

### 7.1. Tạo payment history record

**File:** `backend/services/paymentHistoryService.js`

**⚠️ LƯU Ý:** Đây là tính năng RIÊNG BIỆT với payment request!

**Mục đích:** Tạo lịch sử thanh toán theo từng kỳ đối soát để user tra cứu

**Thời điểm tạo:** Khi admin finalize một kỳ đối soát hoặc manual trigger

```javascript
// Tạo payment history cho tất cả users trong kỳ đối soát
await PaymentHistoryService.createPaymentHistoryForPeriod(
  '2024-12',  // payment period
  {
    reconciliationDate: new Date(),
    status: 'pending'
  }
);
```

### 7.2. Database: user_payment_history

```sql
INSERT INTO user_payment_history (
  user_id,
  payment_period,        -- '2024-12'
  total_cashback,        -- Tổng cashback trong kỳ
  reconciliation_date,   -- Ngày đối soát
  status,                -- 'pending' | 'paid' | 'cancelled'
  payment_date,          -- NULL (chưa trả)
  payment_method,        -- 'bank_transfer'
  payment_details        -- JSON metadata
) VALUES (...)
```

### 7.3. Database: user_payment_details

**Chi tiết từng conversion trong kỳ:**

```sql
INSERT INTO user_payment_details (
  payment_history_id,    -- FK đến user_payment_history
  conversion_id,         -- FK đến system_conversions
  merchant_name,
  order_code,
  cashback_amount,
  reconciliation_month,  -- '2024-12'
  payment_month,         -- NULL (chưa trả)
  status,                -- 'approved' | 'paid'
  metadata
) VALUES (...)
```

### 7.4. User view payment history

**File:** `backend/routes/userPaymentHistory.js`

**Endpoints:**

```javascript
// 1. Get payment history list
GET /api/user/payment-history
  ?year=2024
  &status=pending
  &limit=100

// 2. Get summary statistics
GET /api/user/payment-history/summary

// 3. Get details for specific period
GET /api/user/payment-history/2024-12

// 4. Export to Excel
GET /api/user/payment-history/2024-12/export?format=xlsx
```

**Response example:**

```json
{
  "success": true,
  "data": {
    "payment_history": {
      "id": "...",
      "payment_period": "2024-12",
      "total_cashback": 1500000,
      "status": "paid",
      "payment_date": "2025-01-05",
      "reconciliation_date": "2024-12-15"
    },
    "details": [
      {
        "merchant_name": "Shopee",
        "order_code": "SP123456",
        "cashback_amount": 50000,
        "reconciliation_month": "2024-12",
        "payment_month": "2025-01",
        "status": "paid"
      },
      // ... more items
    ],
    "statistics": {
      "total_orders": 30,
      "total_cashback": 1500000,
      "paid_count": 30,
      "pending_count": 0
    },
    "merchant_breakdown": [
      {
        "merchant_name": "Shopee",
        "orders_count": 15,
        "total_cashback": 750000
      },
      // ...
    ]
  }
}
```

---

## 8. Các Bảng Database Liên Quan

### 8.1. Core Tables

#### `system_conversions`
**Mục đích:** Conversions đã match với clicks (đơn hàng thực của user)

**Columns quan trọng:**
- `at_conversion_id` (UUID): ID từ AccessTrade
- `user_id`, `click_id`, `merchant_id`
- `cashback_amount`: Tiền cashback user nhận
- `status`: `pending` | `approved` | `rejected`
- `system_reconciliation_status`: NULL | `'reconciled'`
- `system_reconciliation_id`: FK đến kỳ đối soát
- `payment_status`: NULL | `'pending'` | `'confirmed'` | `'paid'`
- `payment_request_id`: FK đến payment request

#### `system_reconciliations`
**Mục đích:** Kỳ đối soát hàng tháng

**Columns quan trọng:**
- `period_start`, `period_end`: Khoảng thời gian đối soát
- `period_label`: "Tháng 12/2024"
- `status`: `'draft'` | `'finalized'`
- `total_cashback`, `reserved_amount`
- `reconciliation_date`, `finalized_at`

#### `system_reconciliation_items`
**Mục đích:** Chi tiết từng conversion trong kỳ đối soát

**Columns quan trọng:**
- `system_reconciliation_id`: FK đến kỳ đối soát
- `conversion_id`: FK đến `system_conversions.at_conversion_id`
- `user_id`, `cashback_amount`
- `api_reconciled`: true/false
- `is_high_risk`: true/false
- `order_time` (ASC): Dùng cho FIFO

#### `payment_requests`
**Mục đích:** Yêu cầu thanh toán từ user

**Columns quan trọng:**
- `user_id`, `requested_amount`
- `bank_account_number_encrypted`: ⚠️ Mã hóa
- `status`: `'pending'` | `'confirmed'` | `'paid'` | `'rejected'` | `'cancelled'`
- `admin_id`: Admin xử lý
- `transaction_reference`: Mã giao dịch
- `created_at`, `confirmed_at`, `paid_at`

#### `payment_system_reconciliation_mapping`
**Mục đích:** Mapping giữa payment request và reconciliation items

**Columns quan trọng:**
- `payment_request_id`: FK payment
- `system_reconciliation_id`: FK kỳ đối soát
- `system_reconciliation_item_id`: FK item
- `conversion_id`: FK conversion
- `user_id`, `cashback_amount`
- `linked_at`: Timestamp

### 8.2. Audit & History Tables

#### `payment_validation_audit_log`
**Mục đích:** Log mọi validation attempt (security & debugging)

#### `payment_request_logs`
**Mục đích:** Log mọi activity trên payment request

#### `user_payment_history`
**Mục đích:** Lịch sử thanh toán theo kỳ (user view)

#### `user_payment_details`
**Mục đích:** Chi tiết từng conversion trong lịch sử thanh toán

---

## 9. Timeline và SLA

### 9.1. Timeline chuẩn

```
Ngày 1-31: User mua hàng, conversions được approve
  │
  ├─▶ Ngày 15 tháng sau: Auto tạo kỳ đối soát (2:00 AM)
  │
  ├─▶ Ngày 15-20: Admin review và finalize kỳ đối soát
  │
  ├─▶ Ngày 20-25: User tạo payment request
  │
  ├─▶ Ngày 25-30: Admin xác nhận payment requests
  │
  └─▶ Ngày 1-5 tháng tiếp theo: Admin chuyển tiền và mark as paid
```

### 9.2. Ví dụ cụ thể

**Scenario:** User mua hàng tháng 12/2024

```
2024-12-01 đến 2024-12-31
  User mua hàng tại Shopee qua link affiliate
  └─▶ Conversion created with status = 'pending'

2024-12-15 đến 2024-12-20
  Shopee approve đơn hàng
  └─▶ Conversion status = 'approved'

2025-01-15 02:00 AM
  🤖 Auto job chạy
  └─▶ Tạo kỳ đối soát "Tháng 12/2024"
  └─▶ Thu thập tất cả conversions approved trong 12/2024
  └─▶ Tạo system_reconciliation_items
  └─▶ Update system_conversions.system_reconciliation_status = 'reconciled'

2025-01-16
  Admin review kỳ đối soát
  └─▶ Kiểm tra đơn hàng rủi ro cao
  └─▶ Finalize kỳ đối soát
  └─▶ system_reconciliations.status = 'finalized'

2025-01-20
  User tạo payment request: 1,500,000 VND
  └─▶ Hệ thống auto-select 30 items (FIFO)
  └─▶ Tạo payment_system_reconciliation_mapping (30 records)
  └─▶ Update system_conversions.payment_status = 'pending'
  └─▶ payment_requests.status = 'pending'

2025-01-22
  Admin confirm payment request
  └─▶ payment_requests.status = 'confirmed'
  └─▶ ✓ AUTO: system_conversions.payment_status = 'confirmed'

2025-01-25
  Admin chuyển khoản và mark as paid
  └─▶ payment_requests.status = 'paid'
  └─▶ ✓ AUTO: system_conversions.payment_status = 'paid'
  └─▶ User nhận tiền trong tài khoản ngân hàng
```

**Total time:** ~45 ngày từ lúc mua hàng đến nhận tiền

### 9.3. SLA (Service Level Agreement)

| Giai đoạn | SLA | Owner |
|-----------|-----|-------|
| Conversion approval | 7-30 ngày | Merchant (AccessTrade) |
| System reconciliation | Ngày 15 hàng tháng | System (Auto) |
| Admin finalize reconciliation | 5 ngày làm việc | Admin |
| Payment request creation | Bất kỳ lúc nào | User |
| Admin confirm payment | 3 ngày làm việc | Admin |
| Admin transfer & mark paid | 5 ngày làm việc | Admin |

**Tổng thời gian:** ~45-60 ngày từ đặt hàng đến nhận tiền

---

## 10. Xử lý Exception và Edge Cases

### 10.1. User hủy payment request

**Scenario:** User tạo payment request nhưng muốn hủy

**File:** `backend/models/PaymentRequest.js` (method: `cancelPaymentRequest`)

```javascript
// User hoặc Admin có thể cancel
await PaymentRequest.cancelPaymentRequest(paymentId, userId, reason);

// Database updates:
// 1. payment_requests.status = 'cancelled'
// 2. payment_requests.cancelled_at = NOW()
// 3. payment_requests.cancellation_reason = reason

// 4. ✓ AUTO: system_conversions.payment_status = 'cancelled'

// 5. DELETE payment_system_reconciliation_mapping
//    └─▶ Items trở lại trạng thái available
```

**Kết quả:**
- Items được unlink
- Items có thể được chọn lại cho payment request khác
- User có thể tạo payment request mới

### 10.2. Admin reject payment request

**Scenario:** Admin phát hiện thông tin ngân hàng sai hoặc nghi ngờ gian lận

```sql
UPDATE payment_requests
SET
  status = 'rejected',
  rejected_at = NOW(),
  admin_notes = 'Thông tin ngân hàng không khớp'
WHERE id = {payment_id}

-- ✓ AUTO: system_conversions.payment_status = 'rejected'
```

**Flow tiếp theo:**
- User được thông báo lý do reject
- User có thể tạo payment request mới với thông tin chính xác
- Items vẫn available (không bị lock)

### 10.3. Insufficient balance (race condition)

**Scenario:** 2 requests cùng lúc cố select cùng 1 item

**Protection:** Database-level locking với `SELECT FOR UPDATE`

```sql
-- Transaction 1:
BEGIN;
SELECT * FROM system_reconciliation_items
WHERE ...
FOR UPDATE;  -- ✓ Lock rows

-- Transaction 2:
BEGIN;
SELECT * FROM system_reconciliation_items
WHERE ...
FOR UPDATE;  -- ⏳ WAIT until Transaction 1 commits

-- Transaction 1 commits first → Items được link
-- Transaction 2 không thấy items nữa → Trả về insufficient balance
```

### 10.4. Item becomes unavailable after selection

**Scenario:** Item được select nhưng admin cancel reconciliation

**Protection:** Layer 3 validation - `verifyItemsAvailability()`

```javascript
// Ngay trước khi link, double-check
const verification = await verifyItemsAvailability(itemIds);

if (!verification.allAvailable) {
  // Rollback transaction
  throw new Error('Items no longer available');
  // User sẽ thấy error và phải tạo request mới
}
```

### 10.5. Conversion bị reject sau khi đã đối soát

**Scenario:** Merchant reject conversion sau khi đã finalize reconciliation

**Xử lý:**

1. AccessTrade webhook update `system_conversions.status = 'rejected'`
2. Admin review lại kỳ đối soát
3. Nếu chưa thanh toán:
   - Unlink item khỏi payment request
   - Update `system_reconciliation_items.conversion_status = 'rejected'`
   - Giảm available balance của user
4. Nếu đã thanh toán:
   - Tạo transaction điều chỉnh (adjustment)
   - Trừ số dư user trong kỳ tiếp theo
   - Log vào audit trail

### 10.6. High-risk items

**Scenario:** Đơn hàng có dấu hiệu rủi ro cao

**Indicators:**
- Order value quá lớn
- User mới tạo tài khoản
- Merchant có tỷ lệ reject cao
- Nhiều conversions cùng lúc

**Xử lý:**

```sql
-- Mark as high risk khi tạo reconciliation item
INSERT INTO system_reconciliation_items (
  ...,
  is_high_risk = true,
  risk_score = 85,  -- 0-100
  risk_notes = 'Large order value, new user account'
)

-- Reserved amount calculation
UPDATE system_reconciliations
SET reserved_amount = (
  SELECT SUM(cashback_amount)
  FROM system_reconciliation_items
  WHERE system_reconciliation_id = ...
    AND is_high_risk = true
)
```

**Admin workflow:**
- Review tất cả high-risk items trước khi finalize
- Hold payment cho high-risk items thêm 15-30 ngày
- Chờ confirm từ merchant

### 10.7. Duplicate payment request

**Scenario:** User spam tạo nhiều payment requests

**Protection:**

```javascript
// Layer 1 validation kiểm tra pending request
const validation = await validatePaymentRequest(userId, amount);

if (validation.hasPendingRequest) {
  throw new Error('Bạn đã có yêu cầu thanh toán đang chờ xử lý');
}
```

**Database constraint:**

```sql
-- Unique constraint (optional)
CREATE UNIQUE INDEX idx_payment_requests_user_pending
ON payment_requests(user_id)
WHERE status IN ('pending', 'confirmed');
```

---

## 📊 Tổng Kết

### Toàn bộ workflow trong 1 diagram

```
┌──────────────────────────────────────────────────────────────┐
│ PHASE 1: ORDER & TRACKING (Ngày 1-31 của tháng)             │
├──────────────────────────────────────────────────────────────┤
│ 1. User click affiliate link → clicks table                 │
│ 2. User mua hàng → AccessTrade webhook                       │
│ 3. Match conversion với click → system_conversions          │
│ 4. Merchant approve → status = 'approved'                    │
└──────────────────────────────────────────────────────────────┘
                            ⬇️
┌──────────────────────────────────────────────────────────────┐
│ PHASE 2: RECONCILIATION (Ngày 15 tháng sau)                 │
├──────────────────────────────────────────────────────────────┤
│ 1. Auto job chạy tạo system_reconciliations                 │
│ 2. Thu thập conversions approved → reconciliation_items     │
│ 3. Tính toán rủi ro và reserved amount                       │
│ 4. Admin review và finalize                                  │
│ 5. Update: system_reconciliation_status = 'reconciled'       │
└──────────────────────────────────────────────────────────────┘
                            ⬇️
┌──────────────────────────────────────────────────────────────┐
│ PHASE 3: PAYMENT REQUEST (Ngày 20-25)                       │
├──────────────────────────────────────────────────────────────┤
│ 1. 3-layer validation                                        │
│ 2. Auto-select items (FIFO + locking)                       │
│ 3. Create payment_requests (status = 'pending')             │
│ 4. Link items → payment_system_reconciliation_mapping       │
│ 5. ✓ AUTO: payment_status = 'pending'                       │
└──────────────────────────────────────────────────────────────┘
                            ⬇️
┌──────────────────────────────────────────────────────────────┐
│ PHASE 4: ADMIN CONFIRMATION (Ngày 25-30)                    │
├──────────────────────────────────────────────────────────────┤
│ 1. Admin confirm → status = 'confirmed'                      │
│ 2. ✓ AUTO: payment_status = 'confirmed'                     │
└──────────────────────────────────────────────────────────────┘
                            ⬇️
┌──────────────────────────────────────────────────────────────┐
│ PHASE 5: PAYMENT (Ngày 1-5 tháng tiếp theo)                 │
├──────────────────────────────────────────────────────────────┤
│ 1. Admin chuyển khoản thực tế                                │
│ 2. Admin mark as paid → status = 'paid'                      │
│ 3. ✓ AUTO: payment_status = 'paid'                          │
│ 4. User nhận tiền ✓                                          │
└──────────────────────────────────────────────────────────────┘
                            ⬇️
┌──────────────────────────────────────────────────────────────┐
│ PHASE 6: USER HISTORY                                        │
├──────────────────────────────────────────────────────────────┤
│ 1. user_payment_history (theo kỳ)                           │
│ 2. user_payment_details (chi tiết từng conversion)          │
│ 3. User xem và export Excel                                  │
└──────────────────────────────────────────────────────────────┘
```

### Key Takeaways

✅ **Tự động hóa hoàn toàn:**
- Monthly reconciliation job (ngày 15)
- Auto-select items theo FIFO
- Auto-update payment_status khi admin thay đổi status

✅ **3-Layer Validation:**
- Layer 1: Pre-request validation (balance, pending check)
- Layer 2: Auto-select với database locking (race condition protection)
- Layer 3: Verify items trước khi link (double-check)

✅ **Audit Trail đầy đủ:**
- payment_validation_audit_log
- payment_request_logs
- Tất cả timestamp fields (created_at, confirmed_at, paid_at)

✅ **Security:**
- Bank account encryption
- Database-level locking
- Validation at every step
- Admin authorization required

✅ **User Experience:**
- Payment history với export Excel
- Real-time status tracking
- Transparent timeline

---

**Document Version:** 1.0
**Last Updated:** 2026-01-02
**Author:** Claude Code (generated from codebase analysis)
**Status:** ✅ Complete
