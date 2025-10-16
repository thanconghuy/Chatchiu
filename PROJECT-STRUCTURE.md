# MMOCashback - Cấu trúc dự án

## 📋 Tổng quan

Hệ thống cashback affiliate marketing tích hợp với AccessTrade/iSclix API.

**Stack**: Node.js + Express + PostgreSQL + Vanilla JS

---

## 📁 Cấu trúc thư mục

```
MMOCashback/
├── backend/                    # Backend API (Node.js + Express)
│   ├── config/
│   │   └── database.js        # PostgreSQL connection pool
│   ├── middleware/
│   │   └── auth.js            # JWT authentication middleware
│   ├── models/                # Database models (ORM-like)
│   │   ├── User.js            # Users table operations
│   │   ├── Merchant.js        # Merchants (Shopee, Lazada, etc.)
│   │   ├── Click.js           # Click tracking
│   │   ├── Conversion.js      # User conversions (matched)
│   │   └── SystemConversion.js # AT API conversions (all data)
│   ├── routes/                # API route handlers
│   │   ├── auth.js            # /api/auth/* - Login, register, me
│   │   ├── dashboard.js       # /api/dashboard/* - User dashboard
│   │   ├── admin.js           # /api/admin/* - Admin management
│   │   └── tracking.js        # /api/tracking/* - Conversion tracking
│   ├── services/              # Business logic services
│   │   ├── linkGenerator.js   # Affiliate link generation
│   │   └── trackingService.js # Conversion matching logic
│   ├── init-db.js             # Database initialization script
│   └── server.js              # Express app entry point
│
├── frontend/                   # Frontend (Vanilla JS)
│   ├── admin/                 # Admin panel pages
│   │   ├── index.html         # Dashboard overview
│   │   ├── users.html         # User management
│   │   ├── merchants.html     # Merchant config
│   │   ├── conversions.html   # Conversions (matched)
│   │   ├── at-orders.html     # AT raw data viewer
│   │   ├── transactions.html  # Withdrawals
│   │   ├── tools.html         # API testing tools
│   │   ├── admin.css          # Admin styles
│   │   └── *.js               # Corresponding JS files
│   ├── css/
│   │   └── style.css          # Global styles
│   ├── js/
│   │   ├── config.js          # API base URL config
│   │   ├── auth.js            # Auth utilities (login, token)
│   │   └── dashboard.js       # User dashboard logic
│   ├── dashboard.html         # User dashboard page
│   ├── history.html           # User order history
│   ├── login.html             # Login page
│   └── register.html          # Registration page
│
├── *.sql                       # Migration scripts
├── .env                        # Environment variables
├── package.json                # Dependencies
└── README.md                   # Project readme
```

---

## 🗄️ Database Schema

### Core Tables

#### `users`
Thông tin người dùng và số dư
```sql
- id (UUID, PK)
- email (VARCHAR, UNIQUE)
- password_hash
- username
- full_name
- phone
- available_balance (DECIMAL) -- Số dư có thể rút
- pending_balance (DECIMAL)   -- Đang chờ duyệt
- total_cashback (DECIMAL)    -- Tổng đã nhận
- is_admin (BOOLEAN)
- created_at, updated_at
```

#### `merchants`
Cấu hình các merchant (Shopee, Lazada, Tiki...)
```sql
- id (VARCHAR, PK)             -- 'shopee', 'lazada', etc.
- name
- logo_url
- campaign_id (VARCHAR)        -- iSclix campaign ID
- offer_id (VARCHAR)           -- iSclix offer ID
- commission_rate              -- "Lên đến 5.6%"
- policy_note (TEXT)           -- Chính sách hoàn tiền
- deep_link_base (TEXT)        -- Base URL for deep linking
- is_active (BOOLEAN)
- created_at, updated_at
```

#### `clicks`
Tracking mỗi lần user tạo link
```sql
- id (UUID, PK)
- user_id (UUID, FK -> users)
- merchant_id (VARCHAR, FK -> merchants)
- aff_sid (VARCHAR, UNIQUE)    -- Affiliate SID (nullable)
- click_type (ENUM)            -- 'button' | 'link'
- original_url (TEXT)          -- Product URL (if link type)
- affiliate_url (TEXT)         -- Generated affiliate URL
- utm_source, utm_medium, utm_campaign, utm_content, sub4
- ip_address, user_agent
- clicked_at (TIMESTAMP)
```

