# 🗺️ Roadmap: Các Bước Tiếp Theo

## 📊 Tình Hình Hiện Tại

✅ **Đã Hoàn Thành:**
- Priority 1: Sub Parameters (utm_content, sub2, sub3, sub4)
- Priority 2: Timestamp Tracking & Retry Mechanism
- Priority 3: AccessTrade API Integration (Dual Mode)
- Cron Jobs Service (Auto retry, cleanup, alerts)
- Monitoring Dashboard (Realtime metrics)
- Testing Guide & Scripts

📈 **Match Rate Hiện Tại:** ~38%
🎯 **Mục Tiêu:** 60-75%

---

## 🎯 Kế Hoạch Ngắn Hạn (1-2 Tuần)

### Tuần 1: Testing & Monitoring

#### 1. Test Monitoring Dashboard ⏰ 30 phút
```
✓ Mở http://localhost:3007/admin/monitoring
✓ Kiểm tra tất cả metrics hiển thị đúng
✓ Test đổi time period (24h, 7d, 30d)
✓ Screenshot kết quả để so sánh sau
```

#### 2. Chạy Retry Service Thủ Công Mỗi Ngày ⏰ 5 phút/ngày
```bash
# Chạy mỗi ngày lúc 9h sáng và 6h chiều
node test-retry-service.js
```

**Ghi chép:**
- Số clicks matched mỗi lần chạy
- Match rate improvement
- Clicks sắp hết hạn cần xử lý

#### 3. Phân Tích Match Method Breakdown ⏰ 1 giờ
```sql
-- Chạy query này mỗi ngày
SELECT
  CASE
    WHEN co.utm_content IS NOT NULL AND c.utm_content = co.utm_content THEN 'utm_content'
    WHEN co.sub2 IS NOT NULL AND c.sub2 = co.sub2 THEN 'sub2'
    WHEN co.aff_sid IS NOT NULL AND c.aff_sid = co.aff_sid THEN 'aff_sid'
    ELSE 'unknown'
  END as match_method,
  COUNT(*) as count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) as percentage
FROM conversions co
JOIN clicks c ON co.click_id = c.id
WHERE co.created_at >= NOW() - INTERVAL '7 days'
GROUP BY match_method
ORDER BY count DESC;
```

**Mục tiêu:**
- `utm_content` (Priority 1): 40-50%
- `sub2` (Priority 2 - backup): 30-40% ← Quan trọng!
- `aff_sid` (Priority 3 - fallback): 10-20%
- `unknown`: < 5%

#### 4. So Sánh API Mode vs DIY Mode ⏰ 30 phút
Nếu bạn muốn test API mode:

1. Backup database trước
2. Đổi `.env`: `USE_ACCESSTRADE_API=true`
3. Restart server
4. Tạo 20 test clicks
5. Đợi 3-5 ngày
6. So sánh match rate giữa API và DIY

---

### Tuần 2: Optimization & Auto-Retry

#### 5. Tối Ưu Retry Schedule ⏰ 2 giờ

Sau 1 tuần test manual, phân tích:
- Clicks thường match sau bao lâu? (1 ngày, 3 ngày, 1 tuần?)
- Có pattern nào không? (VD: Shopee match nhanh hơn Tiki?)

Điều chỉnh schedule trong `.env`:
```env
# Nếu clicks match nhanh (1-2 ngày)
RETRY_CRON_SCHEDULE=0 */3 * * *  # Mỗi 3 giờ

# Nếu clicks match chậm (3-7 ngày)
RETRY_CRON_SCHEDULE=0 */6 * * *  # Mỗi 6 giờ (mặc định)

# Nếu clicks match rất chậm (> 7 ngày)
RETRY_CRON_SCHEDULE=0 */12 * * *  # Mỗi 12 giờ
```

#### 6. Bật Auto Cron Jobs ⏰ 15 phút

**Điều kiện:** Match rate ổn định > 50% trong 1 tuần

Bật auto retry:
```env
AUTO_CRON_ENABLED=true
```

Restart server và monitor logs:
```bash
npm start
# Xem logs: ✅ Scheduled: Retry unmatched clicks (0 */6 * * *)
```

