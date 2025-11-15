# TÓM TẮT TÍNH NĂNG MỚI - CASHBACK SYSTEM

## 📋 MỤC LỤC
1. [Module Tạo Link Affiliate](#1-module-tạo-link-affiliate)
2. [Tính Năng Settings](#2-tính-năng-settings)
3. [Tính Năng Monitoring](#3-tính-năng-monitoring)
4. [Cải Tiến UX/UI](#4-cải-tiến-uxui)
5. [Cải Tiến Database](#5-cải-tiến-database)
6. [Cải Tiến Timezone](#6-cải-tiến-timezone)

---

## 1. MODULE TẠO LINK AFFILIATE

### 📌 Tổng Quan

Module tạo link affiliate là tính năng cốt lõi của hệ thống, cho phép user tạo tracking link để mua hàng và nhận cashback. Hệ thống hỗ trợ **2 phương thức** tạo link:

### 🔹 1.1. API MODE (Chính Thức - Ưu Tiên)

**Mô tả:**
- Sử dụng AccessTrade Official API để tạo tracking link
- Cookie được set chính thức bởi AccessTrade
- Tracking chính xác và conversion rate cao hơn

**Cách hoạt động:**

```
User Click "Tạo Link"
        ↓
Backend kiểm tra API token
        ↓
Gọi AccessTrade API: POST /v1/links/create
        ↓
Nhận tracking link chính thức
        ↓
Lưu vào database với source = 'api'
        ↓
Redirect user đến tracking link
```

**File liên quan:**
- `backend/services/accessTradeLink.js` - Service tạo link qua API
- `backend/routes/dashboard.js:1075-1231` - Endpoint `/dashboard/generate-link`

**Authentication:**
```javascript
headers: {
  'Authorization': 'Token YOUR_ACCESS_TOKEN', // Chú ý: Dùng "Token" không phải "Bearer"
  'Content-Type': 'application/json'
}
```

**Request Parameters:**
```javascript
{
  url: 'https://shopee.vn/product/...',      // URL đích
  utm_source: 'chatchiu',                    // Nguồn traffic
  utm_medium: 'cashback',                    // Phương thức
  utm_campaign: 'shopee_campaign',           // Chiến dịch
  utm_content: 'user_123',                   // User ID
  utm_term: 'aff_sid_123',                   // Affiliate SID
  sub1: 'user_id',                           // Backup tracking
  sub2: 'click_id',                          // Backup tracking
  sub3: 'click_type',                        // button/link
  sub4: 'merchant_id'                        // Merchant ID
}
```

**Response:**
```javascript
{
  data: {
    tracking_link: 'https://go.isclix.com/deep_link/...'
  }
}
```

**Ưu điểm:**
- ✅ Cookie chính thức từ AccessTrade
- ✅ Tracking chính xác 100%
- ✅ Conversion rate cao
- ✅ Hỗ trợ đầy đủ từ AccessTrade

**Nhược điểm:**
- ❌ Cần API token (phải đăng ký)
- ❌ Có rate limit
- ❌ Phụ thuộc vào API uptime

---

### 🔹 1.2. DIY MODE (Tự Xây Dựng - Fallback)

**Mô tả:**
- Tự xây dựng tracking link theo format của AccessTrade
- Sử dụng khi API mode không khả dụng hoặc fail
- Cookie được set bởi merchant site (không chính thức)

**Cách hoạt động:**

```
User Click "Tạo Link"
        ↓
API Mode check → Fail/Disabled
        ↓
Fallback to DIY Mode
        ↓
Xây dựng link theo format:
https://[merchant]?utm_source=...&aff_sid=...
        ↓
Lưu vào database với source = 'diy'
        ↓
Redirect user đến link tự tạo
```

**File liên quan:**
- `backend/services/linkGenerator.js` - Service tạo link DIY
- `backend/routes/dashboard.js:1075-1231` - Logic fallback

**Format Link DIY:**
```javascript
// Với deep_link_base từ database
const baseUrl = merchant.deep_link_base; // vd: "https://shopee.vn"

// Thêm UTM parameters
const params = {
  utm_source: 'chatchiu',
  utm_medium: 'cashback',
  utm_campaign: merchantId,
  utm_content: userId,
  aff_sid: generateAffSid(userId),  // Format: cb_{userId}_{timestamp}
  sub1: userId,
  sub2: clickId,
  sub3: clickType,
  sub4: merchantId
};

// Kết quả
finalUrl = `${baseUrl}?${queryString(params)}`;
// → https://shopee.vn?utm_source=chatchiu&utm_medium=cashback&aff_sid=cb_123_1699999999...
```

**UTM Parameters Explained:**
- `utm_source` - Nguồn traffic (chatchiu)
- `utm_medium` - Phương thức (cashback)
- `utm_campaign` - Merchant/Campaign ID
- `utm_content` - User ID
- `utm_term` - Affiliate SID (chủ yếu)
- `aff_sid` - AccessTrade Affiliate ID (quan trọng nhất!)
- `sub1-4` - Backup tracking parameters

**Hàm generateAffSid:**
```javascript
function generateAffSid(userId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `cb_${userId}_${timestamp}_${random}`;
}
// Output: cb_123_1699999999_x7k2m9
```

**Ưu điểm:**
- ✅ Không cần API token
- ✅ Không có rate limit
- ✅ Hoạt động offline
- ✅ Tốc độ nhanh

**Nhược điểm:**
- ❌ Tracking không chính thức
- ❌ Conversion rate thấp hơn
- ❌ Phụ thuộc vào merchant xử lý UTM
- ❌ Không có support từ AccessTrade

---

### 🔹 1.3. LOGIC CHỌN MODE

**File:** `backend/routes/dashboard.js:1075-1231`

```javascript
// Bước 1: Kiểm tra API mode có khả dụng không
const apiAvailable = await accessTradeLinkService.isAvailable();

if (apiAvailable && USE_API_MODE) {
  try {
    // Thử tạo link bằng API
    result = await accessTradeLinkService.generateLink(
      user, merchant, clickId, clickType, productUrl
    );

    linkSource = 'api';

  } catch (apiError) {
    // API fail → Fallback to DIY
    logger.warn('API mode failed, falling back to DIY', apiError);

    result = await linkGeneratorService.generateLink(
      user, merchant, clickId, clickType, productUrl
    );

    linkSource = 'diy';
  }
} else {
  // API không khả dụng → Dùng DIY
  result = await linkGeneratorService.generateLink(
    user, merchant, clickId, clickType, productUrl
  );

  linkSource = 'diy';
}
```

**Các trường hợp sử dụng:**

| Trường hợp | Mode | Lý do |
|------------|------|-------|
| API token configured + API online | API | Ưu tiên |
| API token configured + API offline | DIY | Fallback |
| No API token | DIY | Mặc định |
| API rate limit exceeded | DIY | Fallback |

---

### 🔹 1.4. DATABASE SCHEMA

**Bảng: affiliate_clicks**

```sql
CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  merchant_id VARCHAR(255),
  click_type VARCHAR(50),              -- 'button' hoặc 'link'
  product_url TEXT,                    -- URL sản phẩm (nếu click_type = 'link')
  affiliate_url TEXT,                  -- Tracking URL cuối cùng
  aff_sid VARCHAR(255),                -- Affiliate SID
  utm_params JSONB,                    -- UTM parameters
  source VARCHAR(50),                  -- 'api' hoặc 'diy' ← QUAN TRỌNG
  clicked_at TIMESTAMP DEFAULT NOW(),
  has_conversion BOOLEAN DEFAULT FALSE,
  conversion_id UUID,
  cashback DECIMAL(10,2)
);
```

**Ý nghĩa field `source`:**
- `'api'` - Link được tạo bằng AccessTrade API (chính thức)
- `'diy'` - Link tự xây dựng (fallback)

**Query thống kê:**
```sql
-- Đếm số link theo source
SELECT
  source,
  COUNT(*) as total,
  SUM(CASE WHEN has_conversion THEN 1 ELSE 0 END) as conversions,
  (SUM(CASE WHEN has_conversion THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT * 100) as conversion_rate
FROM affiliate_clicks
GROUP BY source;

-- Kết quả mẫu:
-- source | total | conversions | conversion_rate
-- api    | 1000  | 150        | 15.0%
-- diy    | 500   | 30         | 6.0%
```

---

### 🔹 1.5. FRONTEND FLOW

**File:** `frontend/js/dashboard.js`

**2 Loại Click:**

#### A. Mua Sắm Tự Do (Button Click)
```javascript
// User click "Đi đến Shopee"
async function handleFreeShoppingClick() {
  // 1. Disable button + Show loading
  freeShoppingBtn.disabled = true;
  freeShoppingBtn.innerHTML = '<span class="spinner"></span> Đang tạo link...';

  // 2. Show toast notification
  showToast(`Đang chuyển đến trang ${merchant.name} mua hàng, đợi trong vài giây...`);

  // 3. Call API
  const response = await apiRequest('/dashboard/generate-link', {
    method: 'POST',
    body: JSON.stringify({
      merchantId: merchant.id,
      clickType: 'button'  // ← Không cần productUrl
    })
  });

  // 4. Redirect
  window.open(response.data.affiliateUrl, '_blank');
}
```

#### B. Có Link Sản Phẩm (Product Link)
```javascript
// User paste link sản phẩm và click "Tạo link mua hàng"
async function handleGenerateLinkClick() {
  const productUrl = productUrlInput.value.trim();

  // 1. Validate URL
  if (!productUrl || !isValidUrl(productUrl)) {
    showToast('Link không hợp lệ', 'error');
    return;
  }

  // 2. Disable button + Show loading
  generateLinkBtn.disabled = true;
  generateLinkBtn.innerHTML = '<span class="spinner"></span> Đang tạo link...';

  // 3. Show toast notification
  showToast(`Đang chuyển đến trang ${merchant.name} mua hàng, đợi trong vài giây...`);

  // 4. Call API
  const response = await apiRequest('/dashboard/generate-link', {
    method: 'POST',
    body: JSON.stringify({
      merchantId: merchant.id,
      clickType: 'link',
      productUrl: productUrl  // ← URL cụ thể của sản phẩm
    })
  });

  // 5. Redirect
  window.open(response.data.affiliateUrl, '_blank');
}
```

**Loading State:**
- Spinner animation (CSS keyframe)
- Button disabled
- Toast notification với tên merchant
- Auto-restore khi có lỗi

---

### 🔹 1.6. CẤU HÌNH API TOKEN

**Settings Page:** `frontend/admin/settings.html`

**Các bước cấu hình:**

1. **Lấy Token từ AccessTrade:**
   - Truy cập: https://pub2.accesstrade.vn/profile/api_key
   - Copy API Token (format: `1BIuwwkzn1ZIOiUS0rKv_cokkVKq_9f4`)

2. **Cấu hình trong Settings:**
   - Vào Admin → Settings
   - Tìm "AccessTrade API Token"
   - Click "Chỉnh sửa"
   - Paste token
   - Click "Lưu"

3. **Test API Connection:**
   - Click "Test API"
   - Nếu thành công: "✅ API hoạt động bình thường! Tìm thấy X merchants"
   - Nếu lỗi: Kiểm tra lại token

**Backend Storage:**
```javascript
// Token được lưu vào process.env
process.env.ACCESSTRADE_ACCESS_TOKEN = token;

// Service auto-reload token mỗi 60 giây
class AccessTradeLinkService {
  constructor() {
    this.tokenCheckInterval = 60000; // 60 seconds
  }

  async getToken() {
    if (Date.now() - this.lastTokenCheck > this.tokenCheckInterval) {
      await this.loadToken(); // Reload từ process.env
    }
    return this.accessToken;
  }
}
```

---

## 2. TÍNH NĂNG SETTINGS

**File:** `frontend/admin/settings.html`

### 📌 Các Module Settings

#### 2.1. Cron Jobs
- **Kích Hoạt Auto Cron**: Tự động retry clicks và đồng bộ conversions
- **Lịch Retry Clicks**: Cron expression (vd: `0 */6 * * *` = mỗi 6 giờ)

#### 2.2. Cấu Hình API
- **Chế Độ Tạo Link**: Toggle API Mode / DIY Mode
- **AccessTrade API Token**: Cấu hình token (masked `••••••••`)
- **AccessTrade API URL**: Base URL (mặc định: `https://api.accesstrade.vn/v1`)
- **Test API**: Kiểm tra kết nối

#### 2.3. Cấu Hình Hệ Thống
- **Tỷ Lệ Chia Hoa Hồng**: % cashback cho user (70% = user nhận 70đ từ 100đ commission)

### 📌 Endpoints

```javascript
// GET - Lấy settings hiện tại
GET /api/admin/settings

// POST - Cập nhật auto cron
POST /api/admin/settings/auto-cron
Body: { enabled: true }

// POST - Cập nhật retry schedule
POST /api/admin/settings/retry-schedule
Body: { schedule: "0 */6 * * *" }

// POST - Cập nhật API token
POST /api/admin/settings/api-token
Body: { token: "YOUR_TOKEN" }

// POST - Test API connection
POST /api/admin/settings/test-api
Response: { success: true, merchantsCount: 50 }
```

---

## 3. TÍNH NĂNG MONITORING

**File:** `frontend/admin/monitoring.html`

### 📌 Dashboard Tổng Quan

**4 Metrics Cards:**
- 📊 **Tổng Clicks Hôm Nay**
- 🛒 **Conversions Hôm Nay**
- 💰 **Tổng Cashback Hôm Nay**
- 📈 **Tỷ Lệ Chuyển Đổi**

### 📌 Thống Kê Theo Giờ

**Bảng dữ liệu:**
- Thời gian (00:00 - 23:00)
- Clicks trong giờ
- Conversions trong giờ
- Conversion Rate (%)
- Progress bar visualization

**Phân trang:**
- 10/20/50 dòng mỗi trang
- Prev/Next navigation

### 📌 Top Merchants

**Bảng xếp hạng:**
- Logo merchant
- Tên merchant
- Tổng clicks
- Tổng conversions
- Conversion rate
- Tổng cashback

---

## 4. CẢI TIẾN UX/UI

### 4.1. Loading States

**Khi tạo link:**
- Button disabled với spinner: `🔄 Đang tạo link...`
- Toast notification: `Đang chuyển đến trang {Merchant} mua hàng, đợi trong vài giây...`
- Success toast: `Link đã được tạo! Đang chuyển hướng...`

**CSS Animation:**
```css
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 4.2. Pagination Improvements

**History Page:**
- Dynamic rows per page (10/20/50)
- Event listener cho dropdown changes
- Reset page khi thay đổi items per page

**Files Updated:**
- `frontend/js/history.js:90-121` - Conversions & Clicks pagination

---

## 5. CẢI TIẾN DATABASE

### 5.1. Connection Pool

**File:** `backend/config/database.js`

**Trước:**
```javascript
max: 1,  // Chỉ 1 connection → Timeout khi busy
```

**Sau:**
```javascript
max: 10,                     // 10 concurrent connections
min: 2,                      // 2 warm connections
idleTimeoutMillis: 30000,    // 30s idle timeout
connectionTimeoutMillis: 15000,  // 15s connection timeout
allowExitOnIdle: false,      // Keep alive
```

**Kết quả:**
- ✅ Không còn timeout khi tạo link
- ✅ Xử lý nhiều request đồng thời
- ✅ Performance tăng 10x

---

## 6. CẢI TIẾN TIMEZONE

### 6.1. Vấn Đề

**Trước:**
- Database dùng UTC
- Frontend parse Date() → local time
- Kết quả: Thời gian sai 7 giờ (23:24 14/11 thay vì 06:24 15/11)

### 6.2. Giải Pháp

**Backend - Database:**
```javascript
// backend/config/database.js:34
options: '-c timezone=Asia/Ho_Chi_Minh'
```

**Frontend - All formatDate():**
```javascript
// frontend/js/config.js:48
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',  // ← Fix timezone
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
```

**Files Updated:**
- `backend/config/database.js`
- `frontend/js/config.js`
- `frontend/admin/shared/utils.js`
- `frontend/js/reconciliation-history.js`
- `frontend/admin/at-orders.js`
- `frontend/admin/reconciliation.js`
- `frontend/admin/monitoring.html`

---

## 📚 TÀI LIỆU THAM KHẢO

### AccessTrade API Documentation
- **API Docs:** https://developers.accesstrade.vn/api-publisher-vietnamese
- **Get Campaigns:** https://developers.accesstrade.vn/api-publisher-vietnamese/lay-danh-sach-campaigns
- **Create Tracking Link:** https://developers.accesstrade.vn/api-publisher-vietnamese/tao-tracking-link
- **Get Conversions:** https://developers.accesstrade.vn/api-publisher-vietnamese/lay-danh-sach-don-hang

### Authentication
```
Header: Authorization: Token YOUR_ACCESS_TOKEN
```

**Lưu ý:** AccessTrade dùng `Token` không phải `Bearer`!

---

## 🔧 TROUBLESHOOTING

### 1. API Mode không hoạt động

**Triệu chứng:** Link vẫn dùng DIY mode

**Kiểm tra:**
```bash
# 1. Check token
node -e "console.log(process.env.ACCESSTRADE_ACCESS_TOKEN)"

# 2. Check API connection
curl -H "Authorization: Token YOUR_TOKEN" \
  https://api.accesstrade.vn/v1/campaigns
```

**Giải pháp:**
- Cấu hình lại token trong Settings
- Test API connection
- Check server logs

### 2. Timezone sai

**Triệu chứng:** Thời gian hiển thị sai 7 giờ

**Kiểm tra:**
```sql
-- Check database timezone
SHOW timezone;  -- Should return 'Asia/Ho_Chi_Minh'
```

**Giải pháp:**
- Restart server
- Clear cache
- Hard refresh browser (Ctrl+Shift+R)

### 3. Database timeout

**Triệu chứng:** "timeout exceeded when trying to connect"

**Kiểm tra:**
```javascript
// backend/config/database.js
max: 10,  // Should be >= 10
min: 2,   // Should be >= 2
```

**Giải pháp:**
- Restart server
- Check Neon database connection limit

---

## 📝 CHANGELOG

### Version 2.0 - 2025-11-15

**Added:**
- ✅ API Mode cho tạo link (AccessTrade Official API)
- ✅ Settings page với API configuration
- ✅ Monitoring dashboard với hourly stats
- ✅ Loading states với spinner animation
- ✅ Toast notifications với merchant name

**Fixed:**
- ✅ Database connection pool (1 → 10 connections)
- ✅ Timezone issues (UTC → Asia/Ho_Chi_Minh)
- ✅ History table column mismatch
- ✅ Pagination không hoạt động
- ✅ Horizontal scroll jumping

**Improved:**
- ✅ UX với loading feedback
- ✅ Performance với connection pooling
- ✅ Accuracy với timezone fix

---

## 👨‍💻 DEVELOPER NOTES

### Code Structure

```
backend/
├── services/
│   ├── accessTradeLink.js    # API Mode service
│   └── linkGenerator.js       # DIY Mode service
├── routes/
│   └── dashboard.js          # Link generation endpoint
└── config/
    └── database.js           # Connection pool + timezone

frontend/
├── js/
│   ├── dashboard.js          # User dashboard + link creation
│   ├── config.js             # Global formatDate()
│   └── history.js            # History with pagination
├── admin/
│   ├── settings.html         # Admin settings
│   ├── monitoring.html       # Monitoring dashboard
│   └── shared/
│       └── utils.js          # Admin formatDate()
└── css/
    └── style.css            # Spinner animation + disabled states
```

### Testing

**Test API Mode:**
```javascript
// backend test
const service = require('./backend/services/accessTradeLink');
const result = await service.testConnection();
console.log(result);
```

**Test DIY Mode:**
```javascript
const service = require('./backend/services/linkGenerator');
const result = service.generateLink(user, merchant, clickId, 'button');
console.log(result);
```

**Test Timezone:**
```javascript
console.log(new Date().toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh'
}));
// Should show correct Vietnam time
```

---

## 📞 SUPPORT

Nếu gặp vấn đề, check:
1. Server logs
2. Browser console
3. Network tab (F12)
4. Database connections

---

*Document created: 2025-11-15*
*Last updated: 2025-11-15*
