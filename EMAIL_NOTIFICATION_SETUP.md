# Email Notification Setup Guide - Payment Requests

**Date:** 2026-01-16
**Version:** 1.0
**Author:** Claude Code

---

## 📋 Tổng Quan

Đã thêm 2 email notification mới cho Payment Request module:

1. **Admin Notification** - Khi có yêu cầu thanh toán mới
2. **User Cancellation** - Khi user hủy yêu cầu thanh toán

---

## 🚀 Installation Steps

### Bước 1: Chạy Database Migration

```bash
cd f:\VSCODE\Chatchiu\backend

# Option A: Run SQL directly in PostgreSQL
psql -U your_user -d your_database -f migrations/add_payment_email_templates.sql

# Option B: Use pgAdmin
# Copy nội dung của migrations/add_payment_email_templates.sql vào Query Tool và Execute
```

### Bước 2: Cấu hình Admin Email

Sau khi chạy migration, update admin email trong database:

```sql
UPDATE system_settings
SET setting_value = 'your-admin-email@example.com'
WHERE setting_key = 'admin_notification_email';
```

**QUAN TRỌNG:** Thay `your-admin-email@example.com` bằng email admin thật!

### Bước 3: Verify Templates Đã Được Thêm

```sql
SELECT setting_key, LENGTH(setting_value) as content_length, description
FROM system_settings
WHERE setting_key LIKE 'email_template_payment%'
   OR setting_key = 'admin_notification_email'
ORDER BY setting_key;
```

**Expected Output:**
```
setting_key                                          | content_length | description
----------------------------------------------------|----------------|------------------
admin_notification_email                             | 25             | Email address to receive...
email_template_payment_cancelled_content             | 2500+          | Email content for user...
email_template_payment_cancelled_subject             | 50             | Email subject for user...
email_template_payment_request_created_admin_content | 3500+          | Email content for admin...
email_template_payment_request_created_admin_subject | 60             | Email subject for admin...
```

### Bước 4: Restart Backend

```bash
# Kill old processes
taskkill /IM node.exe /F

# Start backend
cd f:\VSCODE\Chatchiu
npm run dev
```

---

## ✅ Testing

### Test 1: Admin Notification (New Payment Request)

**Steps:**
1. Login as user: `testuser@test.com`
2. Navigate to: http://localhost:3007/payment-requests
3. Click "Tạo yêu cầu thanh toán"
4. Fill form:
   - Số tiền: 100,000 VND
   - Chọn tài khoản ngân hàng
5. Click "Tạo yêu cầu"

**Expected Result:**
- Payment request created successfully ✅
- Admin receives email with:
  - Subject: `[ChatChiu Admin] Yêu cầu rút tiền mới: 100.000₫`
  - User info, request details, statistics
  - Action buttons to admin panel

**Backend Logs to Check:**
```
[INFO] Payment request created successfully
[INFO] Admin notification email sent successfully
```

**If Email Doesn't Arrive:**
- Check `admin_notification_email` setting in database
- Check SMTP configuration in system_settings or `.env`
- Check `email_logs` table for errors:
  ```sql
  SELECT * FROM email_logs
  WHERE email_type = 'payment_request_created_admin'
  ORDER BY created_at DESC LIMIT 10;
  ```

---

### Test 2: User Cancellation Confirmation

**Steps:**
1. Login as user
2. Navigate to payment requests list
3. Find a **PENDING** request
4. Click "Hủy"
5. Confirm cancellation

**Expected Result:**
- Payment request cancelled ✅
- Balance returned to user ✅
- User receives email with:
  - Subject: `[ChatChiu] Yêu cầu rút tiền đã hủy: 100.000₫`
  - Cancellation details
  - Updated balance info
  - Action buttons (create new request, view history)

**Backend Logs to Check:**
```
[SUCCESS] Payment request cancelled successfully
[INFO] Cancellation confirmation email sent successfully
```

**If Email Doesn't Arrive:**
- Check user has valid email in `users` table
- Check `email_logs` table:
  ```sql
  SELECT * FROM email_logs
  WHERE email_type = 'payment_cancelled'
  ORDER BY created_at DESC LIMIT 10;
  ```

