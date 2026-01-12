# Email Template Management System

## 📧 Tổng quan

Hệ thống quản lý email templates tập trung cho notification emails, cho phép admin điều chỉnh nội dung email mà không cần thay đổi code.

## 🏗️ Kiến trúc

### 1. Storage - SystemSettings

Email templates được lưu trong bảng `system_settings` với format:

```sql
setting_key: email_template_{type}_subject
setting_value: "🎉 Bạn có cashback mới!"
setting_type: string

setting_key: email_template_{type}_content
setting_value: "<div>...</div>"
setting_type: string
```

**Template types:**
- `instant` - Email thông báo cashback mới
- `reminder` - Email nhắc nhở định kỳ
- `urgent` - Email khẩn trước deadline

### 2. Backend API

**Endpoint:** `/api/notifications/admin/templates`

#### GET - Load tất cả templates
```javascript
GET /api/notifications/admin/templates

Response:
{
  "success": true,
  "data": {
    "instant": {
      "subject": "...",
      "content": "..."
    },
    "reminder": {
      "subject": "...",
      "content": "..."
    },
    "urgent": {
      "subject": "...",
      "content": "..."
    }
  }
}
```

#### PUT - Update một template
```javascript
PUT /api/notifications/admin/templates/:type

Body:
{
  "subject": "New subject line",
  "content": "<div>New HTML content</div>"
}

Response:
{
  "success": true,
  "message": "Template đã được lưu thành công",
  "data": {
    "type": "instant",
    "subject": "...",
    "content": "..."
  }
}
```

