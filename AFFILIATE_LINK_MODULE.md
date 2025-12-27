# Module Tạo Link Mua Hàng & Monitoring - Hệ Thống Cashback

## Tổng Quan

Hệ thống tạo link affiliate và theo dõi chuyển đổi (conversions) cho nền tảng cashback. Hỗ trợ nhiều nguồn link khác nhau với khả năng fallback tự động và tracking chi tiết.

---

## I. KIẾN TRÚC HỆ THỐNG

### 1. Luồng Hoạt Động Chính

```
User Request → Generate Link → Track Click → Monitor Conversion → Calculate Cashback → Payout
```

### 2. Các Thành Phần Chính

- **Link Generation Services**: Tạo affiliate link từ nhiều nguồn
- **Click Tracking**: Ghi nhận và theo dõi clicks
- **Conversion Tracking**: Theo dõi đơn hàng và chuyển đổi
- **Monitoring Dashboard**: Giao diện quản lý và thống kê
- **Background Jobs**: Đồng bộ và xử lý tự động

---

## II. LINK GENERATION SERVICES

### 1. DIY Link Generator (`backend/services/linkGenerator.js`)

**Mục đích**: Tạo link affiliate sử dụng iSclix deeplink format

**Core Function**:
```javascript
async generateAffiliateLink({
  userId,
  merchantId,
  clickType = 'button',
  productUrl = null,
  clickId = null
})
```

**Input Parameters**:
- `userId` (required): ID người dùng
- `merchantId` (required): ID merchant
- `clickType` (optional): 'button' hoặc 'link', default 'button'
- `productUrl` (optional): URL sản phẩm cụ thể (cho type='link')
- `clickId` (optional): Click ID đã tạo trước

**Output**:
```javascript
{
  success: true,
  affiliateUrl: 'https://go.isclix.com/deep_link/...',
  affSid: 'user123_1234567890_abc',
  clickId: 123,
  linkSource: 'diy'
}
```

**Chi Tiết Xử Lý**:

```javascript
// 1. Generate Affiliate Session ID
generateAffSid(userId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}_${timestamp}_${random}`;
}

// 2. Build UTM Parameters
buildUtmParams(username, clickId) {
  return {
    utm_source: 'chatchiu',
    utm_campaign: 'cashback',
    utm_medium: username,
    utm_content: clickId // PRIMARY tracking parameter
  };
}

// 3. Build Sub Parameters (backup tracking)
const subParams = {
  sub1: userId,           // User ID
  sub2: clickId,          // Click ID (backup matching)
  sub3: clickType,        // button/link
  sub4: 'oneatweb'        // Fixed identifier
};

// 4. Build Deeplink URL
const deeplinkUrl = `https://go.isclix.com/deep_link/${PUBLISHER_ID}/${merchant.campaign_id}`;
const params = {
  url: productUrl ? encodeURIComponent(productUrl) : merchant.deep_link_base,
  aff_sid: affSid,
  ...utmParams,
  ...subParams
};

// 5. Record Click
await Click.create({
  user_id: userId,
  merchant_id: merchantId,
  aff_sid: affSid,
  click_type: clickType,
  affiliate_url: finalUrl,
  utm_source: 'chatchiu',
  utm_campaign: 'cashback',
  utm_medium: username,
  utm_content: clickId,
  sub1: userId,
  sub2: clickId,
  sub3: clickType,
  sub4: 'oneatweb',
  link_source: 'diy'
});
```

**Validation**:
```javascript
validateProductUrl(productUrl, merchantDomain) {
  const urlObj = new URL(productUrl);
  const domain = urlObj.hostname.replace('www.', '');

  // Check if URL domain matches merchant domain
  if (!domain.includes(merchantDomain)) {
    throw new Error(`URL không thuộc merchant ${merchantDomain}`);
  }
}
```

---

### 2. AccessTrade API Link Generator (`backend/services/accessTradeLink.js`)

**Mục đích**: Tạo link chính thức qua AccessTrade API V1

**Core Function**:
```javascript
async generateLink({
  userId,
  merchantId,
  clickType = 'button',
  productUrl = null,
  clickId = null
})
```

**API Endpoint**: `POST https://api.accesstrade.vn/v1/product_link/create`

**Request Body**:
```javascript
{
  url: productUrl || merchant.deep_link_base,
  utm_source: 'chatchiu',
  utm_campaign: 'cashback',
  utm_medium: username,
  utm_content: clickId,      // PRIMARY matching
  utm_term: affSid,
  sub1: userId,
  sub2: clickId,             // BACKUP matching
  sub3: clickType,
  sub4: 'oneatweb'
}
```

**Headers**:
```javascript
{
  'Authorization': `Token ${ACCESSTRADE_API_TOKEN}`,
  'Content-Type': 'application/json'
}
```

**Response**:
```javascript
{
  data: {
    link: 'https://fast.accesstrade.com.vn/deep_link/...'
  }
}
```

**Error Handling**:
```javascript
try {
  const response = await axios.post(apiUrl, requestBody, { headers });

  if (!response.data || !response.data.data || !response.data.data.link) {
    throw new Error('Invalid API response format');
  }

  return {
    success: true,
    affiliateUrl: response.data.data.link,
    affSid,
    clickId,
    linkSource: 'api'
  };

} catch (error) {
  logger.error('AccessTrade API error', {
    error: error.message,
    status: error.response?.status,
    data: error.response?.data
  });

  return {
    success: false,
    error: error.message
  };
}
```

