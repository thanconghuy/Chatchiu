# 🔧 FIX "Debug User" Issue

## ❓ Vấn Đề

Sidebar hiển thị **"Debug User"** thay vì tên user thật.

## 🔍 Nguyên Nhân

localStorage đang lưu data test từ lần mở `debug-sidebar.html`:

```javascript
// debug-sidebar.html đã set:
localStorage.setItem('cashback_user', JSON.stringify({
    fullName: 'Debug User',
    email: 'debug@test.com'
}));
```

Data này còn lưu trong browser và được sidebar load ra.

## ✅ Giải Pháp

### Option 1: Clear localStorage Tự Động (KHUYẾN NGHỊ)

Mở trang clear data:
```
localhost:3007/clear-debug-data.html
```

1. Page sẽ hiển thị current user: **Debug User**
2. Click button "Clear Debug Data"
3. localStorage sẽ bị xóa
4. Auto redirect về login
5. Đăng nhập lại → User name sẽ đúng!

### Option 2: Clear localStorage Thủ Công

```
1. Mở bất kỳ page nào
2. F12 → Console tab
3. Paste code:
```javascript
localStorage.clear();
location.reload();
```
4. Đăng nhập lại
```

### Option 3: DevTools Application Tab

```
1. F12 → Application tab (Chrome) / Storage tab (Firefox)
2. Left sidebar → Storage → Local Storage
3. Click localhost:3007
4. Right-click → Clear
5. Refresh page (F5)
6. Đăng nhập lại
```

## 🔒 Tại Sao Cần Đăng Nhập Lại?

localStorage chứa:
- `cashback_user` → User info
- `cashback_token` → Auth token

Khi clear localStorage:
- ❌ Token bị mất → Bị logout
- ❌ User info bị mất → Sidebar không có data

Sau khi đăng nhập lại:
- ✅ Token mới được lưu
- ✅ User info thật được lưu
- ✅ Sidebar hiển thị đúng tên

## 🧪 Verify Fix

Sau khi clear và login lại:

### Check trong Console:
```javascript
const user = JSON.parse(localStorage.getItem('cashback_user'));
console.log('User:', user.fullName);  // Should NOT be "Debug User"
console.log('Email:', user.email);
```

### Check trên UI:
1. Sidebar user card phải hiển thị tên thật
2. Dropdown menu phải có email thật
3. Không còn "Debug User" nữa

## 📝 Prevention

Để tránh issue này trong tương lai:

### 1. Debug Page Chỉ Dùng Cho Dev

`debug-sidebar.html` và `test-sidebar-width.html` chỉ để test CSS, **KHÔNG dùng cho production**.

### 2. Không Mock User Trên Production Pages

Dashboard, shopping, statistics pages không có mock user code → an toàn!

### 3. Clear Debug Data Sau Khi Test

Sau khi test xong debug pages, luôn chạy:
```
localhost:3007/clear-debug-data.html
```

## 🚨 Important Notes

**Debug pages có mock user:**
- ❌ `debug-sidebar.html` → Sets "Debug User"
- ❌ `test-sidebar-width.html` → Sets "Test User"

**Production pages KHÔNG có mock:**
- ✅ `dashboard.html`
- ✅ `shopping.html`
- ✅ `statistics.html`
- ✅ `history.html`
- ✅ `reconciliation-history.html`
- ✅ `payment-requests.html`
- ✅ `profile.html`

## ✅ Quick Fix Steps

```
1. Mở: localhost:3007/clear-debug-data.html
2. Click: "Clear Debug Data" button
3. Đợi redirect về /login
4. Đăng nhập lại với account thật
5. Check sidebar → Tên đúng! ✅
```

---

**Issue:** Sidebar shows "Debug User"
**Root Cause:** localStorage contaminated with test data
**Fix:** Clear localStorage via `clear-debug-data.html`
**Time:** < 1 minute

**Quick Fix URL:** `localhost:3007/clear-debug-data.html`
