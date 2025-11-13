# Debug: Không Có Đơn Hàng Trong Đối Soát

## Vấn đề
Khi preview đối soát tháng 8/2025, nhận thông báo: **"Không có đơn hàng nào đủ điều kiện cho kỳ này"**

## Các bước kiểm tra

### 1. Kiểm tra dữ liệu đã import
```sql
-- Kiểm tra conversions đã import tháng 8
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN is_confirmed = 1 THEN 1 ELSE 0 END) as confirmed_count,
  SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
  SUM(CASE WHEN is_confirmed = 1 AND status = 'approved' THEN 1 ELSE 0 END) as eligible_count
FROM conversions
WHERE confirmed_time >= '2025-08-01'
  AND confirmed_time < '2025-09-01';
```

### 2. Kiểm tra điều kiện của query đối soát
Query đối soát yêu cầu:
1. ✅ `is_confirmed = 1` - AT đã xác nhận
2. ✅ `status = 'approved'` - Admin đã duyệt
3. ✅ `confirmed_time` trong khoảng thời gian
4. ✅ `utm_source` khớp filter (nếu có)

### 3. Kiểm tra chi tiết các đơn hàng tháng 8
```sql
-- Xem chi tiết các đơn tháng 8
SELECT
  id,
  order_code,
  merchant_name,
  order_amount,
  commission,
  cashback_amount,
  status,
  is_confirmed,
  utm_source,
  order_time,
  confirmed_time,
  created_at
FROM conversions
WHERE confirmed_time >= '2025-08-01'
  AND confirmed_time < '2025-09-01'
ORDER BY confirmed_time DESC;
```

## Các nguyên nhân có thể

### Nguyên nhân 1: Đơn hàng chưa được approve
**Triệu chứng**: `is_confirmed = 1` nhưng `status != 'approved'`

**Giải pháp**:
1. Vào **Admin > Conversions**
2. Filter "Đang xử lý"
3. Approve các đơn hàng cần thiết

### Nguyên nhân 2: confirmed_time không khớp với tháng 8
**Triệu chứng**: Đơn hàng có `sales_time` trong tháng 8 nhưng `confirmed_time` là null hoặc tháng khác

**Kiểm tra**:
```sql
SELECT
  order_code,
  order_time,
  sales_time,
  confirmed_time,
  is_confirmed
FROM conversions
WHERE order_time >= '2025-08-01'
  AND order_time < '2025-09-01';
```

**Giải pháp**: Đối soát sử dụng `confirmed_time`, không phải `order_time` hay `sales_time`. Nếu `confirmed_time` là null, đơn hàng sẽ không được tính.

### Nguyên nhân 3: utm_source không khớp
**Triệu chứng**: Đơn hàng có utm_source khác "chatchiu"

**Kiểm tra**:
```sql
SELECT
  utm_source,
  COUNT(*) as count
FROM conversions
WHERE confirmed_time >= '2025-08-01'
  AND confirmed_time < '2025-09-01'
  AND is_confirmed = 1
  AND status = 'approved'
GROUP BY utm_source;
```

**Giải pháp**: Chọn **"Tất cả"** trong dropdown UTM Source khi preview

### Nguyên nhân 4: Dữ liệu import chưa đúng
**Triệu chứng**: Import thành công nhưng thiếu trường quan trọng

**Kiểm tra lại import**:
1. Vào **Admin > Tools**
2. Import lại dữ liệu tháng 8/2025
3. Kiểm tra log trong Console (F12)
4. Xem bảng kết quả sau import:
   - Cột **TT Đơn hàng** phải có "Đã duyệt"
   - Cột **TT Đối soát** phải có "Đã đối soát"

## Script SQL để fix nhanh

### Fix 1: Approve tất cả đơn đã confirmed
```sql
-- CHỈ CHẠY NẾU BẠN CHẮC CHẮN!
UPDATE conversions
SET status = 'approved'
WHERE is_confirmed = 1
  AND status = 'pending'
  AND confirmed_time >= '2025-08-01'
  AND confirmed_time < '2025-09-01';
```

### Fix 2: Set confirmed_time = sales_time nếu missing
```sql
-- CHỈ CHẠY NẾU BẠN CHẮC CHẮN!
UPDATE conversions
SET confirmed_time = sales_time
WHERE is_confirmed = 1
  AND confirmed_time IS NULL
  AND sales_time >= '2025-08-01'
  AND sales_time < '2025-09-01';
```

## Workflow debug từng bước

### Bước 1: Kiểm tra trong Admin Panel
1. **Admin > Conversions**
   - Filter "Tất cả"
   - Tìm đơn hàng tháng 8
   - Kiểm tra cột "TT Đơn hàng" và "TT Đối soát"

2. **Admin > Dữ liệu đơn AT**
   - Xem tất cả raw data từ AT
   - Kiểm tra `is_confirmed` và dates

### Bước 2: Kiểm tra logs backend
1. Mở Terminal
2. Xem logs khi preview:
```
[INFO] Previewing reconciliation { userId, periodStart, periodEnd, utmSource }
[INFO] Executing preview query { query, values }
[INFO] Query returned conversions { count, sample }
[SUCCESS] Preview completed { stats }
```

3. Nếu `count = 0`, kiểm tra query conditions

### Bước 3: Test với điều kiện đơn giản hơn
Thử preview với:
- UTM Source: **Tất cả** (không filter)
- Khoảng thời gian rộng hơn: 01/01/2024 → 31/12/2025

Nếu vẫn không có đơn → Vấn đề ở dữ liệu import

## Checklist Debug

- [ ] Đã import dữ liệu tháng 8/2025 thành công
- [ ] Có ít nhất 1 đơn với `is_confirmed = 1` trong Conversions
- [ ] Có ít nhất 1 đơn với `status = 'approved'`
- [ ] `confirmed_time` nằm trong khoảng 01/08/2025 → 31/08/2025
- [ ] Thử preview với UTM Source = "Tất cả"
- [ ] Kiểm tra logs backend khi preview
- [ ] Refresh trang và thử lại

## Giải pháp nhanh

### Nếu muốn test ngay:
1. Vào **Admin > Conversions**
2. Tìm 1 đơn bất kỳ có `is_confirmed = 1`
3. Approve đơn đó
4. Note lại `confirmed_time` của đơn
5. Vào **Admin > Đối soát**
6. Chọn khoảng thời gian bao gồm `confirmed_time` đó
7. UTM Source = "Tất cả"
8. Click Preview

Nếu vẫn không thấy → Có bug trong code, cần debug sâu hơn.

## Debug SQL trực tiếp trong database

```sql
-- Test query giống như backend
SELECT
  c.id,
  c.order_code,
  c.merchant_name,
  c.status,
  c.is_confirmed,
  c.utm_source,
  c.confirmed_time,
  ri.reconciliation_id as existing_reconciliation_id
FROM conversions c
INNER JOIN users u ON c.user_id = u.id
LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
WHERE 1=1
  AND c.is_confirmed = 1
  AND c.status = 'approved'
  AND c.confirmed_time >= '2025-08-01'
  AND c.confirmed_time < '2025-09-01'
ORDER BY c.confirmed_time DESC;
```

Nếu query này trả về 0 rows → Không có đơn nào đủ điều kiện
Nếu query trả về rows → Bug ở frontend hoặc API response
