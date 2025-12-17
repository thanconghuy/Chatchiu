# Cron Jobs Troubleshooting Guide

## Current Issue

**Symptom**: Toggle shows ON but "Không có cron jobs nào đang chạy" (yellow warning box displays)

**User Screenshot Evidence**:
- Toggle: ✅ Kích Hoạt Auto Cron Jobs [ON]
- Status: "Chưa được khởi tạo" (Not initialized)
- Yellow warning: "Không có cron jobs nào đang chạy"
- "🔄 Reload Jobs Ngay" button appears

## Code Flow Analysis

### 1. Server Startup (server-cashback.js:340-358)

```javascript
// Step 1: Load setting from database
const autoCronEnabled = await SystemSettings.get('auto_cron_enabled', true);
process.env.AUTO_CRON_ENABLED = autoCronEnabled ? 'true' : 'false';

// Step 2: Initialize cron jobs
await cronJobsService.initialize();
const status = cronJobsService.getStatus();
if (status.isInitialized) {
    console.log(`⏱️  Cron Jobs: ${status.jobsCount} jobs initialized`);
}
```

**Expected on server start**:
- If `auto_cron_enabled = true` in database → 4 jobs should start
- Console should show: `⏱️  Cron Jobs: 4 jobs initialized`

**Actual behavior**: Unknown (need server logs)

---

### 2. Toggle ON Endpoint (admin.js:4022-4054)

```javascript
POST /api/admin/settings/auto-cron
{
  "enabled": true
}

// Backend logic:
await SystemSettings.set('auto_cron_enabled', enabled, req.userId);
const status = await cronJobsService.reload();

res.json({
  success: true,
  data: {
    enabled,
    status: {
      isInitialized: true/false,
      jobsCount: 0-4,
      autoCronEnabled: true/false
    }
  }
});
```

**Expected response when toggling ON**:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "status": {
      "isInitialized": true,
      "jobsCount": 4,
      "autoCronEnabled": true
    }
  }
}
```

**Actual response**: Need to check (frontend should log this)

---

### 3. Frontend Auto-Fix Logic (settings.html:1211-1263)

```javascript
// Step 1: Toggle ON
const response = await apiRequest('/admin/settings/auto-cron', {
    method: 'POST',
    body: JSON.stringify({ enabled: true })
});

// Step 2: Wait 500ms
await new Promise(resolve => setTimeout(resolve, 500));

// Step 3: Load status
await loadCronJobsStatus();

// Step 4: AUTO-FIX - If enabled but jobsCount = 0, force reload
if (enabled && response.data && response.data.jobsCount === 0) {
    console.warn('⚠️ Auto Cron enabled but no jobs running, forcing reload...');

    const reloadResponse = await apiRequest('/admin/settings/cron-reload', {
        method: 'POST'
    });

    if (reloadResponse.success) {
        showToast('🔄 Jobs đã được reload', 'info');
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadCronJobsStatus();
    }
}
```

**Current state**: Yellow warning shows → Auto-fix logic detected `jobsCount = 0`

---

### 4. Reload Endpoint (admin.js:4060-4078)

```javascript
POST /api/admin/settings/cron-reload

// Backend logic:
const status = await cronJobsService.reload();

res.json({
  success: true,
  message: 'Cron jobs đã được reload thành công',
  data: status
});
```

**Expected after manual reload**: `jobsCount = 4`

**Current state**: User has NOT clicked "Reload Jobs Ngay" button yet

---

## Potential Root Causes

### Cause 1: Database Setting Not Saved Correctly ⚠️

**Check**:
```sql
SELECT setting_key, setting_value, updated_at
FROM system_settings
WHERE setting_key = 'auto_cron_enabled';
```

**Expected**:
```
setting_key       | setting_value | updated_at
------------------|---------------|-------------------
auto_cron_enabled | true          | 2025-01-XX XX:XX:XX
```

**If missing or false**: Toggle not saving to database

---

### Cause 2: Environment Variable Override 🔍

**Check** (server-cashback.js:342):
```javascript
process.env.AUTO_CRON_ENABLED = autoCronEnabled ? 'true' : 'false';
```

**Then in cronJobs.js:47-54**:
```javascript
if (process.env.AUTO_CRON_ENABLED !== undefined) {
    autoCronEnabled = process.env.AUTO_CRON_ENABLED === 'true';
    logger.info(`[Local Dev] Cron setting from .env: ${autoCronEnabled}`);
}
```

**Issue**: If `.env` file has `AUTO_CRON_ENABLED=false`, it might override database setting in local dev

**Fix**: Check `.env` file

---

### Cause 3: isInitialized Flag Logic Bug 🐛

**Scenario**:
1. Server starts → `auto_cron_enabled = false` → `isInitialized = false`
2. User toggles ON → calls `reload()` → sets `isInitialized = false` again (line 97)
3. Then checks database → but `isInitialized` is still false

**Code in cronJobs.js:76-92**:
```javascript
if (this.isInitialized && this.jobs.length > 0 && !forceReload) {
    // Verify jobs are running
    const allJobsRunning = this.jobs.every(({ job }) => job !== null);

    if (allJobsRunning) {
        logger.info(`Cron jobs already running (${this.jobs.length} jobs active)`);
        return; // ⚠️ Early return - no reload
    }
}

