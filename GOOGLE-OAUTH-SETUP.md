# 🔐 Hướng dẫn thiết lập Google OAuth

## 📋 Các bước thiết lập

### Bước 1: Tạo Google Cloud Project

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Đăng nhập bằng tài khoản Google của bạn
3. Click **"Select a project"** > **"New Project"**
4. Nhập tên project: `MMO Cashback` (hoặc tên bạn muốn)
5. Click **"Create"**

### Bước 2: Enable Google+ API

1. Trong Google Cloud Console, vào **"APIs & Services"** > **"Library"**
2. Tìm kiếm **"Google+ API"** hoặc **"Google People API"**
3. Click vào API và nhấn **"Enable"**

### Bước 3: Tạo OAuth 2.0 Credentials

1. Vào **"APIs & Services"** > **"Credentials"**
2. Click **"Create Credentials"** > **"OAuth client ID"**
3. Nếu chưa có OAuth consent screen, click **"Configure consent screen"**:
   - Chọn **"External"** (cho testing) hoặc **"Internal"** (nếu có Google Workspace)
   - Click **"Create"**
   - Điền thông tin:
     - **App name**: MMO Cashback
     - **User support email**: Email của bạn
     - **Developer contact information**: Email của bạn
   - Click **"Save and Continue"**
   - **Scopes**: Bỏ qua, click **"Save and Continue"**
   - **Test users**: Thêm email của bạn để test
   - Click **"Save and Continue"**

4. Quay lại **"Credentials"** > **"Create Credentials"** > **"OAuth client ID"**
5. Chọn **Application type**: **"Web application"**
6. Nhập thông tin:
   - **Name**: MMO Cashback Web Client
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:3000/api/auth/google/callback
     ```
7. Click **"Create"**

### Bước 4: Copy Credentials

Sau khi tạo xong, bạn sẽ thấy popup hiển thị:
- **Client ID**: Có dạng `xxxxxx.apps.googleusercontent.com`
- **Client Secret**: Chuỗi ký tự ngẫu nhiên

**LƯU Ý**: Copy cả 2 giá trị này ngay!

### Bước 5: Cập nhật file .env

Mở file `.env` và cập nhật các giá trị:

```env
# ==========================================
# GOOGLE OAUTH - REQUIRED FOR GOOGLE LOGIN
# ==========================================
GOOGLE_CLIENT_ID=123456789-abcdefghijk.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

**Thay thế**:
- `GOOGLE_CLIENT_ID`: Paste Client ID vừa copy
- `GOOGLE_CLIENT_SECRET`: Paste Client Secret vừa copy

### Bước 6: Restart Server

```bash
npm start
```

### Bước 7: Test Google Login

1. Truy cập: http://localhost:3000/login
2. Click nút **"Đăng nhập bằng Google"**
3. Chọn tài khoản Google
4. Cho phép ứng dụng truy cập thông tin cơ bản (email, tên)
5. Bạn sẽ được redirect về dashboard

## 🎯 Flow hoạt động

```
User click "Đăng nhập Google"
    ↓
Redirect → /api/auth/google
    ↓
Google Login Page
    ↓
User chọn account & cho phép
    ↓
Redirect → /api/auth/google/callback
    ↓
Backend tạo/update user trong database
    ↓
Generate JWT token
    ↓
Redirect → /login?token=xxx&google_login=success
    ↓
Frontend lưu token & redirect → /dashboard
```

## 🔧 Troubleshooting

### Lỗi: "OAuth2Strategy requires a clientID option"

**Nguyên nhân**: Chưa có `GOOGLE_CLIENT_ID` trong `.env`

**Giải pháp**:
1. Kiểm tra file `.env` có đúng không
2. Đảm bảo đã restart server sau khi sửa `.env`

### Lỗi: "Redirect URI mismatch"

**Nguyên nhân**: URL callback không khớp với cấu hình trong Google Cloud Console

**Giải pháp**:
1. Vào Google Cloud Console > Credentials
2. Edit OAuth client ID
3. Kiểm tra **Authorized redirect URIs** có đúng:
   ```
   http://localhost:3000/api/auth/google/callback
   ```

### Lỗi: "Access blocked: This app's request is invalid"

**Nguyên nhân**: Chưa configure OAuth consent screen

**Giải pháp**: Làm theo Bước 3 phía trên để configure consent screen

### Lỗi: "User not found" sau khi login Google

**Nguyên nhân**: Lỗi tạo user trong database

**Giải pháp**:
1. Kiểm tra database connection
2. Check logs trong terminal
3. Verify bảng `users` có column `google_id`

## 📊 Production Setup

Khi deploy lên production (VD: Vercel, Heroku, AWS):

1. **Update Authorized Origins**:
   ```
   https://your-domain.com
   ```

2. **Update Redirect URIs**:
   ```
   https://your-domain.com/api/auth/google/callback
   ```

3. **Update .env**:
   ```env
   GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
   ```

4. **OAuth Consent Screen**:
   - Chuyển từ "Testing" sang "In Production"
   - Hoặc publish app để mọi người có thể login

## 📝 Thông tin User sau khi Login Google

Backend tự động lấy từ Google:
- ✅ Email
- ✅ Full Name (Display Name)
- ✅ Google ID (unique identifier)
- ✅ Profile Picture URL (optional)

Thông tin được lưu vào database:
- `email`: Email từ Google
- `full_name`: Tên hiển thị
- `username`: Tự động generate từ email (phần trước @)
- `google_id`: Google ID để liên kết account
- `password_hash`: NULL (không cần password cho Google login)

## 🔐 Security Notes

1. **Client Secret**:
   - KHÔNG commit vào Git
   - Chỉ lưu trong `.env`
   - Production nên dùng environment variables trên hosting

2. **Scope minimal**:
   - Chỉ yêu cầu `profile` và `email`
   - Không yêu cầu quyền truy cập Google Drive, Gmail, etc.

3. **Consent Screen**:
   - Testing mode: Chỉ test users được thêm mới login được
   - Production: Mọi người đều login được

## ✅ Checklist

- [ ] Tạo Google Cloud Project
- [ ] Enable Google+ API hoặc People API
- [ ] Tạo OAuth 2.0 Client ID
- [ ] Configure OAuth consent screen
- [ ] Copy Client ID & Client Secret
- [ ] Update `.env` file
- [ ] Restart server
- [ ] Test login bằng Google
- [ ] Verify user được tạo trong database

---

**🎉 Xong! Bạn đã thiết lập Google OAuth thành công!**

Truy cập http://localhost:3000/login và thử đăng nhập bằng Google.