#### `system_conversions`
Dữ liệu conversions từ AccessTrade API (raw data)
```sql
- id (UUID, PK)
- accesstrade_id (VARCHAR, UNIQUE) -- ID từ AT API
- merchant_id (VARCHAR, FK)
- merchant_name
- order_code                   -- Mã đơn hàng
- order_amount (DECIMAL)       -- Giá trị đơn
- commission (DECIMAL)         -- Hoa hồng nhận được
- status (ENUM)                -- 'pending' | 'approved' | 'rejected'
- order_time, approval_time
- aff_sid (VARCHAR)            -- Để match với clicks
- utm_* fields                 -- UTM tracking
- user_id (UUID, nullable)     -- Sau khi match
- click_id (UUID, nullable)    -- Sau khi match
- matched_at (TIMESTAMP)       -- Thời điểm match
- created_at, updated_at
```

#### `conversions`
User conversions (đã match với clicks)
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- click_id (UUID, FK)
- merchant_id (VARCHAR, FK)
- order_code
- order_amount (DECIMAL)
- commission (DECIMAL)
- cashback_amount (DECIMAL)    -- Tiền user nhận = commission * rate
- status (ENUM)
- order_time, approval_time
- aff_sid
- created_at, updated_at
```

---

## 🔄 Data Flow

### 1. User tạo link mua hàng

```
User clicks merchant
    ↓
Frontend: openMerchantModal()
    ↓
User chọn: [Mua tự do] hoặc [Có link sản phẩm]
    ↓
POST /api/dashboard/generate-link
    {
      merchantId: 'lazada',
      clickType: 'button' | 'link',
      productUrl: 'https://...' (optional)
    }
    ↓
Backend: dashboard.js
    1. Validate merchant & URL
    2. Click.create() → tạo record clicks (aff_sid = NULL)
    3. generateAffiliateLink() → tạo affiliate URL
    4. Click.updateLinkData() → update aff_sid, affiliate_url
    5. Return affiliate URL to user
    ↓
User clicks → redirect to affiliate URL
    ↓
User mua hàng trên Lazada/Shopee
    ↓
[Wait 1-30 ngày để merchant duyệt]
```

### 2. Import conversions từ AccessTrade

```
Admin: Tools page → Click "Fetch Conversions"
    ↓
POST /api/admin/fetch-conversions
    {
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      status: 'approved'
    }
    ↓
Backend: admin.js
    1. Call AccessTrade API
    2. Parse response data
    3. SystemConversion.createOrUpdate()
       → Lưu vào system_conversions table
    ↓
Response: { success: true, count: 150 }
```

### 3. Match conversions với users

```
Admin: Conversions page → Click "Kiểm tra chuyển đổi"
    ↓
POST /api/admin/sync-conversions
    ↓
Backend: trackingService.js

    FOR EACH system_conversion (chưa match):
        1. Tìm click bằng aff_sid
           SystemConversion.aff_sid = Click.aff_sid

        2. Nếu tìm thấy:
           - Create Conversion record
           - Update user balances:
             * pending_balance += cashback
           - Mark system_conversion as matched

        3. Nếu không tìm thấy:
           - Log "No matching click found"
    ↓
Response: { matched: 45, notMatched: 5 }
```

### 4. Approve conversion (duyệt đơn)

```
AT API webhook hoặc manual sync
    ↓
system_conversions.status = 'approved'
    ↓
Trigger conversion update:
    1. Conversion.status = 'approved'
    2. User balances:
       - pending_balance -= cashback
       - available_balance += cashback
       - total_cashback += cashback
