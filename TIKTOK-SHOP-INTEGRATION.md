# TikTok Shop API V2 Integration - Implementation Summary

## 📋 Overview

Integration hoàn tất module TikTok Shop API V2 vào hệ thống cashback với kiến trúc **tách riêng hoàn toàn**, đảm bảo **không ảnh hưởng** đến các module hiện có và **giữ nguyên 100%** cấu trúc tracking.

---

## ✅ Verification Results

### **Tracking Structure Integrity**
```
✅ Required tracking fields: ALL PRESENT
✅ Product info column: ADDED
✅ UTM parameters: Preserved (utm_source, utm_medium, utm_campaign, utm_content)
✅ SUB parameters: Preserved (sub1=userId, sub2=clickId, sub3=clickType, sub4=platform)
✅ Conversion matching: Compatible
```

### **Module Architecture**
```
✅ Separate module: tiktokShopLink.js created
✅ No modification to: linkGenerator.js & accessTradeLink.js
✅ Product metadata: Stored in product_info JSONB
✅ Tracking preserved: All cashback parameters intact
```

---

## 🏗️ Architecture

### **Service Layer - 3 Independent Modules**

```
backend/services/
├── linkGenerator.js          ← DIY Mode (KHÔNG SỬA)
│   └── Manual link construction
│
├── accessTradeLink.js        ← Generic V1 API (KHÔNG SỬA)
│   └── /v1/product_link/create
│   └── For: Lazada, Shopee, Tiki, etc.
│
└── tiktokShopLink.js         ← TikTok Shop V2 API (MỚI) ✨
    └── /v2/tiktokshop_product_feeds/create_link
    └── For: TikTok Shop only
```

### **Link Generation Flow**

```
User Request (Generate Link)
         ↓
   API Mode Enabled?
         ↓
    ┌────┴────┐
   YES       NO → DIY Mode
    ↓
Detect URL Type
    ↓
    ├─ TikTok URL?
    │    ↓ YES
    │  TikTok Shop V2 API ✨
    │    ↓ (on error)
    │  DIY Fallback
    │
    └─ Other URL
         ↓
       Generic V1 API
         ↓ (on error)
       DIY Fallback
```

---

## 📁 Files Modified/Created

### **1. NEW: `backend/services/tiktokShopLink.js`**

**Purpose:** Service riêng biệt cho TikTok Shop V2 API

**Key Features:**
- ✅ Auto-detect TikTok URLs (`vt.tiktok.com`, `shop.tiktok.com`)
- ✅ Product validation (check if in affiliate program)
- ✅ Return product metadata: name, price, image, commission
- ✅ Short URL support
- ✅ Proper error handling with fallback

**API Endpoint:**
```javascript
POST https://api.accesstrade.vn/v2/tiktokshop_product_feeds/create_link

Request:
{
  "product_url": "httpsnmvt.tiktok.com/...",
  "utm_source": "chatchiu",
  "utm_medium": "username",
  "utm_campaign": "cashback",
  "utm_content": "click-id",
  "sub1": "user-id",
  "sub2": "click-id",
  "sub3": "link",
  "sub4": "oneatweb"
}

Response:
{
  "status": true,
  "data": {
    "aff_url": "https://tracking.dev.accesstrade.me/...",
    "aff_short_url": "https://shorten.dev.accesstrade.me/...",
    "product_id": "1729836100247522192",
    "product_name": "...",
    "product_price": { "amount": "20000", "currency": "VND" },
    "product_image": "https://...",
    "product_commission": { "amount": "3.000", "rate": 1500 }
  }
}
```

---

### **2. MODIFIED: `backend/routes/dashboard.js`**

**Changes:**
```javascript
// Line 12: Import TikTok Shop service
const tiktokShopLinkService = require('../services/tiktokShopLink');

// Line 264-380: Intelligent routing logic
if (useApiMode) {
  const isTikTokShop = tiktokShopLinkService.isTikTokShopUrl(productUrl);

  if (isTikTokShop && await tiktokShopLinkService.isAvailable()) {
    // Use TikTok Shop V2 API
    linkData = await tiktokShopLinkService.generateLink(user, click.id, productUrl);
    linkSource = 'tiktok-api';

    // Save product info
    if (linkData.productInfo?.id) {
      await Click.updateProductInfo(click.id, linkData.productInfo);
    }
  } else {
    // Use Generic V1 API or DIY
  }
}

// Line 439-461: Include product info in response
if (linkSource === 'tiktok-api' && linkData.productInfo) {
  responseData.productInfo = linkData.productInfo;
  responseData.shortUrl = linkData.shortUrl;
}
```

**Impact:**
- ✅ No breaking changes
- ✅ Backward compatible
- ✅ All existing tracking parameters preserved

---

