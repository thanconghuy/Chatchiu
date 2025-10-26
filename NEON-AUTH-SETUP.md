# Hướng dẫn cấu hình Neon Auth

Tài liệu này hướng dẫn cấu hình **Neon Auth** (Stack Auth) cho hệ thống Cashback - đây là giải pháp authentication được tích hợp sẵn từ Neon.

## Tính năng đã triển khai

### 1. Neon Auth (Stack Auth) Integration ✅
- Sử dụng Neon Auth (powered by Stack Auth) cho authentication
- Tự động đồng bộ user data với Neon PostgreSQL
- Hỗ trợ JWT verification và REST API verification
- Google OAuth được tích hợp sẵn trong Neon Auth
- Password Reset được quản lý bởi Neon Auth

### 2. Backend Integration ✅
- Middleware xác thực JWT tokens từ Neon Auth
- API endpoints để sync user data
- Backward compatibility với hệ thống cũ

### 3. Frontend Integration ✅
- Vanilla JavaScript implementation với ES6 modules
- CDN-based Stack Auth integration
- UI components cho Sign In / Sign Up
- Auto-redirect sau khi đăng nhập thành công

## Cấu hình Neon Auth

### Bước 1: Enable Neon Auth trong Neon Console

1. Truy cập [Neon Console](https://console.neon.tech)
2. Chọn project của bạn (hoặc tạo project mới tại [pg.new](https://pg.new))
3. Vào tab **Auth** trong project dashboard
4. Click **Enable Neon Auth**
5. Làm theo hướng dẫn onboarding

### Bước 2: Lấy Auth Credentials

Sau khi enable Neon Auth, vào tab **Configuration** để lấy credentials:

```
Project ID: proj_xxx...
Publishable Client Key: pk_xxx...
Secret Server Key: sk_xxx...
```

### Bước 3: Cấu hình Environment Variables

Cập nhật file `.env` với credentials từ Neon Console:

```env
# Neon Auth Configuration
NEON_AUTH_PROJECT_ID=proj_your_project_id
STACK_PROJECT_ID=proj_your_project_id
NEON_AUTH_PUBLISHABLE_KEY=pk_your_publishable_key
STACK_PUBLISHABLE_CLIENT_KEY=pk_your_publishable_key
NEON_AUTH_SECRET_KEY=sk_your_secret_key
STACK_SECRET_SERVER_KEY=sk_your_secret_key

# Database URL (already configured)
DATABASE_URL=postgresql://neondb_owner:npg_xxx@ep-xxx.aws.neon.tech/neondb?sslmode=require
```

### Bước 4: Cấu hình Frontend

Cập nhật file `frontend/js/config.js`:

```javascript
const NEON_AUTH_CONFIG = {
    projectId: 'proj_your_project_id',
    publishableKey: 'pk_your_publishable_key',
};
```

## Cấu hình Google OAuth trong Neon Auth

Neon Auth đã tích hợp sẵn Google OAuth, bạn chỉ cần:

### Bước 1: Enable Google OAuth trong Neon Console

1. Trong Neon Console, vào project > **Auth** > **Authentication methods**
2. Enable **Google** sign-in
3. Neon Auth sẽ tự động xử lý OAuth flow

### Bước 2: (Optional) Custom Google OAuth

Nếu muốn sử dụng Google OAuth credentials riêng:

1. Tạo OAuth 2.0 Client ID tại [Google Cloud Console](https://console.cloud.google.com/)
2. Thêm Authorized redirect URIs:
   ```
   https://api.stack-auth.com/api/v1/auth/oauth/callback/google
   ```
3. Cập nhật trong Neon Auth settings với Client ID và Secret của bạn

## Cấu hình Password Reset

Password Reset được quản lý tự động bởi Neon Auth:

### Cấu hình Email Provider

1. Trong Neon Console > Auth > **Email settings**
2. Chọn email provider:
   - **Built-in** (default): Neon Auth gửi email tự động
   - **Custom SMTP**: Sử dụng SMTP server của bạn
   - **SendGrid / Mailgun**: Tích hợp với email service

### Nếu sử dụng Custom SMTP

Cập nhật trong Neon Console hoặc qua API:

```javascript
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_user": "your-email@gmail.com",
  "smtp_password": "your-app-password"
}
```

## Cấu trúc Project

### Backend Files

```
backend/
├── middleware/
│   ├── auth.js              # Old JWT auth (kept for compatibility)
│   └── neonAuth.js          # New Neon Auth middleware ✨
├── routes/
│   ├── auth.js              # Old auth routes (kept for compatibility)
│   └── neonAuthRoutes.js    # New Neon Auth routes ✨
└── config/
    └── passport.js          # Google OAuth (old, not needed with Neon Auth)
```

### Frontend Files

```
frontend/
├── login.html               # Old login page (custom auth)
├── login-neon.html          # New Neon Auth login page ✨
├── forgot-password.html     # Old forgot password (custom)
├── reset-password.html      # Old reset password (custom)
└── js/
    ├── auth.js              # Old auth functions
    ├── neonAuth.js          # New Neon Auth helpers ✨
    └── config.js            # Configuration (updated with Neon Auth)
```

### Database Schema

```sql
-- Users table with Neon Auth support
ALTER TABLE users ADD COLUMN neon_auth_id VARCHAR(255) UNIQUE;
CREATE INDEX idx_users_neon_auth_id ON users(neon_auth_id);
```

Migration đã được chạy tự động.

## API Endpoints

### Neon Auth Endpoints

```
POST /api/neon-auth/sync-user
- Sync user from Neon Auth to local database
- Headers: x-stack-access-token
- Auto-called after login

GET /api/neon-auth/me
- Get current user info
- Headers: x-stack-access-token

POST /api/neon-auth/update-profile
- Update user profile (phone, fullName)
- Headers: x-stack-access-token
- Body: { phone, fullName }
```

### Old Auth Endpoints (Backward Compatible)

```
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET /api/auth/google
GET /api/auth/google/callback
```

## Sử dụng Neon Auth

### Cách 1: Login Page mới (Khuyến nghị)

Truy cập: `http://localhost:3000/login-neon`

Page này sử dụng Neon Auth UI components và tự động xử lý:
- Email/Password login
- Google OAuth login
- Sign up
- Password reset
- Email verification

### Cách 2: Tích hợp vào page hiện có

Thêm vào HTML:

```html
<script src="js/config.js"></script>
<script src="js/neonAuth.js"></script>
<script type="module">
import { StackClientApp } from 'https://esm.sh/@stackframe/stack@latest';

const stackApp = new StackClientApp({
    projectId: window.NEON_AUTH_CONFIG.projectId,
    publishableClientKey: window.NEON_AUTH_CONFIG.publishableKey,
    tokenStore: 'cookie'
});

// Check if logged in
const user = await stackApp.getUser();
if (user) {
    console.log('User logged in:', user);
} else {
    console.log('User not logged in');
}
</script>
```

### JavaScript Functions

```javascript
// Check if logged in
if (isNeonAuthLoggedIn()) {
    console.log('User is logged in');
}

// Get current user
const user = await getNeonAuthUser();

// Logout
await logoutNeonAuth();

// Update profile
await updateNeonAuthProfile({
    phone: '+84123456789',
    fullName: 'Nguyen Van A'
});

// Make authenticated API request
const data = await neonAuthApiRequest('/dashboard/stats');
```

## Testing

### Test Neon Auth Login

1. Đảm bảo server đang chạy: `npm start`
2. Truy cập `http://localhost:3000/login-neon`
3. Test các scenarios:
   - ✅ Sign up với email/password
   - ✅ Sign in với email/password
   - ✅ Sign in với Google
   - ✅ Forgot password
   - ✅ Email verification

### Test Backend API

```bash
# Get user info (cần access token)
curl -X GET http://localhost:3000/api/neon-auth/me \
  -H "x-stack-access-token: YOUR_ACCESS_TOKEN"

# Update profile
curl -X POST http://localhost:3000/api/neon-auth/update-profile \
  -H "Content-Type: application/json" \
  -H "x-stack-access-token: YOUR_ACCESS_TOKEN" \
  -d '{"phone": "+84123456789"}'
```

## Migration từ Custom Auth sang Neon Auth

### Option 1: Chạy song song (Khuyến nghị)

- Giữ cả 2 hệ thống auth (old + Neon Auth)
- User cũ: tiếp tục dùng `/login`
- User mới: sử dụng `/login-neon`
- Dần dần migrate users qua Neon Auth

### Option 2: Migration toàn bộ

1. Export tất cả users hiện tại
2. Sử dụng Neon Auth API để create users:
   ```javascript
   const response = await fetch('https://api.stack-auth.com/api/v1/users', {
       method: 'POST',
       headers: {
           'x-stack-project-id': projectId,
           'x-stack-secret-server-key': secretKey,
           'x-stack-access-type': 'server'
       },
       body: JSON.stringify({
           primary_email: user.email,
           display_name: user.fullName,
           password: 'temporary-password' // Users sẽ reset password
       })
   });
   ```
3. Update `neon_auth_id` trong database
4. Gửi email cho users để reset password
5. Redirect `/login` → `/login-neon`

## Production Deployment

### 1. Update Environment Variables

Trong production (Vercel, Railway, etc.):

```env
NEON_AUTH_PROJECT_ID=proj_production_id
STACK_PROJECT_ID=proj_production_id
NEON_AUTH_PUBLISHABLE_KEY=pk_production_key
STACK_PUBLISHABLE_CLIENT_KEY=pk_production_key
NEON_AUTH_SECRET_KEY=sk_production_secret
STACK_SECRET_SERVER_KEY=sk_production_secret
DATABASE_URL=postgresql://...
```

### 2. Update Frontend Config

Trong `config.js`, sử dụng environment-based config:

```javascript
const NEON_AUTH_CONFIG = {
    projectId: window.location.hostname === 'localhost'
        ? 'proj_dev_id'
        : 'proj_prod_id',
    publishableKey: window.location.hostname === 'localhost'
        ? 'pk_dev_key'
        : 'pk_prod_key'
};
```

### 3. Configure Allowed Origins

Trong Neon Console > Auth > **Security**:

- Thêm production domain vào **Allowed Origins**
- Thêm production domain vào **Redirect URLs**

## Troubleshooting

### Neon Auth không load

1. Kiểm tra `NEON_AUTH_CONFIG` trong `config.js`
2. Kiểm tra Console log cho errors
3. Verify rằng project ID và publishable key đúng
4. Kiểm tra CORS settings trong Neon Console

### JWT Verification failed

1. Kiểm tra `STACK_PROJECT_ID` trong `.env`
2. Verify token format: `x-stack-access-token` header
3. Check token expiration
4. Verify JWKS endpoint accessible

### User sync failed

1. Check database connection
2. Verify `neon_auth_id` column exists
3. Check API endpoint `/api/neon-auth/sync-user`
4. Review backend logs

### Google OAuth không hoạt động

1. Enable Google trong Neon Console
2. Check redirect URLs configuration
3. Verify Google OAuth settings trong Neon Auth

## So sánh: Custom Auth vs Neon Auth

| Feature | Custom Auth (Old) | Neon Auth (New) |
|---------|------------------|-----------------|
| Setup time | ~4 hours | ~15 minutes |
| Email/Password | ✅ Custom | ✅ Built-in |
| Google OAuth | ✅ Manual setup | ✅ Pre-configured |
| Password Reset | ✅ Custom SMTP | ✅ Managed |
| Email Verification | ❌ Not implemented | ✅ Built-in |
| 2FA/MFA | ❌ Not available | ✅ Available |
| Session Management | ❌ Basic JWT | ✅ Advanced |
| User Management UI | ❌ No | ✅ Admin Dashboard |
| Teams/Roles | ❌ No | ✅ Built-in |
| Maintenance | High | Low |

## Lợi ích của Neon Auth

✅ **Nhanh hơn**: Setup trong vài phút thay vì vài giờ
✅ **An toàn hơn**: Security best practices được implement sẵn
✅ **Ít bug hơn**: Tested bởi thousands of developers
✅ **Nhiều tính năng hơn**: 2FA, email verification, teams, roles
✅ **Dễ maintain hơn**: Ít code phải maintain
✅ **Auto sync**: User data tự động sync với Neon PostgreSQL

## Support & Resources

- **Neon Auth Docs**: https://neon.com/docs/neon-auth
- **Stack Auth Docs**: https://docs.stack-auth.com
- **API Reference**: https://api-docs.neon.tech
- **Community**: https://discord.gg/neon
- **GitHub Issues**: Create issue nếu gặp vấn đề

## Next Steps

Sau khi setup Neon Auth:

- [ ] Test đầy đủ authentication flow
- [ ] Enable email verification
- [ ] Setup 2FA cho admin accounts
- [ ] Configure custom email templates
- [ ] Setup webhook cho auth events
- [ ] Implement team/organization features
- [ ] Migrate existing users (nếu có)
- [ ] Update production environment
- [ ] Monitor authentication metrics trong Neon Console

---

**Lưu ý**: Neon Auth hiện đang ở beta. Mọi feedback và bug reports đều được welcome tại Neon's GitHub hoặc Discord!