if (forceReload) {
    logger.info('Force reload: Resetting cron jobs state...');
    this.isInitialized = false; // ✅ Reset flag
}

// ... schedule jobs
this.isInitialized = true; // ✅ Set to true after scheduling
```

**Expected flow**:
- `reload()` calls `initialize(true)` (forceReload = true)
- `isInitialized` reset to false
- Jobs scheduled
- `isInitialized` set to true
- Return status with `jobsCount = 4`

**Potential issue**: If exception thrown during scheduling, `isInitialized` never set to true

---

### Cause 4: Jobs Scheduled But Not Started 🚫

**Code in cronJobs.js:139-182**:
```javascript
const job = cron.schedule(schedule, async () => {
    // ... job logic
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

// ✅ Ensure job is started
job.start();

this.jobs.push({ name: 'retry-unmatched', schedule, job });
logger.info(`✅ Scheduled & Started: Retry unmatched clicks (${schedule})`);
```

**This should work** - `job.start()` is called explicitly

**But**: If `cron.schedule()` throws error, job not added to array → `jobsCount = 0`

---

## Debugging Steps

### Step 1: Check Server Logs 📋

**Start server and check console**:
```bash
npm run dev 2>&1 | grep -E "Cron|⏱️|✅ Scheduled|Auto Cron"
```

**Expected output if working**:
```
[Production] Cron setting from database: true
✅ Scheduled & Started: Retry unmatched clicks (0 */6 * * *)
✅ Scheduled & Started: Cleanup expired clicks (0 3 * * *)
✅ Scheduled & Started: Expiring clicks alert (0 9 * * *)
✅ Scheduled & Started: Activity logs cleanup (0 2 * * *)
✅ Initialized 4 cron jobs (auto-start enabled)
⏱️  Cron Jobs: 4 jobs initialized
```

**If you see**:
- `Auto cron jobs DISABLED` → Database setting is false
- `Cron jobs already running` → Jobs already initialized, but frontend not seeing them
- No output → `cronJobsService.initialize()` not called or threw error

---

### Step 2: Check Database Setting 🗄️

**Query**:
```sql
SELECT setting_key, setting_value, updated_at, updated_by
FROM system_settings
WHERE setting_key = 'auto_cron_enabled';
```

**If result is empty**: Setting never created → Initialize manually:
```sql
INSERT INTO system_settings (setting_key, setting_value, updated_by)
VALUES ('auto_cron_enabled', 'true', 1)
ON CONFLICT (setting_key)
DO UPDATE SET setting_value = 'true';
```

**If `setting_value = 'false'`**: Toggle saved incorrectly → Update:
```sql
UPDATE system_settings
SET setting_value = 'true'
WHERE setting_key = 'auto_cron_enabled';
```

---

### Step 3: Check Environment Variable 🌍

**Check `.env` file**:
```bash
grep AUTO_CRON_ENABLED .env
```

**If exists and = false**:
```env
AUTO_CRON_ENABLED=false  # ❌ Remove this line or set to true
```

**Fix**: Comment out or remove (let database be source of truth):
```env
# AUTO_CRON_ENABLED=false  # Use database setting instead
```

---

### Step 4: Force Reload via API 🔄

**Using browser console on `/admin/settings` page**:
```javascript
// Check current status
const statusRes = await apiRequest('/admin/cron/status');
console.log('Current status:', statusRes.data);

// Force reload
const reloadRes = await apiRequest('/admin/settings/cron-reload', {
    method: 'POST'
});
console.log('Reload result:', reloadRes.data);

// Check status again
const newStatusRes = await apiRequest('/admin/cron/status');
console.log('New status:', newStatusRes.data);
```

**Expected result**:
```javascript
Current status: {
  isInitialized: false,
  autoCronEnabled: true,
  jobsCount: 0,
  jobs: []
}

Reload result: {
  isInitialized: true,
  autoCronEnabled: true,
  jobsCount: 4,
  jobs: [
    { name: 'retry-unmatched', schedule: '0 */6 * * *', status: 'running' },
    { name: 'cleanup-expired', schedule: '0 3 * * *', status: 'running' },
    { name: 'expiring-alert', schedule: '0 9 * * *', status: 'running' },
    { name: 'cleanup-activity-logs', schedule: '0 2 * * *', status: 'running' }
  ]
}
```

---

### Step 5: Test with Manual Node REPL 🧪

**Create test script** `test-cron.js`:
```javascript
require('dotenv').config();

const cronJobsService = require('./backend/jobs/cronJobs');

(async () => {
    console.log('Testing cron jobs initialization...');

    try {
        await cronJobsService.initialize(true);
        const status = cronJobsService.getStatus();

        console.log('Status:', JSON.stringify(status, null, 2));

        if (status.jobsCount === 4) {
            console.log('✅ SUCCESS: All 4 jobs initialized');
        } else {
            console.log('❌ FAILED: Expected 4 jobs, got', status.jobsCount);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
```

**Run**:
```bash
node test-cron.js
```

**Expected output**:
```
Testing cron jobs initialization...
[Production] Cron setting from database: true
✅ Scheduled & Started: Retry unmatched clicks (0 */6 * * *)
✅ Scheduled & Started: Cleanup expired clicks (0 3 * * *)
✅ Scheduled & Started: Expiring clicks alert (0 9 * * *)
✅ Scheduled & Started: Activity logs cleanup (0 2 * * *)
✅ Initialized 4 cron jobs (auto-start enabled)
Status: {
  "isInitialized": true,
  "autoCronEnabled": true,
  "jobsCount": 4,
  "jobs": [...]
}
✅ SUCCESS: All 4 jobs initialized
```

---

## Quick Fixes

### Fix 1: Force Enable via Database (Immediate)

```sql
-- Ensure setting exists and is enabled
INSERT INTO system_settings (setting_key, setting_value, updated_by)
VALUES ('auto_cron_enabled', 'true', 1)
ON CONFLICT (setting_key)
DO UPDATE SET
    setting_value = 'true',
    updated_at = NOW();
```

**Then restart server**:
```bash
# Stop server (Ctrl+C)
npm run dev
```

---

### Fix 2: Remove .env Override (If Applicable)

**Edit `.env` file**, comment out:
```env
# AUTO_CRON_ENABLED=false  # Removed - using database setting
```

**Restart server**

---

### Fix 3: Manual Reload from Admin UI

**Steps**:
1. Open `/admin/settings`
2. Scroll to "Cron Jobs & Retry Settings"
3. Click "🔄 Reload Jobs" button
4. Verify jobs appear in table

---

## Expected Behavior After Fix

### UI State: Jobs Running ✅

```
✅ Kích Hoạt Auto Cron Jobs     [ON]
   Enabled

   Đã khởi tạo • 4 jobs đang chạy

┌─────────────────────────────────────────────┐
│ Job Name             Schedule      Status   │
├─────────────────────────────────────────────┤
│ 🔄 Retry Unmatched  0 */6 * * *  Running   │
│ 🗑️ Cleanup Expired  0 3 * * *    Running   │
│ ⏰ Alert Expiring   0 9 * * *    Running   │
│ 🗑️ Cleanup Logs     0 2 * * *    Running   │
└─────────────────────────────────────────────┘
```

---

## Related Documents

- [CRON_JOBS_AUTO_START_FIX.md](CRON_JOBS_AUTO_START_FIX.md) - Backend auto-start implementation
- [CRON_JOBS_UI_AUTO_FIX.md](CRON_JOBS_UI_AUTO_FIX.md) - Frontend auto-fix UI
- Backend: [backend/jobs/cronJobs.js](backend/jobs/cronJobs.js)
- Frontend: [frontend/admin/settings.html](frontend/admin/settings.html)
- Server startup: [server-cashback.js](server-cashback.js)

---

## Next Steps for User

**Recommended action**: Click the "🔄 Reload Jobs Ngay" button in the yellow warning box

**Expected result**: Jobs should start immediately

**If still not working**:
1. Open browser DevTools console (F12)
2. Click the reload button
3. Share console output + any error messages
4. We'll debug the backend reload endpoint

---

**Status**: ⏳ WAITING FOR USER ACTION (Click "Reload Jobs Ngay" button)

**Current State**: UI correctly showing warning, auto-fix button available

**Blocked By**: Need to test if manual reload button works