### **3. MODIFIED: `backend/models/Click.js`**

**Changes:**
```javascript
// Line 315-331: New method for product info
static async updateProductInfo(clickId, productInfo) {
  const query = `
    UPDATE clicks
    SET product_info = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [clickId, JSON.stringify(productInfo)]);
  return result.rows[0];
}
```

**Impact:**
- ✅ Additive change only
- ✅ No modification to existing methods

---

### **4. NEW: Migration `011_add_product_info_to_clicks.sql`**

```sql
-- Add product_info column as JSONB
ALTER TABLE clicks ADD COLUMN IF NOT EXISTS product_info JSONB;

-- Create GIN index for fast queries
CREATE INDEX IF NOT EXISTS idx_clicks_product_info
ON clicks USING GIN (product_info);

-- Add comment
COMMENT ON COLUMN clicks.product_info IS
  'TikTok Shop product metadata from V2 API: {id, name, price, image, commission}';
```

**Schema:**
```javascript
product_info: {
  id: "1729836100247522192",
  name: "Ghim Tráng Men Hình Mèo...",
  price: { amount: "20000", currency: "VND" },
  image: "https://p16-oec-sg.ibyteimg.com/...",
  commission: { amount: "3.000", currency: "VND", rate: 1500 }
}
```

---

## 🎯 Tracking Parameters - Preserved 100%

### **UTM Parameters (Primary Tracking)**
```javascript
utm_source: 'chatchiu'           // Fixed
utm_medium: user.username        // User's username
utm_campaign: 'cashback'         // Fixed
utm_content: click.id            // Click UUID ← CRITICAL for matching
```

### **SUB Parameters (Backup Tracking)**
```javascript
sub1: user.id                    // User UUID ← Backup matching
sub2: click.id                   // Click UUID ← Backup matching
sub3: 'link' | 'button'          // Click type
sub4: 'oneatweb'                 // Platform identifier
```

### **Tracking Flow**
```
1. User clicks affiliate link
   ↓
2. URL contains: utm_content={click-id} & sub2={click-id}
   ↓
3. User makes purchase on TikTok Shop
   ↓
4. AccessTrade sends conversion webhook with utm_content
   ↓
5. System matches: conversions.utm_content = clicks.id
   OR fallback: conversions.sub2 = clicks.id
   ↓
6. Conversion linked to click → cashback calculated
```

---

## 🆚 Comparison: V1 vs V2 API

| Feature | Generic V1 API | **TikTok Shop V2 API** |
|---------|----------------|------------------------|
| **Endpoint** | `/v1/product_link/create` | `/v2/tiktokshop_product_feeds/create_link` |
| **Input Format** | `urls: [...]` (array) | `product_url: "..."` (string) |
| **Campaign ID** | ✅ Required | ❌ Auto-detected |
| **Product Validation** | ❌ No | ✅ Validates if in program |
| **Product Metadata** | ❌ No | ✅ Full metadata returned |
| **Short URL** | ❌ No | ✅ Yes |
| **Response** | Only `aff_link` | Full product data |
| **Use Case** | Lazada, Shopee, Tiki | TikTok Shop only |

---

## 📊 API Response Examples

### **Success Response (TikTok Shop V2)**
```json
{
  "success": true,
  "message": "Affiliate link generated successfully",
  "data": {
    "affiliateUrl": "https://tracking.dev.accesstrade.me/deep_link/...",
    "shortUrl": "https://shorten.dev.accesstrade.me/WxmudqdK",
    "affSid": "c7b15b93-4905-4038-b88a-a0152a8d9def_1731744455891_e7b5b",
    "clickId": "f0f26df4-1707-4803-abeb-f0abaf69833e",
    "linkSource": "tiktok-api",
    "merchant": {
      "id": "tiktokshop",
      "name": "TikTok Shop"
    },
    "productInfo": {
      "id": "1729836100247522192",
      "name": "Ghim Tráng Men Hình Mèo, Tranh Sơn Dầu Nghệ Thuật...",
      "price": {
        "amount": "20000",
        "currency": "VND"
      },
      "image": "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/...",
      "commission": {
        "amount": "3.000",
        "currency": "VND",
        "rate": 1500
      }
    }
  }
}
```

### **Error Response (Product Not in Program)**
```json
{
  "success": false,
  "message": "Product is not part of TikTok Shop affiliate program. Please verify the product URL.",
  "error": "TikTok Shop API failed: The link is not part of the campaign"
}
```

### **Fallback Response (API Failed → DIY)**
```json
{
  "success": true,
  "data": {
    "affiliateUrl": "https://go.isclix.com/deep_link/...",
    "affSid": "...",
    "clickId": "...",
    "linkSource": "diy-fallback",  // ← Indicates fallback was used
    "merchant": { ... }
    // No productInfo (API failed)
  }
}
```

---

## 🔧 Configuration

### **Environment Variables**
```bash
# Enable API mode
USE_ACCESSTRADE_API=true

