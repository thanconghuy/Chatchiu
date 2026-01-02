# Payment Module Optimization - Deployment Checklist

## 📋 Tổng Quan

Checklist này hướng dẫn từng bước để triển khai an toàn các tối ưu hóa module thanh toán.

---

## ✅ Phase 0: Chuẩn Bị (Trước Khi Deploy)

### 0.1 Backup và Kiểm Tra

- [ ] **Backup database hiện tại**
  ```bash
  pg_dump -U postgres chatchiu > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Backup code hiện tại**
  ```bash
  git commit -am "Checkpoint before optimization deployment"
  git tag pre-optimization-$(date +%Y%m%d)
  ```

- [ ] **Kiểm tra disk space còn đủ**
  ```bash
  df -h
  # Cần ít nhất 2GB free space
  ```

- [ ] **Kiểm tra PostgreSQL version**
  ```bash
  psql --version
  # Cần PostgreSQL 12 trở lên cho các tính năng CTE được tối ưu
  ```

### 0.2 Chuẩn Bị Môi Trường

- [ ] **Copy env variables mới**
  ```bash
  cat .env.example.optimization >> .env
  # Hoặc thêm thủ công vào .env
  ```

- [ ] **Verify environment variables**
  ```bash
  # Check xem có các biến này chưa
  grep USE_OPTIMIZED_PAYMENT_SERVICE .env
  grep OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE .env
  ```

- [ ] **Install dependencies (nếu cần)**
  ```bash
  npm install
  ```

### 0.3 Chạy Tests

- [ ] **Chạy test suite hiện tại**
  ```bash
  npm test
  # Đảm bảo tất cả tests pass trước khi bắt đầu
  ```

---

## ✅ Phase 1: Apply Database Indexes (Ngày 1)

### 1.1 Chuẩn Bị

- [ ] **Backup database lần nữa trước khi apply indexes**
  ```bash
  ./backend/scripts/deploy-optimization.sh indexes
  # Script sẽ tự động backup
  ```

- [ ] **Hoặc backup thủ công**
  ```bash
  pg_dump -U postgres chatchiu > backups/before_indexes_$(date +%Y%m%d_%H%M%S).sql
  ```

### 1.2 Apply Indexes

- [ ] **Chạy migration script**
  ```bash
  psql -U postgres -d chatchiu -f backend/database/migrations/optimize-payment-indexes.sql
  ```

- [ ] **Verify indexes được tạo thành công**
  ```bash
  ./backend/scripts/deploy-optimization.sh monitor
  ```

- [ ] **Hoặc kiểm tra thủ công**
  ```sql
  SELECT COUNT(*)
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_payment%';
  -- Kết quả phải là 30+ indexes
  ```

### 1.3 Monitoring (24-48 giờ)

- [ ] **Check index usage sau 24 giờ**
  ```bash
  ./backend/scripts/deploy-optimization.sh monitor
  ```

- [ ] **Monitor database performance**
  ```sql
  -- Query execution time
  SELECT query, mean_time, calls
  FROM pg_stat_statements
  WHERE query LIKE '%payment_requests%'
  ORDER BY mean_time DESC
  LIMIT 10;
  ```

- [ ] **Check for unused indexes**
  ```sql
  SELECT indexname, idx_scan
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_payment%'
    AND idx_scan = 0;
  -- Nếu có index nào idx_scan = 0 sau 48h, cân nhắc xóa
  ```

- [ ] **Monitor database size**
  ```sql
  SELECT pg_size_pretty(pg_database_size('chatchiu'));
  -- Indexes sẽ tăng database size ~5-10%
  ```

### 1.4 Performance Benchmarks

- [ ] **Chạy benchmark queries TRƯỚC khi áp indexes** (nếu chưa)
  ```sql
  -- User payment list
  EXPLAIN ANALYZE
  SELECT * FROM payment_requests
  WHERE user_id = 'some-user-id'
    AND cancelled_at IS NULL
  ORDER BY created_at DESC
  LIMIT 20;
  ```

- [ ] **Chạy lại benchmark queries SAU khi áp indexes**
  ```sql
  -- Same query, check execution time improvement
  ```

- [ ] **Document performance improvements**
  - Ghi lại thời gian before/after
  - Expected: 50-100x faster cho most queries

---

## ✅ Phase 2: Deploy Optimized Service (Ngày 3-4)

### 2.1 Code Deployment

- [ ] **Verify files đã được tạo**
  ```bash
  ls -la backend/services/paymentRequestService.optimized.js
  ls -la backend/utils/featureFlags.js
  ls -la backend/routes/paymentRequest.wrapper.js
  ```

- [ ] **Chạy tests cho optimized service**
  ```bash
  npm test -- backend/tests/paymentRequestService.optimized.test.js
  ```

### 2.2 Feature Flag Configuration

- [ ] **Set feature flags trong .env (10% rollout)**
  ```bash
  # Thêm vào .env
  USE_OPTIMIZED_PAYMENT_SERVICE=true
  OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE=10
  ```

- [ ] **Restart application**
  ```bash
  pm2 restart chatchiu-api
  ```

- [ ] **Check logs**
  ```bash
  pm2 logs chatchiu-api --lines 100
  # Verify không có lỗi khi khởi động
  ```

### 2.3 Monitoring (24 giờ @ 10%)

- [ ] **Monitor error rates**
  ```bash
  pm2 logs chatchiu-api | grep ERROR
  ```

- [ ] **Check payment creation success rate**
  ```sql
  -- Compare success rate between services
  SELECT
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status != 'cancelled') as successful
  FROM payment_requests
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour
  ORDER BY hour DESC;
  ```

- [ ] **Monitor response times**
  ```bash
  # Check application logs for timing information
  pm2 logs chatchiu-api | grep "Payment request created"
  ```

- [ ] **User feedback**
  - Có báo lỗi từ users không?
  - Payment flow có vấn đề gì không?

### 2.4 Gradual Rollout (nếu 10% OK)

- [ ] **Tăng lên 25%**
  ```bash
  # Update .env
  OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE=25
  pm2 restart chatchiu-api
  ```
  Monitor thêm 24h

- [ ] **Tăng lên 50%**
  ```bash
  OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE=50
  pm2 restart chatchiu-api
  ```
  Monitor thêm 24h

- [ ] **Tăng lên 100%**
  ```bash
  OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE=100
  pm2 restart chatchiu-api
  ```
  Monitor thêm 48h

---

## ✅ Phase 3: Full Rollout & Cleanup (Ngày 7-10)

### 3.1 Production Verification

- [ ] **Verify performance improvements**
  ```sql
  -- Check average response time improved
  SELECT
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_seconds
  FROM payment_requests
  WHERE created_at > NOW() - INTERVAL '7 days';
  ```

- [ ] **Check error rates stabilized**
  ```sql
  SELECT
    DATE(created_at),
    COUNT(*) FILTER (WHERE status = 'cancelled') * 100.0 / COUNT(*) as cancellation_rate
  FROM payment_requests
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at);
  -- Cancellation rate should be < 5%
  ```

- [ ] **User satisfaction check**
  - Có complaints về payment không?
  - Withdrawal process có smooth không?

### 3.2 Code Cleanup (Optional)

- [ ] **Xóa feature flags và wrapper**
  ```bash
  # Sau khi 100% rollout stable, có thể:
  # 1. Replace all imports to use optimized service directly
  # 2. Remove wrapper
  # 3. Archive original service
  ```

- [ ] **Update documentation**
  - [ ] Update README
  - [ ] Update API docs
  - [ ] Update deployment guides

### 3.3 Performance Documentation

- [ ] **Document actual improvements**
  ```markdown
  ## Performance Improvements Achieved

  - Payment creation: XXms → YYms (ZZ% faster)
  - User list query: XXms → YYms (ZZ% faster)
  - Admin list query: XXms → YYms (ZZ% faster)
  - Database load: XX% reduction in query count
  ```

---

## 🔴 Rollback Plan (Nếu Có Vấn Đề)

### Rollback Database Indexes

```bash
# Nếu indexes gây vấn đề (rất hiếm)
psql -U postgres -d chatchiu -c "
  DROP INDEX IF EXISTS idx_payment_requests_user_status;
  DROP INDEX IF EXISTS idx_payment_requests_status_created;
  -- etc... drop all indexes created
