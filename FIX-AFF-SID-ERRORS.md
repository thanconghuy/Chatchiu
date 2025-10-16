# Fix Aff_Sid Errors - Hướng dẫn sửa lỗi

## Vấn đề
3 lỗi liên quan đến việc tạo link affiliate:

1. ❌ **Lỗi "null value in column aff_sid"** khi tạo link
2. ❌ **Placeholder không đúng domain** của merchant
3. ❌ **Button "Đi đến Lazada" cũng bị lỗi aff_sid**

## Nguyên nhân
- Database schema yêu cầu `aff_sid NOT NULL` và `affiliate_url NOT NULL`
- Nhưng code tạo Click record TRƯỚC, rồi mới update `aff_sid` SAU
- Placeholder text bị hardcode thay vì dynamic theo merchant

## Giải pháp đã implement

### 1. Sửa Database Schema
File: `backend/init-db.js` (line 129, 132)
- Đã sửa `aff_sid VARCHAR(100) UNIQUE NOT NULL` → `aff_sid VARCHAR(100) UNIQUE`
- Đã sửa `affiliate_url TEXT NOT NULL` → `affiliate_url TEXT`

### 2. Sửa Dynamic Placeholder
File: `frontend/js/dashboard.js` (line 171-209)
- Thêm function `getMerchantPlaceholder()` để tự động tạo placeholder theo merchant
- Update placeholder khi mở modal

### 3. Migration cho Database hiện tại

**Cách 1: Chạy migration SQL (Khuyến nghị cho production)**
```bash
# Kết nối vào PostgreSQL
psql -U postgres -d cashback_db

# Chạy file migration
\i fix-clicks-aff-sid.sql
```

**Cách 2: Chạy trực tiếp SQL**
```sql
-- Cho phép NULL trong aff_sid và affiliate_url
ALTER TABLE clicks
  ALTER COLUMN aff_sid DROP NOT NULL,
  ALTER COLUMN affiliate_url DROP NOT NULL;

-- Kiểm tra kết quả
\d clicks
```

**Cách 3: Reset database (CHỈ cho development)**
```bash
cd backend
node init-db.js
```
⚠️ **Cảnh báo**: Cách 3 sẽ XÓA TOÀN BỘ dữ liệu!

## Testing

### Test Case 1: Free Shopping Button
1. Đăng nhập vào dashboard
2. Click vào một merchant (vd: Shopee)
3. Click button "Đi đến Shopee"
4. ✅ Không còn lỗi "null value in column aff_sid"
5. ✅ Link được tạo và chuyển hướng thành công

### Test Case 2: Product Link
1. Click vào merchant Lazada
2. Kiểm tra placeholder: phải là `https://www.lazada.vn/products/...`
3. Paste link product từ Lazada
4. Click "Tạo link mua hàng"
5. ✅ Không có lỗi, link được tạo thành công

### Test Case 3: Validate URL
1. Click vào Shopee
2. Paste link từ Lazada (wrong domain)
3. ✅ Phải báo lỗi "Product URL must be from Shopee website"

## Kiểm tra trong Database

```sql
-- Xem clicks vừa tạo
SELECT
  id,
  user_id,
  merchant_id,
  aff_sid,
  click_type,
  affiliate_url,
  clicked_at
FROM clicks
ORDER BY clicked_at DESC
LIMIT 5;

-- Kiểm tra aff_sid có unique không
SELECT aff_sid, COUNT(*)
FROM clicks
WHERE aff_sid IS NOT NULL
GROUP BY aff_sid
HAVING COUNT(*) > 1;
```

## Files đã thay đổi

1. ✅ `backend/init-db.js` - Sửa schema cho clicks table
2. ✅ `frontend/js/dashboard.js` - Thêm dynamic placeholder
3. ✅ `fix-clicks-aff-sid.sql` - Migration script

## Rollback (nếu cần)

Nếu cần quay lại NOT NULL constraint:
```sql
-- Xóa các record có aff_sid NULL
DELETE FROM clicks WHERE aff_sid IS NULL;

-- Đặt lại NOT NULL
ALTER TABLE clicks
  ALTER COLUMN aff_sid SET NOT NULL,
  ALTER COLUMN affiliate_url SET NOT NULL;
```

⚠️ **Lưu ý**: Chỉ rollback nếu thực sự cần thiết và đã backup dữ liệu!
