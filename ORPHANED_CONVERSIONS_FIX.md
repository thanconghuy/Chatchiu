# Fix: Orphaned Conversions After Reconciliation Deletion

## Vấn đề

Khi xóa kỳ đối soát ở phiên bản cũ (trước khi có logic restore conversions), các đơn hàng trong kỳ đối soát sẽ bị **orphaned** ở 2 bảng:

### 1. Bảng `conversions`:
- `system_reconciliation_id` vẫn trỏ đến reconciliation đã bị xóa
- `system_reconciliation_status` vẫn là `pending`/`selected`
- Không thể tạo kỳ đối soát mới cho những đơn này

### 2. Bảng `reconciliation_waiting_list`:
- `status` = `'reconciled'` (đã đối soát)
- `selected_for_reconciliation_id` vẫn trỏ đến reconciliation đã bị xóa
- Đơn hàng **KHÔNG hiển thị** trong danh sách chờ đối soát (UI chỉ show status='waiting')
- Mặc dù có trong database nhưng user không thấy được

## Trường hợp cụ thể đã xảy ra

Bạn đã xóa 1 kỳ đối soát có **4 đơn hàng Shopee**:

1. `2511076KHBQ411` - 2,931.60 VNĐ
2. `251106353HTKV8` - 1,157.10 VNĐ
3. `251106313Y4E8V` - 4,426.10 VNĐ
4. `2511062TFSXCCD` - 1,908.20 VNĐ

**Tổng cashback bị orphaned:** 10,423 VNĐ

## Giải pháp đã thực hiện

### 1. Fix code backend (Đã hoàn thành)

Cập nhật DELETE endpoint trong `backend/routes/systemReconciliationAdmin.js`:

```javascript
// IMPORTANT: Restore conversions to waiting status before deleting
const getConversionsQuery = `
  SELECT conversion_id
  FROM system_reconciliation_items
  WHERE system_reconciliation_id = $1
`;
const conversionsResult = await pool.query(getConversionsQuery, [id]);
const conversionIds = conversionsResult.rows.map(r => r.conversion_id);

if (conversionIds.length > 0) {
  const restoreQuery = `
    UPDATE conversions
    SET
      system_reconciliation_status = NULL,
      system_reconciliation_id = NULL,
      updated_at = NOW()
    WHERE id = ANY($1)
  `;
  await pool.query(restoreQuery, [conversionIds]);
}
```

### 2. Restore các đơn hàng đã bị orphaned

Đã tạo 3 scripts để kiểm tra và restore:

#### A. Kiểm tra orphaned conversions:

```bash
node check-orphaned-conversions.js
```

Script này sẽ:
- Tìm tất cả conversions có `system_reconciliation_id` nhưng reconciliation không tồn tại
- Hiển thị danh sách chi tiết
- Tính tổng cashback bị orphaned
- Đưa ra hướng dẫn khôi phục

#### B. Restore tự động (CHỈ conversions table):

```bash
node restore-orphaned-conversions.js
```

Script này sẽ:
- Tự động restore conversions bị orphaned trong bảng `conversions`
- Set `system_reconciliation_id = NULL`
- Set `system_reconciliation_status = NULL`
- Trả các đơn về trạng thái chờ đối soát

#### C. Restore TẤT CẢ (KHUYÊN DÙNG):

```bash
node restore-all-orphaned.js
```

Script này sẽ restore cả 2 bảng:
1. **Bảng `conversions`:**
   - Set `system_reconciliation_id = NULL`
   - Set `system_reconciliation_status = NULL`

2. **Bảng `reconciliation_waiting_list`:**
   - Set `status = 'waiting'` (thay vì 'reconciled')
   - Set `selected_for_reconciliation_id = NULL`
   - Đơn hàng sẽ hiển thị lại trong UI "Danh Sách Chờ Đối Soát"

### 3. Kết quả

✅ **Đã restore thành công 4 đơn hàng ở CẢ 2 bảng:**

1. **Bảng `conversions`:** 4 đơn đã được clear system_reconciliation_id
2. **Bảng `reconciliation_waiting_list`:** 4 đơn đã được set status='waiting'

Các đơn hàng này:
- ✅ Hiển thị trong UI "Danh Sách Chờ Đối Soát"
- ✅ Có thể được thêm vào kỳ đối soát mới
- ✅ Sẵn sàng cho admin tạo kỳ đối soát

## SQL Query để restore thủ công

Nếu cần restore thủ công bằng SQL:

### 1. Kiểm tra orphaned conversions trong bảng conversions

```sql
SELECT
  c.id,
  c.order_code,
  c.merchant_name,
  c.cashback_amount,
  c.system_reconciliation_status,
  c.system_reconciliation_id
FROM conversions c
LEFT JOIN system_reconciliations sr ON sr.id = c.system_reconciliation_id
WHERE c.system_reconciliation_id IS NOT NULL
  AND sr.id IS NULL;
```

### 2. Kiểm tra orphaned conversions trong bảng waiting_list

```sql
SELECT
  rwl.id,
  c.order_code,
  rwl.status,
  rwl.selected_for_reconciliation_id
FROM reconciliation_waiting_list rwl
JOIN conversions c ON c.id = rwl.conversion_id
WHERE rwl.status = 'reconciled'
  AND (
    rwl.selected_for_reconciliation_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM system_reconciliations sr
      WHERE sr.id = rwl.selected_for_reconciliation_id
    )
  );
```

### 3. Restore conversions table

```sql
UPDATE conversions
SET
  system_reconciliation_status = NULL,
  system_reconciliation_id = NULL,
  updated_at = NOW()
WHERE system_reconciliation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM system_reconciliations sr
    WHERE sr.id = conversions.system_reconciliation_id
  );
```

### 4. Restore waiting_list table

```sql
UPDATE reconciliation_waiting_list
SET
  status = 'waiting',
  selected_for_reconciliation_id = NULL,
  updated_at = NOW()
WHERE status = 'reconciled'
  AND (
    selected_for_reconciliation_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM system_reconciliations sr
      WHERE sr.id = reconciliation_waiting_list.selected_for_reconciliation_id
    )
  );
```

## Phòng tránh trong tương lai

### 1. Code đã được fix

Endpoint DELETE hiện tại đã tự động restore conversions trước khi xóa reconciliation.

### 2. Quy trình kiểm tra định kỳ

Chạy script kiểm tra hàng tuần:

```bash
node check-orphaned-conversions.js
```

Nếu phát hiện orphaned conversions, chạy ngay:

```bash
node restore-orphaned-conversions.js
```

### 3. Monitoring

Thêm vào dashboard admin:
- Số lượng orphaned conversions
- Tổng cashback bị orphaned
- Alert nếu phát hiện orphaned conversions

## Timeline

- **Ngày phát hiện:** 2025-12-28
- **Số đơn bị ảnh hưởng:** 4 đơn hàng (10,423 VNĐ)
- **Đã restore:** ✅ 100% (4/4 đơn)
- **Code fix:** ✅ Hoàn thành
- **Status:** ✅ Đã giải quyết hoàn toàn

## Tài liệu liên quan

- [backend/routes/systemReconciliationAdmin.js:517-589](../backend/routes/systemReconciliationAdmin.js#L517-L589) - DELETE endpoint với restore logic
- [check-orphaned-conversions.js](../check-orphaned-conversions.js) - Script kiểm tra
- [restore-orphaned-conversions.js](../restore-orphaned-conversions.js) - Script restore tự động

## Tác giả

- **Reported by:** User
- **Fixed by:** Claude Code Assistant
- **Date:** 2025-12-28
