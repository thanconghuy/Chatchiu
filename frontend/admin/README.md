# Admin Dashboard - Cấu trúc & Hướng dẫn

## 📁 Cấu trúc thư mục

```
frontend/admin/
├── shared/                      # Code dùng chung
│   ├── layout.template.html    # Template layout chuẩn
│   ├── constants.js            # Constants (API endpoints, status...)
│   └── utils.js                # Utility functions
│
├── modules/ (planned)           # Modules tương lai
│   └── [future modules]
│
├── *.html                       # Các trang admin (giữ nguyên)
│   ├── index.html              # Dashboard
│   ├── users.html              # User management
│   ├── conversions.html        # Conversions
│   ├── at-orders.html          # AT Orders
│   ├── reconciliation.html     # Đối soát
│   ├── merchants.html          # Merchants
│   └── tools.html              # Admin tools
│
├── *.js                         # JavaScript của từng trang
├── admin.css                    # Shared admin styles
└── README.md                    # Documentation (file này)
```

## 🎯 Nguyên tắc phát triển

### 1. **Hybrid Approach (MPA with Clean URLs)**
- Giữ nguyên các module riêng biệt (Multi-Page Application)
- Mỗi module = 1 file .html riêng (tránh xung đột code)
- Sử dụng shared code để giảm duplicate
- **Backend routing tự động serve file .html mà KHÔNG hiển thị .html trong URL**

**Ví dụ routing:**
```
User visits: /admin/users
Backend serves: /admin/users.html
URL stays: /admin/users (clean, no .html)

If user visits: /admin/users.html
Backend redirects: 301 → /admin/users (permanent redirect)
```

**Lợi ích:**
- ✅ URL đẹp, chuyên nghiệp (không có .html)
- ✅ Mỗi module độc lập (không xung đột)
- ✅ Dễ maintain và debug
- ✅ SEO friendly (nếu cần)
- ✅ Không cần refactor sang SPA

### 2. **Shared Resources**
- **Constants** (`shared/constants.js`): API endpoints, status, configs
- **Utils** (`shared/utils.js`): Formatting, date utils, table helpers
- **Layout** (`shared/layout.template.html`): Template khi tạo page mới

### 2. **Routing Architecture**

**Câu hỏi: "Có BẮT BUỘC mỗi module phải có file .html không?"**

**Trả lời: CÓ - với Hybrid MPA approach hiện tại**

**Tại sao?**
1. Mỗi module = 1 file .html độc lập
2. Backend routing map URL → file tương ứng
3. Không có file = không có gì để serve

**Nhưng URL KHÔNG hiển thị .html:**
- Backend tự động xử lý routing
- User chỉ thấy URL clean: `/admin/users`
- Backend serves file: `admin/users.html`

**So sánh với SPA:**
| Feature | Hybrid MPA (Hiện tại) | SPA |
|---------|----------------------|-----|
| Số file .html | Nhiều (1 file/module) | 1 file duy nhất |
| URL | Clean (no .html) | Clean |
| Code isolation | ✅ Tốt (mỗi module riêng) | ❌ Dễ xung đột |
| Maintenance | ✅ Dễ | ⚠️ Phức tạp |
| Page load | Full reload | No reload |
| Phù hợp | Admin dashboard | Heavy JS apps |

### 3. **Khi nào tạo file .html mới?**

❌ **KHÔNG nên tạo file mới khi:**
- Chỉ là một form nhỏ
- Có thể dùng modal/dialog
- Chức năng nhỏ có thể tích hợp vào page hiện có

✅ **NÊN tạo file mới khi:**
- Module độc lập, phức tạp
- Cần riêng navigation item
- Có nhiều chức năng con
- Cần SEO/deep linking

**Khi tạo file mới:**
1. Copy từ `shared/layout.template.html`
2. Backend TỰ ĐỘNG nhận file (dynamic routing)
3. Không cần edit server code

## 📝 Hướng dẫn tạo trang mới

### Bước 1: Copy template
```bash
cp shared/layout.template.html new-page.html
```

### Bước 2: Replace placeholders

Tìm và thay thế các placeholders:
- `{{PAGE_TITLE}}` → Tên trang (vd: "Users Management")
- `{{PAGE_ICON}}` → Icon emoji (vd: "👥")
- `{{ACTIVE_[page]}}` → Add class "active" cho nav item tương ứng
- `{{CONTENT}}` → Nội dung HTML của trang
- `{{PAGE_SCRIPT}}` → Path tới JS file (vd: "users.js")

### Bước 3: Include shared scripts

