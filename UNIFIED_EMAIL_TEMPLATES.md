# Unified Email Template System

## 🎯 Tổng quan

Đã hoàn thành migration TẤT CẢ email templates từ file-based system sang unified database-based system tại **Notification Settings**.

**Date:** 2026-01-04
**Status:** ✅ Production Ready

---

## 📊 Summary of Changes

### ✅ What Was Done

1. **Backend API** - Added 4 new template types to database system
2. **Frontend UI** - Updated dropdown và variables list để support all 7 templates
3. **Email Services** - Migrated PaymentEmailHelper & ReconciliationEmailHelper to load from SystemSettings
4. **Deprecation** - Hidden Settings → Email Templates tab with clear redirect notice

### 🗂️ Template Types (7 Total)

#### 📬 Cashback Notifications (3)
| Type | Template Key | When Sent |
|------|--------------|-----------|
| **Instant** | `email_template_instant_*` | Ngay khi conversion approved & user đủ điều kiện rút |
| **Reminder** | `email_template_reminder_*` | Định kỳ (7 ngày) nhắc nhở user có balance |
| **Urgent** | `email_template_urgent_*` | Trước deadline đối soát (48h) |

#### 💳 Payment Requests (3)
| Type | Template Key | When Sent |
|------|--------------|-----------|
| **Confirmed** | `email_template_payment_confirmed_*` | Khi admin approve payment request |
| **Rejected** | `email_template_payment_rejected_*` | Khi admin reject payment request |
| **Paid** | `email_template_payment_paid_*` | Khi admin mark payment as paid |

#### 📊 Reconciliation (1)
| Type | Template Key | When Sent |
|------|--------------|-----------|
| **Finalized** | `email_template_reconciliation_finalized_*` | Khi kỳ đối soát được finalize |

---

## 🏗️ Architecture

### Before (Dual System - Complex)

```
📁 File-based Templates               📊 Database Templates
├── backend/templates/email/          ├── system_settings table
│   ├── payment/confirmed.html        │   ├── email_template_instant_*
│   ├── payment/rejected.html         │   ├── email_template_reminder_*
│   ├── payment/paid.html             │   └── email_template_urgent_*
│   └── reconciliation/finalized.html │
│                                     │
├── Settings → Email Templates        ├── Notification Settings
└── EmailTemplateService (file I/O)   └── SystemSettings (database)
```

**Problems:**
- 2 separate UIs for managing templates
- Confusion about where to edit which template
- File-based requires filesystem access
- No test email feature for file-based
- Hard to version control database templates

### After (Unified System - Simple)

```
📊 Unified Database Templates
└── system_settings table
    ├── Cashback: instant, reminder, urgent
    ├── Payment: payment_confirmed, payment_rejected, payment_paid
    └── Reconciliation: reconciliation_finalized

📍 Single Management UI
└── Notification Settings
    ├── Template dropdown (7 types)
    ├── Dynamic variables list
    ├── Live preview
    ├── Edit & Save to database
    └── Test email with sample data
```

**Benefits:**
- ✅ ONE location for ALL templates
- ✅ Test email for ANY template
- ✅ Instant updates (no file deployment)
- ✅ Consistent variable system
- ✅ Dynamic preview with sample data

---

## 📝 Technical Implementation

### 1. Backend Changes

#### File: `backend/routes/notifications.js`

**Added Default Templates (Lines 512-748)**

```javascript
const defaultTemplates = {
  instant: { subject: '...', content: '...' },
  reminder: { subject: '...', content: '...' },
  urgent: { subject: '...', content: '...' },
  payment_confirmed: { subject: '...', content: '...' },
  payment_rejected: { subject: '...', content: '...' },
  payment_paid: { subject: '...', content: '...' },
  reconciliation_finalized: { subject: '...', content: '...' }
};
```

**Updated validTypes Arrays**

```javascript
const validTypes = [
  'instant', 'reminder', 'urgent',
  'payment_confirmed', 'payment_rejected', 'payment_paid',
  'reconciliation_finalized'
];
```

**Updated Test Template Endpoint (Lines 305-375)**

- Added conditional sample data based on template type
- Cashback templates: `userName, amount, totalAvailable, merchant`
- Payment templates: `paymentId, amount, bankAccount, approvedDate, paidDate, transactionId, reason`
- Reconciliation template: `reconciliationId, period, totalAmount, finalizedDate, totalOrders, totalPayments`

#### File: `backend/services/emailHelpers/paymentEmailHelper.js`

**Migration to SystemSettings**

