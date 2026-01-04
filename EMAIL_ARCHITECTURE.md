# Email Template Architecture

## 📧 Tổng quan Kiến trúc Email

Hệ thống Chatchiu sử dụng 2 loại email templates với mục đích khác nhau:

### 1. **File-based Templates** (Quản lý tại Settings → Email Templates)

**Mục đích:** Templates phức tạp, có layout, components
**Storage:** Files trong `backend/templates/email/`
**API:** `/api/admin/email-template`
**UI:** `/admin/settings` → Tab "Email Templates"

#### Templates:

| Template | Path | Mục đích |
|----------|------|----------|
| **Layout Chính** | `base/layout.html` | Master template chứa structure chung |
| **Header** | `base/components/header.html` | Header component (logo, branding) |
| **Footer** | `base/components/footer.html` | Footer component (links, copyright) |
| **Đối Soát Hoàn Thành** | `reconciliation/finalized.html` | Email thông báo kỳ đối soát đã hoàn thành |
| **Thanh Toán Đã Duyệt** | `payment/confirmed.html` | Email xác nhận payment request được duyệt |
| **Thanh Toán Bị Từ Chối** | `payment/rejected.html` | Email thông báo payment request bị từ chối |
| **Thanh Toán Đã Chuyển** | `payment/paid.html` | Email xác nhận đã chuyển tiền |

**Đặc điểm:**
- ✅ Có layout wrapper (header + content + footer)
- ✅ Support components
- ✅ HTML phức tạp, nhiều styling
- ✅ Chỉnh sửa qua file editor (textarea)
- ✅ Lưu vào filesystem

**Flow:**
```
Admin edits in Settings → Email Templates tab
  ↓
PUT /api/admin/email-template
  ↓
Save to backend/templates/email/{path}
  ↓
EmailTemplateService loads and renders
  ↓
Email sent with full layout
```

---

### 2. **Database-based Templates** (Quản lý tại Notification Settings)

**Mục đích:** Notification emails đơn giản, dễ thay đổi
**Storage:** `system_settings` table
**API:** `/api/notifications/admin/templates`
**UI:** `/admin/notification-settings` → Section "Quản Lý Email Templates"

#### Templates:

| Type | Subject | Khi nào gửi? |
|------|---------|--------------|
| **instant** | 🎉 Bạn có cashback mới từ {merchant}! | Ngay khi conversion approved & đủ điều kiện rút |
| **reminder** | ⏰ Nhắc nhở: Bạn có {{totalAvailable}} cashback chờ rút! | Định kỳ (7 ngày) nhắc nhở user có balance |
| **urgent** | 🚨 KHẨN: Deadline đối soát sắp hết! Rút tiền ngay! | Trước deadline đối soát (48h) |

**Đặc điểm:**
- ✅ Standalone HTML (không dùng layout)
- ✅ Inline styles
- ✅ Subject + Content đều có thể edit
- ✅ Chỉnh sửa qua modal editor
- ✅ Lưu vào database (persist across reloads)

**Flow:**
```
Admin edits in Notification Settings
  ↓
PUT /api/notifications/admin/templates/:type
  ↓
Save to system_settings table
  ↓
CashbackNotificationService loads from DB
  ↓
Email sent (standalone)
```

---

## 🏗️ Kiến trúc Chi tiết

### File-based Templates Structure

```
backend/
└── templates/
    └── email/
        ├── base/
        │   ├── layout.html           # Master wrapper
        │   └── components/
        │       ├── header.html        # Logo, branding
        │       └── footer.html        # Links, copyright
        ├── reconciliation/
        │   └── finalized.html         # Đối soát complete
        └── payment/
            ├── confirmed.html         # Payment approved
            ├── rejected.html          # Payment rejected
            └── paid.html              # Money transferred
```

**Rendering process:**
```javascript
// EmailTemplateService.renderTemplate()
1. Load template file (e.g., payment/confirmed.html)
2. Load layout.html
3. Load header.html & footer.html
4. Replace variables in all parts
5. Wrap content in layout
6. Return final HTML
```

### Database-based Templates Structure

```sql
-- system_settings table
setting_key                          | setting_value
-------------------------------------|------------------
email_template_instant_subject       | '🎉 Bạn có cashback...'
email_template_instant_content       | '<div>...</div>'
email_template_reminder_subject      | '⏰ Nhắc nhở...'
email_template_reminder_content      | '<div>...</div>'
email_template_urgent_subject        | '🚨 KHẨN...'
email_template_urgent_content        | '<div>...</div>'
```

**Rendering process:**
```javascript
// CashbackNotificationService
1. Load template from SystemSettings
2. Replace variables in content
3. Send email directly (no layout wrapping)
```

---

## 🔄 Khi nào dùng loại nào?

### Dùng File-based khi:
- Email phức tạp, cần layout chung
- Nhiều components tái sử dụng
- Không thay đổi thường xuyên
- Cần version control (Git)

