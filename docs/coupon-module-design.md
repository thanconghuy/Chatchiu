# Module Coupon - Chatchiu.Online

## Database Schema

### Table: coupons
```sql
CREATE TABLE coupons (
    id VARCHAR(255) PRIMARY KEY,
    merchant_id VARCHAR(255) REFERENCES merchants(id),
    campaign_id VARCHAR(255),
    name VARCHAR(500),
    content TEXT,
    image_url TEXT,

    -- Coupon codes
    coupon_codes JSONB, -- [{code, desc}]

    -- Timing
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    time_left VARCHAR(100),

    -- Links
    original_link TEXT,
    affiliate_link TEXT,

    -- Discount info
    discount_value DECIMAL(15,2),
    discount_percentage DECIMAL(5,2),
    coin_cap DECIMAL(15,2),
    coin_percentage DECIMAL(5,2),
    min_spend DECIMAL(15,2),
    max_value DECIMAL(15,2),

    -- Status
    is_hot BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    percentage_used INTEGER DEFAULT 0,

    -- Categories
    categories JSONB, -- [{category_name, category_name_show}]

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    synced_at TIMESTAMP,

    INDEX idx_merchant (merchant_id),
    INDEX idx_end_date (end_date),
    INDEX idx_is_hot (is_hot),
    INDEX idx_is_active (is_active)
);
```

### Table: coupon_clicks
```sql
CREATE TABLE coupon_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    coupon_id VARCHAR(255) REFERENCES coupons(id),
    merchant_id VARCHAR(255) REFERENCES merchants(id),

    -- Tracking
    clicked_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,

    -- Conversion tracking (optional)
    converted BOOLEAN DEFAULT FALSE,
    conversion_id UUID REFERENCES conversions(id),

    INDEX idx_user (user_id),
    INDEX idx_coupon (coupon_id),
    INDEX idx_clicked_at (clicked_at)
);
```

### Table: coupon_categories
```sql
CREATE TABLE coupon_categories (
    id SERIAL PRIMARY KEY,
    category_code VARCHAR(50) UNIQUE,
    category_name VARCHAR(255),
    category_type VARCHAR(50), -- E-COMMERCE, BEAUTY, etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Table: user_saved_coupons
```sql
CREATE TABLE user_saved_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    coupon_id VARCHAR(255) REFERENCES coupons(id),
    saved_at TIMESTAMP DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,

    UNIQUE(user_id, coupon_id),
    INDEX idx_user_saved (user_id, saved_at)
);
```

## Backend API Endpoints

### Admin APIs

#### 1. Sync Coupons from AccessTrade
```
POST /api/admin/coupons/sync
Body: {
  merchant_id?: string,
  is_hot?: boolean,
  limit?: number
}
Response: {
  success: boolean,
  synced: number,
  new: number,
  updated: number,
  errors: string[]
}
```

#### 2. Manage Coupons
```
GET /api/admin/coupons - List all coupons with filters
POST /api/admin/coupons - Manual create
PUT /api/admin/coupons/:id - Update
DELETE /api/admin/coupons/:id - Soft delete (set is_active=false)
```

#### 3. Analytics
```
GET /api/admin/coupons/stats
Response: {
  total_coupons: number,
  active_coupons: number,
  expired_coupons: number,
  total_clicks: number,
  clicks_today: number,
  top_coupons: [...],
  top_merchants: [...]
}
```

### User APIs

#### 1. Browse Coupons
```
GET /api/coupons
Query: {
  merchant?: string,
  category?: string,
  is_hot?: boolean,
  search?: string,
  page?: number,
  limit?: number
}
Response: {
  success: boolean,
  coupons: [...],
  total: number,
  page: number
}
```

#### 2. Get Coupon Detail
```
GET /api/coupons/:id
Response: {
  success: boolean,
  coupon: {...}
}
```

#### 3. Search Coupons by Product Link
```
POST /api/coupons/search-by-link
Body: {
  url: string
}
Response: {
  success: boolean,
  coupons: [...],
  product_info: {...}
}
```

#### 4. Get Hot Coupons
```
GET /api/coupons/hot
Query: {
  period?: 'week' | 'month',
  limit?: number
}
```

#### 5. Track Coupon Click
```
POST /api/coupons/:id/click
Response: {
  success: boolean,
  affiliate_link: string
}
```

#### 6. Save/Unsave Coupon
```
POST /api/coupons/:id/save
DELETE /api/coupons/:id/save
GET /api/coupons/saved - Get user's saved coupons
```

## Frontend Pages

### 1. User Pages

#### /coupons (Main Coupon Page)
- Search bar
- Filter by merchant, category, hot coupons
- Grid/List view of coupons
- Pagination
- Sort options (newest, ending soon, discount value)

#### /coupons/:id (Coupon Detail)
- Full coupon info
- Multiple coupon codes if available
- "Copy Code" button
- "Use Now" button (tracks click + redirects)
- Save/Unsave button
- Related coupons
- Share buttons

#### /coupons/saved (Saved Coupons)
- User's saved coupons
- Filter: active/used/expired
- Quick actions: use, remove

#### Dashboard Widget
- "Hot Coupons Today" section
- Quick access to saved coupons

### 2. Admin Pages

#### /admin/coupons
- List all coupons
- Sync button
- Filters: merchant, status, date range
- Bulk actions: activate/deactivate
- View stats: clicks, conversions

#### /admin/coupons/sync
- Manual sync interface
- Select merchant
- Sync hot coupons only option
- View sync history/logs

## Key Features

### 1. Auto Sync Coupons
- Cron job to sync hot coupons daily
- Sync specific merchant coupons weekly
- Auto deactivate expired coupons

### 2. Smart Search
- Search by merchant name
- Search by discount amount
- Search by product link
- Filter by category

### 3. User Features
- Save favorite coupons
- Click tracking
- Copy coupon code with one click
- Share coupons

### 4. Analytics
- Most clicked coupons
- Conversion rate per coupon
- Popular merchants
- User engagement metrics

## Technical Implementation

### Backend Services

#### 1. CouponService (backend/services/couponService.js)
```javascript
class CouponService {
  // Sync from AccessTrade
  async syncCoupons(options)
  async syncHotCoupons(period)
  async syncMerchantCoupons(merchantId)

