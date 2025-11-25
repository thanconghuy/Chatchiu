# 📋 System Reconciliation Status Workflow

## Tổng quan

Document này mô tả workflow cập nhật trạng thái đối soát cho các conversions (đơn hàng) trong hệ thống.

---

## 🔄 Lifecycle của Conversion Status

### 1. Order được Approve
```
Conversion {
  status: 'approved'
  system_reconciliation_status: NULL
  system_reconciliation_id: NULL
  system_reconciled_at: NULL
}
```
✅ Đơn hàng đã được admin approve, sẵn sàng để đối soát

---

### 2. Add vào System Reconciliation (Draft)
**Khi:** Admin tạo kỳ đối soát mới và chọn đơn hàng

**Action:**
```sql
-- Khi tạo reconciliation draft
UPDATE conversions
SET
  system_reconciliation_status = 'pending',
  system_reconciliation_id = '<recon_id>'
WHERE id = '<conversion_id>';
```

**Result:**
```
Conversion {
  status: 'approved'
  system_reconciliation_status: 'pending' ← Đã add vào draft
  system_reconciliation_id: '<recon_id>'
  system_reconciled_at: NULL
}
```

✅ Đơn đã được add vào kỳ đối soát (draft), **KHÔNG còn hiện trong list đơn chưa đối soát**

---

### 3. Finalize System Reconciliation
**Khi:** Admin click "Hoàn tất" kỳ đối soát

**Action:**
```sql
-- Khi finalize reconciliation
UPDATE conversions c
SET
  system_reconciliation_status = 'reconciled',
  system_reconciled_at = CURRENT_TIMESTAMP
FROM system_reconciliation_items sri
WHERE c.id = sri.conversion_id
  AND sri.system_reconciliation_id = '<recon_id>';
```

**Result:**
```
Conversion {
  status: 'approved'
  system_reconciliation_status: 'reconciled' ← Đã đối soát!
  system_reconciliation_id: '<recon_id>'
  system_reconciled_at: '2025-11-23 10:30:00'
}
```

✅ Cashback đã được tính vào `user_system_balance.available_balance`
✅ User có thể tạo payment request

---

### 4. Payment Request Created & Paid
**Khi:** User tạo payment request và admin thanh toán

**Action:**
```sql
-- Khi payment request được mark as "paid"
-- (Sẽ implement trong tương lai)
UPDATE conversions c
SET
  system_reconciliation_status = 'paid'
WHERE c.id IN (
  SELECT conversion_id
  FROM payment_system_reconciliation_mapping
  WHERE payment_request_id = '<payment_id>'
);
```

**Result:**
```
Conversion {
  status: 'approved'
  system_reconciliation_status: 'paid' ← Đã thanh toán!
  system_reconciliation_id: '<recon_id>'
  system_reconciled_at: '2025-11-23 10:30:00'
}
```

✅ Cashback đã được thanh toán cho user
✅ Conversion lifecycle hoàn tất

---

## 📊 Combined Status

Hệ thống có cả **System Reconciliation** và **API Reconciliation**. View `v_conversion_reconciliation_status` kết hợp cả 2:

### Status Matrix

| System Status | API Confirmed | Combined Status | Meaning |
|--------------|---------------|-----------------|---------|
| NULL | 0 | `not_reconciled` | Chưa đối soát |
| `pending` | 0/1 | `pending_system_reconciliation` | Đang trong draft |
| `reconciled` | 0 | `system_reconciled_pending_api` | Đối soát nội bộ xong, chờ API |
| `reconciled` | 1 | `system_reconciled_pending_api` | Cả 2 đều xong nhưng chưa thanh toán |
| `paid` | 0 | `system_reconciled_pending_api` | Đã thanh toán, chờ API confirm |
| `paid` | 1 | `fully_reconciled` | ✅ Hoàn tất 100% |
| NULL | 1 | `api_confirmed_pending_system` | API confirm nhưng chưa đối soát nội bộ |

---

## 🛠️ Các Functions Hỗ Trợ

### 1. Get Unreconciled Conversions
```sql
-- Lấy danh sách đơn chưa đối soát trong khoảng thời gian
SELECT * FROM get_unreconciled_conversions_for_period(
  '2025-11-01'::DATE,
  '2025-11-30'::DATE,
  NULL  -- hoặc aff_sid
);
```

**Return:** Chỉ trả về conversions:
- status = 'approved'
- system_reconciliation_status IS NULL HOẶC NOT IN ('reconciled', 'paid')
- order_time trong khoảng thời gian

---

### 2. View Reconciliation Status
```sql
-- Xem tổng quan trạng thái đối soát
SELECT
  combined_status,
  COUNT(*) as count,
  SUM(cashback_amount) as total_cashback
FROM v_conversion_reconciliation_status
GROUP BY combined_status
ORDER BY count DESC;
```

---

### 3. Find Conversions by Status
```sql
-- Tìm đơn đã đối soát nội bộ nhưng API chưa confirm
SELECT *
FROM v_conversion_reconciliation_status
WHERE combined_status = 'system_reconciled_pending_api'
ORDER BY order_time DESC;
```

