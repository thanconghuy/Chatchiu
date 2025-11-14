# 🧪 Hướng Dẫn Test Các Tính Năng Mới

## 📋 Tổng Quan

Hệ thống vừa được nâng cấp với các tính năng mới:
1. **Cron Jobs** - Tự động retry clicks chưa match
2. **Monitoring Dashboard** - Theo dõi hiệu suất tracking
3. **Retry Service** - Khôi phục đơn hàng bị mất

---

## 1️⃣ Test Retry Service (Khôi Phục Đơn Hàng)

### Test Thủ Công với Script

```bash
node test-retry-service.js
```

**Kết quả mong đợi:**
- ✅ Hiển thị số clicks chưa match
- ✅ Hiển thị số clicks sắp hết hạn
- ✅ Thử match lại các clicks chưa có conversion
- ✅ Báo cáo chi tiết kết quả

### Test qua Admin API

**Bước 1: Lấy Admin Token**
1. Đăng nhập vào `/admin`
2. Mở DevTools (F12) → Console
3. Chạy: `localStorage.getItem('token')`
4. Copy token

**Bước 2: Test API Endpoints**

Dùng Postman, Thunder Client, hoặc curl:

```bash
# 1. Kiểm tra stats
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/tools/retry-stats

# 2. Chạy retry thủ công
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"daysOld": 1, "limit": 100}' \
  http://localhost:3007/api/admin/tools/retry-unmatched

# 3. Xem clicks sắp hết hạn
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/tools/expiring-clicks?days=3&limit=20
```

---

## 2️⃣ Test Monitoring Dashboard

### Truy Cập Dashboard

```
http://localhost:3007/admin/monitoring
```

### Checklist Test

- [ ] **Overview Metrics hiển thị đúng**
  - Tỷ lệ match (%)
  - Tổng số clicks
  - Clicks chưa match
  - Clicks sắp hết hạn

- [ ] **Match Rate Trends Chart**
  - Biểu đồ hiển thị
  - Đổi time period: 24h, 7 ngày, 30 ngày
  - Chart cập nhật đúng

- [ ] **Match Method Breakdown**
  - Hiển thị số lượng match theo utm_content
  - Hiển thị số lượng match theo sub2
  - Hiển thị số lượng match theo aff_sid

- [ ] **Link Mode Distribution**
  - Hiển thị số clicks tạo bằng API mode
  - Hiển thị số clicks tạo bằng DIY mode

- [ ] **Cron Jobs Status**
  - Hiển thị trạng thái cron jobs
  - Nếu `AUTO_CRON_ENABLED=false`: hiển thị "chưa được kích hoạt"
  - Nếu `AUTO_CRON_ENABLED=true`: hiển thị danh sách jobs đang chạy

- [ ] **Smart Alerts**
  - Nếu có clicks chưa match > 50: hiển thị cảnh báo warning
  - Nếu có clicks sắp hết hạn > 20: hiển thị cảnh báo danger
  - Nếu match rate < 40%: hiển thị cảnh báo

- [ ] **Refresh Button**
  - Click "Làm mới" để reload data
  - Data cập nhật thành công

---

## 3️⃣ Test Cron Jobs

### Kiểm Tra Trạng Thái

```bash
# API call
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/cron/status
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": {
    "isInitialized": false,
    "autoCronEnabled": false,
    "jobsCount": 0,
    "jobs": []
  }
}
```

### Bật Cron Jobs (Khi Sẵn Sàng)

**Bước 1: Cấu hình**
Mở file `.env` và đổi:
```env
AUTO_CRON_ENABLED=true
```

**Bước 2: Restart Server**
```bash
npm start
```

**Bước 3: Kiểm tra log**
Server log sẽ hiển thị:
```
⏱️  Cron Jobs: 3 jobs initialized
✅ Scheduled: Retry unmatched clicks (0 */6 * * *)
✅ Scheduled: Cleanup expired clicks (0 3 * * *)
✅ Scheduled: Expiring clicks alert (0 9 * * *)
```

### Chạy Thủ Công Các Jobs

```bash
# Retry unmatched clicks
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/cron/trigger/retry-unmatched

# Cleanup expired clicks
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/cron/trigger/cleanup-expired

# Alert expiring clicks
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/cron/trigger/expiring-alert
```

### Dừng Cron Jobs

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/cron/stop
```

---

## 4️⃣ Test End-to-End Flow

### Scenario: Kiểm tra retry service có khôi phục được đơn hàng không

**Bước 1: Tạo test click**
1. Truy cập dashboard user
2. Click vào merchant (VD: Shopee)
3. Note lại click ID

**Bước 2: Giả lập conversion trên AccessTrade**
(Yêu cầu có quyền truy cập AccessTrade API sandbox)

**Bước 3: Đợi click "chưa match"**
- Click sẽ chưa match nếu conversion chưa về
- Hoặc tracking parameters bị drop

**Bước 4: Chạy retry service**
```bash
node test-retry-service.js
```

**Bước 5: Kiểm tra kết quả**
- Vào `/admin/conversions` xem conversion đã match chưa
- Hoặc check database:
```sql
SELECT c.id, c.clicked_at, co.order_id, co.created_at
FROM clicks c
LEFT JOIN conversions co ON c.id = co.click_id
WHERE c.id = 'YOUR_CLICK_ID';
```

---

## 5️⃣ Test Database Queries

### Kiểm tra clicks chưa match

```sql
SELECT
  c.id,
  c.merchant_id,
  c.clicked_at,
  c.link_expires_at,
  c.last_checked_at,
  CASE
    WHEN EXISTS (SELECT 1 FROM conversions WHERE click_id = c.id)
    THEN 'matched'
    ELSE 'unmatched'
  END as status