```javascript
// OLD: File-based
const html = await EmailTemplateService.renderTemplate(
  emailConfig.TEMPLATES.PAYMENT_CONFIRMED, {...}
);

// NEW: Database-based
const subject = await SystemSettings.get('email_template_payment_confirmed_subject');
const htmlContent = await SystemSettings.get('email_template_payment_confirmed_content');

const variables = { userName, paymentId, amount, bankAccount, approvedDate };

// Replace {{variable}} in subject and content
for (const [key, value] of Object.entries(variables)) {
  const regex = new RegExp(`{{${key}}}`, 'g');
  finalSubject = finalSubject.replace(regex, value);
  finalContent = finalContent.replace(regex, value);
}
```

**Updated Functions:**
- ✅ `sendPaymentConfirmedEmail()` - Lines 21-75
- ✅ `sendPaymentRejectedEmail()` - Lines 83-137
- ✅ `sendPaymentPaidEmail()` - Lines 145-200

#### File: `backend/services/emailHelpers/reconciliationEmailHelper.js`

**Updated Function:**
- ✅ `sendReconciliationFinalizedEmails()` - Lines 53-94

---

### 2. Frontend Changes

#### File: `frontend/admin/notification-settings.html`

**Updated Template Dropdown (Lines 1199-1213)**

```html
<select id="templateSelect" class="form-select">
  <optgroup label="📬 Cashback Notifications">
    <option value="instant">🎉 Instant Notification</option>
    <option value="reminder">⏰ Periodic Reminder</option>
    <option value="urgent">🚨 Urgent Reminder</option>
  </optgroup>
  <optgroup label="💳 Payment Requests">
    <option value="payment_confirmed">✅ Payment Confirmed</option>
    <option value="payment_rejected">❌ Payment Rejected</option>
    <option value="payment_paid">💸 Payment Paid</option>
  </optgroup>
  <optgroup label="📊 Reconciliation">
    <option value="reconciliation_finalized">📊 Reconciliation Finalized</option>
  </optgroup>
</select>
```

#### File: `frontend/admin/js/notification-settings.js`

**New Functions:**

```javascript
// Get sample data based on template type
function getSampleDataForTemplate(templateType) {
  if (templateType === 'instant' || templateType === 'reminder' || templateType === 'urgent') {
    return { userName, amount, totalAvailable, merchant, ... };
  } else if (templateType.startsWith('payment_')) {
    return { paymentId, amount, bankAccount, approvedDate, ... };
  } else if (templateType === 'reconciliation_finalized') {
    return { reconciliationId, period, totalAmount, ... };
  }
}

// Get available variables for template type
function getVariablesForTemplate(templateType) {
  // Returns array of { code: '{{var}}', description: '...' }
}

// Update variables list display
function updateVariablesList(templateType) {
  const variables = getVariablesForTemplate(templateType);
  variablesList.innerHTML = variables.map(v => `
    <div class="variable-item">
      <code>${v.code}</code>
      <span>${v.description}</span>
    </div>
  `).join('');
}
```

**Updated Functions:**
- ✅ `loadTemplate()` - Now calls `updateVariablesList()` and uses dynamic sample data

#### File: `frontend/admin/settings.html`

**Deprecated Email Templates Tab:**
- Hidden tab button (Line 603-606)
- Added deprecation warning banner (Lines 1150-1175)
- Updated "Unified Email Templates" section (Lines 1307-1333)

---

## 🎨 Template Variables

### Cashback Templates

| Variable | Description | Example |
|----------|-------------|---------|
| `{{userName}}` | Tên người dùng | Nguyễn Văn A |
| `{{amount}}` | Số tiền cashback | 250,000₫ |
| `{{totalAvailable}}` | Tổng số dư khả dụng | 1,500,000₫ |
| `{{merchant}}` | Tên merchant | Shopee |
| `{{createRequestUrl}}` | Link tạo yêu cầu rút tiền | https://... |
| `{{unsubscribeUrl}}` | Link hủy đăng ký | https://... |

### Payment Templates

| Variable | Description | Example |
|----------|-------------|---------|
| `{{userName}}` | Tên người dùng | Nguyễn Văn A |
| `{{paymentId}}` | Mã yêu cầu thanh toán | PR-2026-001 |
| `{{amount}}` | Số tiền thanh toán | 1,500,000₫ |
| `{{bankAccount}}` | Thông tin tài khoản | ACB - 1234567890 |
| `{{approvedDate}}` | Ngày duyệt | 04/01/2026 |
| `{{paidDate}}` | Ngày chuyển tiền | 04/01/2026 |
| `{{transactionId}}` | Mã giao dịch | TXN-2026-ABC123 |
| `{{reason}}` | Lý do từ chối | Thông tin tài khoản không hợp lệ |

### Reconciliation Template

