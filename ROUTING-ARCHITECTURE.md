# Routing Architecture - Cashback System

## ❓ Câu hỏi thường gặp

### "Tại sao URL vẫn có .html?"

**Nếu bạn thấy URL có .html** → Bạn đang truy cập trực tiếp bằng URL cũ

**Giải pháp:** Hệ thống đã tự động redirect. Refresh lại page hoặc click vào navigation links.

### "Có BẮT BUỘC mỗi module phải có file .html không?"

**CÓ** - với kiến trúc Hybrid MPA hiện tại.

**Lý do:**
- Backend routing cần file để serve
- Không có file = 404 error
- Mỗi module = 1 file .html độc lập

**NHƯNG:** URL hiển thị sẽ clean (không có .html)

---

## 🏗️ Kiến trúc Routing

### **1. Backend Routing (Express.js)**

**File:** `server-cashback.js`

```javascript
// Clean URL Routes
app.get('/admin/:page', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', `${page}.html`));
});

// Automatic Redirects (.html → clean)
app.get('/admin/:page.html', (req, res) => {
  res.redirect(301, `/admin/${page}`);
});
```

### **2. URL Mapping**

| User Visits | Backend Serves | Status |
|------------|----------------|--------|
| `/admin` | `admin/index.html` | 200 OK |
| `/admin/users` | `admin/users.html` | 200 OK |
| `/admin/users.html` | Redirect → `/admin/users` | 301 |
| `/admin/notexist` | 404 error | 404 |

### **3. Frontend Navigation**

**Tất cả links trong HTML sử dụng clean URLs:**

```html
<!-- ✅ ĐÚNG - Clean URL -->
<a href="/admin/users">Users</a>

<!-- ❌ SAI - Có .html -->
<a href="/admin/users.html">Users</a>
```

---

## 📊 So sánh Kiến trúc

### **Hybrid MPA (Đang dùng) vs SPA**

| Tiêu chí | Hybrid MPA ⭐ (Hiện tại) | SPA |
|----------|------------------------|-----|
| **Số file .html** | Nhiều (1 file/module) | 1 file duy nhất |
| **URL display** | Clean (no .html) ✅ | Clean ✅ |
| **Code isolation** | ✅ Xuất sắc | ⚠️ Dễ xung đột |
| **Development** | ✅ Đơn giản | ⚠️ Phức tạp |
| **Debugging** | ✅ Dễ | ⚠️ Khó |
| **Page load** | Full reload | Không reload |
| **Bundle size** | Nhỏ (lazy load) | Lớn |
| **Maintenance** | ✅ Dễ scale | ⚠️ Cần architecture tốt |
| **Phù hợp cho** | Admin dashboards ⭐ | Heavy interactive apps |

### **Tại sao chọn Hybrid MPA?**

✅ **Ưu điểm:**
1. **Code isolation:** Mỗi module không ảnh hưởng module khác
2. **Dễ maintain:** Fix bug ở 1 module không lo break module khác
3. **Team-friendly:** Nhiều dev làm nhiều module song song
4. **Simple debugging:** Console error chỉ rõ file nào
5. **Shared utilities:** Vẫn giảm được duplicate code
6. **Clean URLs:** User không thấy .html

❌ **Nhược điểm:**
1. Full page reload khi chuyển module (không quan trọng với admin)
2. Cần nhiều file .html (đã optimize bằng template)

---

## 🚀 Workflow Tạo Module Mới

### **Bước 1: Tạo file HTML**
```bash
cp frontend/admin/shared/layout.template.html frontend/admin/new-module.html
```

### **Bước 2: Customize HTML**
- Replace `{{PAGE_TITLE}}`, `{{PAGE_ICON}}`
- Add `{{ACTIVE_new-module}}` class to nav

### **Bước 3: Tạo file JS**
```bash
touch frontend/admin/new-module.js
```

### **Bước 4: Test**
```
Visit: http://localhost:3007/admin/new-module
Backend tự động serve: admin/new-module.html
```

**KHÔNG CẦN sửa server code!** Backend routing đã dynamic.

---

## 🔧 Technical Implementation

### **server-cashback.js**

```javascript
// ========================================
// ROUTING SETUP
// ========================================

// 1. Static file serving
app.use(express.static(path.join(__dirname, 'frontend')));

// 2. Clean URL routes (main pages)
const pages = ['login', 'register', 'dashboard', 'history', 'forgot-password', 'reset-password'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${page}.html`));
  });

  // Auto-redirect .html to clean
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(301, `/${page}`);
  });
});

// 3. Admin routes (dynamic)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

app.get('/admin/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'frontend', 'admin', `${page}.html`));
});

// Auto-redirect admin .html to clean
app.get('/admin/index.html', (req, res) => {
  res.redirect(301, '/admin');
});

app.get('/admin/:page.html', (req, res) => {
  res.redirect(301, `/admin/${req.params.page}`);
});
```

---

## 📝 Best Practices

### **1. Always use clean URLs in code**
```javascript
// ✅ ĐÚNG
window.location.href = '/admin/users';
<a href="/admin/conversions">Conversions</a>

// ❌ SAI
window.location.href = '/admin/users.html';
<a href="/admin/conversions.html">Conversions</a>
```

### **2. Navigation links template**
```html
<a href="/admin" class="nav-item {{ACTIVE_dashboard}}">
    <span class="nav-icon">📊</span>
    <span class="nav-text">Dashboard</span>
</a>
```

### **3. API calls (không đổi)**
```javascript
// API calls vẫn dùng /api/ prefix
await apiRequest('/admin/users'); // → /api/admin/users
```

---

## ✅ Checklist Khi Tạo Module Mới

- [ ] Copy từ `shared/layout.template.html`
- [ ] Replace tất cả `{{PLACEHOLDER}}`
- [ ] Tạo file `.js` tương ứng
- [ ] Include shared scripts (constants.js, utils.js)
- [ ] Add navigation link với clean URL (no .html)
- [ ] Test truy cập qua clean URL
- [ ] Test redirect từ .html URL

---

## 🎯 Kết luận

**3 điều quan trọng nhất:**

1. **Mỗi module VẪN CẦN file .html** → Không có file = không hoạt động
2. **URL KHÔNG hiển thị .html** → Backend tự động xử lý
3. **Navigation dùng clean URLs** → `/admin/users` (không phải `/admin/users.html`)

**Kiến trúc này là optimal cho admin dashboard vì:**
- Simple & maintainable
- Code isolation
- Team-friendly development
- Professional URLs
- Không cần refactor lớn

---

**Last Updated:** 2025-11-13
**Maintained By:** Development Team
