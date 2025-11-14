# 🧪 HƯỚNG DẪN TEST SUB PARAMETERS

## Test 1: Kiểm Tra Link Generation (Tự Động)

Chạy test script để kiểm tra link có chứa đủ sub parameters:

```bash
node test-sub-parameters.js
```

**Kết quả mong đợi:**
```
✅ Link generation successful!
✅ All sub parameters are present!
✅ Sub1 matches User ID: true
✅ Sub2 matches Click ID: true
✅ Sub3 matches Click Type: true
```

---

## Test 2: Kiểm Tra Full Flow (Tự Động)

Test toàn bộ flow từ tạo click → generate link → lưu DB → matching:

```bash
node test-full-flow-sub-parameters.js
```

**Kết quả mong đợi:**
```
✅ Click created
✅ Link generated
✅ Database verification
✅ Find by utm_content: SUCCESS
✅ Find by sub2: SUCCESS (← Tính năng mới)
✅ Find by aff_sid: SUCCESS
✅ Fallback chain working correctly
```

---

## Test 3: Test Thực Tế Trên Frontend (Thủ Công)

### Bước 1: Đăng nhập vào Dashboard
1. Mở trình duyệt: http://localhost:3007/dashboard
2. Đăng nhập với tài khoản của bạn

### Bước 2: Tạo Link Mua Hàng
1. Click vào merchant bất kỳ (VD: Shopee)
2. Chọn "Đi đến Shopee" (mua sắm tự do)
3. **MỞ Developer Tools (F12)**
4. Vào tab **Network**
5. Click nút "Đi đến Shopee"

### Bước 3: Kiểm Tra Request API
1. Trong tab Network, tìm request tên: `generate-link`
2. Click vào request đó
3. Vào tab **Response**
4. Kiểm tra `data.affiliateUrl`

### Bước 4: Xác Nhận Sub Parameters
Link phải có format như sau:

```
https://go.isclix.com/deep_link/4790392958945222748/[merchant_id]?
  url=https://shopee.vn
  &utm_source=chatchiu
  &utm_campaign=cashback
  &utm_medium=[username]
  &utm_content=[click_id]
  &sub1=[user_id]           ← KIỂM TRA
  &sub2=[click_id]          ← KIỂM TRA
  &sub3=button              ← KIỂM TRA
  &sub4=oneatweb
  &aff_sid=[unique_id]
```

**Checklist:**
- [ ] Link có chứa `sub1=` với giá trị là UUID
- [ ] Link có chứa `sub2=` với giá trị giống utm_content
- [ ] Link có chứa `sub3=button` hoặc `sub3=link`
- [ ] Link có chứa `sub4=oneatweb`

---

## Test 4: Kiểm Tra Database (Thủ Công)

### Kiểm tra click vừa tạo có lưu đủ sub parameters:

```sql
-- Lấy click mới nhất
SELECT
  id,
  user_id,
  merchant_id,
  click_type,
  utm_content,
  sub1,  -- ← Phải có giá trị
  sub2,  -- ← Phải có giá trị
  sub3,  -- ← Phải có giá trị
  sub4,  -- ← Phải là 'oneatweb'
  clicked_at
FROM clicks
ORDER BY clicked_at DESC
LIMIT 5;
```

**Kết quả mong đợi:**
```
sub1: d634c3db-1e98-444e-8c21-6979ee046548 (user_id)
sub2: 28a8e867-1f6a-4880-83b4-fccf93b287a9 (click_id)
sub3: button
sub4: oneatweb
```

---

## Test 5: Kiểm Tra Conversion Matching (Thủ Công)

**Scenario 1: Match thành công qua utm_content (Priority 1)**

Giả lập conversion từ AccessTrade có utm_content:

```javascript
// Trong backend console hoặc test script
const trackingService = require('./backend/services/trackingService');

const testConversion = {
  order_id: 'TEST_ORDER_001',
  utm_content: '28a8e867-1f6a-4880-83b4-fccf93b287a9', // Click ID
  aff_sid: 'some_aff_sid',
  pub_commission: 50000,
  billing: 1000000,
  status: 1
};

await trackingService.processConversion(testConversion);
```

**Log mong đợi:**
```
✅ Attempting to match by utm_content (click_id)
✅ Found matching click
   matchedBy: 'utm_content'
   clickId: '28a8e867-1f6a-4880-83b4-fccf93b287a9'
```

---

**Scenario 2: utm_content bị drop, match qua sub2 (Priority 2 - MỚI)**

Giả lập conversion không có utm_content nhưng có sub2:

```javascript
const testConversion = {
  order_id: 'TEST_ORDER_002',
  utm_content: null,  // ← BỊ DROP
  sub2: '28a8e867-1f6a-4880-83b4-fccf93b287a9', // ← BACKUP
  aff_sid: 'some_aff_sid',
  pub_commission: 50000,
  billing: 1000000,
  status: 1
};

await trackingService.processConversion(testConversion);
```

**Log mong đợi:**
```
⚠️  No match by utm_content, trying sub2 (backup click_id)
✅ Found matching click
   matchedBy: 'sub2'  ← QUAN TRỌNG!
   clickId: '28a8e867-1f6a-4880-83b4-fccf93b287a9'
```

---

