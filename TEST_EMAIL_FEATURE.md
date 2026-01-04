# Test Email Feature - Notification Templates

## 🎯 Tổng quan

Tính năng gửi test email cho phép admin kiểm tra nội dung và giao diện của email templates trước khi thực tế gửi cho users.

## ✨ Tính năng

### 1. **Inline Test Form**
- Không cần mở modal riêng
- Form xuất hiện ngay dưới template preview
- Chỉ cần check checkbox để bật/tắt

### 2. **Sample Data Tự động**
- Email test được gửi với sample data mẫu
- Không cần phải tự nhập variables
- Preview chính xác như email thực tế

### 3. **Real-time Feedback**
- Loading state khi đang gửi
- Success/error messages inline
- Toast notification

## 📋 Cách sử dụng

### Step 1: Chọn Template

Vào **Admin Panel** → **Email Notifications** → **Quản Lý Email Templates**

Chọn template muốn test:
- Instant Notification
- Periodic Reminder
- Urgent Reminder

### Step 2: Enable Test Form

✅ Check vào checkbox **"Test gửi email với template này"**

Form sẽ xuất hiện với:
- Input email nhận test
- Button "Gửi Test Email"

### Step 3: Nhập Email & Gửi

1. Nhập email của bạn vào ô "Email nhận test"
2. Click **"Gửi Test Email"**
3. Chờ vài giây (hiển thị "Đang gửi...")
4. Nhận thông báo thành công
5. Kiểm tra email trong hộp thư

### Step 4: Kiểm tra Email

Email test sẽ có:
- Subject đã được replace variables
- HTML content đã được render
- Sample data:
  - userName: "Nguyễn Văn A"
  - amount: "250,000đ"
  - totalAvailable: "1,500,000đ"
  - merchant: "Shopee"

## 🎨 UI/UX Flow

```
┌─────────────────────────────────────┐
│ Chọn Template: [Instant ▼]         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Subject Line:                       │
│ 🎉 Bạn có cashback mới từ Shopee!   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Email Content:                      │
│ [Preview HTML ở đây]                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ☐ Test gửi email với template này  │  ← Click checkbox
└─────────────────────────────────────┘

[Sau khi check:]

┌─────────────────────────────────────┐
│ ✓ Test gửi email với template này  │
│                                     │
│ Email nhận test *                   │
│ [test@example.com            ]      │
│                                     │
│ [📧 Gửi Test Email]                 │
│                                     │
│ ✅ Test email đã được gửi!          │  ← Success feedback
└─────────────────────────────────────┘
```

## 🔧 Technical Implementation

### Frontend

**File:** [frontend/admin/js/notification-settings.js](frontend/admin/js/notification-settings.js)

**Functions:**
```javascript
// Toggle form visibility
toggleTestEmailForm()

// Send test email
async sendTestEmailForTemplate()
```

**Event Listeners:**
```javascript
// Checkbox change
document.getElementById('enableTestEmail').addEventListener('change', toggleTestEmailForm);

// Button click
document.querySelector('[data-action="sendTestEmailForTemplate"]').addEventListener('click', sendTestEmailForTemplate);
```

**API Call:**
```javascript
const response = await fetch(`${API_BASE}/api/notifications/admin/test-template`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    templateType: 'instant', // from dropdown
    recipientEmail: 'test@example.com'
  })
});
```

### Backend

