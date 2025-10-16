# Changelog: UTM Parameters & Conversion Matching Improvements

## Ngày: 2025-10-16

### Tổng quan
Cải tiến hệ thống quản lý đơn hàng từ AccessTrade với UTM tracking và matching chính xác hơn.

---

## I. Đối với "Tất cả dữ liệu đơn hàng trên AccessTrade" (AT Orders)

### ✅ 1. Popup đơn hàng hiển thị ở giữa màn hình
**Files đã sửa:**
- `frontend/admin/at-orders.html` - Thêm inline styles cho modal centering
- `frontend/admin/at-orders.js` - Cập nhật logic hiển thị modal với flex centering

**Kết quả:** Modal detail giờ hiển thị ở chính giữa màn hình thay vì bên trái.

---

### ✅ 2. Hiển thị UTM Parameters
**Files đã sửa:**
- `backend/init-db.js` - Thêm UTM columns vào conversions table schema
- `backend/models/Conversion.js` - Cập nhật create() method để support UTM fields
- `backend/services/trackingService.js` - Extract và save UTM từ AccessTrade API
- `backend/routes/admin.js` - Include UTM trong API responses
- `frontend/admin/at-orders.html` - Thêm section hiển thị UTM trong modal
- `frontend/admin/at-orders.js` - Render UTM parameters trong detail popup

**Migration SQL:** `add-utm-to-conversions.sql`

**UTM Fields được thêm:**
- `utm_source` - Source của traffic
- `utm_medium` - Medium của traffic
- `utm_campaign` - Campaign ID (thường là aff_sid)
- `utm_content` - Content tracking

**Kết quả:**
- Database giờ lưu UTM parameters từ mỗi order
- UI hiển thị đầy đủ UTM trong order detail popup
- Có thể dùng UTM để match conversions với clicks

---

### ✅ 3. Xóa "Tổng cashback" không chính xác
**Files đã sửa:**
- `frontend/admin/at-orders.html` - Xóa stat box "Tổng cashback", giữ lại 3 boxes
- `frontend/admin/at-orders.js` - Xóa reference đến statTotalCashback

**Lý do:** Tổng cashback không chính xác vì chưa mapping với clicks. Chỉ hiển thị khi đã có matching chính xác.

**Kết quả:** Stats row giờ chỉ hiển thị 3 metrics chính xác:
- Tổng đơn hàng
- Tổng giá trị
- Tổng commission

---

### ✅ 4. Lấy UTM khi import và matching với clicks
**Files đã sửa:**
- `backend/services/trackingService.js`:
  - Cập nhật `handleNewConversion()` - Extract UTM từ AT API
  - Cập nhật `createConversionDirect()` - Extract UTM cho direct imports
  - **Thêm mới** `matchConversionWithClick()` - Match conversion với click dựa trên UTM

**Logic matching:**
1. Tìm click theo `utm_campaign` (unique per click)
2. Fallback: Tìm click theo `aff_sid`
3. Nếu match thành công:
   - Update conversion với `click_id` và `user_id`
   - Update user balance nếu conversion đã approved

**Kết quả:** Conversions từ AT giờ được match chính xác với clicks trong database thông qua UTM.

---

## II. Đối với "Conversions Management"

### ✅ 1. Đổi tên nút "Đồng bộ" thành "Kiểm tra chuyển đổi"
**Files đã sửa:**
- `frontend/admin/conversions.html` - Đổi text button
- `frontend/admin/conversions.js` - Cập nhật confirm dialog và messages

**Kết quả:**
- Nút giờ hiển thị: "🔍 Kiểm tra chuyển đổi"
- Khi loading: "⏳ Đang kiểm tra..."

---

### ✅ 2. Chức năng "Kiểm tra chuyển đổi" mới
**Files đã sửa:**
- `backend/routes/admin.js` - **Thêm endpoint mới** `POST /api/admin/check-conversions`
- `frontend/admin/conversions.js` - Cập nhật `triggerSync()` function

**Chức năng mới:**
- Tìm tất cả conversions chưa có `click_id` (unmatched)
- Thử match với clicks trong database dựa trên UTM
- **KHÔNG** gọi AccessTrade API
- Chỉ làm việc với data có sẵn trong database

**API Response:**
```json
{
  "success": true,
  "results": {
    "total": 100,
    "matched": 45,
    "skipped": 50,
    "errors": 5
  },
  "details": [...]
}
```

**Kết quả:** Hệ thống giờ match conversions với clicks nhanh hơn, không phụ thuộc vào AT API.