**Advantages**:
- ✅ Official cookie setting
- ✅ Better tracking attribution
- ✅ Higher conversion match rate
- ✅ Real-time tracking updates

---

### 3. TikTok Shop Link Generator (`backend/services/tiktokShopLink.js`)

**Mục đích**: Tạo link cho TikTok Shop qua AccessTrade API V2

**Core Function**:
```javascript
async generateLink({
  userId,
  merchantId,
  clickType = 'button',
  productUrl = null,
  clickId = null
})
```

**API Endpoint**: `POST https://api.accesstrade.vn/v2/tiktokshop_product_feeds/create_link`

**Request Body**:
```javascript
{
  link: productUrl,        // Required: TikTok Shop product URL
  sub1: userId,
  sub2: clickId,           // PRIMARY matching for TikTok Shop
  sub3: clickType,
  sub4: 'oneatweb',
  sub5: affSid
}
```

**Response với Product Metadata**:
```javascript
{
  success: true,
  data: {
    link: 'https://...',
    product_detail: {
      id: '7123456789',
      name: 'iPhone 15 Pro Max',
      price: '29990000',
      image: 'https://...',
      commission: '350000'
    }
  }
}
```

**Store Product Info in Click**:
```javascript
await Click.updateProductInfo(clickId, {
  id: productDetail.id,
  name: productDetail.name,
  price: parseFloat(productDetail.price),
  image: productDetail.image,
  commission: parseFloat(productDetail.commission)
});
```

**TikTok URL Detection**:
```javascript
isTikTokShopUrl(url) {
  const tiktokDomains = [
    'vt.tiktok.com',
    'www.tiktok.com',
    'tiktok.com'
  ];

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return tiktokDomains.some(d => domain.includes(d));
  } catch {
    return false;
  }
}
```

---

### 4. Unified Link Generation API (`backend/routes/dashboard.js`)

**Endpoint**: `POST /api/generate-link`

**Request Body**:
```javascript
{
  merchantId: 123,
  clickType: 'button',     // 'button' or 'link'
  productUrl: 'https://...' // Optional, required for clickType='link'
}
```

**Priority Logic**:

```javascript
// BUTTON CLICK (Homepage free shopping)
if (clickType === 'button') {
  // Priority 1: Try deeplink (fast, no API limit)
  result = await linkGenerator.generateAffiliateLink({...});

  if (result.success) {
    linkSource = 'deeplink';
  } else {
    // Priority 2: Fallback to AccessTrade API
    result = await accessTradeLink.generateLink({...});
    linkSource = 'api-fallback';
  }
}

// LINK CREATION (Specific product)
if (clickType === 'link') {
  // Priority 1: Try API first (better tracking)
  if (isTikTokShopUrl(productUrl)) {
    result = await tiktokShopLink.generateLink({...});
    linkSource = 'tiktok-api';
  } else if (accessTradeLink.isAvailable()) {
    result = await accessTradeLink.generateLink({...});
    linkSource = 'api';
  } else {
    result = await linkGenerator.generateAffiliateLink({...});
    linkSource = 'deeplink-fallback';
  }
}
```

**Full Code Implementation**:

```javascript
router.post('/generate-link', authenticateToken, async (req, res) => {
  const transaction = await pool.query('BEGIN');

  try {
    const { merchantId, clickType = 'button', productUrl } = req.body;
    const userId = req.userId;

    // Validate
    if (!merchantId) {
      return res.status(400).json({
        success: false,
        message: 'Merchant ID is required'
      });
    }

    if (clickType === 'link' && !productUrl) {
      return res.status(400).json({
        success: false,
        message: 'Product URL is required for link type'
      });
    }

    // Get merchant info
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Create click record first to get click_id
    const clickResult = await pool.query(
      `INSERT INTO clicks (user_id, merchant_id, click_type, clicked_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, merchantId, clickType]
    );
    const clickId = clickResult.rows[0].id;

    let result;
    let linkSource;

    // BUTTON CLICK: Deeplink first, API fallback
    if (clickType === 'button') {
      result = await linkGenerator.generateAffiliateLink({
        userId,
        merchantId,
        clickType,
        productUrl: null,
        clickId
      });

      if (result.success) {
        linkSource = 'deeplink';
      } else {
        logger.warn('Deeplink failed, trying API fallback', {
          userId,
          merchantId,
          error: result.error
        });

        result = await accessTradeLink.generateLink({
          userId,
          merchantId,
          clickType,
          productUrl: null,
          clickId
        });
        linkSource = result.success ? 'api-fallback' : 'failed';
      }
    }

    // LINK CREATION: API first, deeplink fallback
    else if (clickType === 'link') {
      // TikTok Shop detection
      if (tiktokShopLink.isTikTokShopUrl(productUrl)) {
        result = await tiktokShopLink.generateLink({
          userId,
          merchantId,
          clickType,
          productUrl,
          clickId
        });
        linkSource = result.success ? 'tiktok-api' : 'failed';
      }
      // Regular merchants
      else if (accessTradeLink.isAvailable()) {
        result = await accessTradeLink.generateLink({
          userId,
          merchantId,
          clickType,
          productUrl,
          clickId
        });

        if (result.success) {
          linkSource = 'api';
        } else {
          result = await linkGenerator.generateAffiliateLink({
            userId,
            merchantId,
            clickType,
            productUrl,
            clickId
          });
          linkSource = result.success ? 'deeplink-fallback' : 'failed';
        }
      } else {
        result = await linkGenerator.generateAffiliateLink({
          userId,
          merchantId,
          clickType,
          productUrl,
          clickId
        });
        linkSource = result.success ? 'deeplink' : 'failed';
      }
    }

    if (!result.success) {
      await transaction.query('ROLLBACK');

      // Log failed attempt
      await activityLogger.log({
        userId,
        action: 'generate_link_failed',
        details: {
          merchantId,
          clickType,
          error: result.error
        }
      });

      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to generate link'
      });
    }

    // Update click with link data
    await Click.updateLinkData(clickId, {
      affiliate_url: result.affiliateUrl,
      aff_sid: result.affSid,
      link_source: linkSource
    });

    await transaction.query('COMMIT');

    // Log successful generation
    await activityLogger.log({
      userId,
      action: 'generate_link_success',
      details: {
        merchantId,
        clickId,
        clickType,
        linkSource
      }
    });

    logger.info('Link generated successfully', {
      userId,
      merchantId,
      clickId,
      linkSource
    });

    res.json({
      success: true,
      affiliateUrl: result.affiliateUrl,
      affSid: result.affSid,
      clickId,
      linkSource
    });

  } catch (error) {
    await transaction.query('ROLLBACK');

    logger.error('Generate link error', {
      error: error.message,
      stack: error.stack,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
```

---

## III. CLICK TRACKING MODEL

### Database Schema (`clicks` table)

```sql
CREATE TABLE clicks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  aff_sid VARCHAR(255),              -- Affiliate session ID
  click_type VARCHAR(50),            -- 'button' or 'link'
  affiliate_url TEXT,                -- Generated affiliate URL

  -- UTM Parameters (PRIMARY tracking)
  utm_source VARCHAR(100),           -- 'chatchiu'
  utm_campaign VARCHAR(100),         -- 'cashback'
  utm_medium VARCHAR(100),           -- username
  utm_content VARCHAR(100),          -- click_id (PRIMARY matching)
  utm_term VARCHAR(255),             -- aff_sid

  -- Sub Parameters (BACKUP tracking)
  sub1 VARCHAR(100),                 -- user_id
  sub2 VARCHAR(100),                 -- click_id (BACKUP matching)
  sub3 VARCHAR(100),                 -- click_type
  sub4 VARCHAR(100),                 -- 'oneatweb'

  -- Metadata
  link_source VARCHAR(50),           -- 'api', 'diy', 'deeplink', 'tiktok-api'
  product_info JSONB,                -- TikTok Shop product details

  -- Timestamps
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_checked_at TIMESTAMP,

  -- Indexes
  INDEX idx_clicks_user_id (user_id),
  INDEX idx_clicks_aff_sid (aff_sid),
  INDEX idx_clicks_utm_content (utm_content),
  INDEX idx_clicks_sub2 (sub2)
);
```

### Click Model Methods (`backend/models/Click.js`)

```javascript
class Click {
  // Create new click
  static async create({
    user_id,
    merchant_id,
    aff_sid,
    click_type,
    affiliate_url,
    utm_source,
    utm_campaign,
    utm_medium,
    utm_content,
    utm_term,
    sub1,
    sub2,
    sub3,
    sub4,
    link_source
  }) {
    const query = `
      INSERT INTO clicks (
        user_id, merchant_id, aff_sid, click_type, affiliate_url,
        utm_source, utm_campaign, utm_medium, utm_content, utm_term,
        sub1, sub2, sub3, sub4, link_source, clicked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
      RETURNING id
    `;

    const result = await pool.query(query, [
      user_id, merchant_id, aff_sid, click_type, affiliate_url,
      utm_source, utm_campaign, utm_medium, utm_content, utm_term,
      sub1, sub2, sub3, sub4, link_source
    ]);

    return result.rows[0].id;
  }

  // Find click by UTM content (PRIMARY matching)
  static async findByUtmContent(utmContent) {
    const query = `
      SELECT * FROM clicks
      WHERE utm_content = $1
      ORDER BY clicked_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [utmContent]);
    return result.rows[0];
  }

  // Find click by sub2 (BACKUP matching)
  static async findBySub2(sub2) {
    const query = `
      SELECT * FROM clicks
      WHERE sub2 = $1
      ORDER BY clicked_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [sub2]);
    return result.rows[0];
  }

  // Get user's clicks with conversion status
  static async getUserClicks(userId, { limit = 20, offset = 0 } = {}) {
    const query = `
      SELECT
        c.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM conversions conv
            WHERE conv.click_id = c.id
          ) THEN true
          ELSE false
        END as has_conversion,
        conv.cashback_amount
      FROM clicks c
      JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN conversions conv ON conv.click_id = c.id
      WHERE c.user_id = $1
      ORDER BY c.clicked_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  // Get click statistics
  static async getStats(userId) {
    const query = `
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT merchant_id) as unique_merchants,
        COUNT(CASE WHEN click_type = 'button' THEN 1 END) as button_clicks,
        COUNT(CASE WHEN click_type = 'link' THEN 1 END) as link_clicks,
        COUNT(CASE
          WHEN EXISTS (
            SELECT 1 FROM conversions conv
            WHERE conv.click_id = clicks.id
          ) THEN 1
        END) as converted_clicks
      FROM clicks
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  // Find unmatched clicks (for retry service)
  static async findUnmatchedClicks({ daysOld = 1, limit = 200 }) {
    const query = `
      SELECT c.*
      FROM clicks c
      WHERE c.clicked_at > NOW() - INTERVAL '30 days'
        AND c.clicked_at < NOW() - INTERVAL '${daysOld} days'
        AND NOT EXISTS (
          SELECT 1 FROM conversions conv
          WHERE conv.click_id = c.id
        )
      ORDER BY c.clicked_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  // Update product info (TikTok Shop)
  static async updateProductInfo(clickId, productInfo) {
    const query = `
      UPDATE clicks
      SET product_info = $1
      WHERE id = $2
    `;

    await pool.query(query, [JSON.stringify(productInfo), clickId]);
  }

  // Update last checked timestamp
  static async updateLastChecked(clickId) {
    const query = `
      UPDATE clicks
      SET last_checked_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [clickId]);
  }
}
```

---

## IV. CONVERSION TRACKING

### 1. Conversion Model (`backend/models/Conversion.js`)

**Database Schema**:
```sql
CREATE TABLE conversions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  click_id INTEGER REFERENCES clicks(id),
  accesstrade_id VARCHAR(255) UNIQUE,  -- AccessTrade order ID
  order_code VARCHAR(255),
  merchant_id INTEGER REFERENCES merchants(id),

  -- Financial data
  order_amount DECIMAL(15, 2),         -- Total order value
  commission DECIMAL(15, 2),           -- AccessTrade commission
  cashback_amount DECIMAL(15, 2),      -- User cashback (70% of commission)

  -- Status tracking
  status VARCHAR(50),                  -- 'pending', 'approved', 'rejected'

  -- Timestamps
  order_time TIMESTAMP,                -- When order was placed
  approval_time TIMESTAMP,             -- When order was approved
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_conversions_user_id (user_id),
  INDEX idx_conversions_click_id (click_id),
  INDEX idx_conversions_accesstrade_id (accesstrade_id),
  INDEX idx_conversions_status (status)
);
```

**Key Methods**:
```javascript
class Conversion {
  // Create conversion
  static async create({
    user_id,
    click_id,
    accesstrade_id,
    order_code,
    merchant_id,
    order_amount,
    commission,
    cashback_amount,
    status,
    order_time
  }) {
    const query = `
      INSERT INTO conversions (
        user_id, click_id, accesstrade_id, order_code, merchant_id,
        order_amount, commission, cashback_amount, status, order_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await pool.query(query, [
      user_id, click_id, accesstrade_id, order_code, merchant_id,
      order_amount, commission, cashback_amount, status, order_time
    ]);

    return result.rows[0];
  }

  // Find by AccessTrade ID
  static async findByAccessTradeId(atId) {
    const query = `
      SELECT * FROM conversions
      WHERE accesstrade_id = $1
    `;

    const result = await pool.query(query, [atId]);
    return result.rows[0];
  }

  // Update conversion status
  static async updateStatus(conversionId, newStatus) {
    const query = `
      UPDATE conversions
      SET status = $1,
          approval_time = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE approval_time END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [newStatus, conversionId]);
    return result.rows[0];
  }

  // Get user conversions with filters
  static async getUserConversions(userId, {
    status = null,
    startDate = null,
    endDate = null,
    limit = 20,
    offset = 0
  } = {}) {
    let query = `
      SELECT
        c.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        cl.click_type,
        cl.link_source
      FROM conversions c
      JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN clicks cl ON c.click_id = cl.id
      WHERE c.user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND c.order_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND c.order_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY c.order_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Get conversion statistics
  static async getConversionStats(userId) {
    const query = `
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END), 0) as total_order_value,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending_cashback
      FROM conversions
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }
}
```

---

### 2. Tracking Service (`backend/services/trackingService.js`)

**Mục đích**: Xử lý conversions từ AccessTrade webhook/API

**Core Function - Process Conversion**:
```javascript
async processConversion(conversionData) {
  const {
    transaction_id,      // AccessTrade order ID
    order_code,
    merchant_id,
    order_amount,
    commission,
    status,
    order_time,
    click_id,            // From utm_content
    sub2                 // Backup click_id from sub2
  } = conversionData;

  // Step 1: Check if conversion already exists
  const existing = await Conversion.findByAccessTradeId(transaction_id);

  if (existing) {
    return await this.handleExistingConversion(existing, conversionData);
  } else {
    return await this.handleNewConversion(conversionData);
  }
}
```

**Handle New Conversion**:
```javascript
async handleNewConversion(conversionData) {
  const {
    transaction_id,
    order_code,
    merchant_id,
    order_amount,
    commission,
    status,
    order_time,
    click_id,      // PRIMARY: from utm_content
    sub2           // BACKUP: from sub2 parameter
  } = conversionData;

  // Step 1: Try to find matching click
  let click = null;

  // Try PRIMARY matching (utm_content = click_id)
  if (click_id) {
    click = await Click.findByUtmContent(click_id);

    if (click) {
      logger.info('Click matched via utm_content', {
        clickId: click.id,
        utmContent: click_id
      });
    }
  }

  // Try BACKUP matching (sub2 = click_id)
  if (!click && sub2) {
    click = await Click.findBySub2(sub2);

    if (click) {
      logger.info('Click matched via sub2', {
        clickId: click.id,
        sub2
      });
    }
  }

  // Step 2: Calculate cashback (70% of commission)
  const cashbackAmount = commission * 0.7;

  // Step 3: Create conversion record
  const conversion = await Conversion.create({
    user_id: click ? click.user_id : null,
    click_id: click ? click.id : null,
    accesstrade_id: transaction_id,
    order_code,
    merchant_id,
    order_amount,
    commission,
    cashback_amount: cashbackAmount,
    status,
    order_time
  });

  // Step 4: Update user balances if approved
  if (status === 'approved' && click) {
    await this.updateUserBalance(click.user_id, cashbackAmount);
  }

  // Step 5: Log activity
  if (click) {
    await activityLogger.log({
      userId: click.user_id,
      action: 'conversion_matched',
      details: {
        conversionId: conversion.id,
        orderCode: order_code,
        cashbackAmount,
        status
      }
    });
  }

  return {
    success: true,
    conversion,
    matched: !!click
  };
}
```

**Handle Existing Conversion (Status Update)**:
```javascript
async handleExistingConversion(existing, conversionData) {
  const { status: newStatus, commission } = conversionData;

  // Check if status changed
  if (existing.status === newStatus) {
    return {
      success: true,
      conversion: existing,
      updated: false
    };
  }

  // Update conversion status
  const updated = await Conversion.updateStatus(existing.id, newStatus);

  // Update user balance if approved
  if (newStatus === 'approved' && existing.user_id) {
    const cashbackAmount = commission * 0.7;
    await this.updateUserBalance(existing.user_id, cashbackAmount);

    await activityLogger.log({
      userId: existing.user_id,
      action: 'conversion_approved',
      details: {
        conversionId: existing.id,
        orderCode: existing.order_code,
        cashbackAmount
      }
    });
  }

  return {
    success: true,
    conversion: updated,
    updated: true
  };
}
```

**Update User Balance**:
```javascript
async updateUserBalance(userId, cashbackAmount) {
  // Move from pending to available balance
  const query = `
    UPDATE users
    SET available_balance = available_balance + $1,
        pending_balance = pending_balance - $1
    WHERE id = $2
  `;

  await pool.query(query, [cashbackAmount, userId]);

  logger.info('User balance updated', {
    userId,
    cashbackAmount
  });
}
```

---

## V. MONITORING & ADMIN DASHBOARD

### 1. Admin Conversions Page (`frontend/admin/conversions.html`)

**Features**:
- Conversion list table with pagination
- Filters: Status, user search, date range
- Statistics cards: Total, approved, pending, rejected
- Sync actions: Fetch from API, sync statuses

**UI Components**:
```html
<!-- Statistics Cards -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-icon total"><i class="fas fa-shopping-cart"></i></div>
    <div class="stat-details">
      <div class="stat-label">Tổng Đơn</div>
      <div class="stat-value" id="totalConversions">0</div>
    </div>
  </div>

  <div class="stat-card">
    <div class="stat-icon approved"><i class="fas fa-check-circle"></i></div>
    <div class="stat-details">
      <div class="stat-label">Đã Duyệt</div>
      <div class="stat-value" id="approvedConversions">0</div>
    </div>
  </div>

  <!-- More stat cards... -->