**Files:**
- [backend/routes/notifications.js](backend/routes/notifications.js#L509-L662)
  - Line 509-604: GET /admin/templates
  - Line 606-662: PUT /admin/templates/:type

### 3. Frontend UI

**Trang:** `/admin/notification-settings`

#### Features:
1. **Template Selector** - Dropdown chọn template type
2. **Preview** - Hiển thị template với sample data
3. **Editor Modal** - Chỉnh sửa subject và content
4. **Save** - Lưu vào database qua API

#### Workflow:
```
Page Load
  → loadTemplatesFromServer() - Fetch từ API
  → EMAIL_TEMPLATES = {...} - Store in memory

User clicks "Mở Editor Template"
  → openTemplateEditor() - Populate modal

User edits & clicks "Lưu Thay Đổi"
  → saveTemplateChanges() - PUT to API
  → Update EMAIL_TEMPLATES - Sync memory
  → loadTemplate() - Refresh preview
```

**Files:**
- [frontend/admin/notification-settings.html](frontend/admin/notification-settings.html#L1184-L1268)
- [frontend/admin/js/notification-settings.js](frontend/admin/js/notification-settings.js#L820-L1125)
  - Line 833-856: loadTemplatesFromServer()
  - Line 1061-1125: saveTemplateChanges()

## 🎨 Template Variables

Templates sử dụng cú pháp `{{variableName}}`:

| Variable | Mô tả | Example |
|----------|-------|---------|
| `{{userName}}` | Tên người dùng | "Nguyễn Văn A" |
| `{{amount}}` | Số tiền cashback mới | "250,000đ" |
| `{{totalAvailable}}` | Tổng số dư khả dụng | "1,500,000đ" |
| `{{merchant}}` | Tên merchant | "Shopee" |
| `{{unsubscribeUrl}}` | Link hủy đăng ký | "https://..." |

## 📝 Default Templates

### Instant Notification
```html
Subject: 🎉 Bạn có cashback mới từ {merchant}!

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #667eea;">Chúc mừng {{userName}}! 🎉</h2>
  <p>Bạn vừa nhận được <strong style="color: #10b981; font-size: 20px;">{{amount}}</strong> cashback!</p>
  ...
</div>
```

### Periodic Reminder
```html
Subject: ⏰ Nhắc nhở: Bạn có {{totalAvailable}} cashback chờ rút!

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #f59e0b;">Xin chào {{userName}}! ⏰</h2>
  ...
</div>
```

### Urgent Reminder
```html
Subject: 🚨 KHẨN: Deadline đối soát sắp hết! Rút tiền ngay!

<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fee2e2; padding: 16px; border-left: 4px solid #ef4444;">
    <h2 style="color: #991b1b;">⚠️ THÔNG BÁO KHẨN!</h2>
  </div>
  ...
</div>
```

## 🔄 Migration Flow

### Trước đây (Hardcoded):
```
Frontend: EMAIL_TEMPLATES object (JavaScript)
Backend: Hardcoded subject & template name in CashbackNotificationService
```
❌ **Problem:** Reload trang → Templates reset về default

### Bây giờ (Database):
```
Admin edits template
  ↓
Frontend sends PUT to /api/notifications/admin/templates/:type
  ↓
Backend saves to system_settings table
  ↓
Page reload → Load từ database via GET API
```
✅ **Solution:** Templates persist across reloads

## 🧪 Testing

### 1. Test Save/Load
```bash
# 1. Open notification settings
http://localhost:3000/admin/notification-settings

# 2. Select a template (e.g., "Instant")
# 3. Click "Mở Editor Template"
# 4. Edit subject/content
# 5. Click "Lưu Thay Đổi"
# 6. Refresh page
# 7. Verify changes are still there ✅
```

### 2. Test API Directly
```bash
# Get all templates
curl -X GET http://localhost:3000/api/notifications/admin/templates \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update instant template
curl -X PUT http://localhost:3000/api/notifications/admin/templates/instant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test Subject",
    "content": "<div>Test Content</div>"
  }'
```

### 3. Test Send Email
```bash
# Send test email with template
curl -X POST http://localhost:3000/api/notifications/admin/test-template \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateType": "instant",
    "recipientEmail": "test@example.com"
  }'
```

## 🔧 Troubleshooting

### Template không lưu được
**Symptoms:** Click "Lưu Thay Đổi" nhưng reload lại reset về cũ

**Check:**
1. Console browser có error API call không?
2. Network tab - Response có `success: true` không?
3. Database - Check `system_settings` table có rows với key `email_template_*` không?

```sql
SELECT * FROM system_settings
WHERE setting_key LIKE 'email_template_%';
```

### Template load sai
**Symptoms:** UI hiển thị template khác với database

**Fix:**
1. Hard refresh browser (Ctrl + Shift + R)
2. Check cache - `SystemSettings.clearCache()`
3. Verify API response matches database

### Email gửi vẫn dùng template cũ
**Symptoms:** Đã update template nhưng email gửi ra vẫn dùng nội dung cũ

**Reason:** CashbackNotificationService chưa được update để load từ SystemSettings

**TODO:** Cần update service để load template từ database (future enhancement)

## 📊 Database Schema

```sql
-- System settings table structure
CREATE TABLE system_settings (
  setting_key VARCHAR(255) PRIMARY KEY,
  setting_value TEXT,
  setting_type VARCHAR(50),
  category VARCHAR(100),
  description TEXT,
  is_editable BOOLEAN DEFAULT TRUE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template entries
INSERT INTO system_settings (setting_key, setting_value, setting_type, category)
VALUES
  ('email_template_instant_subject', '🎉 Bạn có cashback mới!', 'string', 'notifications'),
  ('email_template_instant_content', '<div>...</div>', 'string', 'notifications'),
  ('email_template_reminder_subject', '⏰ Nhắc nhở...', 'string', 'notifications'),
  ('email_template_reminder_content', '<div>...</div>', 'string', 'notifications'),
  ('email_template_urgent_subject', '🚨 KHẨN...', 'string', 'notifications'),
  ('email_template_urgent_content', '<div>...</div>', 'string', 'notifications');
```

## 🎯 Future Enhancements

1. **Rich Text Editor** - WYSIWYG editor thay vì plain textarea
2. **Template Versioning** - Track history of changes
3. **A/B Testing** - Test multiple versions
4. **Variable Autocomplete** - Suggest available variables
5. **Email Preview with Real Data** - Preview với user data thực tế
6. **Template Import/Export** - Backup và restore templates

## ✅ Checklist for Deployment

- [x] API endpoints created (`GET /admin/templates`, `PUT /admin/templates/:type`)
- [x] Frontend load templates from API on page load
- [x] Frontend save templates via API
- [x] Templates persist in database (system_settings table)
- [x] Default templates defined in backend
- [ ] Update CashbackNotificationService to use templates from database
- [ ] Test email sending with custom templates
- [ ] Document for other developers
- [ ] Production deployment

## 📝 Notes

- Templates được lưu dạng plain HTML, không có sanitization → **Admin only!**
- Variables được replace server-side khi gửi email
- Fallback to default nếu không tìm thấy template trong database
- Cache 30 seconds cho SystemSettings để tránh query nhiều

---

**Status:** ✅ Core functionality complete, ready for testing
**Date:** 2026-01-04
**Author:** Claude Code 🤖
