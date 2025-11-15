# Fix Timezone Issue on Deployed Server

## Vấn Đề
Thời gian ghi nhận trong Monitoring hiển thị sai giờ khi deploy (ví dụ: hiện 15:00 trong khi thực tế là 22:00).

## Nguyên Nhân
1. Database timezone đã set đúng (`-c timezone=Asia/Ho_Chi_Minh`)
2. Frontend đã dùng `timeZone: 'Asia/Ho_Chi_Minh'`
3. **NHƯNG**: Server timezone (OS level) chưa set → Node.js dùng UTC

## Giải Pháp

### Option 1: Set TZ Environment Variable (RECOMMENDED)

**Trong file `.env`:**
```env
TZ=Asia/Ho_Chi_Minh
```

**Hoặc trực tiếp trong server startup:**
```bash
TZ=Asia/Ho_Chi_Minh node server-cashback.js
```

### Option 2: Set trong package.json scripts

```json
{
  "scripts": {
    "start": "cross-env TZ=Asia/Ho_Chi_Minh node server-cashback.js",
    "dev": "cross-env TZ=Asia/Ho_Chi_Minh nodemon server-cashback.js"
  }
}
```

Install `cross-env` (works on all platforms):
```bash
npm install --save cross-env
```

### Option 3: Set OS Level Timezone (if you have server access)

**Ubuntu/Debian:**
```bash
timedatectl set-timezone Asia/Ho_Chi_Minh
```

**Docker:**
```dockerfile
ENV TZ=Asia/Ho_Chi_Minh
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
```

## Verification

After applying fix, check:

```javascript
// Add to server-cashback.js for debugging
console.log('Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Current time:', new Date().toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}));
```

Should output:
```
Server timezone: Asia/Ho_Chi_Minh
Current time: 15/11/2025, 22:00:00  // Correct Vietnam time
```

## For Production Deployment

If deploying to platforms like:

### Vercel / Netlify
Add to `vercel.json` or environment variables:
```json
{
  "env": {
    "TZ": "Asia/Ho_Chi_Minh"
  }
}
```

### Heroku
```bash
heroku config:set TZ=Asia/Ho_Chi_Minh
```

### Railway
Add in environment variables dashboard:
```
TZ=Asia/Ho_Chi_Minh
```

### PM2
```json
{
  "apps": [{
    "name": "cashback-server",
    "script": "server-cashback.js",
    "env": {
      "TZ": "Asia/Ho_Chi_Minh"
    }
  }]
}
```

## Testing

After restart server:
1. Tạo link mới
2. Check Monitoring → Thống Kê Theo Giờ
3. Xem timestamp có đúng giờ VN không

## Notes
- **QUAN TRỌNG**: Phải restart server sau khi đổi timezone
- Database timezone (`-c timezone=Asia/Ho_Chi_Minh`) chỉ ảnh hưởng đến DB queries
- Node.js timezone ảnh hưởng đến `new Date()`, `Date.now()`, etc.