---

## III. Database Schema Changes

### Migration Required
Chạy script SQL để thêm UTM columns:
```bash
psql $DATABASE_URL -f add-utm-to-conversions.sql
```

Hoặc re-init database (sẽ xóa data hiện tại):
```bash
node backend/init-db.js
```

### New Columns
```sql
ALTER TABLE conversions
ADD COLUMN utm_source VARCHAR(100),
ADD COLUMN utm_medium VARCHAR(100),
ADD COLUMN utm_campaign VARCHAR(100),
ADD COLUMN utm_content VARCHAR(100);

CREATE INDEX idx_conversions_utm_source ON conversions(utm_source);
CREATE INDEX idx_conversions_utm_campaign ON conversions(utm_campaign);
```

---

## IV. API Changes

### New Endpoints
- `POST /api/admin/check-conversions` - Match conversions với clicks

### Updated Endpoints
- `GET /api/admin/at-orders` - Include UTM parameters
- `GET /api/admin/at-order/:id` - Include UTM parameters

---

## V. Files Changed Summary

### Backend
1. `backend/init-db.js` - UTM schema
2. `backend/models/Conversion.js` - UTM support
3. `backend/services/trackingService.js` - UTM extraction & matching logic
4. `backend/routes/admin.js` - UTM in responses + new check endpoint

### Frontend
5. `frontend/admin/at-orders.html` - Modal centering, UTM display, remove cashback stat
6. `frontend/admin/at-orders.js` - Modal centering, UTM rendering, remove cashback
7. `frontend/admin/conversions.html` - Button text change
8. `frontend/admin/conversions.js` - New check logic

### SQL
9. `add-utm-to-conversions.sql` - Migration script

---

## VI. Testing Checklist

### Database
- [ ] Chạy migration SQL để add UTM columns
- [ ] Verify indexes được tạo
- [ ] Test query performance với UTM filters

### AT Orders Page
- [ ] Popup hiển thị ở giữa màn hình
- [ ] UTM parameters hiển thị trong detail modal
- [ ] Chỉ có 3 stat boxes (không có Total Cashback)
- [ ] Search và filter hoạt động bình thường

### Conversions Management
- [ ] Button hiển thị "Kiểm tra chuyển đổi"
- [ ] Click button → check conversions matching
- [ ] Toast hiển thị kết quả (matched/skipped/errors)
- [ ] Table reload sau khi check xong

### Import Process
- [ ] Import orders từ AT Tools page
- [ ] Verify UTM được save vào database
- [ ] Check matching logic hoạt động

### Matching Logic
- [ ] Conversions match với clicks qua utm_campaign
- [ ] Fallback match qua aff_sid
- [ ] User balance được update khi match thành công
- [ ] Approved conversions → available balance
- [ ] Pending conversions → pending balance

---

## VII. Deployment Steps

1. **Database Migration:**
   ```bash
   psql $DATABASE_URL -f add-utm-to-conversions.sql
   ```

2. **Deploy Backend:**
   ```bash
   git add .
   git commit -m "Add UTM tracking and conversion matching improvements"
   git push
   ```

3. **Verify Vercel Deployment:**
   - Check environment variables
   - Test API endpoints
   - Check logs for errors

4. **Test in Production:**
   - Test AT orders page
   - Test conversions page
   - Test import flow
   - Test matching logic

---

## VIII. Future Improvements

### Suggested
1. **Bulk matching:** Match tất cả unmatched conversions với một button click
2. **UTM Analytics:** Dashboard hiển thị thống kê theo UTM
3. **Manual matching:** Admin có thể manually link conversion với click
4. **Auto-matching job:** Cron job tự động match conversions mới
5. **Match history:** Log lại history của matching attempts

### Architecture
1. **System Conversions Table:** Tạo bảng riêng cho conversions của hệ thống, link với AT conversions
2. **Caching:** Cache click lookups để matching nhanh hơn
3. **Webhooks:** Nhận real-time updates từ AT thay vì polling

---

## IX. Notes

- UTM parameters được extract từ AccessTrade API response
- Matching ưu tiên `utm_campaign` trước, sau đó mới `aff_sid`
- Conversions có thể tồn tại mà không cần click match (imported directly)
- User balance chỉ được update khi conversion có `user_id`
- "Check Conversions" chỉ xử lý tối đa 100 records mỗi lần để tránh timeout

---

**Người thực hiện:** Claude Code
**Ngày:** 2025-10-16
**Version:** 1.0.0