#### 7. Setup Logging & Alerts ⏰ 1 giờ

Tạo file log riêng cho cron jobs:

```javascript
// backend/utils/cronLogger.js
const winston = require('winston');

const cronLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/cron.log' }),
    new winston.transports.File({
      filename: 'logs/cron-errors.log',
      level: 'error'
    })
  ]
});

module.exports = cronLogger;
```

Cấu hình email alerts (tùy chọn) khi:
- Match rate < 40%
- Expiring clicks > 50
- Cron job fail

---

## 🚀 Kế Hoạch Trung Hạn (1-2 Tháng)

### 8. Nâng Cấp Tracking Logic ⏰ 4 giờ

**Vấn đề hiện tại:** Chỉ match chính xác 100%

**Giải pháp:** Fuzzy matching cho edge cases

```javascript
// backend/services/trackingService.js - Enhancement
async function fuzzyMatchClick(conversion) {
  // Try exact match first
  let click = await exactMatch(conversion);
  if (click) return click;

  // Try fuzzy match by user + merchant + time window
  const timeWindow = 30 * 60 * 1000; // 30 minutes

  click = await pool.query(`
    SELECT c.*
    FROM clicks c
    WHERE c.user_id = $1
      AND c.merchant_id = $2
      AND c.clicked_at BETWEEN $3 - INTERVAL '30 minutes'
                           AND $3 + INTERVAL '30 minutes'
      AND NOT EXISTS (SELECT 1 FROM conversions WHERE click_id = c.id)
    ORDER BY ABS(EXTRACT(EPOCH FROM (c.clicked_at - $3)))
    LIMIT 1
  `, [userId, merchantId, conversionTime]);

  return click.rows[0];
}
```

**Lợi ích:** Tăng match rate thêm 5-10%

### 9. A/B Testing Framework ⏰ 6 giờ

Test các chiến lược khác nhau:

```javascript
// Chiến lược A: Ưu tiên utm_content → sub2 → aff_sid (hiện tại)
// Chiến lược B: Ưu tiên sub2 → utm_content → aff_sid
// Chiến lược C: Match song song và chọn độ tin cậy cao nhất
```

So sánh kết quả sau 1 tháng:
- Match rate
- False positive rate
- Performance (query time)

### 10. Merchant-Specific Optimization ⏰ 3 giờ

Phân tích từng merchant:

```sql
SELECT
  c.merchant_id,
  COUNT(*) as total_clicks,
  COUNT(co.id) as matched_conversions,
  ROUND(COUNT(co.id)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as match_rate
FROM clicks c
LEFT JOIN conversions co ON c.id = co.click_id
WHERE c.clicked_at >= NOW() - INTERVAL '30 days'
GROUP BY c.merchant_id
ORDER BY match_rate ASC;
```

Nếu 1 merchant có match rate thấp:
- Kiểm tra redirect chain (dùng curl -L)
- Kiểm tra parameters nào bị drop
- Tạo custom handling cho merchant đó

### 11. Dashboard Enhancement ⏰ 4 giờ

Thêm tính năng vào monitoring dashboard:

1. **Merchant Breakdown Chart**
   - Match rate by merchant
   - Conversion value by merchant

2. **Time-to-Match Analysis**
   - Histogram: Click → Conversion time
   - Average match latency

3. **Alerts History**
   - Log các lần cảnh báo
   - Track resolution time

4. **Export Reports**
   - Export CSV/Excel
   - Scheduled email reports

---

## 🎯 Kế Hoạch Dài Hạn (3-6 Tháng)

### 12. Machine Learning Matching ⏰ 20 giờ

Train ML model để predict click-conversion match:

**Features:**
- User behavior pattern
- Merchant characteristics
- Time patterns
- Device/browser fingerprint
- IP address similarity

**Benefits:**
- Auto-match với độ tin cậy cao
- Phát hiện fraud clicks
- Match rate > 80%

### 13. Real-time Webhook Integration ⏰ 8 giờ

Thay vì polling API mỗi 6 giờ:

```javascript
// Webhook endpoint nhận conversion realtime từ AccessTrade
app.post('/webhook/accesstrade/conversion', async (req, res) => {
  const conversion = req.body;

  // Verify signature
  if (!verifyWebhookSignature(req)) {
    return res.status(401).send('Invalid signature');
  }

  // Instant matching
  await trackingService.processConversion(conversion);

  res.status(200).send('OK');
});
```

**Benefits:**
- Match ngay lập tức (< 1 phút thay vì 6 giờ)
- Giảm load API
- User experience tốt hơn

### 14. Multi-Network Support ⏰ 16 giờ

Mở rộng sang các affiliate networks khác:

- Admicro
- Accesstrade (done)
- CJ Affiliate
- Involve Asia

**Architecture:**
```javascript
// Adapter pattern
class AffiliateNetworkAdapter {
  async generateLink(user, merchant, params) { /* ... */ }
  async getConversions(startDate, endDate) { /* ... */ }
  async matchConversion(conversion) { /* ... */ }
}

class AccessTradeAdapter extends AffiliateNetworkAdapter { /* ... */ }
class AdmicroAdapter extends AffiliateNetworkAdapter { /* ... */ }
```

### 15. Advanced Analytics ⏰ 12 giờ

1. **Cohort Analysis**
   - User retention
   - Conversion rate by cohort
   - LTV prediction

2. **Attribution Modeling**
   - First-click attribution
   - Last-click attribution
   - Multi-touch attribution

3. **Predictive Analytics**
   - Predict conversion probability
   - Detect abnormal patterns
   - Forecast cashback payout

---

## 📈 KPIs Theo Dõi

### Hàng Ngày
- [ ] Match rate (mục tiêu: > 60%)
- [ ] Unmatched clicks count (mục tiêu: < 50)
- [ ] Clicks sắp hết hạn (mục tiêu: < 20)
- [ ] Cron job success rate (mục tiêu: 100%)

### Hàng Tuần
- [ ] Match rate trend (tăng/giảm?)
- [ ] Match method distribution (sub2 có hoạt động?)
- [ ] API mode vs DIY comparison
- [ ] Performance metrics (query time)

### Hàng Tháng
- [ ] Overall match rate improvement
- [ ] Merchant-specific performance
- [ ] User satisfaction (survey)
- [ ] Revenue impact

---

## 🎯 Mục Tiêu Cuối Cùng

| Metric | Hiện Tại | Mục Tiêu Q1 2025 | Mục Tiêu Q2 2025 |
|--------|----------|------------------|------------------|
| Match Rate | 38% | 60% | 75% |
| Unmatched Clicks | ~100 | < 50 | < 20 |
| Time to Match | 6h | 1h | < 5 min |
| User Complaints | - | < 5/tháng | < 2/tháng |
| Revenue Lost | 62% | 40% | 25% |

---

## 📝 Checklist Hành Động Ngay

### Tuần Này (Ưu Tiên Cao)

- [ ] Test monitoring dashboard kỹ
- [ ] Chạy retry service manual mỗi ngày
- [ ] Ghi chép kết quả vào spreadsheet
- [ ] Screenshot metrics để so sánh

### Tuần Sau

- [ ] Phân tích match method breakdown
- [ ] Quyết định có bật API mode không
- [ ] Tối ưu retry schedule
- [ ] Setup logging tốt hơn

### Tháng Sau

- [ ] Bật auto cron jobs
- [ ] Implement fuzzy matching
- [ ] Dashboard enhancements
- [ ] Merchant-specific optimization

---

## 💡 Gợi Ý

1. **Bắt đầu nhỏ:** Test manual 1-2 tuần trước khi bật auto
2. **Monitor chặt:** Check monitoring dashboard mỗi ngày
3. **Ghi chép:** Document mọi thay đổi và kết quả
4. **Backup:** Backup database trước khi deploy production
5. **A/B Test:** Đừng change nhiều thứ cùng lúc
6. **Ask for help:** Nếu stuck, hỏi ngay!

---

## 📞 Support

Nếu gặp vấn đề:
1. Check TESTING-GUIDE.md troubleshooting section
2. Review logs: `logs/app.log`, `logs/cron.log`
3. Test với script: `node test-retry-service.js`
4. Check monitoring dashboard alerts

**Chúc may mắn! 🚀**