**File:** [backend/routes/notifications.js](backend/routes/notifications.js#L293-L398)

**Endpoint:** `POST /api/notifications/admin/test-template`

**Logic:**
```javascript
1. Validate input (templateType, recipientEmail)
2. Load template from SystemSettings
   - email_template_{type}_subject
   - email_template_{type}_content
3. Replace variables with sample data
4. Send email via EmailService.sendEmail()
5. Return success/error response
```

**Sample Data:**
```javascript
const sampleData = {
  userName: 'Nguyễn Văn A',
  amount: '250,000đ',
  totalAvailable: '1,500,000đ',
  merchant: 'Shopee',
  createRequestUrl: 'https://chatchiu.online/payment-requests',
  unsubscribeUrl: 'https://chatchiu.online/notifications/unsubscribe/test/{type}'
};
```

**Variable Replacement:**
```javascript
for (const [key, value] of Object.entries(sampleData)) {
  const regex = new RegExp(`{{${key}}}`, 'g');
  finalSubject = finalSubject.replace(regex, value);
  finalContent = finalContent.replace(regex, value);
}
```

## 📊 Data Flow

```
Admin clicks "Gửi Test Email"
  ↓
Frontend: sendTestEmailForTemplate()
  ↓
POST /api/notifications/admin/test-template
  {
    templateType: "instant",
    recipientEmail: "admin@example.com"
  }
  ↓
Backend: Load template from system_settings
  - email_template_instant_subject
  - email_template_instant_content
  ↓
Replace variables with sample data
  - {{userName}} → "Nguyễn Văn A"
  - {{amount}} → "250,000đ"
  - {{totalAvailable}} → "1,500,000đ"
  ↓
EmailService.sendEmail({
  to: "admin@example.com",
  subject: "🎉 Bạn có cashback mới từ Shopee!",
  html: "<div>...</div>"
})
  ↓
Resend API sends email
  ↓
Return success → Frontend shows ✅
```

## ✅ Validation

### Frontend Validation:
1. **Email required** - Hiển thị error nếu để trống
2. **Email format** - Validate regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

### Backend Validation:
1. **Template type** - Chỉ accept: 'instant', 'reminder', 'urgent'
2. **Email format** - Regex validation
3. **Template exists** - Check trong system_settings

## 🎨 UI States

### 1. **Unchecked** (Default)
```
☐ Test gửi email với template này
[Form hidden]
```

### 2. **Checked** (Form visible)
```
✓ Test gửi email với template này
[Form shown with input + button]
```

### 3. **Loading**
```
Button: 🔄 Đang gửi...
Status: 🔵 Đang gửi test email...
```

### 4. **Success**
```
Button: 📧 Gửi Test Email (restored)
Status: ✅ Test email đã được gửi đến email@example.com!
Toast: ✅ Đã Gửi!
```

### 5. **Error**
```
Button: 📧 Gửi Test Email (restored)
Status: ❌ Lỗi: Email không hợp lệ
Toast: ❌ Lỗi!
```

## 🧪 Testing Checklist

### Manual Testing:

- [ ] Check checkbox → Form hiển thị
- [ ] Uncheck checkbox → Form ẩn
- [ ] Nhập email invalid → Show error "Email không hợp lệ"
- [ ] Để trống email → Show error "Vui lòng nhập email nhận"
- [ ] Nhập email valid + gửi → Loading state
- [ ] Email gửi thành công → Success message
- [ ] Kiểm tra inbox → Email nhận được
- [ ] Email có đúng subject đã edit
- [ ] Email có đúng content đã edit
- [ ] Variables đã được replace ({{userName}} → "Nguyễn Văn A")
- [ ] Test với cả 3 templates (instant, reminder, urgent)

### Edge Cases:

- [ ] Template chưa có trong database → Show error "Template not found"
- [ ] Network error → Show error message
- [ ] Invalid auth token → Redirect to login
- [ ] Gửi 2 lần liên tiếp → Cả 2 đều thành công

## 🚀 Benefits

### For Admin:
1. ✅ **Preview trước khi go live** - Kiểm tra kỹ trước khi gửi cho users
2. ✅ **Test nhanh** - Không cần setup phức tạp
3. ✅ **Feedback tức thì** - Biết ngay email có gửi được không
4. ✅ **Tự edit & test** - Không cần dev support

### For Development:
1. ✅ **QA dễ dàng** - QA tự test email templates
2. ✅ **Debug nhanh** - Repro issues nhanh hơn
3. ✅ **No mock data** - Dùng real email service
4. ✅ **Production-like** - Test với actual email rendering

## 📝 Example Workflow

**Scenario:** Admin muốn update subject của Instant Notification

1. Vào Notification Settings
2. Chọn "Instant Notification - Email gửi ngay"
3. Click "Mở Editor Template"
4. Sửa subject: "🎉 Bạn có cashback mới từ {merchant}!"
5. Click "Lưu Thay Đổi"
6. ✅ Check "Test gửi email với template này"
7. Nhập email: admin@chatchiu.com
8. Click "Gửi Test Email"
9. ⏳ Chờ 2-3 giây
10. ✅ "Test email đã được gửi!"
11. Mở inbox → Kiểm tra email
12. ✅ Subject đã update như mong muốn

## 🔒 Security

### Authorization:
- ✅ Require admin authentication
- ✅ Check `authenticateAdmin` middleware
- ✅ Log admin ID khi gửi test email

### Rate Limiting:
- ⚠️ **TODO:** Add rate limit để tránh spam
- Suggest: Max 10 test emails / 5 minutes / admin

### Email Safety:
- ✅ Validate email format
- ✅ Use sample data (không expose user thật)
- ✅ Unsubscribe link là test link (không ảnh hưởng users)

## 📊 Logs

Backend logs khi gửi test email:

```javascript
logger.info('Test email sent successfully', {
  adminId: req.userId,
  templateType: 'instant',
  recipientEmail: 'admin@example.com'
});
```

Có thể query logs để:
- Track ai đang test email
- Debug issues
- Audit trail

## 🎯 Future Enhancements

1. **Preview Variables** - Cho phép admin tự nhập sample data
2. **Send to Multiple** - Gửi test đến nhiều emails cùng lúc
3. **Save Test Recipients** - Lưu emails thường dùng để test
4. **Email Client Preview** - Preview trên Gmail, Outlook, etc
5. **A/B Test** - Test 2 versions của template
6. **Analytics** - Track open rate, click rate của test emails

---

**Status:** ✅ Hoàn tất và sẵn sàng sử dụng
**Date:** 2026-01-04
**Author:** Claude Code 🤖
