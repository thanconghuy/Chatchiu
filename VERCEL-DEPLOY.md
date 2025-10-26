# Hướng dẫn Deploy lên Vercel

## Các file đã cấu hình:
- ✅ `vercel.json` - Cấu hình build và routes
- ✅ `api/index.js` - Entry point cho Serverless Function
- ✅ `.vercelignore` - Loại trừ file không cần thiết
- ✅ `package.json` - Đã set engines và main entry

## Bước 1: Cấu hình Environment Variables trên Vercel

Truy cập Vercel Dashboard → Project Settings → Environment Variables, thêm:

### Required:
```
DATABASE_URL=postgresql://username:password@host/database?sslmode=require
JWT_SECRET=your-strong-secret-key-here
ACCESSTRADE_API_TOKEN=your-accesstrade-token
ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1
```

### Optional:
```
COMMISSION_SPLIT=0.7
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GOOGLE_CALLBACK_URL=https://your-domain.vercel.app/api/auth/google/callback
```

## Bước 2: Deploy

### Qua Vercel CLI:
```bash
# Install Vercel CLI (if needed)
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Qua Vercel Dashboard:
1. Import repository từ GitHub
2. Vercel sẽ tự detect và build
3. Thêm Environment Variables
4. Deploy

## Bước 3: Kiểm tra

Sau khi deploy thành công:
- Health check: `https://your-domain.vercel.app/health`
- Dashboard: `https://your-domain.vercel.app/dashboard`
- Admin: `https://your-domain.vercel.app/admin`

## Troubleshooting

### Lỗi "FUNCTION_INVOCATION_FAILED":
- ✅ Kiểm tra Environment Variables đã đủ chưa
- ✅ Kiểm tra DATABASE_URL có `?sslmode=require`
- ✅ Xem logs: `vercel logs <deployment-url>`

### Lỗi Database Connection:
- Neon PostgreSQL yêu cầu SSL
- Database URL format: `postgresql://user:pass@host/db?sslmode=require`

### Lỗi 404:
- Kiểm tra `vercel.json` routes
- Kiểm tra `api/index.js` có export đúng

## Notes:
- Vercel Serverless Functions có timeout 10s (Hobby plan) / 60s (Pro plan)
- Auto-sync bị DISABLED, sử dụng manual sync từ Admin Panel
- Cron jobs không hoạt động trên Vercel (dùng Vercel Cron hoặc external service)