```

---

## 🔑 Key Services

### `linkGenerator.js`
Tạo affiliate tracking links

**Main function**: `generateAffiliateLink(user, merchant, clickId, clickType, productUrl)`

**Input**:
- `user`: User object (id, username)
- `merchant`: Merchant object (campaign_id, offer_id, deep_link_base)
- `clickId`: UUID từ clicks table
- `clickType`: 'button' | 'link'
- `productUrl`: URL sản phẩm (nếu clickType = 'link')

**Output**:
```js
{
  affiliateUrl: 'https://go.isclix.com/deep_link/...',
  affSid: 'user-id_timestamp_random',
  utmParams: { utm_source, utm_medium, ... },
  originalUrl: 'https://lazada.vn/...',
  clickId: 'uuid'
}
```

**Format hiện tại** (SAI):
```
https://go.isclix.com/deep_link/{campaign_id}?url={encoded}&utm_params&aff_sid=...
```

**Format đúng** (cần fix):
```
https://go.isclix.com/deep_link/{campaign_id}/{offer_id}?utm_params&url={destination}
```

### `trackingService.js`
Match conversions từ AT với clicks của users

**Main function**: `matchConversions()`

**Logic**:
1. Lấy tất cả system_conversions chưa match
2. For each conversion:
   - Tìm click bằng `aff_sid`
   - Nếu có → tạo conversion + update user balance
   - Nếu không → log error

**Matching strategy**:
- Primary: `system_conversions.aff_sid = clicks.aff_sid`
- Fallback: utm_content (click_id) matching

---

## 🛠️ Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cashback_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-key-change-this

# Server
PORT=3000
NODE_ENV=development

# AccessTrade API
ACCESSTRADE_API_KEY=your_api_key
ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1

# Deep Link Base
DEEP_LINK_BASE=https://go.isclix.com/deep_link/v6
```

---

## 🚀 Common Tasks

### Start Development Server
```bash
# Backend
cd backend
npm start

# Frontend - Use Live Server extension in VS Code
# Or any static file server
```

### Initialize Database
```bash
cd backend
node init-db.js
```
⚠️ **Warning**: Xóa toàn bộ data!

### Run Migration
```bash
psql -U postgres -d cashback_db -f migration-file.sql
```

### Test AccessTrade API
Admin → Tools → "Fetch Conversions"

---

## 🐛 Known Issues & Fixes

### Issue 1: `aff_sid` NULL constraint error
**Fix**: Run `fix-clicks-aff-sid.sql`

### Issue 2: Wrong deep link format
**Fix**: Update `linkGenerator.js` (line 119) - see refactoring section

### Issue 3: Placeholder text hardcoded
**Fix**: Dynamic placeholder in `dashboard.js` (line 172)

---

## 📊 API Endpoints Summary

### Public Endpoints
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập

### User Endpoints (require auth)
- `GET /api/auth/me` - User info
- `GET /api/dashboard/stats` - Dashboard stats
- `GET /api/dashboard/merchants` - List merchants
- `POST /api/dashboard/generate-link` - Tạo affiliate link
- `GET /api/dashboard/recent-clicks` - Lịch sử clicks
- `GET /api/dashboard/conversions` - User conversions

### Admin Endpoints (require admin role)
- `GET /api/admin/users` - List users
- `GET /api/admin/conversions` - All conversions
- `GET /api/admin/at-orders` - AT raw data
- `POST /api/admin/fetch-conversions` - Import từ AT API
- `POST /api/admin/sync-conversions` - Match conversions
- `PUT /api/admin/conversion/:id/approve` - Approve
- `PUT /api/admin/merchant/:id` - Update merchant

---

## 📝 Code Style & Conventions

### Naming
- **Models**: PascalCase (e.g., `User.js`, `Merchant.js`)
- **Routes**: camelCase (e.g., `dashboard.js`, `admin.js`)
- **Functions**: camelCase (e.g., `generateAffiliateLink()`)
- **Database columns**: snake_case (e.g., `user_id`, `created_at`)

### Error Handling
```js
try {
  const result = await Model.method();
  res.json({ success: true, data: result });
} catch (error) {
  console.error('Error description:', error);
  res.status(500).json({
    success: false,
    message: error.message || 'Generic error'
  });
}
```

### Response Format
```js
// Success
{ success: true, data: {...}, message: 'Optional' }

// Error
{ success: false, message: 'Error description' }
```

---

## 🔍 Debugging Tips

### Enable SQL query logging
In `database.js`:
```js
pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});
```

### Log requests
In `server.js`:
```js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

### Check conversion matching
```sql
-- See unmatched conversions
SELECT * FROM system_conversions
WHERE user_id IS NULL
LIMIT 10;

-- See matched conversions
SELECT
  sc.order_code,
  sc.aff_sid,
  c.id as click_id,
  u.username
FROM system_conversions sc
JOIN clicks c ON sc.aff_sid = c.aff_sid
JOIN users u ON c.user_id = u.id
LIMIT 10;
```

---

## 📚 References

- [AccessTrade API Docs](https://developers.accesstrade.vn/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

**Last Updated**: 2025-01-16
**Version**: 1.0.0