  // CRUD
  async getCoupons(filters, pagination)
  async getCouponById(id)
  async searchByLink(url)
  async getHotCoupons(period, limit)

  // User actions
  async trackClick(userId, couponId)
  async saveCoupon(userId, couponId)
  async unsaveCoupon(userId, couponId)
  async getSavedCoupons(userId)

  // Analytics
  async getCouponStats()
  async getTopCoupons(limit)

  // Cleanup
  async deactivateExpiredCoupons()
}
```

### Frontend Components

#### Coupon Card Component
```jsx
<div class="coupon-card">
  <img src="{coupon.image}" />
  <div class="coupon-info">
    <h3>{coupon.name}</h3>
    <p class="merchant">{coupon.merchant}</p>
    <div class="discount">
      {discount_value || discount_percentage}
    </div>
    <div class="coupon-codes">
      {codes.map(code => <CouponCode code={code} />)}
    </div>
    <div class="actions">
      <button class="copy-code">Copy Code</button>
      <button class="use-now">Use Now</button>
      <button class="save">Save</button>
    </div>
    <div class="expiry">Expires: {end_date}</div>
  </div>
</div>
```

## Cron Jobs

### 1. Sync Hot Coupons Daily
```javascript
// Every day at 6 AM
0 6 * * * - Sync hot coupons from AccessTrade
```

### 2. Deactivate Expired Coupons
```javascript
// Every hour
0 * * * * - Check and deactivate expired coupons
```

### 3. Weekly Merchant Sync
```javascript
// Every Sunday at 3 AM
0 3 * * 0 - Sync all merchant coupons
```

## Mobile Optimization

- Card-based layout for coupons
- Swipeable coupon carousel
- One-tap copy code
- Share via mobile apps
- Push notifications for expiring saved coupons

## Integration Points

### 1. With Existing Cashback System
- Show relevant coupons when user clicks merchant
- Combine coupon + cashback savings display
- Track coupon usage → conversion

### 2. With Click Tracking
- Coupon clicks tracked separately
- Attribute conversions to coupon if used

### 3. With Merchant System
- Link coupons to existing merchants
- Show coupon count on merchant cards
- Filter merchants with active coupons
