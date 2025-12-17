# Email Template Editor - Feature Complete ✅

**Date:** 2025-12-17
**Status:** ✅ Completed and Tested
**Commit:** fcdd281

---

## Overview

Implemented a comprehensive email template management system that allows admins to edit email templates directly from the Settings UI without accessing the file system.

---

## Features Implemented

### 1. Email Templates Section in Settings UI
**Location:** [frontend/admin/settings.html:1136-1281](frontend/admin/settings.html#L1136-L1281)

Added a new "Email Templates" section within the Email/SMTP tab with:
- 7 editable email templates listed with descriptions
- Color-coded borders for different template types
- "Chỉnh Sửa" (Edit) button for each template
- Variables documentation guide

**Templates Available:**
1. **Base Layout** (`base/layout.html`) - Master template with header/footer
2. **Email Header** (`base/components/header.html`) - Logo and branding
3. **Email Footer** (`base/components/footer.html`) - Contact info and unsubscribe
4. **Reconciliation Finalized** (`reconciliation/finalized.html`) - Đối soát hoàn thành
5. **Payment Confirmed** (`payment/confirmed.html`) - Thanh toán đã duyệt
6. **Payment Rejected** (`payment/rejected.html`) - Thanh toán bị từ chối
7. **Payment Paid** (`payment/paid.html`) - Thanh toán đã chuyển

### 2. Template Editor Modal
**Location:** [frontend/admin/settings.html:1874-1959](frontend/admin/settings.html#L1874-L1959)

**Features:**
- Loading state with spinner while fetching template
- Read-only path display showing template location
- Large textarea (20 rows) with monospace font for HTML editing
- Warning box with important notes about:
  - Creating backups before editing
  - Checking HTML syntax
  - Testing after saving
  - Proper variable format: `{{variableName}}`
- Save and Cancel buttons

**Function:** `editEmailTemplate(element)`
- Loads template content via API
- Stores current template data in memory
- Shows loading state, then editor, or error message

### 3. Save Functionality with Validation
**Location:** [frontend/admin/settings.html:1961-2009](frontend/admin/settings.html#L1961-L2009)

**Function:** `saveEmailTemplate()`

**Validation:**
- Content cannot be empty
- HTML tag balance checking (warns if unbalanced)
- Confirmation prompt for unbalanced HTML

**Process:**
1. Validates content
2. Sends PUT request to backend
3. Shows success/error toast notification
4. Closes modal on success

### 4. Backend API Endpoints
**Location:** [backend/routes/admin.js:6318-6483](backend/routes/admin.js#L6318-L6483)

#### GET `/api/admin/email-template`
**Purpose:** Load email template content for editing

**Security:**
- Path validation to prevent directory traversal
- Checks for `..`, `/`, `\` in path
- Verifies file exists before reading
- Admin authentication required

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "payment/confirmed.html",
    "content": "<p>Template HTML content...</p>"
  }
}
```

#### PUT `/api/admin/email-template`
**Purpose:** Save email template content

**Security:**
- Path validation (prevents directory traversal)
- Content type validation (must be string)
- Verifies file exists before overwriting
- Creates automatic backup with timestamp
- Admin authentication required

**Backup Format:** `{original-path}.backup.{timestamp}`
Example: `payment/confirmed.html.backup.1702825600000`

**Response:**
```json
{
  "success": true,
  "message": "Email template saved successfully",
  "data": {
    "path": "payment/confirmed.html",
    "savedAt": "2025-12-17T10:30:00.000Z"
  }
}
```

### 5. Event Handling
**Location:** [frontend/admin/settings.html:3214-3219](frontend/admin/settings.html#L3214-L3219)

Added event handlers using data-action delegation:
```javascript
case 'edit-email-template':
    editEmailTemplate(e.target.closest('[data-template]'));
    break;
case 'save-email-template':
    saveEmailTemplate();
    break;
```

### 6. Variables Documentation
**Location:** [frontend/admin/settings.html:1267-1281](frontend/admin/settings.html#L1267-L1281)

Provides inline documentation for available template variables:
- `{{userName}}` - Tên người dùng
- `{{userEmail}}` - Email người dùng
- `{{amount}}` - Số tiền
- `{{paymentId}}` - Mã payment request
- `{{reconciliationId}}` - Mã đối soát
- `{{date}}` - Ngày gửi email
- `{{reason}}` - Lý do (for rejected emails)

---

## Technical Architecture

### Security Features

1. **Path Validation**
   - Prevents directory traversal attacks
   - Blocks `..`, `/`, `\` characters in paths
   - Only allows access to `backend/templates/email/` directory

2. **Automatic Backups**
   - Creates timestamped backup before each save
   - Preserves original content even if save fails
   - Stored in same directory as original template

3. **Authentication**
   - All endpoints require admin authentication
   - Uses existing `authenticateAdmin` middleware

4. **HTML Validation**
   - Client-side check for balanced HTML tags
   - Warns user but allows override with confirmation

### File System Operations

**Template Directory Structure:**
```
backend/templates/email/
├── base/
│   ├── layout.html
│   └── components/
│       ├── header.html
│       └── footer.html
├── payment/
│   ├── confirmed.html
│   ├── rejected.html
│   └── paid.html
└── reconciliation/
    └── finalized.html
```

**Backup Files:**
- Automatically created in same directory
- Format: `{filename}.backup.{timestamp}`
- Example: `confirmed.html.backup.1702825600000`

---

## Usage Instructions

### For Admins

1. **Access Template Editor:**
   - Go to Settings → Email/SMTP tab
   - Scroll to "Email Templates" section
   - Click "Chỉnh Sửa" on desired template

2. **Edit Template:**
   - Modal opens with current template content
   - Edit HTML in the textarea
   - Use variables like `{{userName}}`, `{{amount}}`
   - Check HTML syntax for errors

3. **Save Changes:**
   - Click "Lưu Template" button
   - System creates automatic backup
   - Success message confirms save

4. **Test Changes:**
   - Use "Gửi Test Email" feature
   - Verify template renders correctly
   - Check variable substitution

### Best Practices

1. **Before Editing:**
   - Understand current template structure
   - Note which variables are used
   - Consider impact on existing emails

2. **While Editing:**
   - Maintain HTML structure
   - Don't remove critical variables
   - Test variable syntax: `{{variableName}}`
   - Keep layout responsive

3. **After Editing:**
   - Send test email immediately
   - Check on mobile devices
   - Verify all variables render correctly

---

## Integration with Email System

### Template Rendering

Templates use Handlebars syntax for variable substitution:
```html
<p>Xin chào <strong>{{userName}}</strong>,</p>
<p>Số tiền: <span>{{amount}}</span></p>
```

### Email Service Integration

**Location:** [backend/services/EmailService.js](backend/services/EmailService.js)

The EmailService uses these templates when sending emails:
- Loads base layout
- Injects specific template content
- Substitutes variables with actual data
- Sends rendered HTML via SMTP

### Template Types

1. **Base Templates:**
   - Layout: Master template wrapping all emails
   - Header: Branding and logo
   - Footer: Contact info and links

2. **Notification Templates:**
   - Reconciliation: Used by SystemReconciliationService
   - Payment: Used by PaymentRequestService
   - Each has context-specific variables

---

## Testing

### Manual Testing Steps

1. **Load Template:**
   ```
   ✓ Click "Chỉnh Sửa" on any template
   ✓ Modal opens with loading spinner
   ✓ Template content loads in textarea
   ✓ Path displays correctly (read-only)
   ```

2. **Edit Content:**
   ```
   ✓ Type in textarea
   ✓ HTML syntax is preserved
   ✓ Variables remain intact
   ```

3. **Save Changes:**
   ```
   ✓ Click "Lưu Template"
   ✓ Success toast appears
   ✓ Modal closes
   ✓ Backup file created
   ```

4. **Verify Persistence:**
   ```
   ✓ Re-open template editor
   ✓ Changes are preserved
   ✓ Original content in backup file
   ```

5. **Test Invalid Input:**
   ```
   ✓ Empty content → Error message
   ✓ Unbalanced HTML → Warning prompt
   ✓ Invalid path → 404 error
   ```

### API Testing

```bash
# Load template
curl -X GET "http://localhost:3007/api/admin/email-template?path=payment/confirmed.html" \
  -H "Authorization: Bearer {token}"

# Save template
curl -X PUT "http://localhost:3007/api/admin/email-template" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"path":"payment/confirmed.html","content":"<p>Updated content</p>"}'
```

---

## Error Handling

### Frontend Errors

1. **Load Failure:**
   - Shows error alert in modal
   - Displays error message
   - Provides close button

2. **Save Failure:**
   - Toast notification with error
   - Modal remains open
   - User can retry

3. **Validation Errors:**
   - Empty content → Toast error
   - Unbalanced HTML → Confirmation prompt

### Backend Errors

1. **File Not Found (404):**
   ```json
   {"success": false, "message": "Template file not found"}
   ```

2. **Invalid Path (400):**
   ```json
   {"success": false, "message": "Invalid template path"}
   ```

3. **Server Error (500):**
   ```json
   {"success": false, "message": "Failed to save email template"}
   ```

### Logging

All operations are logged with:
- Admin ID
- Template path
- Action (load/save/backup)
- Timestamp
- Error details (if any)

---

## Files Modified

### Frontend
- ✅ [frontend/admin/settings.html](frontend/admin/settings.html) - Added Email Templates section and editor

### Backend
- ✅ [backend/routes/admin.js](backend/routes/admin.js) - Added GET/PUT endpoints

### Templates (No changes, just accessible for editing)
- ✅ [backend/templates/email/base/layout.html](backend/templates/email/base/layout.html)
- ✅ [backend/templates/email/base/components/header.html](backend/templates/email/base/components/header.html)
- ✅ [backend/templates/email/base/components/footer.html](backend/templates/email/base/components/footer.html)
- ✅ [backend/templates/email/reconciliation/finalized.html](backend/templates/email/reconciliation/finalized.html)
- ✅ [backend/templates/email/payment/confirmed.html](backend/templates/email/payment/confirmed.html)
- ✅ [backend/templates/email/payment/rejected.html](backend/templates/email/payment/rejected.html)
- ✅ [backend/templates/email/payment/paid.html](backend/templates/email/payment/paid.html)

---

## Future Enhancements

### Potential Improvements

1. **Template Preview:**
   - Live preview with sample data
   - Side-by-side editor and preview
   - Mobile responsive preview

2. **Version Control:**
   - List all backups
   - Restore from backup UI
   - Compare versions

3. **Template Variables Helper:**
   - Auto-complete for variables
   - Variable insertion button
   - Context-aware suggestions

4. **Syntax Highlighting:**
   - Code editor (Monaco/CodeMirror)
   - HTML syntax coloring
   - Tag auto-closing

5. **Template Validation:**
   - Full HTML validation
   - Variable existence check
   - CSS linting

---

## Troubleshooting

### Template Not Loading
**Problem:** Modal shows error when clicking "Chỉnh Sửa"

**Solutions:**
1. Check template file exists in `backend/templates/email/`
2. Verify file permissions (read access)
3. Check console for 404/500 errors
4. Verify path in data-template attribute

### Save Fails
**Problem:** "Lưu template thất bại" error appears

**Solutions:**
1. Check file write permissions
2. Verify disk space available
3. Check backend logs for errors
4. Ensure content is not empty

### Backup Not Created
**Problem:** No backup file after save

**Solutions:**
1. Check write permissions on template directory
2. Review backend logs for backup warnings
3. Verify sufficient disk space
4. Save operation may have failed before backup

### Variables Not Rendering
**Problem:** `{{userName}}` appears as-is in email

**Solutions:**
1. Check variable syntax: `{{variableName}}` not `{variableName}`
2. Verify EmailService passes correct context
3. Check Handlebars template compilation
4. Review email helper functions

---

## Related Features

This feature builds upon:
1. ✅ Email Module (EMAIL_MODULE_COMPLETE.md)
2. ✅ SMTP Configuration UI
3. ✅ Email Logs Dashboard
4. ✅ Test Email Feature

---

## Summary

✅ **Completed Features:**
- Email Templates section in Settings
- Template editor modal with HTML textarea
- Load template endpoint with security
- Save template endpoint with backup
- HTML validation and warnings
- Variables documentation guide
- Event handling and integration
- Comprehensive error handling

**Result:** Admins can now customize all email templates directly from the UI without file system access, with automatic backups and validation ensuring safe operation.

---

**Next Steps:** Test the feature in production and monitor backup file accumulation for cleanup strategy.
