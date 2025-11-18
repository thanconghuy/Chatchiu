# TIMEZONE FIX - Sửa lỗi hiển thị thời gian click

## 📋 Vấn đề

Khi deploy lên production (https://chatchiu.online), thời gian ghi nhận click hiển thị **SAI** - thời gian bị nhảy sang **ngày mai** hoặc sai lệch nhiều giờ so với thời gian thực tế.

### Ví dụ:
- **Thời gian thực:** 16/11/2025 lúc 15:36
- **Hiển thị trên production:** 17/11/2025 lúc 20:22 ❌

## 🔍 Nguyên nhân

### 1. **Database Timezone**
PostgreSQL database được cấu hình với timezone: `Asia/Ho_Chi_Minh` (UTC+7)

```sql
SHOW timezone;
-- Result: Asia/Ho_Chi_Minh
```

### 2. **Data Storage**
Timestamps được lưu trong database dạng `TIMESTAMP` (không có timezone info):
- Khi insert: `2025-11-17T08:36:47.967Z` (UTC format)
- PostgreSQL lưu trữ: `2025-11-17 08:36:47.967`

### 3. **Backend Response**
Backend trả về ISO string cho frontend:
```json
{
  "clickedAt": "2025-11-17T08:36:47.967Z"
}
```

### 4. **Frontend Display Problem**
JavaScript `Date` object parse ISO string theo **timezone của client/server**:

**Trên local (Vietnam - UTC+7):**
```javascript
new Date("2025-11-17T08:36:47.967Z")
// → Mon Nov 17 2025 15:36:47 GMT+0700 (✅ Đúng)
```

**Trên production (nếu server ở US - UTC-5):**
```javascript
new Date("2025-11-17T08:36:47.967Z")
// → Mon Nov 17 2025 03:36:47 GMT-0500 (❌ Sai)
```

## ✅ Giải pháp

### **Fix ở Frontend: Force Vietnam Timezone**

Thay đổi tất cả các hàm `formatDate()` để **force** sử dụng `Asia/Ho_Chi_Minh` timezone bất kể client/server đang ở timezone nào.

### Files đã sửa:

#### 1. **[frontend/js/config.js](frontend/js/config.js)**
```javascript
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    // Force Vietnam timezone regardless of client/server timezone
    return date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',  // ← KEY FIX
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}
```

#### 2. **[frontend/admin/shared/utils.js](frontend/admin/shared/utils.js)**
```javascript
function formatDate(dateString, includeTime = false) {
    if (!dateString) return '-';
    const date = new Date(dateString);

    if (includeTime) {
        return date.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',  // ← Force VN timezone
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    return date.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',  // ← Force VN timezone
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
```

## 🧪 Testing

### Debug Script
Tạo file `test-timezone.js` để debug timezone issues:

```bash
node test-timezone.js
```

**Output mẫu:**
```
=== TIMEZONE DEBUG ===

1. Node.js Environment:
   - Current time (local): Mon Nov 17 2025 16:19:11 GMT+0700
   - Current time (UTC): Mon, 17 Nov 2025 09:19:11 GMT
   - Timezone offset: -420 minutes

2. PostgreSQL Database:
   - Database timezone: Asia/Ho_Chi_Minh

3. Recent Clicks:
   - clicked_at (raw): 2025-11-17T08:36:47.967Z
   - JavaScript parse: Mon Nov 17 2025 15:36:47 GMT+0700 ✅
```

### Test on Production

1. **Deploy code mới lên production**
2. **Tạo 1 click mới** và kiểm tra timestamp
3. **Verify:** Thời gian hiển thị phải khớp với giờ Vietnam hiện tại

## 📝 Các files liên quan

### Files đã sửa:
- ✅ `frontend/js/config.js` - Main formatDate function
- ✅ `frontend/admin/shared/utils.js` - Admin utilities

### Files có formatDate khác (nếu cần fix thêm):
- `frontend/admin/admin.js`
- `frontend/admin/at-orders.js`
- `frontend/admin/reconciliation.js`
- `frontend/js/reconciliation-history.js`
- `frontend/admin/activity-logs.html` (inline)

**Note:** Các file trên **ĐÃ CÓ** `timeZone: 'Asia/Ho_Chi_Minh'` nhưng thiếu `hour12: false`, có thể cần update thêm.

## 🚀 Deployment Checklist

- [x] Fix formatDate function với `timeZone: 'Asia/Ho_Chi_Minh'`
- [x] Test trên local environment
- [ ] Deploy lên production
- [ ] Test trên production với real data
- [ ] Monitor logs for any timezone-related errors

## 💡 Best Practices Going Forward

### 1. **Database**
```sql
-- Recommended: Use TIMESTAMPTZ instead of TIMESTAMP
ALTER TABLE clicks ALTER COLUMN clicked_at TYPE TIMESTAMPTZ;
```

### 2. **Backend**
```javascript
// Always return ISO string with timezone info
clickedAt: row.clicked_at.toISOString()
```

### 3. **Frontend**
```javascript
// Always force timezone when displaying
date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false  // Use 24-hour format
})
```

### 4. **Environment Variables**
```bash
# Set server timezone to UTC for consistency
TZ=UTC
```

## 🔗 Related Issues

- Production URL: https://chatchiu.online/dashboard
- Screenshot: Thời gian click bị sai 17/11/2025 instead of 16/11/2025
- Root cause: Timezone mismatch between database, server, and client

---

**Fixed by:** Claude Code
**Date:** 17/11/2025
**Version:** 1.0.1