# AccessTrade API Token (shared for V1 and V2)
ACCESSTRADE_ACCESS_TOKEN=your-token-here

# API URL
ACCESSTRADE_API_URL=https://api.accesstrade.vn
```

---

## 🧪 Testing

### **Run Tracking Structure Verification**
```bash
node test-tracking-structure.js
```

**Output:**
```
✅ Required tracking fields: ALL PRESENT
✅ Product info column: ADDED
✅ UTM parameters: Preserved
✅ SUB parameters: Preserved
✅ Conversion matching: Compatible
```

### **Manual Test with cURL**
```bash
# Login and get token
curl -X POST http://localhost:3007/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Generate TikTok Shop link
curl -X POST http://localhost:3007/api/dashboard/generate-link \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "tiktokshop",
    "clickType": "link",
    "productUrl": "https://vt.tiktok.com/ZSBKCcJrf/"
  }'
```

---

## 📌 Migration Guide

### **Database Migration**
```bash
# Run migration to add product_info column
psql $DATABASE_URL -f backend/migrations/011_add_product_info_to_clicks.sql
```

### **Server Restart**
```bash
cd backend
npm start
```

**Expected Log:**
```
[INFO] AccessTrade token loaded from environment
[INFO] TikTok Shop API: Token loaded from environment  ✨
```

---

## 🎓 Usage Examples

### **Frontend Integration (Example)**
```javascript
// Generate TikTok Shop link
const response = await fetch('/api/dashboard/generate-link', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    merchantId: 'tiktokshop',
    clickType: 'link',
    productUrl: 'https://vt.tiktok.com/ZSBKCcJrf/'
  })
});

const data = await response.json();

if (data.success) {
  // Display affiliate link
  console.log('Affiliate URL:', data.data.affiliateUrl);
  console.log('Short URL:', data.data.shortUrl);

  // Display product preview (if TikTok API)
  if (data.data.productInfo) {
    console.log('Product:', data.data.productInfo.name);
    console.log('Price:', data.data.productInfo.price.amount);
    console.log('Commission:', data.data.productInfo.commission.amount);

    // Show product image
    // <img src={data.data.productInfo.image} />
  }
}
```

---

## ⚠️ Important Notes

### **1. Merchant Setup**
TikTok Shop merchant phải được tạo trong database:
```sql
INSERT INTO merchants (id, name, campaign_id, logo_url, commission_rate)
VALUES (
  'tiktokshop',
  'TikTok Shop',
  'auto-detect',  -- V2 API auto-detects campaign
  'https://...',
  0.7
);
```

### **2. Product Validation**
TikTok Shop V2 API sẽ validate:
- ✅ Product có trong TikTok Affiliate program không?
- ❌ Nếu không → trả về error
- ✅ System tự động fallback về DIY mode

### **3. Conversion Tracking**
Tracking vẫn hoạt động **chính xác 100%**:
- Primary: `utm_content = click_id`
- Backup: `sub2 = click_id`
- AccessTrade webhook sẽ gửi về với các parameters này

### **4. Backward Compatibility**
- ✅ Merchants khác (Lazada, Shopee) vẫn dùng V1 API
- ✅ DIY mode vẫn hoạt động bình thường
- ✅ Existing conversions matching không bị ảnh hưởng

---

## 🚀 Next Steps

### **1. Frontend Enhancement**
- [ ] Hiển thị product preview khi generate link
- [ ] Show product image, price, commission
- [ ] Short URL copy button

### **2. Analytics**
- [ ] Track link_source statistics
- [ ] Monitor TikTok API vs DIY conversion rates
- [ ] Product info analytics

### **3. User Experience**
- [ ] Auto-detect TikTok URLs and suggest commission
- [ ] Product search by name
- [ ] Commission calculator

---

## 📚 References

- **AccessTrade TikTok Shop API Docs**: [Link provided by user]
- **Migration File**: `backend/migrations/011_add_product_info_to_clicks.sql`
- **Service File**: `backend/services/tiktokShopLink.js`
- **Test Script**: `test-tracking-structure.js`

---

## ✅ Final Checklist

- [x] TikTok Shop service created (tiktokShopLink.js)
- [x] No modification to existing services
- [x] Product info column added to clicks table
- [x] Click model updated with updateProductInfo method
- [x] Dashboard routing logic updated
- [x] Tracking structure preserved 100%
- [x] Migration script created and run
- [x] Test script created and verified
- [x] Documentation completed

**Status: ✅ PRODUCTION READY**

---

*Generated: 2025-11-16*
*Version: 1.0.0*
