# 🚀 Deploy lên Vercel - Quick Guide

## ⚠️ LƯU Ý QUAN TRỌNG

Vercel **KHÔNG HỖ TRỢ** long-running Node.js server như Express!

Bạn cần chọn 1 trong 2 cách:

### Option 1: Vercel Serverless (Khuyến nghị)
- Backend: Chuyển sang **Serverless Functions**
- Database: Dùng **Vercel Postgres** hoặc external DB (Supabase, Neon)
- ✅ Free tier có sẵn
- ❌ Cần refactor code

### Option 2: Hybrid (Frontend Vercel + Backend Elsewhere)
- Frontend: Deploy lên Vercel
- Backend: Deploy lên Railway, Render, hoặc Heroku
- ✅ Không cần refactor code
- ❌ Cần 2 services

---

## 🎯 Option 1: Full Vercel (Serverless)

### Bước 1: Cài đặt Vercel CLI

```bash
npm install -g vercel

# Login
vercel login
```

### Bước 2: Cấu trúc project cho Vercel

Tạo file `vercel.json` ở root:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "frontend/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "frontend/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### ⚠️ VẤN ĐỀ: Express không chạy trên Vercel!

Vercel yêu cầu **serverless functions**, không phải Express server.

**Giải pháp**: Refactor backend thành serverless functions

---

## 🔄 Refactor Backend cho Vercel

### Cấu trúc mới:

```
backend/
├── api/                    # Vercel serverless functions
│   ├── auth/
│   │   ├── login.js       # POST /api/auth/login
│   │   ├── register.js    # POST /api/auth/register
│   │   └── me.js          # GET /api/auth/me
│   ├── dashboard/
│   │   ├── stats.js
│   │   ├── merchants.js
│   │   └── generate-link.js
│   └── admin/
│       ├── users.js
│       └── conversions.js
├── lib/                   # Shared code
│   ├── db.js             # Database connection
│   ├── auth.js           # Auth middleware
│   └── utils.js
└── vercel.json
```

### Ví dụ: Serverless Function

**File**: `backend/api/auth/login.js`

```javascript
const { pool } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required'
      });
    }

    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Check password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
```

---

## ❌ VẤN ĐỀ LỚN: Vercel không phù hợp!

Refactor toàn bộ Express → Serverless = **RẤT TỐN THỜI GIAN**!

---

## ✅ Option 2: GIẢI PHÁP ĐƠN GIẢN HỠN

### Frontend: Vercel
### Backend: Railway.app (Free tier)

---

## 🚂 Deploy Backend lên Railway

### Bước 1: Tạo tài khoản Railway

1. Vào https://railway.app
2. Sign up with GitHub
3. Verify email

### Bước 2: Deploy Backend

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project (trong thư mục backend)
cd backend
railway init

# Link to new project
railway link

# Add PostgreSQL
railway add postgresql

# Set environment variables
railway variables set JWT_SECRET=your-secret-key
railway variables set NODE_ENV=production

# Deploy
railway up
```

### Bước 3: Lấy Backend URL

```bash
railway open

# Copy URL (vd: https://your-app.railway.app)
```

---

## 🎨 Deploy Frontend lên Vercel

### Bước 1: Update API URL

**File**: `frontend/js/config.js`

```javascript
// Production API URL from Railway
const API_BASE_URL = 'https://your-app.railway.app/api';
```

### Bước 2: Deploy

```bash
cd frontend
vercel

# Follow prompts:
# - Set up and deploy: Yes
# - Which scope: Your account
# - Link to existing project: No
# - Project name: mmocashback-frontend
# - Directory: ./ (current)
# - Override settings: No

# Deploy to production
vercel --prod
```

### Bước 3: Lấy Frontend URL

Vercel sẽ cho bạn URL: `https://mmocashback-frontend.vercel.app`

---

## 🔗 Alternative: Deploy cả 2 lên Railway

Railway support cả frontend + backend!

### Deploy Full Stack trên Railway:

```bash
cd MMOCashback

# Init Railway project
railway init

# Add PostgreSQL
railway add postgresql

# Deploy toàn bộ
railway up

# Railway sẽ tự detect:
# - Node.js backend
# - Serve static frontend files
```

**vercel.json** (không cần nếu dùng Railway)

---

## 🆓 So sánh các Platform