**Ví dụ:**
- Email đối soát (có bảng data phức tạp)
- Email payment (có status, amount, bank info)

### Dùng Database-based khi:
- Email đơn giản, standalone
- Cần thay đổi nội dung thường xuyên
- Admin muốn tự chỉnh sửa không cần dev
- A/B testing subject lines

**Ví dụ:**
- Notification cashback (simple alert)
- Marketing emails (frequent updates)

---

## 📝 Template Variables

### Common Variables (cả 2 loại):
```javascript
{
  userName: "Nguyễn Văn A",
  userEmail: "user@example.com",
  amount: "1,500,000₫",
  date: "15/11/2025"
}
```

### File-based specific:
```javascript
{
  paymentId: "PR-2025-001",
  reconciliationId: "REC-2025-Q1",
  reason: "Thiếu thông tin ngân hàng",
  bankAccount: "****1234"
}
```

### Database-based specific:
```javascript
{
  merchant: "Shopee",
  totalAvailable: "1,500,000₫",
  unsubscribeUrl: "https://..."
}
```

---

## 🔧 API Endpoints

### File-based Templates

#### GET - Load template content
```http
GET /api/admin/email-template?path=payment/confirmed.html

Response:
{
  "success": true,
  "data": {
    "path": "payment/confirmed.html",
    "content": "<div>...</div>"
  }
}
```

#### PUT - Save template
```http
PUT /api/admin/email-template
Content-Type: application/json

{
  "path": "payment/confirmed.html",
  "content": "<div>Updated content</div>"
}

Response:
{
  "success": true,
  "message": "Template saved successfully"
}
```

### Database-based Templates

#### GET - Load all templates
```http
GET /api/notifications/admin/templates

Response:
{
  "success": true,
  "data": {
    "instant": {
      "subject": "...",
      "content": "..."
    },
    "reminder": {...},
    "urgent": {...}
  }
}
```

#### PUT - Update template
```http
PUT /api/notifications/admin/templates/instant
Content-Type: application/json

{
  "subject": "New subject",
  "content": "<div>New content</div>"
}

Response:
{
  "success": true,
  "message": "Template đã được lưu thành công"
}
```

---

## 🚀 Best Practices

### File-based Templates:
1. ✅ **Backup before edit** - Copy file trước khi sửa
2. ✅ **Test in staging** - Test trên môi trường dev trước
3. ✅ **Use variables** - Dùng {{variable}} thay vì hardcode
4. ✅ **Keep layout simple** - Header/footer đơn giản, dễ maintain
5. ✅ **Git commit** - Commit changes để có version history

### Database-based Templates:
1. ✅ **Preview before save** - Xem preview với sample data
2. ✅ **Test send** - Gửi test email sau khi save
3. ✅ **Inline styles** - Dùng inline CSS, không external
4. ✅ **Mobile responsive** - Test trên mobile
5. ✅ **Unsubscribe link** - Luôn có {{unsubscribeUrl}}

---

## 🔗 Cross-reference

### Settings → Email Templates
Có link đến Notification Settings:
```html
<a href="/admin/notification-settings">
  Mở Notification Settings
</a>
```

### Notification Settings
Section "Quản Lý Email Templates" với 3 templates:
- Instant Notification
- Periodic Reminder
- Urgent Reminder

---

## 📊 Comparison Table

| Feature | File-based | Database-based |
|---------|-----------|----------------|
| **Storage** | Filesystem | PostgreSQL |
| **Edit UI** | Textarea modal | Rich editor modal |
| **Layout** | Yes (wrapper) | No (standalone) |
| **Components** | Yes | No |
| **Version Control** | Git | Database history |
| **Admin Friendly** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Developer Friendly** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Performance** | Cached in memory | Cached 30s |
| **Rollback** | Git revert | Manual restore |

---

## 🎯 Migration Guide

### Chuyển từ File → Database:
```javascript
// 1. Get content from file
const fs = require('fs').promises;
const content = await fs.readFile('templates/email/cashback-instant.html', 'utf-8');

// 2. Save to database
await SystemSettings.set('email_template_instant_content', content);
```

### Chuyển từ Database → File:
```javascript
// 1. Get from database
const content = await SystemSettings.get('email_template_instant_content');

// 2. Save to file
const fs = require('fs').promises;
await fs.writeFile('templates/email/cashback-instant.html', content);
```

---

## ✅ Summary

- **File-based** = Complex templates với layout (Payment, Reconciliation)
- **Database-based** = Simple notifications (Instant, Reminder, Urgent)
- Both support variables with `{{variableName}}` syntax
- Admin có thể edit cả 2 loại qua UI
- File-based trong Settings, Database-based trong Notification Settings

**Principle:** Sử dụng đúng tool cho đúng việc!

---

**Last Updated:** 2026-01-04
**Author:** Claude Code 🤖
