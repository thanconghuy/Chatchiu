# Cashback Notification System - Quick Reference

Quick commands and API calls for managing the cashback notification system.

---

## 🚀 Quick Start

### Test the System
```bash
# Test cron job setup and view eligible users
node backend/test-reminder-cron.js
```

### View Current Settings
```bash
curl -X GET http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🎛️ Admin Controls

### Change Reminder Frequency (Days)
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_frequency_days": 5}'
```

### Change Send Time (Daily)
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_time": "14:00"}'
```

### Disable All Reminders
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": false}'
```

### Enable Reminders
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": true}'
```

### Disable Instant Notifications
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_instant_enabled": false}'
```

---

## 📧 Manual Triggers

### Send Reminders Now (Bypass Schedule)
```bash
curl -X POST http://localhost:3001/api/notifications/admin/send-reminders \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Test Instant Notification
```bash
curl -X POST http://localhost:3001/api/notifications/admin/test-instant \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID_HERE"}'
```

---

## 📊 Monitoring

### View Statistics
```bash
curl -X GET "http://localhost:3001/api/notifications/admin/stats?startDate=2025-12-01&endDate=2025-12-31" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View Recent Notifications
```bash
curl -X GET "http://localhost:3001/api/notifications/admin/recent?type=periodic&limit=50" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View Eligible Users
```bash
curl -X GET http://localhost:3001/api/notifications/admin/eligible-users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Cron Job Status
```bash
curl -X GET http://localhost:3001/api/admin/cron-jobs/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🗄️ Direct Database Queries

### View Settings
```sql
SELECT setting_key, setting_value, description
FROM system_settings
WHERE category = 'notifications'
ORDER BY setting_key;
```

### Update Frequency Directly
```sql
UPDATE system_settings
SET setting_value = '5'
WHERE setting_key = 'cashback_reminder_frequency_days';
```

### Update Send Time Directly
```sql
UPDATE system_settings
SET setting_value = '14:00'
WHERE setting_key = 'cashback_reminder_time';
```

### Disable Reminders Directly
```sql
UPDATE system_settings
SET setting_value = 'false'
WHERE setting_key = 'cashback_reminder_enabled';
```

**⚠️ Note:** After direct database changes, reload cron jobs:
```bash
curl -X POST http://localhost:3001/api/admin/cron-jobs/reload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🔍 Troubleshooting

### Check If Reminders Are Enabled
```bash
curl -X GET http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq .data.cashback_reminder_enabled
```

### Check Next Run Time
```bash
node backend/test-reminder-cron.js
# Look for "Next Run: ..." in output
```

### Check Eligible Users Count
```bash
curl -X GET http://localhost:3001/api/notifications/admin/eligible-users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.data.total'
```

### Check Recent Failures
```bash
curl -X GET "http://localhost:3001/api/notifications/admin/recent?limit=10" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq '.data.notifications[] | select(.email_status == "failed")'
```

---

## ⏰ Cron Schedule Reference

| Time | Cron Expression | Description |
|------|----------------|-------------|
| 09:00 | `0 9 * * *` | 9:00 AM daily |
| 10:00 | `0 10 * * *` | 10:00 AM daily (default) |
| 14:00 | `0 14 * * *` | 2:00 PM daily |
| 14:30 | `30 14 * * *` | 2:30 PM daily |
| 20:00 | `0 20 * * *` | 8:00 PM daily |

**Format:** `minute hour * * *`
- minute: 0-59
- hour: 0-23 (24-hour format)
- `* * *` means every day, every month, every day of week

---

## 🎯 Common Scenarios

### Scenario 1: Increase Reminder Frequency
**Need:** Send reminders more often (e.g., every 3 days instead of 7)

```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_frequency_days": 3}'
```

### Scenario 2: Change to Evening Send Time
**Need:** Send at 8:00 PM instead of 10:00 AM

```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_time": "20:00"}'
```

### Scenario 3: Disable During Holiday
**Need:** Stop all notifications temporarily

```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": false}'
```

### Scenario 4: Test Before Enabling
**Need:** Test sending without enabling automatic

1. Keep reminders disabled
2. Manually trigger:
```bash
curl -X POST http://localhost:3001/api/notifications/admin/send-reminders \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
3. Review results
4. Enable if satisfied:
```bash
curl -X PUT http://localhost:3001/api/notifications/admin/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cashback_reminder_enabled": true}'
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `backend/services/notifications/CashbackNotificationService.js` | Core notification logic |
| `backend/jobs/cronJobs.js` | Cron job scheduler |
| `backend/routes/notifications.js` | API endpoints |
| `backend/migrations/031_create_cashback_notifications.sql` | Database schema |
| `backend/migrations/032_add_notification_settings.sql` | Settings migration |
| `backend/test-reminder-cron.js` | Test script |
| `PHASE1-CASHBACK-NOTIFICATIONS.md` | Phase 1 docs |
| `PHASE2-CASHBACK-AUTOMATION.md` | Phase 2 docs |
| `PHASE2-COMPLETE-SUMMARY.md` | Summary report |

---

## 🆘 Emergency Commands

### Stop All Cron Jobs
```bash
curl -X POST http://localhost:3001/api/admin/cron-jobs/stop \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Reload All Cron Jobs
```bash
curl -X POST http://localhost:3001/api/admin/cron-jobs/reload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View Server Logs
```bash
# Vercel
vercel logs

# Local
tail -f logs/combined.log
```

### Check Database Connection
```bash
node -e "require('./backend/config/database').pool.query('SELECT NOW()').then(r => console.log('DB OK:', r.rows[0].now)).catch(e => console.error('DB ERROR:', e.message))"
```

---

## 📞 Support

For detailed documentation, see:
- [PHASE1-CASHBACK-NOTIFICATIONS.md](./PHASE1-CASHBACK-NOTIFICATIONS.md)
- [PHASE2-CASHBACK-AUTOMATION.md](./PHASE2-CASHBACK-AUTOMATION.md)
- [PHASE2-COMPLETE-SUMMARY.md](./PHASE2-COMPLETE-SUMMARY.md)

---

**Last Updated:** December 26, 2025
