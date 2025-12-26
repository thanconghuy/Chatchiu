# Phase 2: Cashback Notification Automation 🤖

## Overview

Phase 2 adds automated periodic reminders with **admin-configurable frequency and schedule**. Admins can set:
- How often to send reminders (X days between reminders)
- What time of day to send reminders (HH:MM format)
- Enable/disable instant notifications and reminders

## ✅ What Was Implemented

### 1. Database Configuration (Migration 032)

**Settings Added to `system_settings` table:**

| Setting Key | Default Value | Description |
|------------|---------------|-------------|
| `cashback_reminder_enabled` | `true` | Bật/tắt tính năng gửi email nhắc nhở cashback tự động |
| `cashback_reminder_frequency_days` | `7` | Số ngày giữa các lần gửi email nhắc nhở cashback |
| `cashback_reminder_time` | `10:00` | Thời gian trong ngày gửi email (HH:MM, Asia/Ho_Chi_Minh) |
| `cashback_instant_enabled` | `true` | Bật/tắt tính năng gửi email thông báo instant khi có cashback |

**Migration File:** `backend/migrations/032_add_notification_settings.sql`

### 2. Automated Cron Job

**File:** `backend/jobs/cronJobs.js`

**Job 5: Cashback Reminder Emails**
- **Schedule:** Configurable via `cashback_reminder_time` setting (default: daily at 10:00 AM)
- **Timezone:** Asia/Ho_Chi_Minh
- **Function:** Calls `CashbackNotificationService.sendPeriodicReminders()`
- **Features:**
  - Checks if reminders are enabled before running
  - Auto-reloads when admin changes schedule
  - Logs success/failure statistics
  - Alerts if failure rate > 20%

**Cron Expression:** Dynamically generated from `cashback_reminder_time`
- Example: `10:00` → `0 10 * * *` (daily at 10:00 AM)
- Example: `14:30` → `30 14 * * *` (daily at 2:30 PM)

### 3. Admin API Endpoints

**Base URL:** `/api/notifications/admin`

#### Get Notification Settings
```bash
GET /api/notifications/admin/settings
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cashback_reminder_enabled": true,
    "cashback_reminder_frequency_days": 7,
    "cashback_reminder_time": "10:00",
    "cashback_instant_enabled": true
  }
}
```

#### Update Notification Settings
```bash
PUT /api/notifications/admin/settings
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "cashback_reminder_enabled": true,
  "cashback_reminder_frequency_days": 5,
  "cashback_reminder_time": "14:30",
  "cashback_instant_enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật cấu hình thành công",
  "data": {
    "cashback_reminder_enabled": true,
    "cashback_reminder_frequency_days": 5,
    "cashback_reminder_time": "14:30",
    "cashback_instant_enabled": true
  }
}
```

**Features:**
- Validates `cashback_reminder_frequency_days` (1-30 days)
- Validates `cashback_reminder_time` format (HH:MM)
- Automatically reloads cron jobs when schedule changes
- No server restart required!

#### Manually Trigger Reminders
```bash
POST /api/notifications/admin/send-reminders
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Periodic reminders sent",
  "data": {
    "total": 15,
    "sent": 12,
    "skipped": 2,
    "failed": 1,
    "details": [...]
  }
}
```

## 🚀 How It Works

### Automatic Flow

```
1. Server starts → Cron jobs initialized
   ↓
2. Read settings from database:
   - cashback_reminder_enabled = true
   - cashback_reminder_time = "10:00"
   ↓
3. Schedule cron job: "0 10 * * *" (daily at 10:00 AM)
   ↓
4. Every day at 10:00 AM:
   - Check if still enabled
   - Call CashbackNotificationService.sendPeriodicReminders()
   - Get eligible users (respecting frequency_days setting)
   - Send emails in batches of 10
   - Log results
```

### User Eligibility Logic

Users receive reminders if:
- ✅ `available_balance >= min_withdrawal_amount`
- ✅ No pending payment request
- ✅ Has not unsubscribed
- ✅ Reminder preference enabled
- ✅ Last reminder sent > X days ago (from `cashback_reminder_frequency_days`)

**Query Location:** `CashbackNotificationService.getEligibleUsersForReminder()`

### Dynamic Schedule Updates

When admin changes `cashback_reminder_time`:
1. Settings updated in database
2. API calls `cronJobs.reload()`
3. All cron jobs stopped
4. New schedule read from database
5. Cron jobs restarted with new schedule
6. ✅ No server restart needed!

## 📋 Testing Instructions

### 1. Verify Migration

```bash
# Check settings were added
node backend/run-migration-032.js

# Expected output:
✅ Migration 032 completed successfully!
✓ Notification settings added: 4
```

### 2. Test API Endpoints

#### Get Current Settings
```bash
curl -X GET http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Update Reminder Frequency
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cashback_reminder_frequency_days": 3,
    "cashback_reminder_time": "14:00"
  }'
```

