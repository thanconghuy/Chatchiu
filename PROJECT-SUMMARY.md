# CHATCHIU CASHBACK SYSTEM - PROJECT SUMMARY

## 📋 Tổng Quan Dự Án

**Tên dự án:** ChatChiu Cashback System
**Mô tả:** Hệ thống cashback tích hợp với AccessTrade API, cho phép người dùng tạo affiliate links và nhận cashback từ các đơn hàng.
**Phiên bản:** 1.0.0
**Ngày cập nhật:** 16/11/2025

---

## 🏗️ Kiến Trúc Hệ Thống

### **Technology Stack**

**Backend:**
- Node.js + Express.js
- PostgreSQL (Neon Serverless Database)
- JWT Authentication
- Axios (HTTP Client)
- Node-cron (Scheduled Tasks)

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5 + CSS3
- Responsive Design
- Mobile-first approach

**API Integration:**
- AccessTrade V1 API (Generic merchants)
- AccessTrade V2 API (TikTok Shop)
- TikTok Shop Product Feeds API

---

## 📁 Cấu Trúc Thư Mục

```
Chatchiu/
├── backend/
│   ├── config/
│   │   └── database.js              # Database connection config
│   ├── middleware/
│   │   └── auth.js                  # JWT authentication middleware
│   ├── models/
│   │   ├── Click.js                 # Click tracking model
│   │   ├── Conversion.js            # Conversion model
│   │   ├── Merchant.js              # Merchant model
│   │   └── User.js                  # User model
│   ├── routes/
│   │   ├── admin.js                 # Admin API routes
│   │   ├── auth.js                  # Authentication routes
│   │   ├── dashboard.js             # User dashboard routes
│   │   └── reconciliation.js        # Reconciliation routes
│   ├── services/
│   │   ├── accessTradeLink.js       # Generic V1 API service
│   │   ├── tiktokShopLink.js        # TikTok Shop V2 API service
│   │   ├── linkGenerator.js         # DIY link generation
│   │   ├── conversionImport.js      # Import conversions from AT
│   │   └── pendingOrdersUpdate.js   # Update pending orders
│   ├── migrations/
│   │   ├── 001-010_*.sql            # Database migrations
│   │   └── 011_add_product_info.sql # TikTok Shop product info
│   └── server-cashback.js           # Main server file
│
├── frontend/
│   ├── admin/
│   │   ├── admin.html               # Admin dashboard
│   │   ├── admin.js                 # Admin logic
│   │   ├── admin.css                # Admin styles
│   │   ├── sidebar.js               # Shared sidebar component
│   │   ├── conversions.html         # Conversions management
│   │   ├── conversions.js           # Conversions logic
│   │   ├── atorders.html            # AccessTrade orders
│   │   ├── atorders.js              # AT orders logic
│   │   └── reconciliation.html      # Reconciliation module
│   ├── dashboard.html               # User dashboard
│   ├── dashboard.js                 # User dashboard logic
│   ├── js/
│   │   ├── auth.js                  # Auth utilities
│   │   ├── config.js                # API config
│   │   └── mobile-menu.js           # Mobile menu handler
│   └── css/
│       └── style.css                # Global styles
│
├── test-*.js                        # Test scripts
├── .env                             # Environment variables
├── PROJECT-SUMMARY.md               # This file
├── TIKTOK-SHOP-INTEGRATION.md       # TikTok integration docs
└── package.json                     # NPM dependencies
```

---

## 🗄️ Database Schema

### **Bảng Chính (Main Tables)**

#### **users**
```sql
- id (UUID, Primary Key)
- email (TEXT, Unique)
- password (TEXT, Hashed)
- username (TEXT)
- full_name (TEXT)
- is_admin (BOOLEAN, Default: false)
- balance (DECIMAL, Default: 0)
- created_at (TIMESTAMP)
```

#### **merchants**
```sql
- id (TEXT, Primary Key)
- name (TEXT)
- campaign_id (TEXT)
- logo_url (TEXT)
- deep_link_base (TEXT)
- commission_rate (DECIMAL)
- is_active (BOOLEAN, Default: true)
- api_type (TEXT) -- 'tiktok_v2' for TikTok Shop
- created_at (TIMESTAMP)
```

