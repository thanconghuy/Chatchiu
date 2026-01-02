# 🧪 Hướng Dẫn Test Local - Payment Optimization

## Mục Đích

Test toàn bộ tối ưu hóa trên môi trường local trước khi deploy lên production.

---

## 📋 Các Bước Thực Hiện

### Bước 1: Chuẩn Bị Database Test

```bash
# Tạo database test từ production schema
bash backend/scripts/setup-test-db.sh
```

Script này sẽ:
- ✅ Tạo database `chatchiu_test`
- ✅ Copy schema từ `chatchiu` (production)
- ✅ Copy system settings
- ✅ Tạo 3 test users sẵn

### Bước 2: Cấu Hình .env.test

```bash
# Mở file .env.test và cập nhật
nano .env.test
```

Cần cập nhật:
```env
DB_PASSWORD=your_actual_password
JWT_SECRET=your_actual_jwt_secret
```

### Bước 3: Apply Database Indexes

```bash
# Apply indexes lên database test
psql -U postgres -d chatchiu_test -f backend/database/migrations/optimize-payment-indexes.sql
```

Verify:
```bash
psql -U postgres -d chatchiu_test -c "
SELECT COUNT(*) as total_indexes
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_payment%';
"
```

Kết quả phải là: **30+ indexes**

### Bước 4: Chạy Automated Tests

```bash
# Chạy test script tự động
node backend/scripts/test-local-optimization.js
```

Script này sẽ test:
- ✅ Original service (để so sánh)
- ✅ Optimized service
- ✅ Validation errors
- ✅ Query performance
- ✅ Settings cache
- ✅ Database indexes

### Bước 5: Chạy Manual Tests (Qua API)

#### 5.1 Start test server

```bash
# Load test environment
export $(cat .env.test | xargs)

# Start server on test port
npm run dev
# hoặc
node server.js
```

#### 5.2 Test API endpoints

**A. Login với test user**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser1@example.com",
    "password": "test123"
  }'
```

Lưu JWT token nhận được.

**B. Check available balance**
```bash
curl -X GET http://localhost:3001/api/payment-requests/eligibility \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**C. Create payment request**
```bash
curl -X POST http://localhost:3001/api/payment-requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestedAmount": 200000,
    "bankName": "Vietcombank",
    "bankAccountNumber": "1234567890",
    "bankAccountName": "Test User",
    "bankBranch": "HCM"
  }'
```

**D. Get payment list**
```bash
curl -X GET http://localhost:3001/api/payment-requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Bước 6: Test Performance Benchmarks

```bash
# Benchmark create payment
time node -e "
require('dotenv').config({ path: '.env.test' });
const { PaymentRequestServiceOptimized } = require('./backend/services/paymentRequestService.optimized');

(async () => {
  const result = await PaymentRequestServiceOptimized.createPaymentRequest({
    userId: 'YOUR_TEST_USER_ID',
    requestedAmount: 200000,
    bankName: 'Vietcombank',
    bankAccountNumber: '1234567890',
    bankAccountName: 'Test User'
  });
  console.log('Success:', result.paymentRequest.id);
})();
"
```

---

## ✅ Checklist Kiểm Tra

### Database Optimization

- [ ] **Indexes được tạo thành công**
  ```bash
  psql -U postgres -d chatchiu_test -c "
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND indexname LIKE 'idx_payment%';"
  ```

- [ ] **Indexes được sử dụng trong queries**
  ```bash
  psql -U postgres -d chatchiu_test -c "
  EXPLAIN ANALYZE
  SELECT * FROM payment_requests
  WHERE user_id = (SELECT id FROM users LIMIT 1)
    AND cancelled_at IS NULL
  ORDER BY created_at DESC
  LIMIT 20;"
  ```
  Kết quả phải có: `Index Scan using idx_payment...`

### Service Functionality

- [ ] **Payment creation thành công**
  - Original service: ✅
  - Optimized service: ✅
  - Cả hai cho kết quả giống nhau

- [ ] **Validation errors đúng**
  - Amount quá thấp → `BELOW_MIN_AMOUNT`
  - Amount quá cao → `ABOVE_MAX_AMOUNT`
  - Không đủ balance → `INSUFFICIENT_BALANCE`
  - Đã có pending request → `HAS_PENDING_REQUEST`

- [ ] **Items linking chính xác**
  - FIFO order (items cũ nhất được chọn trước)
  - Tổng amount >= requested amount
  - Tất cả items được link vào payment request

- [ ] **Settings cache hoạt động**
  - Lần 1 fetch: ~20-50ms (từ DB)
  - Lần 2 fetch: ~1-5ms (từ cache)

### Performance Improvements

- [ ] **Create payment request**
  - Original: ~XXXms
  - Optimized: ~XXXms
  - Improvement: XX% faster

- [ ] **Get payment list**
  - Original: ~XXXms với N+1 queries
  - Optimized: ~XXXms với 1 query
  - Improvement: XX% faster

- [ ] **Get payment details**
  - Original: ~XXXms với multiple queries
  - Optimized: ~XXXms với 1 query
  - Improvement: XX% faster

---

## 🐛 Troubleshooting

### Issue: Database test không tạo được

**Giải pháp:**
```bash
# Check PostgreSQL đang chạy
pg_isready