| Variable | Description | Example |
|----------|-------------|---------|
| `{{userName}}` | Tên người dùng | Nguyễn Văn A |
| `{{reconciliationId}}` | Mã đối soát | REC-2026-Q1 |
| `{{period}}` | Kỳ đối soát | Q1/2026 (01/01 - 31/03) |
| `{{totalAmount}}` | Tổng số tiền | 15,750,000₫ |
| `{{finalizedDate}}` | Ngày hoàn thành | 04/01/2026 |
| `{{totalOrders}}` | Tổng số đơn hàng | 127 |
| `{{totalPayments}}` | Tổng số thanh toán | 45 |

---

## 🧪 Testing Guide

### 1. Test Template Loading

```bash
# Navigate to Notification Settings
http://localhost:3000/admin/notification-settings

# Check all 7 templates load correctly
- Select each template from dropdown
- Verify subject and preview render correctly
- Check variables list updates dynamically
```

### 2. Test Template Editing

```bash
# For each template:
1. Click "Mở Editor Template"
2. Edit subject line
3. Edit HTML content
4. Click "Lưu Thay Đổi"
5. Verify success message
6. Reload page → Check changes persist
```

### 3. Test Email Sending

```bash
# For each template:
1. Select template from dropdown
2. Check "Test gửi email với template này"
3. Enter your email address
4. Click "Gửi Test Email"
5. Check inbox for email
6. Verify:
   - Subject matches edited subject
   - Variables replaced correctly
   - HTML renders properly
   - Sample data is appropriate for template type
```

### 4. Test Payment Emails (Real Flow)

```bash
# Setup:
1. Create a payment request as user
2. As admin, approve/reject/mark as paid
3. Check user receives correct email

# Expected emails:
- Approve → payment_confirmed email
- Reject → payment_rejected email
- Mark Paid → payment_paid email
```

### 5. Test Reconciliation Email

```bash
# Setup:
1. Create reconciliation period
2. Finalize reconciliation
3. Check users receive reconciliation_finalized email

# Verify:
- All users with balances receive email
- Variables populated correctly
- Period label matches
```

### 6. Test Deprecation Notice

```bash
# Navigate to Settings → Email Templates (if not hidden)
http://localhost:3000/admin/settings

# Verify:
- Tab is hidden in navigation
- If accessed directly, shows deprecation warning
- "Mở Notification Settings" link works
```

---

## 📋 Migration Checklist

### ✅ Phase 1: Database Templates
- [x] Add payment_confirmed template to defaultTemplates
- [x] Add payment_rejected template to defaultTemplates
- [x] Add payment_paid template to defaultTemplates
- [x] Add reconciliation_finalized template to defaultTemplates
- [x] Update validTypes array in PUT endpoint
- [x] Update validTypes array in test-template endpoint
- [x] Add conditional sample data for all template types

### ✅ Phase 2: Frontend UI
- [x] Update template dropdown with optgroups
- [x] Add payment & reconciliation options to dropdown
- [x] Create getSampleDataForTemplate() function
- [x] Create getVariablesForTemplate() function
- [x] Create updateVariablesList() function
- [x] Update loadTemplate() to use dynamic data

### ✅ Phase 3: Service Updates
- [x] Migrate paymentEmailHelper.js to SystemSettings
- [x] Update sendPaymentConfirmedEmail()
- [x] Update sendPaymentRejectedEmail()
- [x] Update sendPaymentPaidEmail()
- [x] Migrate reconciliationEmailHelper.js to SystemSettings
- [x] Update sendReconciliationFinalizedEmails()

### ✅ Phase 4: Deprecation
- [x] Hide Email Templates tab from navigation
- [x] Add deprecation warning to tab content
- [x] Update notification section to mention ALL templates
- [x] Add clear redirect to Notification Settings

### ✅ Phase 5: Testing & Documentation
- [x] Create UNIFIED_EMAIL_TEMPLATES.md
- [x] Document all 7 template types
- [x] Document all variables for each type
- [x] Create testing guide
- [x] Create migration checklist

---

## 🚀 Deployment Steps

### 1. Database Migration

The default templates will be created automatically on first GET request to `/api/notifications/admin/templates`. No manual SQL migration needed.

**Verification:**

```sql
-- Check templates exist in database
SELECT setting_key, LEFT(setting_value, 50) as preview
FROM system_settings
WHERE setting_key LIKE 'email_template_%'
ORDER BY setting_key;
```

Expected 14 rows (7 templates × 2 fields each):
```
email_template_instant_subject
email_template_instant_content
email_template_reminder_subject
email_template_reminder_content
email_template_urgent_subject
email_template_urgent_content
email_template_payment_confirmed_subject
email_template_payment_confirmed_content
email_template_payment_rejected_subject
email_template_payment_rejected_content
email_template_payment_paid_subject
email_template_payment_paid_content
email_template_reconciliation_finalized_subject
email_template_reconciliation_finalized_content
```