#### **clicks**
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key → users.id)
- merchant_id (TEXT, Foreign Key → merchants.id)
- click_type (TEXT) -- 'link' | 'button'
- affiliate_url (TEXT)
- aff_sid (TEXT)
- product_url (TEXT)
- utm_source (TEXT)
- utm_medium (TEXT)
- utm_campaign (TEXT)
- utm_content (TEXT) -- = click.id (for matching)
- sub1 (TEXT) -- = user_id
- sub2 (TEXT) -- = click.id (backup matching)
- sub3 (TEXT) -- = click_type
- sub4 (TEXT) -- = 'oneatweb'
- link_source (TEXT) -- 'api' | 'tiktok-api' | 'diy'
- product_info (JSONB) -- TikTok Shop product metadata
- clicked_at (TIMESTAMP)
```

#### **conversions**
```sql
- id (UUID, Primary Key)
- click_id (UUID, Foreign Key → clicks.id)
- user_id (UUID, Foreign Key → users.id)
- merchant_id (TEXT, Foreign Key → merchants.id)
- accesstrade_id (TEXT, Unique)
- order_code (TEXT)
- order_amount (DECIMAL)
- commission (DECIMAL)
- cashback_amount (DECIMAL)
- status (TEXT) -- 'pending' | 'approved' | 'rejected'
- is_confirmed (BOOLEAN) -- Reconciliation status
- order_time (TIMESTAMP)
- confirmed_time (TIMESTAMP)
- utm_source (TEXT)
- utm_medium (TEXT)
- utm_campaign (TEXT)
- utm_content (TEXT)
- created_at (TIMESTAMP)
```

#### **system_conversions**
```sql
-- Similar to conversions but for cashback system tracking
-- Contains matched conversions with user_id
```

#### **reconciliations**
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key → users.id)
- period_start (DATE)
- period_end (DATE)
- total_approved (DECIMAL)
- total_items (INTEGER)
- status (TEXT)
- created_by (UUID, Foreign Key → users.id)
- created_at (TIMESTAMP)
```

---

## 🔄 Luồng Hoạt Động (Workflows)

### **1. Link Generation Flow**

```
User Request
    ↓
Check API Mode Enabled?
    ↓
┌───YES──────────────────┐
│                        │
│ Check Merchant Type    │
│                        │
├─ api_type = 'tiktok_v2'?
│  ├─ YES → TikTok Shop V2 API
│  │         ├─ Get product info
│  │         ├─ Validate product
│  │         ├─ Generate aff link
│  │         └─ Save product_info
│  │
│  └─ NO → Check URL pattern
│           ├─ TikTok URL? → TikTok V2 API
│           └─ Other → Generic V1 API
│
└─ On Error → DIY Fallback
                ↓
           Manual Link Construction
```

### **2. Conversion Tracking Flow**

```
1. User clicks affiliate link
   └─ URL contains: utm_content={click-id}, sub2={click-id}

2. User makes purchase on merchant site

3. AccessTrade webhook sends conversion data
   └─ Includes: utm_content, sub2, order details

4. System matches conversion:
   Primary: conversions.utm_content = clicks.id
   Backup:  conversions.sub2 = clicks.id

5. Create conversion record
   └─ Calculate cashback = commission × merchant.commission_rate

6. Update user balance (when approved)
```

### **3. Reconciliation Flow**

```
Admin creates reconciliation
    ↓
Select period & user
    ↓
System queries approved conversions
    ↓
Mark conversions as is_confirmed = true
    ↓
Lock conversions from further changes
    ↓
Generate reconciliation report
```

---

## 🔌 API Endpoints

### **Authentication**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout user |

### **User Dashboard**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Get user statistics |
| GET | `/api/dashboard/clicks` | Get user clicks |
| GET | `/api/dashboard/conversions` | Get user conversions |
| POST | `/api/dashboard/generate-link` | Generate affiliate link |