---

## 📧 Email Configuration

### SMTP Settings

Email system loads SMTP config from 2 sources (priority order):

1. **Database** (system_settings table) - HIGHEST PRIORITY
2. **Environment Variables** (.env file) - Fallback

### Option A: Configure via Database

```sql
-- SMTP Host
INSERT INTO system_settings (setting_key, setting_value, category)
VALUES ('smtp_host', 'smtp.gmail.com', 'email')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- SMTP Port
INSERT INTO system_settings (setting_key, setting_value, category)
VALUES ('smtp_port', '587', 'email')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- SMTP User
INSERT INTO system_settings (setting_key, setting_value, category)
VALUES ('smtp_user', 'your-email@gmail.com', 'email')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- SMTP Password (App Password for Gmail)
INSERT INTO system_settings (setting_key, setting_value, category)
VALUES ('smtp_password', 'your-app-password', 'email')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- SMTP From
INSERT INTO system_settings (setting_key, setting_value, category)
VALUES ('smtp_from', 'ChatChiu <noreply@chatchiu.com>', 'email')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
```

### Option B: Configure via .env

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=ChatChiu <noreply@chatchiu.com>
```

### Gmail Setup

If using Gmail:
1. Enable 2-Factor Authentication
2. Create App Password: https://myaccount.google.com/apppasswords
3. Use app password (not your regular password)

---

## 🔍 Troubleshooting

### Problem 1: Email Not Sending

**Check logs:**
```sql
SELECT
  email_type,
  status,
  recipient,
  error_message,
  created_at
FROM email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

**Common causes:**
- ❌ Invalid SMTP credentials
- ❌ Firewall blocking port 587/465
- ❌ Gmail blocking "less secure apps"
- ❌ Missing admin_notification_email setting

---

### Problem 2: Template Variables Not Replaced

**Symptoms:**
Email contains `{{userName}}` instead of actual name

**Cause:**
Template not loaded from database correctly

**Fix:**
```sql
-- Check if templates exist
SELECT setting_key FROM system_settings
WHERE setting_key LIKE 'email_template%';

-- If missing, re-run migration
\i migrations/add_payment_email_templates.sql
```

---

### Problem 3: Admin Email Not Set

**Error in logs:**
```
Admin notification email not configured in system settings
```

**Fix:**
```sql
UPDATE system_settings
SET setting_value = 'admin@yourcompany.com'
WHERE setting_key = 'admin_notification_email';
```

---

## 📊 Monitoring

### Check Email Statistics

```sql
-- Email sent today
SELECT
  email_type,
  status,
  COUNT(*) as count
FROM email_logs
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY email_type, status
ORDER BY email_type, status;

-- Failed emails
SELECT *
FROM email_logs
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Email delivery rate
SELECT
  email_type,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / NULLIF(COUNT(*), 0), 2) as success_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY email_type;
```

---

## 📝 Files Modified

### New Files Created:
- `backend/templates/email/payment/new-request-admin.html` - Admin notification template
- `backend/templates/email/payment/cancelled.html` - User cancellation template
- `backend/migrations/add_payment_email_templates.sql` - Database migration
- `EMAIL_NOTIFICATION_SETUP.md` - This documentation

### Modified Files:
- `backend/config/email.js` - Added new email types and admin URLs
- `backend/services/emailHelpers/paymentEmailHelper.js` - Added 2 new functions
- `backend/services/paymentRequestService.js` - Integrated email sending

---

## 🎯 Summary

✅ **What's Working:**
- Email sent when payment request is created (to admin)
- Email sent when payment request is cancelled (to user)
- Email sent when payment request is confirmed (to user) - EXISTING
- Email sent when payment request is rejected (to user) - EXISTING
- Email sent when payment request is paid (to user) - EXISTING

❌ **Not Implemented:**
- Email reminders for pending requests
- Email digest (daily summary to admin)
- User email preferences (opt-out)

---

## 📞 Support

If you encounter issues:
1. Check backend logs for errors
2. Check `email_logs` table in database
3. Verify SMTP configuration
4. Test SMTP connection manually

For questions, contact: support@chatchiu.com
