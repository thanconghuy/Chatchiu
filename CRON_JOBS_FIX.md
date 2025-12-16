# 🔧 Auto Cron Jobs Fix

## 🎯 Vấn Đề

Cron jobs không tự động chạy khi server khởi động, phải reload thủ công mới hoạt động.

---

## 🔍 Nguyên Nhân

**File:** `server-cashback.js:351`

```javascript
// ❌ BEFORE - Missing await
cronJobsService.initialize();
```

**Vấn đề:**
- `cronJobsService.initialize()` là **async function**
- Server không **await** nên tiếp tục chạy trước khi cron jobs được initialize hoàn toàn
- Kết quả: Cron jobs chưa kịp start khi server ready

---

## ✅ Giải Pháp

**File:** `server-cashback.js:351`

```javascript
// ✅ AFTER - Added await
await cronJobsService.initialize();
```

**Lợi ích:**
- Đảm bảo cron jobs được initialize **hoàn toàn** trước khi server ready
- Jobs sẽ tự động chạy theo schedule mà không cần reload thủ công

---

## 🚀 Cách Test

### 1. Restart Server

```bash
npm run dev
```

### 2. Kiểm Tra Console Log

Khi server khởi động, bạn sẽ thấy:

```
⏱️  Cron Jobs: 4 jobs initialized
✅ Scheduled: Retry unmatched clicks (0 */6 * * *)
✅ Scheduled: Cleanup expired clicks (0 3 * * *)
✅ Scheduled: Alert expiring clicks (0 9 * * *)
✅ Scheduled: Cleanup activity logs (0 2 * * *)
```

### 3. Kiểm Tra Status Qua API

**Request:**
```bash
GET http://localhost:3007/api/admin/cron/status
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "isInitialized": true,
    "autoCronEnabled": true,
    "jobsCount": 4,
    "jobs": [
      {
        "name": "retry-unmatched",
        "schedule": "0 */6 * * *"
      },
      {
        "name": "cleanup-expired",
        "schedule": "0 3 * * *"
      },
      {
        "name": "expiring-alert",
        "schedule": "0 9 * * *"
      },
      {
        "name": "cleanup-activity-logs",
        "schedule": "0 2 * * *"
      }
    ]
  }
}
```

### 4. Kiểm Tra UI Admin Panel

1. Vào **Admin Panel** → **Settings** → Tab **Cron Jobs**
2. Kiểm tra:
   - ✅ **Auto Cron Status:** `Enabled`
   - ✅ **Info Text:** `Đã khởi tạo • 4 jobs đang chạy`
   - ✅ **Jobs List:** Hiển thị 4 jobs với next run time

---

## 📋 Danh Sách Cron Jobs

| Job Name | Schedule | Mô Tả |
|----------|----------|-------|
| **Retry Unmatched Clicks** | `0 */6 * * *` | Chạy mỗi 6 giờ - Retry các click chưa match với conversion |
| **Cleanup Expired Clicks** | `0 3 * * *` | Chạy lúc 3h sáng - Xóa các click đã hết hạn (>30 ngày) |
| **Alert Expiring Clicks** | `0 9 * * *` | Chạy lúc 9h sáng - Cảnh báo các click sắp hết hạn |
| **Cleanup Activity Logs** | `0 2 * * *` | Chạy lúc 2h sáng - Xóa activity logs cũ (>90 ngày) |

---

## 🗂️ Files Changed

| File | Line | Change |
|------|------|--------|
| `server-cashback.js` | 351 | Added `await` before `cronJobsService.initialize()` |

---

## 🔄 Rollback (Nếu Cần)

Nếu gặp vấn đề, revert lại:

```javascript
// Remove await
cronJobsService.initialize();
```

---

## 📝 Notes

1. **Database Setting:** Cron jobs kiểm tra setting `auto_cron_enabled` trong database
   - Default: `true`
   - Có thể toggle ON/OFF qua Admin Panel

2. **Environment Variable:** Sau khi load từ database, setting được sync vào `process.env.AUTO_CRON_ENABLED`

3. **Force Reload:** Có thể reload cron jobs mà không cần restart server:
   - UI: Click button "Reload Cron Jobs" trong Settings
   - API: `POST /api/admin/settings/cron-reload`

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Fixed
