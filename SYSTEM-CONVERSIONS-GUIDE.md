# System Conversions - Hướng dẫn chi tiết

## 🎯 Mục đích

Tạo bảng `system_conversions` riêng để:
1. **Lưu CHSELECTONLY conversions ĐÃ MATCH với clicks** (conversions thực sự của users)
2. **Load nhanh hơn** cho Conversions Management (không cần JOIN phức tạp)
3. **Tách biệt** data từ AT với conversions của hệ thống

---

## 📋 Cấu trúc

### **Bảng `conversions` (AT Orders - Raw data)**
- Chứa TẤT CẢ orders từ AccessTrade
- `click_id` có thể NULL (chưa match)
- `user_id` có thể NULL (chưa match)
- Dùng cho: AT Orders page, import/sync

### **Bảng `system_conversions` (System Conversions - Matched only)**
- Chỉ chứa conversions ĐÃ MATCH
- `click_id` NOT NULL (bắt buộc)
- `user_id` NOT NULL (bắt buộc)
- Dùng cho: Conversions Management page

---

## 🔄 Flow hoạt động

### **1. Import orders từ AccessTrade**

```
Admin click "Lấy conversions từ AT"
↓
Orders được import vào `conversions` table
↓
Nếu tìm được matching click:
  → Tạo record trong `conversions` (click_id ≠ NULL)
  → AUTO tạo record trong `system_conversions` ✅
Nếu KHÔNG tìm được:
  → Chỉ tạo record trong `conversions` (click_id = NULL)
  → KHÔNG tạo trong `system_conversions` ❌
```

### **2. Kiểm tra chuyển đổi (Check Conversions)**

```
Admin click "Kiểm tra chuyển đổi"
↓
Tìm tất cả conversions có click_id = NULL
↓
Match với clicks trong database bằng UTM
↓
Nếu match thành công:
  → Update `conversions` SET click_id, user_id
  → AUTO tạo record trong `system_conversions` ✅
  → Cộng cashback cho user
```

---

## 🚀 Code Implementation

### **1. Database Migration**

Chạy SQL script:
```bash
psql $DATABASE_URL -f create-system-conversions-table.sql
```

Hoặc re-init database:
```bash
node backend/init-db.js
```

### **2. Auto-create System Conversion**

Logic đã được thêm vào `trackingService.js`:

**Khi import với match:**
```javascript
// handleNewConversion()
const conversion = await Conversion.create({...});

// Auto-create system conversion
await SystemConversion.createFromATConversion(conversion);
```

**Khi check conversions match:**
```javascript
// matchConversionWithClick()
await db.query('UPDATE conversions SET click_id = $1, user_id = $2...');

// Auto-create system conversion
const updatedConversion = await Conversion.findById(conversion.id);
await SystemConversion.createFromATConversion(updatedConversion);
```

### **3. API Endpoints** (Đã có)

**Conversions Management - Sử dụng bảng gốc (tạm thời):**
```javascript
GET /api/admin/conversions
// Hiện tại vẫn query từ conversions table với INNER JOIN clicks
// TODO: Chuyển sang query từ system_conversions
```

**AT Orders - Raw data:**
```javascript
GET /api/admin/at-orders
// Query từ conversions table (tất cả orders, kể cả chưa match)
```

---

## 🔧 Migration cho existing data

Nếu database đã có conversions cũ, migration script sẽ tự động:

```sql
-- Script trong create-system-conversions-table.sql
INSERT INTO system_conversions (...)
SELECT ...
FROM conversions c
WHERE c.click_id IS NOT NULL
  AND c.user_id IS NOT NULL;
```

Điều này sẽ copy TẤT CẢ conversions đã match hiện tại sang `system_conversions`.

---

## 📊 So sánh Performance

### **Query CŨ (conversions table với JOINs):**
```sql
SELECT c.*, u.email, m.name, cl.aff_sid
FROM conversions c
JOIN clicks cl ON c.click_id = cl.id       -- JOIN 1
JOIN users u ON cl.user_id = u.id          -- JOIN 2
JOIN merchants m ON c.merchant_id = m.id   -- JOIN 3
WHERE ...
```
**Performance:** 🐢 Slow (3 JOINs)

### **Query MỚI (system_conversions):**
```sql
SELECT sc.*, u.email, m.logo_url
FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id     -- JOIN 1 (optional)
LEFT JOIN merchants m ON sc.merchant_id = m.id -- JOIN 2 (optional)
WHERE ...
```
**Performance:** 🚀 Fast (data denormalized, less JOINs)

---

## ✅ Checklist Implementation

### Phase 1: Database ✅
- [x] Tạo bảng `system_conversions`
- [x] Tạo indexes
- [x] Tạo migration script
- [x] Update init-db.js

### Phase 2: Backend Logic ✅
- [x] Tạo SystemConversion model
- [x] Auto-create khi import với match
- [x] Auto-create khi check conversions match
- [x] Handle upsert (ON CONFLICT)

### Phase 3: API Routes (TODO)
- [ ] Tạo endpoint mới `GET /api/admin/system-conversions`
- [ ] Update Conversions Management UI để dùng endpoint mới
- [ ] Giữ endpoint cũ `/conversions` để backward compatible

### Phase 4: Frontend (TODO)
- [ ] Update conversions.js để call endpoint mới
- [ ] Test performance improvement
- [ ] Add loading indicator

---

## 🔍 Debug & Monitoring

### Check conversion matching status:

```sql
-- Tổng conversions
SELECT COUNT(*) FROM conversions;

-- Conversions đã match
SELECT COUNT(*) FROM conversions WHERE click_id IS NOT NULL;

-- System conversions (should match above)
SELECT COUNT(*) FROM system_conversions;

-- Conversions chưa match
SELECT COUNT(*) FROM conversions WHERE click_id IS NULL;
```

### Verify data consistency:

```sql
-- Check for conversions in system_conversions but NOT in conversions (should be 0)
SELECT COUNT(*)
FROM system_conversions sc
LEFT JOIN conversions c ON sc.at_conversion_id = c.id
WHERE c.id IS NULL;

-- Check for conversions with click_id but NOT in system_conversions
SELECT COUNT(*)
FROM conversions c
WHERE c.click_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM system_conversions sc
    WHERE sc.at_conversion_id = c.id
  );
```

---

## 🎓 Best Practices

### 1. **Always check before create**
```javascript
// SystemConversion.create() đã có ON CONFLICT DO UPDATE
// Không cần worry về duplicates
```

### 2. **Error handling**
```javascript
try {
  await SystemConversion.createFromATConversion(conversion);
} catch (error) {
  logger.warn('Failed to create system conversion (non-fatal)', error);
  // Không throw error - conversion vẫn được tạo trong conversions table
}
```

### 3. **Denormalize data**
```javascript
// Lưu merchant_name, order_code... trực tiếp
// Tránh JOIN khi query
// Trade-off: Storage vs Speed
```

---

## 📝 Notes

- `system_conversions` là **denormalized** table để optimize read performance
- Data sync tự động khi conversion được match
- Nếu conversion unmatch (xóa click_id), cần xóa khỏi system_conversions
- Dùng `matched_at` để track khi nào conversion được match

---

**Created:** 2025-10-16
**Author:** Claude Code
**Version:** 1.0.0
