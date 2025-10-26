# Hướng dẫn cấu hình Authentication

Tài liệu này hướng dẫn cấu hình các tính năng authentication mới cho hệ thống Cashback.

## Tính năng đã được triển khai

### 1. Đăng nhập với Neon Auth
- Sử dụng Neon PostgreSQL làm database chính
- Package `@neondatabase/serverless` đã được cài đặt
- Authentication sử dụng JWT tokens

### 2. Đăng nhập bằng Google OAuth
- Cho phép người dùng đăng nhập nhanh chóng bằng tài khoản Google
- Tự động tạo tài khoản nếu chưa tồn tại
- Liên kết với tài khoản hiện có nếu email đã tồn tại

### 3. Quên mật khẩu
- Gửi email với link reset password
- Token có thời hạn 1 giờ
- Cho phép người dùng đặt lại mật khẩu an toàn

## Cấu hình Google OAuth

### Bước 1: Tạo Google OAuth Credentials

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo một project mới hoặc chọn project hiện có
3. Vào **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Chọn **Web application**
6. Điền thông tin:
   - **Name**: Cashback System
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (development)
     - `https://your-domain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/google/callback` (development)
     - `https://your-domain.com/api/auth/google/callback` (production)
7. Click **Create** và lưu lại **Client ID** và **Client Secret**

### Bước 2: Cập nhật file `.env`

Mở file `.env` và cập nhật các giá trị sau:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Frontend URL (cho production, thay đổi thành domain thực)
FRONTEND_URL=http://localhost:3000
```

## Cấu hình Email cho Password Reset

### Bước 1: Chuẩn bị Gmail App Password

1. Đăng nhập vào tài khoản Gmail của bạn
2. Vào [Google Account Security](https://myaccount.google.com/security)
3. Bật **2-Step Verification** nếu chưa bật
4. Sau khi bật 2FA, vào lại Security và tìm **App passwords**
5. Tạo một App password mới cho "Mail"
6. Copy password được tạo (16 ký tự)

### Bước 2: Cập nhật SMTP Settings trong `.env`

```env
# SMTP Configuration for Password Reset
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=noreply@cashback.com
```

### Nếu sử dụng email service khác

**SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

**Mailgun:**
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
```

## Cấu trúc Database

Migration đã được chạy tự động để thêm các trường mới:

```sql
-- Thêm vào bảng users
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP;
```

## Các trang mới

### 1. Login Page (`/login`)
- Form đăng nhập thông thường (email/username + password)
- Nút "Đăng nhập bằng Google"
- Link đến trang quên mật khẩu
- Link đến trang đăng ký

### 2. Forgot Password Page (`/forgot-password`)
- Form nhập email
- Gửi email với link reset password

### 3. Reset Password Page (`/reset-password`)
- Nhập mật khẩu mới
- Xác nhận mật khẩu
- Xác thực token từ email

## API Endpoints

### Google OAuth
```
GET /api/auth/google
GET /api/auth/google/callback
```

### Password Reset
```
POST /api/auth/forgot-password
Body: { "email": "user@example.com" }

POST /api/auth/reset-password
Body: {
  "token": "reset-token-from-email",
  "password": "new-password"
}
```

## Testing

### Test Google OAuth (Development)
1. Đảm bảo server đang chạy: `npm start`
2. Truy cập `http://localhost:3000/login`
3. Click nút "Đăng nhập bằng Google"
4. Chọn tài khoản Google
5. Sau khi authenticate, sẽ được redirect về dashboard

### Test Password Reset
1. Truy cập `http://localhost:3000/forgot-password`
2. Nhập email của tài khoản test
3. Kiểm tra email inbox
4. Click link trong email
5. Nhập mật khẩu mới
6. Đăng nhập với mật khẩu mới

## Production Deployment

### 1. Update Environment Variables

Khi deploy lên production (Vercel, Railway, etc.), cập nhật các biến môi trường:

```env
GOOGLE_CLIENT_ID=your-production-client-id
GOOGLE_CLIENT_SECRET=your-production-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
FRONTEND_URL=https://your-domain.com
```

### 2. Update Google OAuth Settings

Thêm production URLs vào Google Cloud Console:
- Authorized JavaScript origins: `https://your-domain.com`
- Authorized redirect URIs: `https://your-domain.com/api/auth/google/callback`

### 3. SSL/HTTPS

Đảm bảo site chạy trên HTTPS khi production để:
- Google OAuth hoạt động đúng
- Bảo mật thông tin người dùng
- Email links an toàn

## Troubleshooting

### Google OAuth không hoạt động

1. Kiểm tra `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` trong `.env`
2. Đảm bảo callback URL khớp với cấu hình trong Google Cloud Console
3. Kiểm tra CORS settings
4. Xem logs trong console để biết lỗi cụ thể

### Email không được gửi

1. Kiểm tra SMTP credentials
2. Với Gmail, đảm bảo đã tạo App Password (không dùng mật khẩu thường)
3. Kiểm tra 2FA đã được bật
4. Kiểm tra logs để xem lỗi SMTP

### Reset password link không hoạt động

1. Kiểm tra token có trong URL không
2. Token có thể đã hết hạn (1 giờ)
3. Yêu cầu reset password mới

## Security Best Practices

1. **JWT Secret**: Thay đổi `JWT_SECRET` thành giá trị random mạnh
2. **HTTPS**: Luôn sử dụng HTTPS trên production
3. **Environment Variables**: Không commit file `.env` vào git
4. **Rate Limiting**: Consider thêm rate limiting cho forgot password endpoint
5. **Email Validation**: Validate email format trước khi gửi

## Next Steps

Các tính năng có thể bổ sung:

- [ ] Two-Factor Authentication (2FA)
- [ ] Email verification sau đăng ký
- [ ] Social login khác (Facebook, GitHub)
- [ ] Session management và logout từ tất cả devices
- [ ] Password strength meter
- [ ] Account lockout sau nhiều lần đăng nhập sai

## Support

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra logs trong console
2. Xem file này để đảm bảo đã cấu hình đúng
3. Tạo issue trong repository
