# Frontend Structure - Cashback System

## 📁 Cấu trúc thư mục

```
frontend/
│
├── 🏠 ROOT PAGES (Public/Landing)
│   └── index.html                      # Landing page / Home
│
├── 🔐 AUTH PAGES (Authentication)
│   ├── login.html                      # User login
│   ├── register.html                   # User registration
│   ├── forgot-password.html            # Password recovery
│   └── reset-password.html             # Password reset
│
├── 👤 USER PAGES (Dashboard)
│   ├── dashboard.html                  # User dashboard
│   └── history.html                    # Transaction history
│
├── ⚙️ ADMIN (Admin Dashboard)
│   ├── shared/                         # Shared resources
│   │   ├── layout.template.html        # Layout template
│   │   ├── constants.js                # Constants & configs
│   │   └── utils.js                    # Utility functions
│   │
│   ├── index.html                      # Admin dashboard
│   ├── users.html                      # User management
│   ├── conversions.html                # Conversions management
│   ├── at-orders.html                  # AccessTrade orders
│   ├── reconciliation.html             # Reconciliation
│   ├── merchants.html                  # Merchants management
│   ├── tools.html                      # Admin tools
│   │
│   ├── *.js                            # Page-specific JavaScript
│   ├── admin.css                       # Admin styles
│   └── README.md                       # Admin documentation
│
├── 📁 ASSETS
│   ├── css/
│   │   └── style.css                   # Global styles
│   │
│   └── js/
│       ├── config.js                   # App configuration
│       ├── auth.js                     # Authentication logic
│       └── mobile-menu.js              # Mobile menu handler
│
└── 📄 THIS FILE
    └── STRUCTURE.md                    # Structure documentation
```

## 🌐 Routing Architecture

### **Clean URLs (No .html Extension)**

Hệ thống sử dụng **Backend Routing** để tạo clean URLs:

```
URL người dùng thấy    →  File thực tế được serve
─────────────────────────────────────────────────
/admin                 →  frontend/admin/index.html
/admin/users           →  frontend/admin/users.html
/admin/conversions     →  frontend/admin/conversions.html
/dashboard             →  frontend/dashboard.html
/login                 →  frontend/login.html
```

**Automatic .html Redirects:**
```
User visits: /admin/users.html
Backend: 301 Redirect → /admin/users
```

**Kết luận:**
- ✅ Mỗi module VẪN CẦN 1 file .html
- ✅ URL hiển thị clean (không có .html)
- ✅ Backend tự động xử lý routing và redirects

## 🗂️ File Organization by Purpose

### **Authentication Flow**
```
index.html (Landing)
    ↓
login.html → dashboard.html (User)
    ↓
register.html → login.html
    ↓
forgot-password.html → reset-password.html → login.html
```

### **User Flow**
```
dashboard.html (Main)
    ├── history.html (Transactions)
    └── [Other user features]
```

### **Admin Flow**
```
admin/index.html (Dashboard)
    ├── admin/users.html (User Management)
    ├── admin/conversions.html (Conversions)
    ├── admin/at-orders.html (AT Orders Data)
    ├── admin/reconciliation.html (Reconciliation)
    ├── admin/merchants.html (Merchants)
    └── admin/tools.html (Admin Tools)
```

## 🎯 Naming Conventions

### **Current (Maintained)**
- `kebab-case.html` for filenames
- `camelCase.js` for JavaScript
- Descriptive names (e.g., `forgot-password.html` not `forgot.html`)

### **Pages are named by:**
1. **Function**: What it does (e.g., `login`, `register`)
2. **Resource**: What it manages (e.g., `users`, `merchants`)
3. **Action**: What action it performs (e.g., `reconciliation`, `tools`)

## 📊 Page Count Summary

- **Public/Landing**: 1 page
- **Authentication**: 4 pages
- **User Dashboard**: 2 pages
- **Admin**: 7 pages
- **Total**: 14 pages ✅ (Cleaned from 20)

## 🗑️ Recently Removed (Cleanup 2025-11-13)

### User Pages
- ❌ `login-neon.html` - Duplicate login page
- ❌ `login-neon-simple.html` - Duplicate login page
- ❌ `reconciliation-history.html` - Unused/duplicate

### Admin Pages
- ❌ `transactions.html` - Duplicate/unused
- ❌ `admin-spa.html` - Test file

## 🚀 When to Create New Pages

### ✅ CREATE new page when:
- Building a major new feature
- Need separate navigation/routing
- Complex UI with many sub-features
- Need deep linking/bookmarking
- Logically independent module

### ❌ DON'T create new page when:
- Small form or dialog (use modal)
- Sub-feature of existing page (add as tab/section)
- Temporary/test page (use existing page)
- Can be done with query parameters

## 📝 Adding New Pages

### For Admin Pages:
See [admin/README.md](admin/README.md) for detailed guide.

**Quick steps:**
1. Copy `admin/shared/layout.template.html`
2. Replace placeholders
3. Create corresponding `.js` file
4. Add navigation link to sidebar
5. Update backend routes if needed

### For User Pages:
1. Create HTML file in root
2. Include necessary scripts:
   ```html
   <script src="js/config.js"></script>
   <script src="js/auth.js"></script>
   ```
3. Add to navigation if needed

## 🔗 Related Documentation

- [Admin README](admin/README.md) - Admin development guide
- [Backend Routes](../backend/routes/) - API endpoints
- [Database Schema](../backend/models/) - Data models

---

**Last Updated**: 2025-11-13
**Maintained By**: Development Team