**Scenario 3: Cả utm_content và sub2 đều drop, match qua aff_sid (Priority 3)**

```javascript
const testConversion = {
  order_id: 'TEST_ORDER_003',
  utm_content: null,  // ← BỊ DROP
  sub2: null,         // ← BỊ DROP
  aff_sid: 'd634c3db-1e98-444e-8c21-6979ee046548_1763095655289_859e4',
  pub_commission: 50000,
  billing: 1000000,
  status: 1
};

await trackingService.processConversion(testConversion);
```

**Log mong đợi:**
```
⚠️  No match by utm_content, trying sub2 (backup click_id)
⚠️  No match by utm_content or sub2, trying aff_sid
✅ Found matching click
   matchedBy: 'aff_sid'
   clickId: '28a8e867-1f6a-4880-83b4-fccf93b287a9'
```

---

## Test 6: Kiểm Tra Lịch Sử Click (Frontend)

1. Vào http://localhost:3007/history
2. Click vào tab **"Lượt click"**
3. Kiểm tra các click vừa tạo

**Mong đợi:**
- Tất cả click đều hiển thị
- Có thông tin merchant, thời gian, trạng thái
- Link affiliate đầy đủ

---

## 📊 Checklist Tổng Hợp

### ✅ Backend Testing
- [ ] `test-sub-parameters.js` pass
- [ ] `test-full-flow-sub-parameters.js` pass
- [ ] Database có lưu sub1, sub2, sub3
- [ ] Matching chain hoạt động đúng 3 priority levels

### ✅ Frontend Testing
- [ ] Generate link thành công
- [ ] Link chứa đầy đủ sub1-sub4 parameters
- [ ] Developer Tools Network tab hiển thị đúng
- [ ] Lịch sử click hiển thị đầy đủ

### ✅ Integration Testing
- [ ] Click → Generate Link → Save DB: OK
- [ ] Conversion matching qua utm_content: OK
- [ ] Conversion matching qua sub2 (NEW): OK
- [ ] Conversion matching qua aff_sid: OK

---

## 🚨 Lưu Ý Quan Trọng

### Điểm khác biệt chính:
1. **sub2 là backup của utm_content** - Đây là tham số QUAN TRỌNG nhất
2. **sub1 lưu user_id** - Để phân tích nếu cần
3. **sub3 lưu click_type** - Để analytics (button vs link)

### Khi nào sử dụng sub parameters?
- AccessTrade API trả về conversion
- utm_content bị drop trong redirect chain
- Hệ thống tự động fallback sang sub2
- **→ Giảm mất đơn hàng**

### Core logic KHÔNG thay đổi:
- ✅ Flow tạo click vẫn như cũ
- ✅ Flow generate link vẫn như cũ
- ✅ Flow lưu database vẫn như cũ
- ✅ CHỈ THÊM fallback matching mới

---

## 🎯 Kết Quả Mong Đợi

### Trước khi cải tiến:
```
100 clicks → 38 conversions matched
             → 62 conversions lost ❌
Conversion rate: 38%
```

### Sau khi cải tiến:
```
100 clicks → 50-60 conversions matched ← TĂNG
             → 40-50 conversions lost ← GIẢM
Conversion rate: 50-60% ← CẢI THIỆN 30-60%
```

**Lý do:** sub2 ít bị drop hơn utm_content vì:
- Tên ngắn hơn (sub2 vs utm_content)
- Không phải standard UTM parameter
- Ít bị filter bởi merchant
- Cung cấp redundancy cho tracking

---

## 📞 Troubleshooting

### Nếu test fail:

**1. Database migration chưa chạy:**
```bash
node run-migration-006.js
```

**2. Server chưa restart:**
```bash
npm start
```

**3. Link không chứa sub parameters:**
- Check file: `backend/services/linkGenerator.js` line 48-60
- Check file: `backend/routes/dashboard.js` line 170-183

**4. Conversion matching không hoạt động:**
- Check file: `backend/services/trackingService.js` line 137-199
- Check logs trong console

---

## 📈 Monitoring

Sau khi deploy, theo dõi logs để xem:

```bash
# Xem conversion matching bằng method nào
grep "Found matching click" logs/app.log

# Đếm số lần match bằng sub2 (tính năng mới)
grep "matchedBy: 'sub2'" logs/app.log | wc -l

# Đếm số lần match bằng utm_content
grep "matchedBy: 'utm_content'" logs/app.log | wc -l

# Đếm số conversion không match được
grep "No matching click found" logs/app.log | wc -l
```

---

## ✅ Sign-off Checklist

Trước khi đánh dấu hoàn thành:

- [ ] Đã chạy `test-sub-parameters.js` - PASS
- [ ] Đã chạy `test-full-flow-sub-parameters.js` - PASS
- [ ] Đã test thủ công trên frontend - PASS
- [ ] Đã kiểm tra database có lưu sub1-sub4 - PASS
- [ ] Đã hiểu rõ 3-tier fallback chain
- [ ] Đã đọc và hiểu toàn bộ hướng dẫn này

**Người test:** _______________
**Ngày test:** _______________
**Kết quả:** ⬜ PASS  ⬜ FAIL

---

**🎉 Chúc mừng! Bạn đã cải tiến thành công hệ thống tracking!**