</div>

<!-- Filters -->
<div class="filters-section">
  <select id="statusFilter">
    <option value="">Tất Cả Trạng Thái</option>
    <option value="pending">Chờ Duyệt</option>
    <option value="approved">Đã Duyệt</option>
    <option value="rejected">Từ Chối</option>
  </select>

  <input type="text" id="searchInput" placeholder="Tìm user...">

  <input type="date" id="startDate">
  <input type="date" id="endDate">

  <button onclick="applyFilters()">Lọc</button>
</div>

<!-- Conversions Table -->
<table id="conversionsTable">
  <thead>
    <tr>
      <th>Order Code</th>
      <th>User</th>
      <th>Merchant</th>
      <th>Order Amount</th>
      <th>Commission</th>
      <th>Cashback</th>
      <th>Status</th>
      <th>Order Time</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody id="conversionsBody">
    <!-- Populated by JS -->
  </tbody>
</table>

<!-- Pagination -->
<div class="pagination" id="pagination"></div>
```

---

### 2. Admin Conversions JavaScript (`frontend/admin/conversions.js`)

**Load Conversions with Filters**:
```javascript
async function loadConversions() {
  const status = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchInput').value;
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const limit = parseInt(document.getElementById('rowsPerPage').value);
  const offset = (currentPage - 1) * limit;

  const params = new URLSearchParams({
    status,
    search,
    startDate,
    endDate,
    limit,
    offset
  });

  const response = await fetch(`/api/admin/conversions?${params}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });

  const data = await response.json();

  if (data.success) {
    renderConversionsTable(data.data.conversions);
    renderPagination(data.data.pagination);
    updateStats(data.data.stats);
  }
}
```

**Render Table**:
```javascript
function renderConversionsTable(conversions) {
  const tbody = document.getElementById('conversionsBody');

  tbody.innerHTML = conversions.map(conv => `
    <tr>
      <td>${conv.order_code}</td>
      <td>
        <div>${conv.user_email}</div>
        <div class="text-muted">${conv.user_name}</div>
      </td>
      <td>
        <div class="merchant-cell">
          <img src="${conv.merchant_logo}" alt="${conv.merchant_name}">
          <span>${conv.merchant_name}</span>
        </div>
      </td>
      <td>${formatCurrency(conv.order_amount)}</td>
      <td>${formatCurrency(conv.commission)}</td>
      <td>${formatCurrency(conv.cashback_amount)}</td>
      <td>
        <span class="badge badge-${conv.status}">
          ${formatStatus(conv.status)}
        </span>
      </td>
      <td>${formatDateTime(conv.order_time)}</td>
      <td>
        <button onclick="viewConversion(${conv.id})">
          <i class="fas fa-eye"></i>
        </button>
        <button onclick="syncConversion(${conv.id})">
          <i class="fas fa-sync"></i>
        </button>
      </td>
    </tr>
  `).join('');
}
```

**Sync From AccessTrade API**:
```javascript
async function syncFromAccessTrade() {
  if (!confirm('Fetch conversions from AccessTrade API?')) return;

  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  const response = await fetch('/api/admin/fetch-conversions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ startDate, endDate })
  });

  const data = await response.json();

  if (data.success) {
    showAlert('success', `Synced ${data.data.newCount} new conversions`);
    loadConversions();
  } else {
    showAlert('error', data.message);
  }
}
```

---

### 3. User Dashboard Statistics (`frontend/dashboard.html`)

**Stats Display**:
```html
<div class="stats-cards">
  <div class="stat-card available-balance">
    <i class="fas fa-wallet"></i>
    <div>
      <h3 id="availableBalance">0đ</h3>
      <p>Số Dư Khả Dụng</p>
    </div>
  </div>

  <div class="stat-card pending-balance">
    <i class="fas fa-clock"></i>
    <div>
      <h3 id="pendingBalance">0đ</h3>
      <p>Đang Chờ Duyệt</p>
    </div>
  </div>

  <div class="stat-card total-orders">
    <i class="fas fa-shopping-cart"></i>
    <div>
      <h3 id="totalOrders">0</h3>
      <p>Tổng Đơn Hàng</p>
    </div>
  </div>

  <div class="stat-card conversion-rate">
    <i class="fas fa-chart-line"></i>
    <div>
      <h3 id="conversionRate">0%</h3>
      <p>Tỷ Lệ Chuyển Đổi</p>
    </div>
  </div>
</div>
```

**Load Stats JavaScript**:
```javascript
async function loadStats() {
  const response = await fetch('/api/dashboard/stats', {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });

  const data = await response.json();

  if (data.success) {
    const stats = data.data;

    document.getElementById('availableBalance').textContent =
      formatCurrency(stats.available_balance);

    document.getElementById('pendingBalance').textContent =
      formatCurrency(stats.pending_balance);

    document.getElementById('totalOrders').textContent =
      stats.total_conversions;

    const conversionRate = stats.total_clicks > 0
      ? ((stats.total_conversions / stats.total_clicks) * 100).toFixed(1)
      : 0;

    document.getElementById('conversionRate').textContent =
      `${conversionRate}%`;
  }
}
```

---

## VI. BACKGROUND JOBS & AUTOMATION

### 1. Conversion Retry Service (`backend/services/retryService.js`)

**Mục đích**: Tự động match lại clicks với conversions chưa match

**Core Function**:
```javascript
async retryUnmatchedClicks({ daysOld = 1, limit = 200 }) {
  logger.info('Starting unmatched clicks retry', { daysOld, limit });

  // Get unmatched clicks
  const clicks = await Click.findUnmatchedClicks({ daysOld, limit });

  logger.info(`Found ${clicks.length} unmatched clicks`);

  const results = {
    total: clicks.length,
    matched: 0,
    stillUnmatched: 0,
    details: []
  };

  for (const click of clicks) {
    try {
      // Try to find conversion by click_id in utm_content or sub2
      let conversion = await Conversion.findByClickId(click.id);

      if (!conversion && click.utm_content) {
        conversion = await Conversion.findByUtmContent(click.utm_content);
      }

      if (!conversion && click.sub2) {
        conversion = await Conversion.findBySub2(click.sub2);
      }

      if (conversion && !conversion.click_id) {
        // Match found! Link conversion to click
        await Conversion.updateClickId(conversion.id, click.id);

        results.matched++;
        results.details.push({
          clickId: click.id,
          conversionId: conversion.id,
          status: 'matched'
        });

        logger.info('Click matched to conversion', {
          clickId: click.id,
          conversionId: conversion.id
        });
      } else {
        results.stillUnmatched++;
      }

      // Update last checked timestamp
      await Click.updateLastChecked(click.id);

    } catch (error) {
      logger.error('Retry click error', {
        clickId: click.id,
        error: error.message
      });
    }
  }

  logger.success('Retry unmatched clicks completed', results);

  return results;
}
```

---

### 2. Auto Sync Cron Job (`backend/jobs/cronJobs.js`)

**Scheduled Task - Fetch Conversions**:
```javascript
// Job: Fetch conversions from AccessTrade API
// Schedule: Every 6 hours
scheduleConversionSync() {
  const schedule = '0 */6 * * *'; // Every 6 hours

  const job = cron.schedule(schedule, async () => {
    logger.info('🔄 Cron: Conversion sync started');

    try {
      const AccessTradeService = require('../services/accesstrade');

      // Fetch conversions from last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const conversions = await AccessTradeService.getOrders({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });

      logger.info(`Fetched ${conversions.length} conversions from API`);

      let newCount = 0;
      let updatedCount = 0;

      for (const conv of conversions) {
        const result = await trackingService.processConversion(conv);

        if (result.success) {
          if (result.updated) {
            updatedCount++;
          } else {
            newCount++;
          }
        }
      }

      logger.success('🔄 Cron: Conversion sync completed', {
        total: conversions.length,
        new: newCount,
        updated: updatedCount
      });

    } catch (error) {
      logger.error('🔄 Cron: Conversion sync failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
  });

  job.start();

  this.jobs.push({
    name: 'conversion-sync',
    schedule,
    job
  });

  logger.info(`✅ Scheduled: Conversion sync (${schedule})`);
}
```

**Scheduled Task - Retry Unmatched Clicks**:
```javascript
// Job: Retry unmatched clicks
// Schedule: Every 6 hours
scheduleRetryUnmatched() {
  const schedule = '0 */6 * * *';

  const job = cron.schedule(schedule, async () => {
    logger.info('🔄 Cron: Retry unmatched clicks started');

    try {
      const results = await retryService.retryUnmatchedClicks({
        daysOld: 1,
        limit: 200
      });

      logger.success('🔄 Cron: Retry completed', {
        total: results.total,
        matched: results.matched,
        stillUnmatched: results.stillUnmatched
      });

      // Alert if many clicks still unmatched
      if (results.stillUnmatched > 50) {
        logger.warn('⚠️ High number of unmatched clicks', {
          count: results.stillUnmatched
        });
      }

    } catch (error) {
      logger.error('🔄 Cron: Retry failed', {
        error: error.message
      });
    }
  }, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
  });

  job.start();

  this.jobs.push({
    name: 'retry-unmatched',
    schedule,
    job
  });

  logger.info(`✅ Scheduled: Retry unmatched clicks (${schedule})`);
}
```

---

## VII. TRACKING PARAMETERS SUMMARY

### UTM Parameters (PRIMARY Tracking)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `utm_source` | 'chatchiu' | Fixed identifier |
| `utm_campaign` | 'cashback' | Fixed campaign name |
| `utm_medium` | username | User identifier |
| `utm_content` | click_id | **PRIMARY** conversion matching key |
| `utm_term` | aff_sid | Affiliate session ID |

### Sub Parameters (BACKUP Tracking)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `sub1` | user_id | User ID |
| `sub2` | click_id | **BACKUP** conversion matching key |
| `sub3` | click_type | 'button' or 'link' |
| `sub4` | 'oneatweb' | Fixed identifier |
| `sub5` | aff_sid | (TikTok Shop only) Session ID |

### Conversion Matching Priority

1. **PRIMARY**: Match via `utm_content` = `click_id`
2. **BACKUP**: Match via `sub2` = `click_id`
3. **FALLBACK**: Manual admin matching

---

## VIII. API ENDPOINTS SUMMARY

### User Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/generate-link` | Generate affiliate link |
| GET | `/api/dashboard/stats` | Get user statistics |
| GET | `/api/dashboard/recent-clicks` | Get recent clicks |
| GET | `/api/dashboard/conversions` | Get user conversions |
| GET | `/api/dashboard/conversion/:id` | Get conversion details |
| GET | `/api/merchants` | Get merchant list |

### Admin Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/conversions` | List conversions with filters |
| GET | `/api/admin/conversion/:id` | Conversion details |
| PUT | `/api/admin/conversion/:id/status` | Update status |
| POST | `/api/admin/fetch-conversions` | Fetch from AccessTrade API |
| POST | `/api/admin/sync-conversions` | Sync statuses |
| GET | `/api/admin/dashboard/stats` | Admin statistics |

---

## IX. ERROR HANDLING & LOGGING

### Error Scenarios

1. **Link Generation Failure**:
   - API rate limit exceeded → Fallback to deeplink
   - Invalid product URL → Return error to user
   - Merchant not found → Return 404

2. **Conversion Matching Failure**:
   - Click not found → Create unmatched conversion
   - Retry service will attempt matching later

3. **API Sync Failure**:
   - AccessTrade API timeout → Retry on next cron run
   - Invalid response format → Log error, skip record

### Logging Levels

```javascript
logger.info('Normal operation', { data });
logger.success('Success event', { data });
logger.warn('Warning condition', { data });
logger.error('Error occurred', { error: error.message, stack });
```

### Activity Logging

```javascript
await activityLogger.log({
  userId: 123,
  action: 'generate_link_success',
  details: {
    merchantId: 5,
    clickId: 789,
    linkSource: 'api'
  }
});
```

---

## X. PERFORMANCE OPTIMIZATION

### Database Indexes

```sql
-- Clicks table
CREATE INDEX idx_clicks_user_id ON clicks(user_id);
CREATE INDEX idx_clicks_utm_content ON clicks(utm_content);
CREATE INDEX idx_clicks_sub2 ON clicks(sub2);
CREATE INDEX idx_clicks_clicked_at ON clicks(clicked_at DESC);

-- Conversions table
CREATE INDEX idx_conversions_user_id ON conversions(user_id);
CREATE INDEX idx_conversions_click_id ON conversions(click_id);
CREATE INDEX idx_conversions_accesstrade_id ON conversions(accesstrade_id);
CREATE INDEX idx_conversions_status ON conversions(status);
CREATE INDEX idx_conversions_order_time ON conversions(order_time DESC);
```

### Caching Strategy

- Merchant data cached for 1 hour
- User stats cached for 5 minutes
- API responses cached for 10 minutes

---

## XI. SECURITY CONSIDERATIONS

### Authentication

- All user endpoints require JWT token
- Admin endpoints require admin role check
- API tokens stored in environment variables

### Input Validation

```javascript
// Validate product URL
if (clickType === 'link' && !productUrl) {
  return res.status(400).json({
    success: false,
    message: 'Product URL is required'
  });
}

// Validate merchant domain
if (productUrl) {
  validateProductUrl(productUrl, merchant.domain);
}
```

### SQL Injection Prevention

- Use parameterized queries
- Never concatenate user input into SQL

```javascript
// GOOD
const query = 'SELECT * FROM users WHERE id = $1';
pool.query(query, [userId]);

// BAD
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

---

## XII. MONITORING & ALERTS

### Key Metrics to Monitor

1. **Link Generation Success Rate**: Target > 95%
2. **Conversion Match Rate**: Target > 80%
3. **API Response Time**: Target < 2s
4. **Unmatched Clicks**: Alert if > 50

### Alert Conditions

```javascript
// Alert if high failure rate
if (failureRate > 0.2) {
  logger.warn('High link generation failure rate', {
    failureRate: `${(failureRate * 100).toFixed(1)}%`
  });
}

// Alert if many unmatched clicks
if (unmatchedCount > 50) {
  logger.warn('High number of unmatched clicks', {
    count: unmatchedCount
  });
}
```

---

## XIII. TESTING GUIDE

### Manual Testing Steps

1. **Test Link Generation**:
   - Login as user
   - Click "Mua Ngay" on merchant
   - Verify affiliate link generated
   - Check click recorded in database

2. **Test Conversion Tracking**:
   - Complete purchase using affiliate link
   - Wait for AccessTrade to send conversion data
   - Verify conversion appears in dashboard
   - Check cashback calculated correctly

3. **Test Admin Functions**:
   - Login as admin
   - View conversions list
   - Sync from AccessTrade API
   - Update conversion status manually

### API Testing

```bash
# Generate link
curl -X POST http://localhost:3000/api/generate-link \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": 5,
    "clickType": "button"
  }'

# Get user stats
curl -X GET http://localhost:3000/api/dashboard/stats \
  -H "Authorization: Bearer <token>"

# Fetch conversions (admin)
curl -X POST http://localhost:3000/api/admin/fetch-conversions \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-01-01",
    "endDate": "2025-12-31"
  }'
