# HƯỚNG DẪN DEPLOY LÊN PRODUCTION

## 📋 CHECKLIST TRƯỚC KHI DEPLOY

### ✅ Security Must-Do List

- [ ] **Đổi JWT_SECRET** thành giá trị random mạnh (32+ ký tự)
  ```bash
  # Generate mới:
  openssl rand -base64 32
  ```

- [ ] **Rotate tất cả API keys và credentials**
  - AccessTrade API Token
  - Google OAuth credentials
  - Stack Auth keys
  - Database password

- [ ] **Setup Environment Variables trên hosting platform**
  - Vercel: https://vercel.com/docs/environment-variables
  - Heroku: https://devcenter.heroku.com/articles/config-vars
  - Các nền tảng khác: Tham khảo docs

- [ ] **Verify `.env` KHÔNG bao giờ commit lên git**
  ```bash
  # Check git history:
  git log --all --full-history -- .env

  # Nếu có, cần remove:
  git filter-branch --force --index-filter \
    "git rm --cached --ignore-unmatch .env" \
    --prune-empty --tag-name-filter cat -- --all
  ```

- [ ] **Set NODE_ENV=production**
  ```
  NODE_ENV=production
  ```

- [ ] **Configure ALLOWED_ORIGINS**
  ```
  ALLOWED_ORIGINS=https://chatchiuonline.com,https://www.chatchiuonline.com
  ```

---

## 🚀 DEPLOY TO VERCEL

### Bước 1: Cài đặt Vercel CLI
```bash
npm install -g vercel
```

### Bước 2: Login
```bash
vercel login
```

### Bước 3: Setup Environment Variables
Vào Vercel Dashboard > Project Settings > Environment Variables

Thêm các biến sau (từ `.env` của bạn):
```
NODE_ENV=production
JWT_SECRET=<your-strong-secret>
DATABASE_URL=<your-neon-db-url>
ACCESSTRADE_API_TOKEN=<your-token>
ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1
COMMISSION_SPLIT=0.7
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Bước 4: Deploy
```bash
vercel --prod
```

### Bước 5: Verify
- Test các endpoints chính
- Check CORS hoạt động
- Verify authentication flow
- Test database connection

---

## 🌐 DEPLOY TO HEROKU

### Bước 1: Install Heroku CLI
```bash
# macOS/Linux:
brew tap heroku/brew && brew install heroku

# Windows:
# Download from: https://devcenter.heroku.com/articles/heroku-cli
```

### Bước 2: Login và tạo app
```bash
heroku login
heroku create your-app-name
```

### Bước 3: Set Config Vars
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET="your-strong-secret"
heroku config:set DATABASE_URL="your-neon-db-url"
heroku config:set ACCESSTRADE_API_TOKEN="your-token"
heroku config:set ACCESSTRADE_API_URL="https://api.accesstrade.vn/v1"
heroku config:set COMMISSION_SPLIT=0.7
heroku config:set GOOGLE_CLIENT_ID="your-client-id"
heroku config:set GOOGLE_CLIENT_SECRET="your-secret"
heroku config:set GOOGLE_CALLBACK_URL="https://your-app.herokuapp.com/api/auth/google/callback"
heroku config:set ALLOWED_ORIGINS="https://your-app.herokuapp.com"
```

### Bước 4: Deploy
```bash
git push heroku main
```

### Bước 5: Open app
```bash
heroku open
```

---

## 🔒 POST-DEPLOYMENT SECURITY CHECKS

### 1. Test CORS Configuration
```bash
# Nên FAIL (blocked):
curl -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://yourdomain.com/api/auth/login

# Nên SUCCESS:
curl -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://yourdomain.com/api/auth/login
```

### 2. Test SSL Certificate
```bash
curl -v https://yourdomain.com
# Verify: SSL certificate valid
```

### 3. Test API Endpoints
```bash
# Health check
curl https://yourdomain.com/health

# Login endpoint
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 4. Check Environment Variables
```bash
# Vercel:
vercel env ls

# Heroku:
heroku config
```

### 5. Monitor Logs
```bash
# Vercel:
vercel logs

# Heroku:
heroku logs --tail
```

---

## 📊 MONITORING & ALERTING

### Setup Monitoring Tools:

1. **Uptime Monitoring**
   - UptimeRobot: https://uptimerobot.com
   - Pingdom: https://www.pingdom.com

2. **Error Tracking**
   - Sentry: https://sentry.io
   ```bash
   npm install @sentry/node
   ```

3. **Log Management**
   - Papertrail (Heroku addon)
   - Vercel Logs (built-in)

4. **Performance Monitoring**
   - New Relic
   - DataDog

---

## 🔄 ROLLBACK PROCEDURE

### Vercel
```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback
```

### Heroku
```bash
# View releases
heroku releases

# Rollback to version
heroku rollback v123
```

---

## 📝 MAINTENANCE TASKS

### Regular (Weekly):
- [ ] Check error logs
- [ ] Monitor uptime
- [ ] Review security alerts

### Monthly:
- [ ] Update dependencies
  ```bash
  npm audit
  npm update
  ```
- [ ] Review access logs
- [ ] Backup database

### Quarterly:
- [ ] Security audit
- [ ] Performance review
- [ ] Rotate credentials

---

## 🆘 EMERGENCY CONTACTS

- **Database Issues**: Neon Support (https://neon.tech/docs)
- **AccessTrade API**: support@accesstrade.vn
- **Hosting**: Vercel/Heroku Support

---

## 📚 USEFUL LINKS

- **Vercel Docs**: https://vercel.com/docs
- **Heroku Docs**: https://devcenter.heroku.com
- **Neon Docs**: https://neon.tech/docs
- **Security Best Practices**: https://cheatsheetseries.owasp.org

---

## ⚠️ IMPORTANT NOTES

1. **NEVER** expose `.env` file
2. **ALWAYS** use HTTPS in production
3. **REGULARLY** rotate secrets
4. **MONITOR** logs for suspicious activity
5. **BACKUP** database regularly
6. **TEST** thoroughly before deploying
7. **DOCUMENT** all changes

---

**Last Updated**: 2025-01-03
**Maintained By**: Development Team