"
```

### Rollback Optimized Service

```bash
# Disable optimized service
# Update .env
USE_OPTIMIZED_PAYMENT_SERVICE=false

# Restart
pm2 restart chatchiu-api
```

### Full Database Rollback (Last Resort)

```bash
# Restore from backup
psql -U postgres -d chatchiu < backups/latest_backup.sql

# Restart application
pm2 restart chatchiu-api
```

---

## 📊 Success Criteria

### Database Performance
- [ ] Index scans > 100 per index (sau 48h)
- [ ] Query execution time giảm 50-80%
- [ ] Database CPU usage không tăng >10%

### Application Performance
- [ ] Payment creation < 200ms (P95)
- [ ] Error rate < 0.1%
- [ ] No increase in timeout errors

### Business Metrics
- [ ] Payment success rate ≥ 95%
- [ ] No increase in user complaints
- [ ] Withdrawal processing time unchanged or better

---

## 📞 Emergency Contacts

**Nếu gặp vấn đề nghiêm trọng:**

1. **Immediately rollback**
   ```bash
   ./backend/scripts/deploy-optimization.sh rollback
   ```

2. **Check logs**
   ```bash
   pm2 logs chatchiu-api --lines 500 > error_logs.txt
   ```

3. **Database status**
   ```sql
   SELECT * FROM pg_stat_activity WHERE state != 'idle';
   ```

4. **Monitor system resources**
   ```bash
   htop  # CPU/Memory
   iotop # Disk I/O
   ```

---

## ✅ Final Checklist

Sau khi hoàn tất tất cả phases:

- [ ] All tests passing
- [ ] Performance improved as expected
- [ ] Error rates within acceptable range
- [ ] User experience improved or unchanged
- [ ] Database stable and performant
- [ ] Rollback plan tested and ready
- [ ] Documentation updated
- [ ] Team trained on new system
- [ ] Monitoring alerts configured

---

**Date Started:** _______________

**Phase 1 Completed:** _______________

**Phase 2 Completed:** _______________

**Phase 3 Completed:** _______________

**Sign-off:** _______________
