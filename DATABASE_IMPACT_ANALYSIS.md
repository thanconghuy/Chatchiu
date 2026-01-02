# 📊 Phân Tích Ảnh Hưởng Của Test Đến Database

## 🎯 Tổng Quan

Document này giải thích chi tiết test scripts ảnh hưởng gì đến database của bạn.

---

## 1️⃣ Test Local (Database: chatchiu_test)

### ✅ **HOÀN TOÀN AN TOÀN** - Không ảnh hưởng production

#### Database được sử dụng:
- **Tên:** `chatchiu_test`
- **Nguồn:** Copy schema từ `chatchiu` (production)
- **Data:** Database riêng biệt, KHÔNG share với production

#### Những gì script làm:

**A. Setup Database Test (setup-test-db.sh)**
```sql
-- Tạo database mới hoàn toàn độc lập
CREATE DATABASE chatchiu_test;

-- Copy CẤU TRÚC (schema) từ production
-- KHÔNG copy DATA của production
pg_dump -s chatchiu → chatchiu_test

-- Copy chỉ bảng system_settings
-- Vì cần giá trị min/max withdrawal
INSERT INTO chatchiu_test.system_settings
SELECT * FROM chatchiu.system_settings;
```

**Ảnh hưởng:**
- ✅ Tạo database `chatchiu_test` MỚI
- ✅ KHÔNG động vào `chatchiu` (production)
- ✅ Chiếm thêm ~10-50MB disk space
- ✅ Có thể XÓA bất cứ lúc nào mà không ảnh hưởng production

**B. Test Script (test-local-optimization.js)**

Script này chạy trên `chatchiu_test`, làm:

```sql
-- 1. Tạo test data
INSERT INTO users ...              -- 3 test users
INSERT INTO system_conversions ... -- 5 test conversions
INSERT INTO system_reconciliation_items ... -- 5 test items

-- 2. Test payment creation
INSERT INTO payment_requests ...
INSERT INTO payment_system_reconciliation_mapping ...

-- 3. Cleanup (tự động)
DELETE FROM payment_system_reconciliation_mapping WHERE user_id = test_user
DELETE FROM payment_requests WHERE user_id = test_user
DELETE FROM system_reconciliation_items WHERE user_id = test_user
DELETE FROM system_conversions WHERE user_id = test_user
```

**Ảnh hưởng:**
- ✅ Tạo và XÓA test data trong `chatchiu_test`
- ✅ KHÔNG động vào `chatchiu` (production)
- ✅ Sau khi test xong, database test sạch như ban đầu
- ✅ Có thể chạy test nhiều lần không lo bị duplicate data

---

## 2️⃣ Apply Indexes (optimize-payment-indexes.sql)

### ⚠️ **CHÚ Ý** - Ảnh hưởng database được chỉ định

#### Nếu chạy trên TEST database:
```bash
psql -U postgres -d chatchiu_test -f optimize-payment-indexes.sql
```

**Ảnh hưởng:**
- ✅ Tạo indexes trên `chatchiu_test`
- ✅ KHÔNG ảnh hưởng `chatchiu` (production)
- ✅ Chiếm ~5-10MB disk space trong `chatchiu_test`
- ✅ Queries trên `chatchiu_test` sẽ nhanh hơn

#### Nếu chạy trên PRODUCTION database:
```bash
psql -U postgres -d chatchiu -f optimize-payment-indexes.sql  # ⚠️ PRODUCTION
```

**Ảnh hưởng:**
- ⚠️ Tạo indexes trên `chatchiu` (PRODUCTION)
- ⚠️ Database size tăng ~5-10% (do indexes)
- ⚠️ Trong lúc tạo index: Có thể slow queries một chút (30-60 giây)
- ✅ Sau khi tạo xong: Queries nhanh hơn 50-100x
- ✅ KHÔNG làm mất data
- ✅ KHÔNG thay đổi data hiện có
- ✅ Chỉ THÊM indexes để tăng tốc

**Có thể rollback:**
```sql
-- Xóa indexes nếu cần
DROP INDEX IF EXISTS idx_payment_requests_user_status;
DROP INDEX IF EXISTS idx_payment_requests_status_created;
-- ... (xóa tất cả indexes đã tạo)
```

---

## 3️⃣ So Sánh Chi Tiết

### Test Local vs Production

| Aspect | Test Local (chatchiu_test) | Production (chatchiu) |
|--------|---------------------------|----------------------|
| **Database** | chatchiu_test (riêng biệt) | chatchiu (thật) |
| **Data** | Test data (fake) | User data (thật) |
| **Có thể xóa?** | ✅ Có, bất cứ lúc nào | ❌ KHÔNG bao giờ |
| **Ảnh hưởng users?** | ❌ Không | ⚠️ Có (nếu làm sai) |
| **Rollback dễ?** | ✅ Rất dễ (drop database) | ⚠️ Cần backup restore |
| **Disk space** | +50-100MB | +5-10% current size |

---

## 4️⃣ Quy Trình An Toàn

### ✅ ĐÚNG - Test local trước

```bash
# Bước 1: Tạo test database
bash backend/scripts/setup-test-db.sh

# Bước 2: Apply indexes trên TEST
psql -U postgres -d chatchiu_test -f optimize-payment-indexes.sql

# Bước 3: Chạy test trên TEST
node backend/scripts/test-local-optimization.js

# Bước 4: Nếu OK, mới apply lên production
```

### ❌ SAI - Apply trực tiếp lên production

```bash
# KHÔNG LÀM THẾ NÀY mà không test trước
psql -U postgres -d chatchiu -f optimize-payment-indexes.sql  # ❌ Nguy hiểm
```