# Check permissions
psql -U postgres -c "SELECT current_user, session_user;"

# Thử tạo thủ công
psql -U postgres -c "CREATE DATABASE chatchiu_test;"
```

### Issue: Test script báo lỗi "module not found"

**Giải pháp:**
```bash
# Install dependencies
npm install

# Check node version
node --version  # Cần >= 14.x
```

### Issue: Indexes không được sử dụng

**Giải pháp:**
```bash
# Update statistics
psql -U postgres -d chatchiu_test -c "
ANALYZE payment_requests;
ANALYZE payment_system_reconciliation_mapping;
ANALYZE system_reconciliation_items;
"
```

### Issue: Test users không login được

**Giải pháp:**

Test users có password mặc định là dummy hash. Cần tạo password thật:

```bash
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('test123', 10).then(hash => console.log(hash));
"
```

Sau đó update vào database:
```sql
UPDATE users
SET password_hash = 'HASH_VUA_TAO'
WHERE email = 'testuser1@example.com';
```

---

## 📊 Kết Quả Mong Đợi

### Performance Targets

| Metric | Original | Optimized | Target |
|--------|----------|-----------|--------|
| Create payment | ~800ms | ~150ms | < 200ms |
| Get payment list (20 items) | ~450ms | ~80ms | < 100ms |
| Get payment details | ~200ms | ~40ms | < 50ms |
| Settings lookup (cached) | ~50ms | ~1ms | < 5ms |

### Database Metrics

| Metric | Target |
|--------|--------|
| Index usage rate | > 80% |
| Query execution time | 50-80% reduction |
| Database calls per operation | Reduced by 70-90% |

### Functionality

- ✅ Tất cả test cases pass
- ✅ Không có errors trong logs
- ✅ Validation logic chính xác
- ✅ Data integrity maintained

---

## 🎯 Tiếp Theo

Sau khi test local thành công:

1. **Document kết quả**
   ```bash
   # Lưu test results
   node backend/scripts/test-local-optimization.js > test_results_$(date +%Y%m%d).log
   ```

2. **Commit code**
   ```bash
   git add .
   git commit -m "Payment optimization - tested and verified locally"
   ```

3. **Chuẩn bị deploy production**
   - Đọc lại DEPLOYMENT_CHECKLIST.md
   - Backup production database
   - Schedule deployment vào lúc traffic thấp

---

## 💡 Tips

1. **Chạy test nhiều lần**
   - Đảm bảo kết quả consistent
   - Check for race conditions

2. **Test với data khác nhau**
   - Tạo thêm test users
   - Tạo nhiều reconciliation items
   - Test với amounts khác nhau

3. **Monitor resource usage**
   ```bash
   # Check database connections
   psql -U postgres -d chatchiu_test -c "
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'chatchiu_test';"

   # Check table sizes
   psql -U postgres -d chatchiu_test -c "
   SELECT pg_size_pretty(pg_total_relation_size('payment_requests'));"
   ```

4. **Test rollback**
   - Test restore từ backup
   - Verify data không bị mất
   - Practice rollback procedure

---

## ✅ Sign-off

**Test completed:** _______________

**Results:**
- [ ] All tests passed
- [ ] Performance targets met
- [ ] No errors or warnings
- [ ] Ready for production deployment

**Tested by:** _______________

**Date:** _______________