```

---

## XIV. TROUBLESHOOTING

### Common Issues

**Issue 1: Link generation fails**
- Check API token validity
- Verify merchant is active
- Check network connectivity

**Issue 2: Conversions not matching**
- Verify utm_content = click_id
- Check sub2 parameter set correctly
- Run retry service manually

**Issue 3: Balance not updating**
- Check conversion status = 'approved'
- Verify user_id in conversion record
- Check database transaction logs

### Debug Commands

```sql
-- Check unmatched conversions
SELECT * FROM conversions
WHERE click_id IS NULL
ORDER BY order_time DESC
LIMIT 20;

-- Check clicks without conversions
SELECT c.* FROM clicks c
LEFT JOIN conversions conv ON conv.click_id = c.id
WHERE conv.id IS NULL
AND c.clicked_at > NOW() - INTERVAL '7 days'
ORDER BY c.clicked_at DESC;

-- Check conversion matching
SELECT
  c.id as click_id,
  c.utm_content,
  c.sub2,
  conv.id as conversion_id,
  conv.order_code,
  conv.status
FROM clicks c
LEFT JOIN conversions conv ON (
  conv.click_id = c.id
  OR conv.utm_content = c.utm_content
  OR conv.sub2 = c.sub2
)
WHERE c.user_id = 123
ORDER BY c.clicked_at DESC;
```

---

## XV. FUTURE ENHANCEMENTS

### Planned Features

1. **Real-time Conversion Webhooks**
   - Receive instant notifications from AccessTrade
   - Update user balance immediately

2. **Advanced Analytics**
   - Conversion funnel analysis
   - Merchant performance comparison
   - User behavior tracking

3. **A/B Testing**
   - Test different link generation strategies
   - Optimize conversion rates

4. **Mobile App Integration**
   - Deep linking support
   - Push notifications for conversions

---

## XVI. CONCLUSION

Hệ thống tạo link affiliate và tracking conversions đã được xây dựng với các tính năng:

✅ **Multi-source Link Generation**: API + Deeplink + TikTok Shop
✅ **Robust Click Tracking**: Primary + Backup parameters
✅ **Automatic Conversion Matching**: UTM + Sub parameters
✅ **Admin Monitoring Dashboard**: Full control and visibility
✅ **Background Jobs**: Auto-sync and retry
✅ **Error Handling**: Fallback mechanisms
✅ **Performance Optimization**: Indexes and caching
✅ **Security**: Authentication and validation

Hệ thống sẵn sàng scale và xử lý hàng nghìn conversions mỗi ngày với độ chính xác cao.