### **Admin**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Admin dashboard stats |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/conversions` | List all conversions |
| GET | `/api/admin/conversion/:id` | Get conversion details |
| PUT | `/api/admin/conversion/:id/status` | Update conversion status |
| GET | `/api/admin/conversion/:id/check-at-status` | Check AT order status |
| PUT | `/api/admin/conversion/:id/sync-from-at` | Sync from AccessTrade |
| POST | `/api/admin/check-conversions` | Match conversions with clicks |
| GET | `/api/admin/monitoring/tiktok-api` | TikTok API monitoring |

### **Reconciliation**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reconciliation/create` | Create reconciliation |
| GET | `/api/reconciliation/list` | List reconciliations |
| GET | `/api/reconciliation/:id` | Get reconciliation details |

---

## 🎯 Core Features

### **1. Multi-Mode Link Generation**

**a) TikTok Shop V2 API Mode**
- Endpoint: `/v2/tiktokshop_product_feeds/create_link`
- Auto-detects TikTok URLs
- Returns product metadata (name, price, image, commission)
- Product validation included
- Short URL generation

**b) Generic V1 API Mode**
- Endpoint: `/v1/product_link/create`
- For: Lazada, Shopee, Tiki, etc.
- Requires campaign_id
- Basic affiliate link generation

**c) DIY Mode**
- Manual link construction
- Fallback when API fails
- Uses deep_link_base from merchant config

### **2. Tracking System**

**UTM Parameters (Primary):**
```javascript
utm_source: 'chatchiu'
utm_medium: user.username
utm_campaign: 'cashback'
utm_content: click.id  // ← CRITICAL for matching
```

**SUB Parameters (Backup):**
```javascript
sub1: user.id      // User UUID
sub2: click.id     // Click UUID (backup matching)
sub3: click_type   // 'link' | 'button'
sub4: 'oneatweb'   // Platform identifier
```

### **3. Conversion Management**

- Import từ AccessTrade API
- Auto-matching với clicks
- Status management (pending → approved → rejected)
- Reconciliation tracking (is_confirmed)
- Balance calculation & update

### **4. Admin Panel**

**Modules:**
- Dashboard: System overview, stats, recent activities
- Users Management: View users, balance, activity
- Conversions Management: Review, approve/reject orders
- AT Orders: Import & sync from AccessTrade
- Reconciliation: Create & manage reconciliations
- Tools: Manual sync, system settings

### **5. TikTok Shop Integration**

**Key Features:**
- Separate module architecture (`tiktokShopLink.js`)
- Product metadata storage in JSONB
- Smart routing (api_type or URL detection)
- Fallback mechanism
- Monitoring endpoint for API performance

**Product Info Structure:**
```json
{
  "id": "1729836100247522192",
  "name": "Product name...",
  "price": {
    "amount": "20000",
    "currency": "VND"
  },
  "image": "https://...",
  "commission": {
    "amount": "3.000",
    "currency": "VND",
    "rate": 1500
  }
}
```

---

## 🔐 Security

### **Authentication**
- JWT-based authentication
- Password hashing with bcrypt
- Token expiration: 7 days
- Admin role verification

### **Authorization**
- Middleware-based access control
- Admin-only routes protected
- User can only access own data

### **Data Protection**
- SQL injection prevention (parameterized queries)
- XSS protection
- CORS configuration
- Environment variables for secrets

---

## ⚙️ Configuration

### **Environment Variables (.env)**

```bash
# Database
DATABASE_URL=postgresql://user:password@host/database

# JWT
JWT_SECRET=your-secret-key

# AccessTrade API
USE_ACCESSTRADE_API=true
ACCESSTRADE_ACCESS_TOKEN=your-token
ACCESSTRADE_API_URL=https://api.accesstrade.vn

# Server
PORT=3007
NODE_ENV=production

# Auto Sync (Optional)
ENABLE_AUTO_SYNC=false
SYNC_INTERVAL_HOURS=6
```

### **Merchant Configuration**

Merchants are configured in database with fields:
- `api_type`: Set to `'tiktok_v2'` for TikTok Shop
- `campaign_id`: AccessTrade campaign ID
- `deep_link_base`: For DIY mode
- `commission_rate`: Cashback percentage (e.g., 0.7 = 70%)

