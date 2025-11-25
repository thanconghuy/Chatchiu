# HƯỚNG DẪN UPDATE CODE - System Reconciliation Status

## ✅ ĐÃ HOÀN THÀNH:
- ✅ Migration 019: Đã chạy thành công - thêm columns vào `system_conversions`
- ✅ Patch 3: `paymentSystemReconciliationService.js` - Đã apply

---

## 📝 CẦN UPDATE THỦ CÔNG:

### **1. File: `backend/services/systemReconciliation/SystemReconciliationService.js`**

#### **CHANGE 1.1: Thêm update status='processing' trong `createReconciliation`**

**Vị trí:** Sau dòng 169 (sau vòng lặp insert items)

**Tìm đoạn code này (dòng 169-171):**
```javascript
        ]);
      }

      // Log creation
```

**Thêm đoạn code SAU dòng 169, TRƯỚC "// Log creation":**
```javascript
        ]);
      }

      // Update conversions status to 'processing' (Đang xử lý)
      // This will auto-sync to system_conversions via trigger
      await client.query(`
        UPDATE conversions
        SET
          system_reconciliation_status = 'processing',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      `, [reconciliation.id, orders.map(o => o.conversion_id)]);

      // Log creation
```

---

#### **CHANGE 1.2: Sửa condition trong `finalizeReconciliation`**

**Vị trí:** Khoảng dòng 297-308

**Tìm đoạn code này:**
```javascript
      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status IS NULL
      `, [reconciliationId]);
```

**Sửa dòng cuối từ `IS NULL` thành `= 'processing'`:**
```javascript
      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status = 'processing'
      `, [reconciliationId]);
```

**Lý do:** Chỉ update từ 'processing' → 'reconciled', không phải từ NULL

---

### **2. File: `backend/models/PaymentRequest.js`**

#### **CHANGE 2.1: Thêm sync payment_status trong `updateStatus`**

**Vị trí:** Khoảng dòng 400-403

**Tìm đoạn code này:**
```javascript
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || `Status changed from ${current.status} to ${status}`,
        metadata: { transactionReference }
      });

      await client.query('COMMIT');
      return result.rows[0];
```

**Thêm đoạn code SAU `_logAction`, TRƯỚC `COMMIT`:**
```javascript
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || `Status changed from ${current.status} to ${status}`,
        metadata: { transactionReference }
      });

      // Sync payment_status to system_conversions for all linked conversions
      await client.query(`
        UPDATE system_conversions sc
        SET
          payment_status = $1,
          updated_at = NOW()
        FROM payment_system_reconciliation_mapping psrm
        WHERE psrm.payment_request_id = $2
          AND sc.at_conversion_id = psrm.conversion_id
      `, [status, id]);

      await client.query('COMMIT');
      return result.rows[0];
```

---

### **3. File: `backend/routes/admin.js`**

#### **CHANGE 3.1: Thêm status fields vào SELECT query**

**Vị trí:** Khoảng dòng 779-793

**Tìm đoạn code này:**
```javascript
    // Query from system_conversions (cashback system only)
    let query = `
      SELECT
        sc.*,
        u.username,
        u.email,
        u.full_name,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        c.order_code as at_order_code
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE 1=1
    `;
```

**Sửa lại SELECT để lấy status fields:**
```javascript
    // Query from system_conversions (cashback system only)
    let query = `
      SELECT
        sc.*,
        u.username,
        u.email,
        u.full_name,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        c.order_code as at_order_code,
        -- Status labels for frontend
        CASE
          WHEN sc.system_reconciliation_status IS NULL THEN 'Chưa đối soát'
          WHEN sc.system_reconciliation_status = 'processing' THEN 'Đang xử lý'
          WHEN sc.system_reconciliation_status IN ('reconciled', 'paid') THEN 'Đã đối soát'
          ELSE 'Chưa đối soát'
        END as reconciliation_status_label,
        CASE
          WHEN sc.payment_status IS NULL THEN 'Chưa tạo yêu cầu'
          WHEN sc.payment_status = 'pending' THEN 'Đang xử lý'
          WHEN sc.payment_status = 'confirmed' THEN 'Đang xử lý'
          WHEN sc.payment_status = 'paid' THEN 'Đã thanh toán'
          WHEN sc.payment_status = 'rejected' THEN 'Hủy'
          ELSE 'Chưa tạo yêu cầu'
        END as payment_status_label
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE 1=1
    `;
```

**Hoặc đơn giản hơn (không cần CASE, frontend tự xử lý):**
```javascript
    // Query from system_conversions (cashback system only)
    let query = `
      SELECT
        sc.*,
        u.username,
        u.email,
        u.full_name,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        c.order_code as at_order_code
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE 1=1
    `;
```

**Lưu ý:** Vì đã có `sc.*` nên các columns `system_reconciliation_status` và `payment_status` đã được SELECT tự động!

---

## 🧪 KIỂM TRA SAU KHI UPDATE:

### **Test 1: Tạo reconciliation mới**
```sql
-- Sau khi tạo reconciliation draft
SELECT c.id, c.system_reconciliation_status, sc.system_reconciliation_status
FROM conversions c
INNER JOIN system_conversions sc ON c.id = sc.at_conversion_id
WHERE c.system_reconciliation_id = '<reconciliation_id>';

-- Expect: Cả 2 đều có status = 'processing'
```

### **Test 2: Finalize reconciliation**
```sql
-- Sau khi finalize
SELECT c.id, c.system_reconciliation_status, sc.system_reconciliation_status
FROM conversions c
INNER JOIN system_conversions sc ON c.id = sc.at_conversion_id
WHERE c.system_reconciliation_id = '<reconciliation_id>';

-- Expect: Cả 2 đều có status = 'reconciled'
```

### **Test 3: Update payment status**
```sql
-- Sau khi admin confirm payment
SELECT sc.id, sc.payment_status, pr.status as payment_request_status
FROM system_conversions sc
INNER JOIN payment_system_reconciliation_mapping psrm
  ON sc.at_conversion_id = psrm.conversion_id
INNER JOIN payment_requests pr ON psrm.payment_request_id = pr.id
WHERE pr.id = '<payment_request_id>';

-- Expect: sc.payment_status = pr.status
```

---

## 📋 CHECKLIST:

- [ ] File 1: SystemReconciliationService.js - CHANGE 1.1 (createReconciliation)
- [ ] File 1: SystemReconciliationService.js - CHANGE 1.2 (finalizeReconciliation)
- [ ] File 2: PaymentRequest.js - CHANGE 2.1 (updateStatus)
- [ ] File 3: admin.js - CHANGE 3.1 (query) - **KHÔNG CẦN SỬA** (đã có sc.*)
- [x] File 4: paymentSystemReconciliationService.js - **ĐÃ APPLY TỰ ĐỘNG**

---

## 🚀 SAU KHI HOÀN THÀNH:

1. Restart server
2. Test tạo reconciliation mới
3. Test finalize reconciliation
4. Test tạo payment request
5. Test admin confirm/reject payment
6. Kiểm tra frontend hiển thị đúng status

---

**Nếu gặp lỗi, báo cho tôi để debug!** 🛠️