### 2. Frontend Deployment

```bash
# No build step needed - static HTML/JS
# Just deploy updated files:
- frontend/admin/notification-settings.html
- frontend/admin/js/notification-settings.js
- frontend/admin/settings.html
```

### 3. Backend Deployment

```bash
# Deploy updated files:
- backend/routes/notifications.js
- backend/services/emailHelpers/paymentEmailHelper.js
- backend/services/emailHelpers/reconciliationEmailHelper.js

# Restart backend server
npm run dev  # or pm2 restart
```

### 4. Post-Deployment Verification

```bash
# 1. Check templates load
curl -H "Authorization: Bearer $TOKEN" \
  https://chatchiu.online/api/notifications/admin/templates

# 2. Send test email
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateType": "payment_confirmed",
    "recipientEmail": "test@example.com"
  }' \
  https://chatchiu.online/api/notifications/admin/test-template

# 3. Check UI
https://chatchiu.online/admin/notification-settings
```

---

## 🔧 Troubleshooting

### Issue: Template not found in database

**Symptoms:** Error "Template not found in database" when sending email

**Solution:**
```javascript
// Templates are created on-demand with defaults
// To manually insert:
const SystemSettings = require('./services/systemSettings');
await SystemSettings.set('email_template_payment_confirmed_subject', 'Default subject');
await SystemSettings.set('email_template_payment_confirmed_content', '<div>Default content</div>');
```

### Issue: Variables not replaced

**Symptoms:** Email contains `{{userName}}` instead of actual name

**Solution:**
- Check variable key matches exactly (case-sensitive)
- Check variables object contains the key
- Check regex replacement loop runs correctly

```javascript
// Debug logging
console.log('Variables:', variables);
console.log('Content before:', htmlContent);
console.log('Content after:', finalContent);
```

### Issue: Old file-based templates still being used

**Symptoms:** Changes in Notification Settings don't affect sent emails

**Solution:**
- Check email helper is using SystemSettings.get(), not EmailTemplateService.renderTemplate()
- Check server restarted after code changes
- Check correct email helper function is being called

---

## 📊 Performance Considerations

### Caching

SystemSettings uses 30-second cache:
```javascript
// From systemSettings.js
const CACHE_TTL = 30 * 1000; // 30 seconds
```

**Impact:**
- Template changes visible within 30 seconds
- No database hit for repeated reads within 30s
- Good balance between freshness and performance

### Database Queries

Each email send requires:
- 2 queries to load subject + content (or 0 if cached)
- 1 query to send via EmailService

**Optimization:**
- Templates pre-loaded on server start
- Cached for 30 seconds
- No filesystem I/O

---

## 🎯 Future Enhancements

### Planned Features

1. **Template Versioning**
   - Track template edit history
   - Rollback to previous version
   - Compare versions side-by-side

2. **Multi-language Support**
   - `email_template_instant_subject_en`
   - `email_template_instant_subject_vi`
   - Auto-detect user language preference

3. **Template Analytics**
   - Track open rate per template
   - Track click-through rate
   - A/B testing support

4. **Advanced Variables**
   - Custom variables per template
   - Conditional blocks: `{{#if userName}}Hello {{userName}}{{/if}}`
   - Loops: `{{#each items}}...{{/each}}`

5. **Template Marketplace**
   - Pre-built templates
   - Import/export templates
   - Share templates between instances

---

## 📚 Related Documentation

- [TEST_EMAIL_FEATURE.md](./TEST_EMAIL_FEATURE.md) - Test email functionality
- [EMAIL_ARCHITECTURE.md](./EMAIL_ARCHITECTURE.md) - Architecture comparison
- [backend/routes/notifications.js](./backend/routes/notifications.js) - API endpoints
- [frontend/admin/notification-settings.html](./frontend/admin/notification-settings.html) - UI

---

## ✅ Success Metrics

**Before Migration:**
- 2 separate UIs for templates
- 3 cashback templates in database
- 4 payment/reconciliation templates in files
- No test email for file-based templates
- Confusion about where to edit

**After Migration:**
- ✅ 1 unified UI for ALL templates
- ✅ 7 templates in database
- ✅ 0 templates in files
- ✅ Test email for ALL templates
- ✅ Clear single source of truth

**Result:** 🎉 **UNIFIED EMAIL TEMPLATE SYSTEM COMPLETE!**

---

**Last Updated:** 2026-01-04
**Author:** Claude Code 🤖
**Status:** Production Ready ✅
