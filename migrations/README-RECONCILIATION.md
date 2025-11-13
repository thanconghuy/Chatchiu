# 📊 Reconciliation Module - Database Migrations

## 📁 Cấu Trúc Files

```
migrations/
├── 001-add-reconciliation-fields-to-conversions.sql   # Update bảng conversions
├── 002-create-reconciliations-table.sql               # Tạo bảng reconciliations
├── 003-create-reconciliation-items-table.sql          # Tạo bảng reconciliation_items
├── 004-create-reconciliation-logs-table.sql           # Tạo bảng reconciliation_logs
├── 005-create-payments-table.sql                      # Tạo bảng payments
├── reconciliation-module-all-in-one.sql               # ⭐ TẤT CẢ migrations trong 1 file
├── run-reconciliation-migrations.js                   # Script tự động (optional)
├── verify-sql-syntax.js                               # Verify SQL syntax
└── README-RECONCILIATION.md                           # File này
```

---

## 🚀 Hướng Dẫn Chạy Migrations

### **Cách 1: Chạy Trên Neon Dashboard (Khuyến Nghị ⭐)**

1. **Mở Neon Dashboard**
   - Đăng nhập vào https://console.neon.tech
   - Chọn project `Chatchiu`
   - Vào tab **SQL Editor**

2. **Copy & Execute**
   - Mở file `reconciliation-module-all-in-one.sql`
   - Copy toàn bộ nội dung
   - Paste vào SQL Editor
   - Click **Run** hoặc nhấn `Ctrl+Enter`

3. **Kiểm Tra Kết Quả**
   - Xem output messages: `✅ Migration completed successfully!`
   - Verify bảng đã tạo:
     ```sql
     SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     AND table_name LIKE 'reconcil%'
     ORDER BY table_name;
     ```

### **Cách 2: Chạy Từng File Riêng Lẻ**

Nếu muốn chạy từng bước:

```sql
-- Bước 1: Update conversions
-- Copy & run: 001-add-reconciliation-fields-to-conversions.sql

-- Bước 2: Tạo reconciliations
-- Copy & run: 002-create-reconciliations-table.sql

-- Bước 3: Tạo reconciliation_items
-- Copy & run: 003-create-reconciliation-items-table.sql

-- Bước 4: Tạo reconciliation_logs
-- Copy & run: 004-create-reconciliation-logs-table.sql

-- Bước 5: Tạo payments
-- Copy & run: 005-create-payments-table.sql
```

### **Cách 3: Chạy Script Tự Động (Nếu Có .env)**

```bash
# Tạo file .env với DATABASE_URL
echo "DATABASE_URL=postgresql://user:pass@host/db" > .env

# Chạy migration script
node migrations/run-reconciliation-migrations.js
```

---

## 📊 Bảng Dữ Liệu Mới

### **1. conversions (Updated)**

**Các cột mới:**
- `is_confirmed` - Trạng thái đối soát (0: chưa, 1: đã đối soát)
- `confirmed_time` - Thời gian xác nhận đối soát
- `order_approved` - Số item approved
- `order_pending` - Số item pending
- `order_reject` - Số item rejected

**Quan trọng:**
- `status` (existing) = Trạng thái conversion (pending/approved/rejected) từ AccessTrade `data.status`
- `is_confirmed` (new) = Trạng thái đối soát (0/1) từ AccessTrade `data.is_confirmed`

### **2. reconciliations**

Quản lý các kỳ đối soát.

**Columns:**
- `id`, `user_id` (NULL = tất cả users)
- `period_start`, `period_end`, `period_label`
- `total_orders`, `total_order_amount`, `total_cashback`
- `status` (draft/confirmed/paid/cancelled)
- `version`, `parent_reconciliation_id`, `is_latest` (versioning)
- `created_by`, timestamps

**Workflow:**
```
draft → confirmed → paid
  ↓         ↓
cancelled  cancelled
```

### **3. reconciliation_items**

Chi tiết các đơn hàng trong kỳ đối soát.

**Columns:**
- `id`, `reconciliation_id`, `conversion_id`
- `user_id`, `click_id`
- Snapshot: `order_code`, `merchant_name`, `order_amount`, `cashback_amount`, etc.

**Constraint:**
- 1 conversion chỉ thuộc 1 reconciliation (UNIQUE)

**Triggers:**
- Tự động update `reconciliations.total_orders/total_cashback` khi thêm/xóa item

