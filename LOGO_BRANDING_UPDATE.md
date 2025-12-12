# LOGO & BRANDING UPDATE - UNIFIED DESIGN

## MỤC TIÊU

Sử dụng **CÙNG LOGO** từ trang chủ (landing page) cho:
- ✅ User Sidebar
- ✅ Admin Sidebar

Logo: **"Chắt Chiu.Online"** với gradient text matching landing page

---

## THAY ĐỔI

### 1. **User Sidebar Logo**

#### JavaScript: `frontend/js/user-sidebar-v2.js`

**TRƯỚC:**
```javascript
<div class="logo">
    <span class="logo-icon"><i class="fa-solid fa-fire"></i></span>
    <span class="logo-text">Chatchiu.Online</span>
</div>
```

**SAU:**
```javascript
<div class="logo">
    <span class="logo-text">Chắt Chiu.Online</span>
</div>
```

#### CSS: `frontend/css/user-sidebar.css`

**TRƯỚC:**
```css
.logo {
    display: flex;
    align-items: center;
    gap: 10px;
}

.logo-icon {
    font-size: 1.6rem;
    color: white;
}

.logo-text {
    font-size: 1.2rem;
    font-weight: 700;
    color: white;
}
```

**SAU:**
```css
.logo {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
}

.logo-text {
    font-size: 1.35rem;
    font-weight: 800;
    background: linear-gradient(135deg, #ffffff 0%, #e0d5ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    text-align: center;
}
```

---

### 2. **Admin Sidebar Logo**

#### JavaScript: `frontend/admin/sidebar.js`

**TRƯỚC:**
```javascript
<div class="logo">
    <span class="logo-icon"><i class="fa-solid fa-bolt"></i></span>
    <span class="logo-text">Admin Panel</span>
</div>
```

**SAU:**
```javascript
<div class="logo">
    <span class="logo-text">Chắt Chiu.Online</span>
    <span class="logo-subtitle">Admin Panel</span>
</div>
```

#### CSS: `frontend/admin/admin.css`

**TRƯỚC:**
```css
.logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}

.logo-icon {
    font-size: 1.8rem;
    color: white;
}

.logo-text {
    font-size: 1.3rem;
    font-weight: 700;
    color: white;
}
```

**SAU:**
```css
.logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin-bottom: var(--spacing-md);
}

.logo-text {
    font-size: 1.35rem;
    font-weight: 800;
    background: linear-gradient(135deg, #ffffff 0%, #e0d5ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    text-align: center;
}

.logo-subtitle {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
}
```

---

## DESIGN SPECS

### Logo Text:
- **Text**: "Chắt Chiu.Online"
- **Font Size**: 1.35rem (21.6px)
- **Font Weight**: 800 (ExtraBold)
- **Gradient**: `linear-gradient(135deg, #ffffff 0%, #e0d5ff 100%)`
  - Start: Pure white (#ffffff)
  - End: Light purple (#e0d5ff)
- **Letter Spacing**: -0.02em (tight)
- **Text Align**: Center

### Admin Subtitle:
- **Text**: "ADMIN PANEL"
- **Font Size**: 0.7rem (11.2px)
- **Font Weight**: 600 (SemiBold)
- **Color**: rgba(255, 255, 255, 0.7) (70% opacity white)
- **Text Transform**: Uppercase
- **Letter Spacing**: 0.5px

---

## VISUAL COMPARISON

### Landing Page Logo:
```
┌─────────────────────────┐
│   Chắt Chiu.Online      │  ← Purple-Pink Gradient
└─────────────────────────┘
```

### User Sidebar Logo:
```
┌─────────────────────────┐
│   Chắt Chiu.Online      │  ← White-LightPurple Gradient
└─────────────────────────┘
```

### Admin Sidebar Logo:
```
┌─────────────────────────┐
│   Chắt Chiu.Online      │  ← White-LightPurple Gradient
│     ADMIN PANEL         │  ← Small subtitle (70% opacity)
└─────────────────────────┘
```

---

## GRADIENT RATIONALE

### Landing Page:
- Background: Light (white/gray)
- Gradient: Dark purple → Pink (high contrast)
- Purpose: Eye-catching, modern

### User/Admin Sidebar:
- Background: Purple gradient (dark)
- Gradient: White → Light purple (high contrast on dark bg)
- Purpose: Readable, professional, consistent with sidebar theme

---

## BROWSER COMPATIBILITY

### CSS Properties Used:
```css
background: linear-gradient(...);           /* Standard */
-webkit-background-clip: text;              /* Safari/Chrome */
-webkit-text-fill-color: transparent;       /* Safari/Chrome */
background-clip: text;                      /* Standard (newer browsers) */
```

**Supported:**
- ✅ Chrome/Edge (Chromium): Full support
- ✅ Safari: Full support
- ✅ Firefox 49+: Full support
- ⚠️ IE11: Fallback to white text (no gradient)

---

## FILES MODIFIED

1. **User Sidebar:**
   - `frontend/js/user-sidebar-v2.js` - Logo HTML structure
   - `frontend/css/user-sidebar.css` - Logo styling

2. **Admin Sidebar:**
   - `frontend/admin/sidebar.js` - Logo HTML structure
   - `frontend/admin/admin.css` - Logo styling

---

## MAINTENANCE

### Changing Logo Text:
Update in **2 locations**:
1. `frontend/js/user-sidebar-v2.js` (line ~212)
2. `frontend/admin/sidebar.js` (line ~216)

### Changing Logo Gradient:
Update in **2 locations**:
1. `frontend/css/user-sidebar.css` (line ~105)
2. `frontend/admin/admin.css` (line ~126)

### Changing Admin Subtitle:
Update in **1 location**:
- `frontend/admin/sidebar.js` (line ~217)

---

## TESTING CHECKLIST

### User Sidebar:
- [ ] Logo displays "Chắt Chiu.Online"
- [ ] Gradient visible (white → light purple)
- [ ] Text centered
- [ ] No icon present
- [ ] All 7 user pages show same logo

### Admin Sidebar:
- [ ] Logo displays "Chắt Chiu.Online"
- [ ] Subtitle displays "ADMIN PANEL"
- [ ] Gradient visible on main text
- [ ] Subtitle has 70% opacity
- [ ] All admin pages show same logo

### Cross-browser:
- [ ] Chrome/Edge
- [ ] Safari
- [ ] Firefox
- [ ] Mobile Safari
- [ ] Mobile Chrome

---

**Ngày update:** 2025-12-12
**Files changed:** 4 files (2 JS, 2 CSS)
**Logo unified:** ✅ Landing Page + User Sidebar + Admin Sidebar
