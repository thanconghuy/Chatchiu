# 📧 SMTP Configuration Guide

## Tại Sao Cần SMTP?

Chức năng **Password Reset** cần gửi email cho users. Để gửi email, bạn cần cấu hình SMTP (Simple Mail Transfer Protocol).

## ⚠️ Lỗi Hiện Tại

Nếu bạn thấy lỗi:
```
Email service is not configured. Please contact administrator.
```

**Nguyên nhân**: File `.env` chưa có SMTP credentials.

---

## 🚀 Quick Setup - Gmail (Khuyến Nghị)

### Bước 1: Enable 2-Factor Authentication

1. Truy cập: https://myaccount.google.com/security
2. Tìm mục **"2-Step Verification"**
3. Bật 2-Step Verification (nếu chưa bật)

### Bước 2: Tạo App Password

1. Truy cập: https://myaccount.google.com/apppasswords
2. Chọn app: **"Mail"**
3. Chọn device: **"Other (Custom name)"** → Nhập: "ChatChiu Cashback"
4. Click **"Generate"**
5. **Copy password** (16 ký tự, không có khoảng trắng)

### Bước 3: Cập Nhật `.env`

Thêm vào file `.env` (không phải `.env.example`):

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_FROM=ChatChiu Cashback <noreply@chatchiu.com>
FRONTEND_URL=http://localhost:3007
```

**Thay thế**:
- `your-email@gmail.com` → Email Gmail của bạn
- `abcd efgh ijkl mnop` → App Password vừa tạo (giữ nguyên khoảng trắng hoặc xóa hết)

### Bước 4: Restart Server

```bash
# Stop server (Ctrl+C nếu đang chạy)
# Start lại
npm start
```

### Bước 5: Test

1. Truy cập: http://localhost:3007/forgot-password
2. Nhập email của bạn
3. Check inbox → Sẽ nhận được email đẹp với link reset password

---

## 🔧 Alternative SMTP Providers

### Option 1: SendGrid (Free 100 emails/day)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

**Setup**:
1. Đăng ký: https://sendgrid.com/
2. Create API Key: Settings → API Keys
3. Copy API key

### Option 2: Mailgun (Free 5,000 emails/month)

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASS=your-mailgun-password
```

**Setup**:
1. Đăng ký: https://www.mailgun.com/
2. Get credentials: Domains → SMTP credentials

### Option 3: Amazon SES (Free 62,000 emails/month if hosted on AWS)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
```

**Setup**:
1. AWS Console → SES
2. Create SMTP credentials

---

## 🔒 Security Best Practices

### ✅ DO:
- ✅ Sử dụng App Password, **KHÔNG** dùng password Gmail chính
- ✅ Giữ `.env` trong `.gitignore`
- ✅ Không commit SMTP credentials lên Git
- ✅ Rotate credentials định kỳ
- ✅ Sử dụng dedicated email account cho production

### ❌ DON'T:
- ❌ Không share SMTP credentials
- ❌ Không dùng personal email cho production
- ❌ Không hardcode credentials trong code

---

## 🧪 Testing SMTP Configuration

### Test 1: Manual Test Script

Tạo file `test-email.js`:

```javascript
const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  // Verify connection
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful!');
  } catch (error) {
    console.error('❌ SMTP connection failed:', error.message);
    return;
  }

  // Send test email
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SMTP_USER, // Send to yourself
      subject: 'Test Email - ChatChiu',
      html: '<h1>✅ SMTP Works!</h1><p>Email configuration is correct.</p>'
    });
    console.log('✅ Test email sent successfully!');
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
  }
}

testEmail();
```

Chạy test:
```bash
node test-email.js
```

### Test 2: Via API

```bash
curl -X POST http://localhost:3007/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com"}'
```

---

## 🐛 Troubleshooting

### Lỗi: "Invalid login"

**Nguyên nhân**: Sai username/password hoặc chưa enable App Password

**Giải pháp**:
1. Kiểm tra lại email và App Password
2. Đảm bảo đã bật 2-Step Verification
3. Tạo lại App Password mới

### Lỗi: "Connection timeout"

**Nguyên nhân**: Port bị block hoặc sai SMTP_HOST

**Giải pháp**:
1. Thử port 465 (secure) thay vì 587
2. Check firewall settings
3. Verify SMTP_HOST đúng

### Lỗi: "self signed certificate"

**Nguyên nhân**: SSL certificate issue

**Giải pháp**:
```javascript
// Thêm vào transporter config (CHỈ dùng cho development)
tls: {
  rejectUnauthorized: false
}
```

### Email không đến inbox

**Kiểm tra**:
1. ✅ Check Spam folder
2. ✅ Check server logs có lỗi không
3. ✅ Verify SMTP_FROM email format đúng
4. ✅ Check email quota (Gmail: 500 emails/day)

---

## 📊 SMTP Limits

| Provider | Free Tier | Limit |
|----------|-----------|-------|
| Gmail | Free | 500 emails/day |
| SendGrid | Free | 100 emails/day |
| Mailgun | Free | 5,000 emails/month |
| Amazon SES | Free (AWS hosted) | 62,000 emails/month |

---

## 🎯 Production Recommendations

### For Small Projects (<1000 users):
→ **Gmail** với App Password (miễn phí, dễ setup)

### For Medium Projects (1000-10000 users):
→ **SendGrid** hoặc **Mailgun** (free tier đủ dùng)

### For Large Projects (>10000 users):
→ **Amazon SES** (rẻ nhất, $0.10 per 1000 emails)

---

## 💡 Tips

1. **Use dedicated email**: Tạo email riêng cho app (vd: `noreply@yourdomain.com`)
2. **Monitor usage**: Track số lượng email gửi để không vượt quota
3. **Implement queue**: Dùng queue system (Bull, BullMQ) cho email khối lượng lớn
4. **Add retry logic**: Retry khi email fail
5. **Log everything**: Log email sent/failed cho debugging

---

## 🔗 Useful Links

- Gmail App Passwords: https://myaccount.google.com/apppasswords
- SendGrid: https://sendgrid.com/
- Mailgun: https://www.mailgun.com/
- Amazon SES: https://aws.amazon.com/ses/
- Nodemailer Docs: https://nodemailer.com/

---

## ✅ Checklist

- [ ] Enable 2-Step Verification (Gmail)
- [ ] Create App Password
- [ ] Add SMTP config to `.env`
- [ ] Test với `test-email.js`
- [ ] Test forgot-password flow
- [ ] Check email đã đến inbox
- [ ] Verify email template hiển thị đẹp
- [ ] Test reset password link hoạt động

---

**Need help?** Create an issue on GitHub or check server logs for detailed error messages.
