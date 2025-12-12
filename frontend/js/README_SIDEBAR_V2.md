# 🚀 User Sidebar V2 - Quick Start

## Quick Setup (New Page)

### 1. Add CSS & Icons to `<head>`:

```html
<link rel="stylesheet" href="css/user-sidebar.css">
<!-- Font Awesome for Icons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
```

### 2. Add Mobile Button in `<body>`:

```html
<button class="mobile-menu-btn" id="mobileMenuToggle">
    <i class="fa-solid fa-bars"></i>
</button>
```

### 3. Add App Container:

```html
<div class="app-container">
    <!-- Sidebar auto-injected here -->

    <main class="main-content">
        <!-- Your content -->
    </main>
</div>
```

### 4. Add Scripts before `</body>`:

```html
<script src="js/config.js"></script>
<script src="js/auth.js"></script>
<script src="js/user-sidebar-v2.js"></script>
```

**Done! Sidebar will auto-load.**

---

## Adding Menu Item

Edit `user-sidebar-v2.js`, add to appropriate group:

```javascript
{
    id: 'your-group',
    title: 'Your Group',
    icon: 'fa-solid fa-icon',
    items: [
        {
            href: '/your-page',
            icon: 'fa-solid fa-page-icon',
            text: 'Your Page Title',
            id: 'your-page'
        }
    ]
}
```

Then update `detectActiveUserPage()` if needed.

---

## Mobile Testing

```bash
# Chrome DevTools
Press F12 → Toggle device toolbar (Ctrl+Shift+M)
Test: iPhone, iPad, Android

# Check:
- Hamburger menu appears
- Sidebar slides in/out
- Overlay works
- Auto-close on click
```

---

## Common Issues

**Sidebar not showing?**
- Check Font Awesome CDN loaded
- Check `user-sidebar.css` imported
- Check `.app-container` exists

**Sidebar width incorrect?**
- Clear browser cache (Ctrl+Shift+R)
- Check CSS variable `--user-sidebar-width: 250px`
- Use test page: `/test-sidebar-width.html`

**Mobile menu not working?**
- Check `#mobileMenuToggle` exists
- Check event listeners attached

---

## Testing Sidebar Width

Use the test page to verify sidebar width is 250px:

```bash
# Open in browser:
localhost:3007/test-sidebar-width.html

# Should show all green checkmarks:
✅ Sidebar CSS variable = 250px
✅ Sidebar actual width = 250px
✅ Main content margin-left = 250px
✅ No balance widget visible
```

---

**Full docs:** [../../docs/USER_SIDEBAR_V2.md](../../docs/USER_SIDEBAR_V2.md)

**Width fix summary:** [../../SIDEBAR_WIDTH_FIX_SUMMARY.md](../../SIDEBAR_WIDTH_FIX_SUMMARY.md)