FROM clicks c
WHERE c.link_expires_at > NOW()
  AND NOT EXISTS (SELECT 1 FROM conversions WHERE click_id = c.id)
ORDER BY c.clicked_at DESC
LIMIT 20;
```

### Kiểm tra match rate

```sql
SELECT
  COUNT(*) as total_clicks,
  COUNT(co.id) as matched_clicks,
  ROUND(COUNT(co.id)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as match_rate
FROM clicks c
LEFT JOIN conversions co ON c.id = co.click_id
WHERE c.clicked_at >= NOW() - INTERVAL '7 days';
```

### Kiểm tra match method breakdown

```sql
SELECT
  CASE
    WHEN co.utm_content IS NOT NULL AND c.utm_content = co.utm_content THEN 'utm_content'
    WHEN co.sub2 IS NOT NULL AND c.sub2 = co.sub2 THEN 'sub2'
    WHEN co.aff_sid IS NOT NULL AND c.aff_sid = co.aff_sid THEN 'aff_sid'
    ELSE 'unknown'
  END as match_method,
  COUNT(*) as count
FROM conversions co
JOIN clicks c ON co.click_id = c.id
WHERE co.created_at >= NOW() - INTERVAL '7 days'
GROUP BY match_method
ORDER BY count DESC;
```

---

## 6️⃣ Performance Testing

### Load Test Monitoring API

Dùng Apache Bench hoặc k6:

```bash
# Test monitoring metrics endpoint
ab -n 100 -c 10 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3007/api/admin/monitoring/metrics?days=7
```

### Benchmark Retry Service

```bash
# Đo thời gian retry 100 clicks
time node test-retry-service.js
```

---

## 🎯 Kết Quả Mong Đợi

### ✅ Retry Service
- Tìm và match được clicks chưa có conversion
- Cải thiện match rate từ 38% lên 50-60%
- Giảm số đơn hàng bị mất

### ✅ Monitoring Dashboard
- Hiển thị realtime metrics
- Chart mượt mà, không lag
- Alerts chính xác

### ✅ Cron Jobs
- Chạy đúng lịch
- Log rõ ràng
- Không crash server

---

## 🐛 Troubleshooting

### Vấn đề: Monitoring dashboard không load data

**Nguyên nhân:** Token hết hạn hoặc không đủ quyền

**Giải pháp:**
1. Check console (F12) xem có lỗi 401/403 không
2. Đăng nhập lại admin
3. Kiểm tra `authenticateAdmin` middleware

### Vấn đề: Cron jobs không chạy

**Nguyên nhân:** `AUTO_CRON_ENABLED=false`

**Giải pháp:**
1. Đổi thành `AUTO_CRON_ENABLED=true` trong `.env`
2. Restart server
3. Check log: "Cron Jobs: X jobs initialized"

### Vấn đề: Retry service không tìm thấy clicks

**Nguyên nhân:** Không có clicks chưa match hoặc filter quá strict

**Giải pháp:**
```javascript
// Đổi filter trong test-retry-service.js
await retryService.retryUnmatchedClicks({
  daysOld: 0,  // Thử 0 thay vì 1
  limit: 100
});
```

### Vấn đề: Chart không hiển thị

**Nguyên nhân:** Không có dữ liệu hoặc Canvas API lỗi

**Giải pháp:**
1. Check console có lỗi JavaScript không
2. Tạo test clicks để có data
3. Refresh trang (F5)

---

## 📊 Metrics Quan Trọng Cần Theo Dõi

1. **Match Rate**: Mục tiêu > 60%
2. **Unmatched Clicks**: Mục tiêu < 50
3. **Match by sub2**: Nên chiếm 20-30% (chứng tỏ backup tracking hoạt động)
4. **Expiring Clicks**: Mục tiêu < 20

---

## 🚀 Bước Tiếp Theo

1. **Test trong 1 tuần** với `AUTO_CRON_ENABLED=false` (manual retry)
2. **Theo dõi metrics** trên monitoring dashboard
3. **Khi match rate ổn định** > 50%, bật auto cron
4. **Monitor logs** để đảm bảo không có lỗi
5. **Tối ưu schedule** nếu cần (thay đổi `RETRY_CRON_SCHEDULE`)

---

## 📝 Ghi Chú

- Retry service chỉ xử lý clicks chưa hết hạn (< 30 ngày)
- Cron jobs chạy theo timezone `Asia/Ho_Chi_Minh`
- Monitoring dashboard cache data 5 phút để giảm load DB
- Nên backup database trước khi test production

---

**Chúc bạn test thành công! 🎉**