#### Manually Trigger Reminders (Test)
```bash
curl -X POST http://localhost:3001/api/notifications/admin/send-reminders \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Verify Cron Job

**Check Server Logs:**
```
✅ Scheduled & Started: Cashback reminder emails (0 10 * * * = 10:00 daily)
✅ Initialized 5 cron jobs (auto-start enabled)
```

**Trigger Manual Test:**
```bash
# Via API
POST /api/notifications/admin/send-reminders

# Or via Node.js
const cronJobs = require('./backend/jobs/cronJobs');
cronJobs.triggerJob('cashback-reminders').then(console.log);
```

**Expected Response:**
```json
{
  "total": 10,
  "sent": 8,
  "skipped": 2,
  "failed": 0,
  "details": [...]
}
```

### 4. Test Schedule Changes

**Scenario:** Change reminder time from 10:00 to 14:30

```bash
# Update settings
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_time": "14:30"}'

# Check server logs - should see:
# Reloading cron jobs from database...
# ✅ Scheduled & Started: Cashback reminder emails (30 14 * * * = 14:30 daily)
```

### 5. Test Enable/Disable

**Disable Reminders:**
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": false}'

# Check logs:
# 📧 Cashback reminders DISABLED via system settings
```

**Re-enable:**
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": true}'

# Cron jobs will reload automatically
```

## 🔧 Configuration Examples

### Conservative Approach (Less Frequent)
```json
{
  "cashback_reminder_frequency_days": 14,
  "cashback_reminder_time": "09:00"
}
```
→ Send reminders every 14 days at 9:00 AM

### Aggressive Approach (More Frequent)
```json
{
  "cashback_reminder_frequency_days": 3,
  "cashback_reminder_time": "10:00"
}
```
→ Send reminders every 3 days at 10:00 AM

### Business Hours Only
```json
{
  "cashback_reminder_time": "14:00"
}
```
→ Send at 2:00 PM (afternoon when users check email)

## 📊 Monitoring

### Cron Job Status
```bash
GET /api/admin/cron-jobs/status
```

Response includes:
- Total jobs running
- Individual job schedules
- Last execution time
- Next execution time

### Notification Statistics
```bash
GET /api/notifications/admin/stats?startDate=2025-12-01&endDate=2025-12-31
```

Shows:
- Total reminders sent
- Success/failure rates
- Conversion rates
- Average balance

### Recent Notifications
```bash
GET /api/notifications/admin/recent?type=periodic&limit=50
```

Shows:
- Last 50 periodic reminders
- Email status
- User details
- Timestamps

## 🛡️ Safety Features

1. **Rate Limiting:**
   - Max 1 reminder per user per 7 days (configurable)
   - Prevents spam even if admin triggers manually multiple times

2. **Batch Processing:**
   - Processes 10 users per batch
   - 2-second delay between batches
   - Prevents email server overload

3. **Non-Blocking:**
   - Email failures don't stop other reminders
   - All errors logged individually
   - Summary statistics provided

4. **Validation:**
   - Frequency: 1-30 days only
   - Time format: HH:MM (00:00 - 23:59)
   - Auto-reject invalid inputs

## 🐛 Troubleshooting

### Reminders Not Sending

**Check 1: Is it enabled?**
```bash
GET /api/notifications/admin/settings
# Verify cashback_reminder_enabled = true
```

**Check 2: Are cron jobs running?**
```bash
GET /api/admin/cron-jobs/status
# Should see "cashback-reminders" in list
```

**Check 3: Are there eligible users?**
```bash
GET /api/notifications/admin/eligible-users
# Should return users with balance >= threshold
```

**Check 4: Check server logs**
```
# Look for:
📧 Cron: Cashback reminder emails started
📧 Cron: Cashback reminder emails completed
```

### Schedule Not Updating

**Solution:** Restart server or call reload endpoint
```bash
POST /api/admin/cron-jobs/reload
```

### High Failure Rate

**Check Email Service:**
- Verify SMTP credentials in `.env`
- Check email service limits
- Review error logs for specific failures

**Check User Data:**
- Verify users have valid email addresses
- Check for email bounces

## 📈 Next Steps (Phase 3)

These features are planned for Phase 3:
- [ ] Admin dashboard UI for settings
- [ ] Email open/click tracking
- [ ] A/B testing email templates
- [ ] Urgent reminders before reconciliation deadline
- [ ] SMS notifications (optional)
- [ ] User preference UI in dashboard

## 🔗 Related Documentation

- [Phase 1: Foundation](./PHASE1-CASHBACK-NOTIFICATIONS.md)
- Database Schema: `backend/migrations/031_create_cashback_notifications.sql`
- Service Layer: `backend/services/notifications/CashbackNotificationService.js`
- Cron Jobs: `backend/jobs/cronJobs.js`
- API Routes: `backend/routes/notifications.js`

---

✅ **Phase 2 Complete!** Admin can now configure reminder frequency and schedule without code changes.