| Platform | Backend | Database | Free Tier | Phù hợp? |
|----------|---------|----------|-----------|----------|
| **Vercel** | Serverless only | External | 100GB bandwidth | ❌ Cần refactor |
| **Railway** | Full Node.js | PostgreSQL built-in | 500h/month | ✅✅✅ |
| **Render** | Full Node.js | PostgreSQL free | Spin down after 15min | ✅ |
| **Heroku** | Full Node.js | PostgreSQL | $7/month | ⚠️ Paid |

---

## 🏆 KHUYẾN NGHỊ: Railway

**Tại sao?**
- ✅ Support Express server (không cần refactor)
- ✅ PostgreSQL database built-in
- ✅ Free tier đủ dùng
- ✅ Deploy dễ dàng (1 command)
- ✅ Auto HTTPS
- ✅ Environment variables UI
- ✅ Logs & monitoring

---

## 🚀 Quick Deploy Guide - Railway

### 1. Cài Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Deploy

```bash
cd MMOCashback/backend

# Initialize
railway init

# Add PostgreSQL
railway add

# Chọn: PostgreSQL

# Deploy
railway up
```

### 3. Set Environment Variables

```bash
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set NODE_ENV=production
railway variables set ACCESSTRADE_API_KEY=your_key
```

Railway sẽ tự động set DB variables!

### 4. Init Database

```bash
# Connect to Railway shell
railway run bash

# Run init script
node init-db.js

# Exit
exit
```

### 5. Setup Frontend

```bash
# Get Railway backend URL
railway domain

# Update frontend config
# Edit frontend/js/config.js:
const API_BASE_URL = 'https://your-app.railway.app/api';
```

### 6. Deploy Frontend

**Option A: Railway (toàn bộ)**
```bash
cd MMOCashback
railway up
```

**Option B: Vercel (chỉ frontend)**
```bash
cd frontend
vercel --prod
```

---

## 📊 Kết quả

- **Backend API**: https://your-app.railway.app
- **Frontend**: https://your-app.railway.app (hoặc Vercel)
- **Database**: Managed PostgreSQL on Railway
- **Cost**: $0 (free tier)

---

## 🔧 Useful Railway Commands

```bash
# View logs
railway logs

# Open project dashboard
railway open

# List services
railway service

# Connect to database
railway connect postgres

# Run migrations
railway run psql $DATABASE_URL -f migration.sql
```

---

## 📝 Railway Project Settings

### Environment Variables (Railway Dashboard)

```
DATABASE_URL=postgresql://...  (auto-set)
JWT_SECRET=your-secret-here
NODE_ENV=production
ACCESSTRADE_API_KEY=your-key
FRONTEND_URL=https://your-frontend.railway.app
```

### Build Settings

Railway tự detect `package.json` và chạy:
- `npm install`
- `npm start`

### Deploy Trigger

- **Push to GitHub**: Auto deploy
- **Manual**: `railway up`

---

## ✅ Deployment Checklist

- [ ] Railway account created
- [ ] PostgreSQL added
- [ ] Environment variables set
- [ ] Database initialized
- [ ] Backend deployed & running
- [ ] Frontend config updated with API URL
- [ ] Frontend deployed
- [ ] Test login works
- [ ] Test link generation works
- [ ] SSL/HTTPS working (auto on Railway)

---

## 🆘 Troubleshooting

### Backend not starting

```bash
railway logs
# Check for errors in startup

railway variables
# Verify all env vars are set
```

### Database connection error

```bash
railway connect postgres
# Test database connection

railway run node -e "console.log(process.env.DATABASE_URL)"
# Check if DATABASE_URL is set
```

### CORS errors

Update `backend/server.js`:

```javascript
app.use(cors({
  origin: [
    'https://your-frontend.vercel.app',
    'https://your-app.railway.app'
  ],
  credentials: true
}));
```

---

## 🎓 Tóm tắt

**ĐỂ DEPLOY NHANH NHẤT**:

1. Dùng **Railway** cho cả backend + frontend
2. Chạy 5 lệnh:
   ```bash
   railway login
   railway init
   railway add      # Chọn PostgreSQL
   railway up
   railway open     # Xem URL
   ```
3. Done! 🎉

**Thời gian**: ~5-10 phút

---

**Last Updated**: 2025-01-16
**Platform**: Railway.app
**Cost**: FREE