**Luôn include theo thứ tự:**
```html
<!-- Shared Scripts -->
<script src="../js/config.js"></script>
<script src="../js/auth.js"></script>
<script src="../js/mobile-menu.js"></script>
<script src="shared/constants.js"></script>
<script src="shared/utils.js"></script>

<!-- Page-specific script -->
<script src="your-page.js"></script>
```

### Bước 4: Viết JavaScript

**Structure chuẩn cho page JS:**

```javascript
// Check authentication & admin access
(async () => {
    const hasAccess = await initAdminPage();
    if (!hasAccess) return;

    // Your initialization
    await init();
})();

// State
let currentPage = 1;
let filters = {};

// Initialize
async function init() {
    setupEventListeners();
    await loadData();
}

// Setup event listeners
function setupEventListeners() {
    // Your event listeners
}

// Load data
async function loadData() {
    try {
        // Show loading
        showTableSkeleton(tableBody, columnCount);

        // Fetch data
        const response = await apiRequest(API_ENDPOINTS.YOUR_ENDPOINT);

        // Render data
        if (response.success) {
            renderData(response.data);
        }
    } catch (error) {
        console.error('Load error:', error);
        showTableError(tableBody, columnCount);
    }
}
```

## 🔧 Shared Functions Reference

### Date & Time
```javascript
formatDate(dateString, includeTime)        // 13/11/2025 hoặc 13/11/2025 20:35
formatDateForPicker(date)                  // 2025-11-13
getDefaultDateRange(days)                  // { from: '2025-10-14', to: '2025-11-13' }
```

### Currency & Numbers
```javascript
formatCurrency(amount)                     // 5.230.000₫
formatNumber(number)                       // 1.234.567
```

### Table Helpers
```javascript
showTableSkeleton(tableBody, columnCount, rowCount)
showTableEmpty(tableBody, columnCount, message)
showTableError(tableBody, columnCount, errorMessage)
getStatusBadge(status)                     // <span class="status-badge ...">
```

### Pagination
```javascript
setupPagination({
    currentPage: 1,
    totalPages: 10,
    totalItems: 500,
    itemsPerPage: 50,
    onPageChange: (page) => { /* handle */ },
    onPageSizeChange: (size) => { /* handle */ }
})
```

### Utilities
```javascript
debounce(func, wait)                       // Debounce function
confirmAction(message, title)              // Confirm dialog
```

## 📊 Constants Usage

```javascript
// API Endpoints
API_ENDPOINTS.ADMIN_USERS                  // '/admin/users'
API_ENDPOINTS.ADMIN_USER(123)              // '/admin/user/123'

// Order Status
ORDER_STATUS.PENDING                       // 'pending'
ORDER_STATUS_TEXT.pending                  // 'Đang xử lý'
ORDER_STATUS_CLASS.pending                 // 'status-pending'

// Config
DEFAULT_PAGE_SIZE                          // 50
PAGE_SIZE_OPTIONS                          // [10, 20, 50, 100]
DEFAULT_DATE_RANGE_DAYS                    // 30
```

## ✅ Best Practices

### 1. **Error Handling**
```javascript
try {
    const response = await apiRequest(endpoint);
    if (response.success) {
        // Success
    } else {
        throw new Error(response.message);
    }
} catch (error) {
    console.error('Error:', error);
    showToast(error.message, 'error');
    showTableError(tableBody, columnCount);
}
```

### 2. **Loading States**
```javascript
// Show loading
showTableSkeleton(tableBody, 10);

// Load data
const data = await fetchData();

// Show result
if (data.length > 0) {
    renderTable(data);
} else {
    showTableEmpty(tableBody, 10);
}
```

### 3. **State Management**
```javascript
// Declare state at top
let currentFilters = {
    status: '',
    dateFrom: '',
    dateTo: '',
    search: ''
};

// Update state
function updateFilters(key, value) {
    currentFilters[key] = value;
    loadData();
}
```

### 4. **Event Listeners Cleanup**
```javascript
// Store references
let searchTimeout;

function setupEventListeners() {
    searchInput.addEventListener('input', debounce((e) => {
        currentFilters.search = e.target.value;
        loadData();
    }, 300));
}
```

## 🚀 Ví dụ hoàn chỉnh

Xem file `conversions.html` và `conversions.js` để tham khảo implementation đầy đủ.

## 📞 Support

Nếu gặp vấn đề hoặc cần thêm utility functions, hãy thêm vào:
- `shared/constants.js` - Cho constants mới
- `shared/utils.js` - Cho utility functions mới

---

**Last updated:** 2025-11-13
**Version:** 1.0.0
