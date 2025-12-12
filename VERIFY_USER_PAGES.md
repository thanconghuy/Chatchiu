# VERIFY ALL USER PAGES - SIDEBAR V2

## CHECKLIST - TẤT CẢ 7 TRANG

### ✅ Files đã verify:

| Page | CSS Links | JS Link | Main Class | Status |
|------|-----------|---------|------------|--------|
| dashboard.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| shopping.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| history.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| statistics.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| reconciliation-history.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| payment-requests.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |
| profile.html | ✅ user-sidebar.css<br>✅ user-layout.css | ✅ user-sidebar-v2.js | ✅ user-main-content | **OK** |

---

## REQUIRED CSS LINKS (Order matters!)

```html
<head>
    <link rel="stylesheet" href="css/style.css">              <!-- 1. Base -->
    <link rel="stylesheet" href="css/user-sidebar.css">       <!-- 2. Visual -->
    <link rel="stylesheet" href="css/user-layout.css">        <!-- 3. Layout (LAST) -->
    <link rel="stylesheet" href="https://.../font-awesome...">
</head>
```

## REQUIRED JS

```html
<body>
    <!-- At end of body, before closing </body> -->
    <script src="js/user-sidebar-v2.js"></script>
</body>
```

## REQUIRED HTML STRUCTURE

```html
<body>
    <!-- Mobile menu button -->
    <button class="mobile-menu-btn" id="mobileMenuToggle">
        <i class="fa-solid fa-bars"></i>
    </button>

    <div class="app-container">
        <!-- Sidebar loaded by JS -->

        <!-- Main content with correct class -->
        <main class="user-main-content">
            ...
        </main>
    </div>

    <script src="js/user-sidebar-v2.js"></script>
</body>
```

---

## TESTING PROCEDURE

### For each page:

1. **Hard Refresh**: `Ctrl + Shift + R` (clear cache)

2. **Check Sidebar:**
   - [ ] Logo: "Chắt Chiu.Online" with gradient (white → light purple)
   - [ ] Width: 280px
   - [ ] User info card visible
   - [ ] 4 menu groups:
     - MUA SẮM & KIẾM TIỀN
     - THỐNG KÊ & LỊCH SỬ
     - TÀI CHÍNH & THANH TOÁN
     - TÀI KHOẢN
   - [ ] Accordion behavior (1 group open at a time)

3. **Check Layout:**
   - [ ] Content margin-left: 280px
   - [ ] NO overlap between sidebar and content
   - [ ] Content padding: 30px

4. **Check Mobile (< 768px):**
   - [ ] Sidebar hidden by default
   - [ ] Mobile menu button visible (top-left)
   - [ ] Click button → sidebar slides in
   - [ ] Overlay appears
   - [ ] Click overlay → sidebar closes

---

## COMMON ISSUES & FIXES

### Issue 1: Old sidebar showing (simple menu)
**Cause**: Browser cache
**Fix**: Hard refresh `Ctrl + Shift + R`

### Issue 2: Logo no gradient (white text)
**Cause**: CSS specificity conflict
**Fix**: Already fixed with `.user-sidebar .logo-text` selector + `!important`

### Issue 3: Content overlapping sidebar
**Cause**: Missing `user-layout.css` or wrong main class
**Fix**:
- Check CSS link order
- Verify `<main class="user-main-content">`

### Issue 4: Sidebar too narrow
**Cause**: Old CSS cached or wrong CSS variable
**Fix**:
- Hard refresh
- Check `--user-sidebar-width: 280px` in user-layout.css

### Issue 5: Menu groups not collapsing
**Cause**: JS not loaded or conflict
**Fix**:
- Check `user-sidebar-v2.js` loaded
- Check browser console for errors

---

## BROWSER DEVELOPER TOOLS CHECK

### In DevTools Console, run:

```javascript
// Check sidebar exists
document.querySelector('.user-sidebar')

// Check width
getComputedStyle(document.querySelector('.user-sidebar')).width

// Check main content margin
getComputedStyle(document.querySelector('.user-main-content')).marginLeft

// Check logo gradient
getComputedStyle(document.querySelector('.logo-text')).background
```

**Expected Results:**
- Sidebar width: `280px`
- Content margin-left: `280px`
- Logo background: Contains `linear-gradient`

---

## URLs TO TEST

1. http://localhost:3007/dashboard
2. http://localhost:3007/shopping
3. http://localhost:3007/history
4. http://localhost:3007/statistics
5. http://localhost:3007/reconciliation-history
6. http://localhost:3007/payment-requests
7. http://localhost:3007/profile

---

## IF STILL SHOWING OLD SIDEBAR

### Check server routing:

Some URLs might route to different files:
- `/payment-history` might route to old file
- Check `backend/routes/` for routing config

### Nuclear option - Clear all caches:

1. Browser: `Ctrl + Shift + Delete` → Clear all
2. Server: Restart Node.js server
3. Hard refresh: `Ctrl + Shift + R`

---

**Last updated:** 2025-12-12
**All 7 pages verified:** ✅
