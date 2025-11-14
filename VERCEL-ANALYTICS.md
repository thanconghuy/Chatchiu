# Vercel Analytics Integration

## ✅ Đã tích hợp thành công!

Vercel Analytics đã được tích hợp vào tất cả các trang của ứng dụng.

## 📊 Tính năng

### 1. Automatic Page View Tracking
- Tự động track tất cả page views
- Không cần cấu hình thêm
- Hoạt động trên tất cả trang đã được thêm `analytics.js`

### 2. Web Vitals Tracking
Tự động track các metrics quan trọng:
- **FCP** (First Contentful Paint)
- **LCP** (Largest Contentful Paint)
- **CLS** (Cumulative Layout Shift)
- **FID** (First Input Delay)
- **TTFB** (Time to First Byte)

### 3. Custom Event Tracking
Bạn có thể track custom events bằng cách:

```javascript
// Track một event đơn giản
window.vaEvent('button_clicked');

// Track event với properties
window.vaEvent('purchase_completed', {
  amount: 100000,
  merchant: 'Shopee',
  cashback: 7000
});
```

## 🎯 Ví dụ sử dụng

### Track khi user click vào merchant
```javascript
// Trong file dashboard.js hoặc app.js
function trackMerchantClick(merchantName) {
  window.vaEvent('merchant_click', {
    merchant: merchantName,
    page: 'dashboard'
  });
}
```

### Track khi tạo link affiliate
```javascript
// Trong trackingService.js
async function trackLinkGeneration(merchantId, userId) {
  window.vaEvent('affiliate_link_generated', {
    merchant_id: merchantId,
    user_id: userId
  });
}
```

### Track conversions
```javascript
// Khi có conversion mới
function trackConversion(conversionData) {
  window.vaEvent('conversion_created', {
    merchant: conversionData.merchant_name,
    amount: conversionData.order_amount,
    commission: conversionData.commission,
    cashback: conversionData.cashback_amount
  });
}
```

## 📦 Files đã thêm Analytics

### User Pages
- ✅ `frontend/index.html` - Landing page
- ✅ `frontend/dashboard.html` - User dashboard
- ✅ `frontend/history.html` - Transaction history

### Admin Pages
- ✅ `frontend/admin/index.html` - Admin dashboard
- ✅ `frontend/admin/merchants.html` - Merchants management
- ✅ `frontend/admin/tools.html` - Admin tools
- ✅ `frontend/admin/users.html` - Users management
- ✅ `frontend/admin/conversions.html` - Conversions list
- ✅ `frontend/admin/transactions.html` - Transactions list
- ✅ `frontend/admin/at-orders.html` - AccessTrade orders

## 🔧 Cấu hình

### Development vs Production

Analytics script tự động detect environment:

**Development (localhost):**
- Mode: `development`
- Events được log nhưng không gửi đến Vercel
- Console log hiển thị: `📊 Vercel Analytics initialized (development mode)`

**Production:**
- Mode: `production`
- Events được gửi đến Vercel Analytics dashboard
- Có thể xem reports tại: https://vercel.com/your-project/analytics

## 🌐 Xem Analytics Dashboard

1. Truy cập Vercel dashboard: https://vercel.com
2. Chọn project của bạn
3. Click tab **"Analytics"** hoặc **"Speed Insights"**
4. Xem:
   - Page views
   - Unique visitors
   - Web Vitals scores
   - Custom events (nếu có)
   - Geographic data
   - Device/browser breakdown

## 🚀 Deploy lên Vercel

Để analytics hoạt động đầy đủ trên production:

1. **Link project với Vercel:**
   ```bash
   vercel link
   ```

2. **Deploy:**
   ```bash
   vercel --prod
   ```

3. **Enable Analytics trong Vercel Dashboard:**
   - Vào project settings
   - Tab "Analytics"
   - Enable "Speed Insights" và "Web Analytics"

## 📝 Notes

- Analytics **chỉ hoạt động trên production** (domain thật, không phải localhost)
- Trên localhost sẽ thấy log `development mode` trong console
- Không cần API key hay configuration thêm
- Miễn phí cho:
  - Web Analytics: Unlimited page views
  - Speed Insights: Unlimited measurements

## 🎁 Bonus: Custom Events Examples

### Track user actions
```javascript
// Login
window.vaEvent('user_login', { method: 'google' });

// Register
window.vaEvent('user_register', { method: 'email' });

// Click merchant
window.vaEvent('merchant_click', { merchant: 'Shopee' });

// Generate link
window.vaEvent('link_generated', { type: 'product', merchant: 'Lazada' });

// Withdrawal
window.vaEvent('withdrawal_request', { amount: 100000 });
```

### Track errors
```javascript
// Track API errors
window.vaEvent('api_error', {
  endpoint: '/api/conversions',
  status: 500,
  message: error.message
});
```

## 🔗 Tài liệu

- [Vercel Analytics Docs](https://vercel.com/docs/analytics)
- [Web Analytics Guide](https://vercel.com/docs/analytics/web-analytics)
- [Speed Insights](https://vercel.com/docs/speed-insights)