### **4. reconciliation_logs**

Audit trail các thao tác.

**Columns:**
- `id`, `reconciliation_id`
- `action` (created/confirmed/paid/cancelled/rerun/...)
- `performed_by`, `performed_at`
- `notes`, `metadata` (JSONB)

**Auto-logging:**
- Trigger tự động log khi:
  - Tạo mới reconciliation
  - Thay đổi status
  - Update notes

### **5. payments**

Schema only - Logic sẽ implement sau.

**Columns:**
- `id`, `reconciliation_id`, `user_id`
- `amount`, `payment_method`
- `bank_name`, `bank_account_number`, `bank_account_name`
- `status` (pending/processing/completed/failed)
- `transaction_ref`, timestamps

---

## ✅ Verify Migrations

Sau khi chạy migrations, verify bằng queries sau:

### **1. Kiểm tra bảng đã tạo**

```sql
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
  'conversions',
  'reconciliations',
  'reconciliation_items',
  'reconciliation_logs',
  'payments'
)
ORDER BY table_name;
```

### **2. Kiểm tra cột mới trong conversions**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversions'
AND column_name IN (
  'is_confirmed',
  'confirmed_time',
  'order_approved',
  'order_pending',
  'order_reject'
);
```

### **3. Kiểm tra indexes**

```sql
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename LIKE 'reconcil%'
ORDER BY tablename, indexname;
```

### **4. Kiểm tra triggers**

```sql
SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table LIKE 'reconcil%'
ORDER BY event_object_table, trigger_name;
```

---

## 🔄 Rollback (Nếu Cần)

Nếu cần rollback migrations:

```sql
-- Xóa bảng mới (theo thứ tự ngược lại)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reconciliation_logs CASCADE;
DROP TABLE IF EXISTS reconciliation_items CASCADE;
DROP TABLE IF EXISTS reconciliations CASCADE;

-- Xóa cột mới trong conversions
ALTER TABLE conversions
  DROP COLUMN IF EXISTS is_confirmed,
  DROP COLUMN IF EXISTS confirmed_time,
  DROP COLUMN IF EXISTS order_approved,
  DROP COLUMN IF EXISTS order_pending,
  DROP COLUMN IF EXISTS order_reject;

-- Xóa functions
DROP FUNCTION IF EXISTS update_parent_reconciliation_latest() CASCADE;
DROP FUNCTION IF EXISTS update_reconciliation_stats() CASCADE;
DROP FUNCTION IF EXISTS log_reconciliation_action() CASCADE;
```

---

## 📝 Next Steps

Sau khi chạy migrations thành công:

1. ✅ **Phase 2**: Fix Backend Logic
   - Sửa `trackingService.js` - Tách `status` vs `is_confirmed`
   - Update `accesstrade.js` - Fetch fields mới
   - Tạo Models: `Reconciliation.js`, `ReconciliationItem.js`

2. ✅ **Phase 3**: Tạo API Endpoints
   - Admin APIs: Create, List, Preview, Update Status, Re-run
   - User APIs: List, Detail, Current Period

3. ✅ **Phase 4**: Frontend UI
   - Admin: Reconciliation Management
   - User: View Reconciliations

---

## 🐛 Troubleshooting

### **Lỗi: Table already exists**

```sql
-- Kiểm tra bảng nào đã tồn tại
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('reconciliations', 'reconciliation_items', 'reconciliation_logs', 'payments');

-- Nếu muốn tạo lại, drop trước (CẢNH BÁO: Mất data!)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reconciliation_logs CASCADE;
DROP TABLE IF EXISTS reconciliation_items CASCADE;
DROP TABLE IF EXISTS reconciliations CASCADE;
```

### **Lỗi: Column already exists**

```sql
-- Kiểm tra cột nào đã tồn tại
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'conversions'
AND column_name IN ('is_confirmed', 'confirmed_time', 'order_approved', 'order_pending', 'order_reject');
```

Migration script sử dụng `IF NOT EXISTS` nên an toàn để chạy nhiều lần.

---

## 📞 Support

Nếu gặp vấn đề:
1. Check Neon logs
2. Verify DATABASE_URL
3. Kiểm tra permissions (cần quyền CREATE TABLE, ALTER TABLE)
4. Review error messages trong SQL Editor

---

**Created**: 2025-11-11
**Version**: 1.0
**Author**: Reconciliation Module Implementation