---

## 🔧 Implementation trong Code

### Khi tạo Reconciliation (Draft)

**File:** `SystemReconciliationService.js`

```javascript
static async createReconciliation({ periodStart, periodEnd, selectedOrderIds, ... }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create reconciliation
    const recon = await createSystemReconciliation(...);

    // 2. Add items
    await client.query(`
      INSERT INTO system_reconciliation_items (...)
      SELECT ... FROM conversions WHERE id = ANY($1)
    `, [selectedOrderIds]);

    // 3. Update conversion status to 'pending'
    await client.query(`
      UPDATE conversions
      SET
        system_reconciliation_status = 'pending',
        system_reconciliation_id = $1
      WHERE id = ANY($2)
    `, [recon.id, selectedOrderIds]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

---

### Khi Finalize Reconciliation

**File:** `SystemReconciliationService.js`

```javascript
static async finalizeReconciliation(reconId, performedBy) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update user balances
    // ...

    // 2. Update conversions status to 'reconciled'
    await client.query(`
      UPDATE conversions c
      SET
        system_reconciliation_status = 'reconciled',
        system_reconciled_at = CURRENT_TIMESTAMP
      FROM system_reconciliation_items sri
      WHERE c.id = sri.conversion_id
        AND sri.system_reconciliation_id = $1
    `, [reconId]);

    // 3. Update reconciliation status
    await client.query(`
      UPDATE system_reconciliations
      SET status = 'finalized', finalized_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [reconId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

---

### Khi Payment được Paid (TODO)

**File:** `PaymentRequestService.js`

```javascript
static async markAsPaid(paymentRequestId, adminInfo, transactionRef) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update payment request
    await updatePaymentRequest(...);

    // 2. Update conversions status to 'paid'
    await client.query(`
      UPDATE conversions c
      SET system_reconciliation_status = 'paid'
      WHERE c.id IN (
        SELECT psrm.conversion_id
        FROM payment_system_reconciliation_mapping psrm
        WHERE psrm.payment_request_id = $1
      )
    `, [paymentRequestId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

---

## 🎯 Lợi ích

### 1. Tránh Double Counting
✅ Đơn đã add vào draft (`pending`) sẽ không hiện trong list "Đơn chưa đối soát"
✅ Không thể add cùng 1 đơn vào 2 kỳ đối soát khác nhau

### 2. Tracking & Reporting
✅ Biết được đơn nào đang trong kỳ đối soát nào
✅ Tracking được timeline: order → reconciled → paid
✅ Báo cáo theo trạng thái đối soát

### 3. Data Integrity
✅ Foreign key constraint đảm bảo tính toàn vẹn
✅ View `v_conversion_reconciliation_status` cung cấp combined status
✅ Function `get_unreconciled_conversions_for_period` đảm bảo chỉ lấy đơn chưa đối soát

---

## 📝 Sample Queries

### Query 1: Đơn đã đối soát nhưng chưa thanh toán
```sql
SELECT
  order_code,
  merchant_name,
  cashback_amount,
  system_recon_period,
  system_reconciled_at
FROM v_conversion_reconciliation_status
WHERE system_reconciliation_status = 'reconciled'
  AND combined_status != 'fully_reconciled'
ORDER BY system_reconciled_at DESC;
```

### Query 2: Tổng cashback theo trạng thái
```sql
SELECT
  system_reconciliation_status,
  COUNT(*) as orders_count,
  SUM(cashback_amount)::DECIMAL(15,2) as total_cashback
FROM conversions
WHERE status = 'approved'
GROUP BY system_reconciliation_status
ORDER BY
  CASE system_reconciliation_status
    WHEN 'paid' THEN 1
    WHEN 'reconciled' THEN 2
    WHEN 'pending' THEN 3
    ELSE 4
  END;
```

### Query 3: Kiểm tra đơn duplicate
```sql
-- Kiểm tra đơn bị add vào nhiều reconciliation (không nên xảy ra)
SELECT
  c.id,
  c.order_code,
  COUNT(DISTINCT sri.system_reconciliation_id) as recon_count,
  ARRAY_AGG(DISTINCT sr.period_label) as periods
FROM conversions c
INNER JOIN system_reconciliation_items sri ON c.id = sri.conversion_id
INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
GROUP BY c.id, c.order_code
HAVING COUNT(DISTINCT sri.system_reconciliation_id) > 1;
```

---

## ✅ Checklist

Khi implement workflow này, đảm bảo:

- [x] Migration 018 đã chạy thành công
- [x] Columns `system_reconciliation_status`, `system_reconciliation_id`, `system_reconciled_at` đã được thêm
- [x] Indexes đã được tạo
- [x] View `v_conversion_reconciliation_status` đã được tạo
- [x] Function `get_unreconciled_conversions_for_period` đã được tạo
- [ ] Code update status khi tạo reconciliation draft
- [ ] Code update status khi finalize reconciliation
- [ ] Code update status khi payment paid
- [ ] Frontend hiển thị status badge cho conversion
- [ ] Test workflow end-to-end

---

**Date:** 2025-11-23
**Version:** 1.0.0