---

## 5️⃣ Câu Hỏi Thường Gặp

### Q1: Test local có làm chậm production không?
**A:** KHÔNG. Test chạy trên database riêng biệt (`chatchiu_test`), hoàn toàn độc lập.

### Q2: Nếu test lỗi, production có bị ảnh hưởng không?
**A:** KHÔNG. Test lỗi chỉ ảnh hưởng `chatchiu_test`, không động vào `chatchiu`.

### Q3: Test có tạo user thật trong production không?
**A:** KHÔNG. Test users chỉ tồn tại trong `chatchiu_test`.

### Q4: Database test có thể xóa không?
**A:** CÓ. Xóa bất cứ lúc nào:
```bash
psql -U postgres -c "DROP DATABASE chatchiu_test;"
```

### Q5: Khi nào thì ảnh hưởng production?
**A:** Chỉ khi bạn CHỦ ĐỘNG apply indexes/code lên production:
```bash
# Lúc này mới ảnh hưởng production
psql -U postgres -d chatchiu -f optimize-payment-indexes.sql
```

### Q6: Apply indexes có làm mất data không?
**A:** KHÔNG. Indexes chỉ là cấu trúc để tăng tốc tìm kiếm, không thay đổi data.

Tương tự như:
- Data = Nội dung sách
- Index = Mục lục của sách
- Thêm mục lục KHÔNG thay đổi nội dung sách

### Q7: Apply indexes có downtime không?
**A:** KHÔNG. PostgreSQL tạo index online, application vẫn chạy bình thường.

Có thể hơi chậm trong 30-60 giây khi tạo index lớn, nhưng không crash.

### Q8: Nếu muốn rollback indexes thì sao?
**A:** Dễ dàng, chỉ cần DROP indexes:
```sql
DROP INDEX IF EXISTS idx_payment_requests_user_status;
-- Xóa ngay lập tức, không ảnh hưởng data
```

### Q9: Backup có bao gồm indexes không?
**A:** CÓ. pg_dump backup cả data và indexes.

### Q10: Test nhiều lần có tạo duplicate data không?
**A:** KHÔNG. Script tự động cleanup sau mỗi test.

---

## 6️⃣ Checklist An Toàn

### Trước khi test local:

- [ ] Đã tạo database test riêng (`chatchiu_test`)
- [ ] File `.env.test` đúng (DB_NAME=chatchiu_test)
- [ ] KHÔNG dùng `.env` production khi test

### Trước khi apply lên production:

- [ ] Đã test local thành công
- [ ] Đã backup production database
- [ ] Đã đọc kỹ script sẽ chạy
- [ ] Lên kế hoạch rollback
- [ ] Chọn thời điểm traffic thấp

### Sau khi apply lên production:

- [ ] Monitor logs 30 phút đầu
- [ ] Check error rates
- [ ] Verify indexes được sử dụng
- [ ] Đo performance improvement

---

## 7️⃣ Ví Dụ Thực Tế

### Scenario 1: Test Local

```bash
# 1. Tạo test DB
createdb chatchiu_test

# 2. Trong test script
const pool = new Pool({
  database: 'chatchiu_test'  // ← Test DB
});

# 3. Chạy test
npm test

# 4. Production không hề biết có test đang chạy ✅
```

### Scenario 2: Apply Production

```bash
# 1. Backup trước
pg_dump chatchiu > backup.sql

# 2. Apply indexes
psql -d chatchiu -f optimize-payment-indexes.sql

# 3. Monitor
watch -n 1 'psql -d chatchiu -c "SELECT * FROM pg_stat_activity"'

# 4. Nếu có vấn đề → Rollback
psql -d chatchiu < backup.sql
```

---

## 8️⃣ Disk Space Impact

### Test Database

```bash
# Check size trước khi test
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('chatchiu_test'));"
# → ~50MB (schema only)

# Sau khi apply indexes
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('chatchiu_test'));"
# → ~60MB (+10MB cho indexes)

# Sau khi test xong, có thể xóa
DROP DATABASE chatchiu_test;
# → Giải phóng 60MB
```

### Production Database

```bash
# Production size
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('chatchiu'));"
# → Ví dụ: 2GB

# Sau khi apply indexes
psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('chatchiu'));"
# → ~2.1GB (+5% cho indexes)
```

---

## 9️⃣ Tóm Tắt

### ✅ Test Local - HOÀN TOÀN AN TOÀN

- Database riêng biệt
- Data riêng biệt
- Không ảnh hưởng production
- Có thể xóa bất cứ lúc nào
- Chạy test bao nhiêu lần cũng được

### ⚠️ Apply Production - CẦN THẬN TRỌNG

- Backup trước
- Test local trước
- Apply vào lúc traffic thấp
- Monitor chặt chẽ
- Sẵn sàng rollback

### 🎯 Quy Tắc Vàng

```
Test nhiều lần trên LOCAL
Deploy một lần trên PRODUCTION
```

---

## 🔟 Emergency Contacts

Nếu có vấn đề với production database:

1. **Stop application ngay**
   ```bash
   pm2 stop chatchiu-api
   ```

2. **Check database status**
   ```sql
   SELECT * FROM pg_stat_activity WHERE state != 'idle';
   ```

3. **Rollback nếu cần**
   ```bash
   psql -U postgres -d chatchiu < backup_latest.sql
   ```

4. **Restart application**
   ```bash
   pm2 restart chatchiu-api
   ```

---

**Ngày tạo:** 2026-01-02
**Phiên bản:** 1.0