---

## 📊 Monitoring & Analytics

### **TikTok API Monitoring**

Endpoint: `GET /api/admin/monitoring/tiktok-api?period=7d`

**Metrics:**
- Total links generated
- API success rate vs fallback rate
- Product metrics (count, avg commission, total value)
- Conversion rate
- Daily breakdown
- AI-generated recommendations

### **System Health**

**Cron Jobs:**
1. Retry unmatched clicks (every 6 hours)
2. Cleanup expired clicks (daily at 3 AM)
3. Expiring clicks alert (daily at 9 AM)
4. Activity logs cleanup (daily at 2 AM)

---

## 🧪 Testing

### **Test Scripts**

```bash
# Test tracking structure integrity
node test-tracking-structure.js

# Test TikTok Shop integration
node test-tiktok-integration.js

# Test TikTok Shop link generation
node test-tiktok-link.js

# Test TikTok API monitoring
node test-tiktok-monitoring.js
```

---

## 🚀 Deployment

### **Production Checklist**

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database URL
- [ ] Set strong JWT_SECRET
- [ ] Configure AccessTrade API token
- [ ] Enable HTTPS
- [ ] Set up CORS for production domain
- [ ] Configure logging
- [ ] Set up monitoring alerts
- [ ] Database backup strategy
- [ ] Error tracking (e.g., Sentry)

### **Database Migrations**

Run migrations in order:
```bash
psql $DATABASE_URL -f backend/migrations/001_*.sql
psql $DATABASE_URL -f backend/migrations/002_*.sql
...
psql $DATABASE_URL -f backend/migrations/011_add_product_info_to_clicks.sql
```

---

## 📝 Recent Updates

### **Version 1.0.0 (16/11/2025)**

1. **TikTok Shop V2 API Integration**
   - Separate module architecture
   - Product metadata storage
   - Smart routing with fallback
   - Monitoring endpoint

2. **Conversions Management Enhancements**
   - Changed "Status" → "TT đơn hàng"
   - Added "TT đối soát" column
   - Reconciliation status tracking
   - Fixed conversion details view

3. **Admin Panel Improvements**
   - Centralized sidebar component
   - Fixed dashboard statistics
   - AT Orders pagination fix
   - Button text localization

4. **Bug Fixes**
   - AccessTrade API token configuration
   - Conversion not found error
   - Port conflict handling
   - Schema compatibility fixes

---

## 🛣️ Roadmap

### **Phase 1: Core System** ✅ COMPLETED
- [x] User authentication
- [x] Link generation (DIY mode)
- [x] Click tracking
- [x] Conversion import
- [x] Admin panel

### **Phase 2: API Integration** ✅ COMPLETED
- [x] AccessTrade V1 API integration
- [x] TikTok Shop V2 API integration
- [x] Smart routing system
- [x] Fallback mechanism

### **Phase 3: Advanced Features** ✅ COMPLETED
- [x] Reconciliation module
- [x] Monitoring & analytics
- [x] AT Orders sync
- [x] Product info tracking

### **Phase 4: Future Enhancements** 🔜 PLANNED
- [ ] Frontend product preview for TikTok Shop
- [ ] Commission calculator
- [ ] Product search by name
- [ ] Automated reconciliation
- [ ] User withdrawal system
- [ ] Email notifications
- [ ] Mobile app (React Native)
- [ ] Multi-language support

---

## 👥 Team & Contact

**Developer:** Claude (Anthropic AI)
**Project Owner:** ChatChiu Team
**Support:** [GitHub Issues](https://github.com/anthropics/claude-code/issues)

---

## 📚 Documentation References

- [TikTok Shop Integration](./TIKTOK-SHOP-INTEGRATION.md)
- [AccessTrade API Docs](https://www.accesstrade.vn/api-documentation)
- [Database Schema](./backend/migrations/)
- [Test Scripts](./test-*.js)

---

## ⚖️ License

Proprietary - All rights reserved

---

**Last Updated:** 16/11/2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
