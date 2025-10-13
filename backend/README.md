# Backend - Database Setup

Hệ thống database cho cashback affiliate marketing với PostgreSQL (Neon).

## 📋 Database Schema

### Tables

#### 1. **users** - Người dùng
```sql
- id (UUID)
- email (unique)
- password_hash
- full_name
- username (unique, dùng cho UTM tracking)
- phone
- available_balance (số dư có thể rút)
- pending_balance (số dư chờ duyệt)
- total_cashback (tổng cashback)
- created_at, updated_at
```

#### 2. **merchants** - Nhà cung cấp
```sql
- id (varchar: 'shopee', 'lazada', 'tiki'...)
- name
- logo_url
- campaign_id (AccessTrade)
- offer_id (AccessTrade)
- commission_rate (text: "3-8%")
- is_active
- deep_link_base
```

#### 3. **clicks** - Lịch sử click
```sql
- id (UUID)
- user_id (FK users)
- merchant_id (FK merchants)
- aff_sid (unique, để match với conversions)
- click_type ('button' | 'link')
- original_url (nếu user nhập link)
- affiliate_url (link đã generate)
- utm_source, utm_medium, utm_campaign, utm_content
- sub4 (cố định 'oneatweb')
- ip_address, user_agent
- clicked_at
```

#### 4. **conversions** - Đơn hàng
```sql
- id (UUID)
- user_id (FK users)
- click_id (FK clicks, nullable)
- accesstrade_conversion_id (unique)
- merchant_id, merchant_name
- order_id, order_value
- commission_amount (từ AccessTrade)
- platform_cut (30% của chúng tôi)
- user_cashback (70% cho user)
- status ('pending' | 'approved' | 'rejected')
- aff_sid (để match)
- ordered_at, approved_at, rejected_at
```

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` và điền thông tin:

```env
# Neon PostgreSQL Connection String
DATABASE_URL=postgres://username:password@your-neon-host.neon.tech/dbname?sslmode=require
```

**Lấy DATABASE_URL từ Neon:**
1. Đăng nhập vào https://neon.tech
2. Tạo project mới hoặc chọn project có sẵn
3. Copy "Connection String" từ Dashboard
4. Paste vào file `.env`

### 3. Initialize Database

```bash
# Tạo tables và seed data
npm run init-db
```

Script sẽ:
- ✅ Tạo 4 tables với indexes
- ✅ Seed 4 merchants (Shopee, Lazada, Tiki, Sendo)
- ✅ Tạo sample user để test

### 4. Test Connection

```bash
# Test kết nối và xem thông tin database
npm run test-db
```

## 📊 Flow Logic

### Flow User Click → Purchase → Cashback

```
1. User đăng nhập
   ↓
2. Hiển thị danh sách Merchants
   ↓
3. User chọn Merchant → Popup với 2 options:
   - [Button] "Mua sắm tự do" → utm_medium='button'
   - [Input] "Nhập link sản phẩm" → utm_medium='link'
   ↓
4. System tạo affiliate link:
   - Generate aff_sid (unique identifier)
   - UTM params:
     * utm_source = 'cashback'
     * utm_medium = 'button' hoặc 'link'
     * utm_campaign = 'lammmo'
     * utm_content = username
     * sub4 = 'oneatweb'
   ↓
5. Lưu vào table 'clicks' với aff_sid
   ↓
6. Redirect user đến affiliate link
   ↓
7. User mua hàng trên merchant site
   ↓
8. [Cron Job] Sync conversions từ AccessTrade (5-10 lần/ngày)
   ↓
9. Match conversion với click qua aff_sid
   ↓
10. Tính cashback:
    - platform_cut = commission_amount * 0.30
    - user_cashback = commission_amount * 0.70
   ↓
11. Cập nhật user balance:
    - pending_balance += user_cashback
    - (Khi approved) available_balance += user_cashback
```

## 🔍 Key Queries

### Match Conversion với Click

```sql
-- Tìm click tương ứng với conversion
SELECT c.*, cl.user_id, cl.utm_content
FROM conversions c
LEFT JOIN clicks cl ON c.aff_sid = cl.aff_sid
WHERE c.aff_sid = 'SOME_AFF_SID';
```

### Cập nhật User Balance khi Conversion Approved

```sql
-- Chuyển từ pending sang available
UPDATE users
SET
  available_balance = available_balance + $1,
  pending_balance = pending_balance - $1,
  updated_at = CURRENT_TIMESTAMP
WHERE id = $2;
```

### Thống kê User

```sql
-- Tổng quan cashback của user
SELECT
  u.username,
  u.available_balance,
  u.pending_balance,
  u.total_cashback,
  COUNT(DISTINCT c.id) as total_orders,
  COUNT(DISTINCT CASE WHEN c.status = 'approved' THEN c.id END) as approved_orders,
  SUM(c.user_cashback) as total_earned
FROM users u
LEFT JOIN conversions c ON u.id = c.user_id
WHERE u.id = $1
GROUP BY u.id;
```

## 🛠️ Useful Commands

```bash
# Test database connection
npm run test-db

# Re-initialize database (WARNING: Drops all tables!)
npm run init-db

# Connect to database using psql
psql $DATABASE_URL
```

## 📝 Notes

### aff_sid Format
- Format đề xuất: `{userId}_{merchantId}_{timestamp}_{random}`
- Ví dụ: `uuid123_shopee_1704038400000_abc123`
- Phải unique để match chính xác

### Commission Split
- **Platform (30%)**: Platform cut để vận hành hệ thống
- **User (70%)**: Cashback trả lại cho user

### Status Flow
```
pending → approved → available_balance tăng
pending → rejected → không tính cashback
```

## 🔐 Security

- ✅ Passwords được hash với bcrypt
- ✅ SSL required cho Neon connection
- ✅ Environment variables cho sensitive data
- ✅ Foreign key constraints để đảm bảo data integrity
- ✅ Indexes để optimize query performance

## 📞 Support

Nếu có vấn đề:
1. Kiểm tra DATABASE_URL trong `.env`
2. Chạy `npm run test-db` để verify connection
3. Check logs trong console

---

Made with ❤️ for Cashback Affiliate System
