# Migration 027: Enable Cron Jobs by Default

## Purpose
Ensure cron jobs are **enabled by default** on server startup by inserting the default `auto_cron_enabled` setting into the database.

## Problem
- Fresh installs had cron jobs disabled
- Users had to manually enable from admin panel
- Retry clicks, cleanup, and alerts didn't run automatically

## Solution
Insert default setting: `auto_cron_enabled = true`

---

## How to Run Migration

### Option 1: Using psql (Direct Database Access)

```bash
# Connect to database
psql "postgresql://your-connection-string"

# Run migration
\i backend/migrations/027_add_default_auto_cron_enabled.sql

# Verify
SELECT * FROM system_settings WHERE setting_key = 'auto_cron_enabled';
```

### Option 2: Using Neon Console

1. Go to https://console.neon.tech
2. Select your project
3. Click "SQL Editor"
4. Copy and paste the SQL from `027_add_default_auto_cron_enabled.sql`
5. Click "Run"

### Option 3: Using Node.js Script

```bash
node backend/scripts/run-migration.js 027
```

---

## Verification

After running the migration, verify:

```sql
-- Check setting exists
SELECT * FROM system_settings WHERE setting_key = 'auto_cron_enabled';

-- Should return:
-- setting_key: auto_cron_enabled
-- setting_value: true
-- setting_type: boolean
-- category: system
```

---

## Testing

1. **Restart server**
   ```bash
   npm start
   ```

2. **Check logs**
   - Should see: `Auto Cron setting: true`
   - Should see: `Cron Jobs: 4 jobs initialized`

3. **Check Admin Settings Page**
   - Go to http://localhost:3007/admin/settings
   - Click "Cron Jobs" tab
   - Should see: "Đã khởi tạo • 4 jobs đang chạy"
   - List should show:
     - 🔄 Retry Unmatched Clicks (0 */6 * * *)
     - 🗑️ Cleanup Expired Clicks (0 3 * * *)
     - ⏰ Alert Expiring Clicks (0 9 * * *)
     - 🗑️ Cleanup Activity Logs (0 2 * * *)

---

## Rollback (If Needed)

```sql
-- Delete the setting (cron jobs will be disabled)
DELETE FROM system_settings WHERE setting_key = 'auto_cron_enabled';

-- Or set to false
UPDATE system_settings
SET setting_value = 'false'
WHERE setting_key = 'auto_cron_enabled';
```

---

## Notes

- Migration uses `ON CONFLICT DO NOTHING` - safe to run multiple times
- Setting is editable - admin can toggle from settings page
- Default value is `true` - cron jobs enabled by default
- Server reads this setting on startup

---

## Related Files

- Migration: `backend/migrations/027_add_default_auto_cron_enabled.sql`
- Cron Jobs Service: `backend/jobs/cronJobs.js`
- Server Startup: `server-cashback.js` (line 251)
- Admin Settings: `frontend/admin/settings.html`
