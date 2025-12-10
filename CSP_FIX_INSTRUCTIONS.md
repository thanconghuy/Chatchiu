# CSP Fix Implementation Instructions

## Vấn đề
Content Security Policy (CSP) directive `script-src-attr 'none'` chặn tất cả inline event handlers (onclick, onchange, etc.), gây ra lỗi:
```
Executing inline event handler violates CSP directive 'script-src-attr 'none'
```

## Giải pháp

Đã tạo file `frontend/admin/js/csp-fix.js` - một global event delegation handler tự động:
1. Xóa tất cả `onclick` attributes
2. Chuyển đổi sang event delegation
3. Monitor DOM changes và xử lý dynamic content

## Cách sử dụng

### Bước 1: Thêm script vào tất cả trang admin

Thêm dòng sau vào **CUỐI** mỗi file HTML trong `frontend/admin/`, ngay trước `</body>`:

```html
<!-- CSP Fix: Remove inline event handlers -->
<script src="/admin/js/csp-fix.js"></script>
</body>
```

### Bước 2: Đảm bảo thứ tự load

Script csp-fix.js phải load **SAU** tất cả các script khác để có thể:
- Truy cập các function đã được define
- Override các onclick handlers

### Ví dụ thứ tự load đúng:

```html
<!-- 1. External libraries -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- 2. Your page-specific scripts -->
<script src="/admin/js/conversions.js"></script>
<script>
    // Inline scripts with function definitions
    function viewDetails(id) { ... }
    function deleteItem(id) { ... }
</script>

<!-- 3. CSP Fix (MUST BE LAST) -->
<script src="/admin/js/csp-fix.js"></script>
</body>
</html>
```

## Files cần update

Thêm CSP fix script vào các file sau:

- [ ] frontend/admin/activity-logs.html
- [ ] frontend/admin/at-orders.html
- [ ] frontend/admin/cashback-stats.html
- [ ] frontend/admin/conversions.html
- [ ] frontend/admin/payment-history.html
- [ ] frontend/admin/payment-requests.html
- [ ] frontend/admin/reconciliation.html
- [x] frontend/admin/settings.html (đã có custom implementation)
- [ ] frontend/admin/system-reconciliation.html

## Cách hoạt động

### 1. Automatic onclick conversion
```html
<!-- Before (CSP violation) -->
<button onclick="deleteItem('123')">Delete</button>

<!-- After (automatically converted) -->
<button data-onclick="deleteItem('123')">Delete</button>
```

### 2. Smart function detection
CSP fix tự động:
- Parse function name và parameters
- Tìm function trong window scope
- Execute với đúng arguments
- Prevent default behavior khi cần

### 3. Common patterns support

Script hỗ trợ các pattern phổ biến:

```html
<!-- Modal close -->
<button class="modal-close">×</button>

<!-- Tab switching -->
<button class="tab-button" data-tab="users">Users</button>

<!-- Action buttons -->
<button class="btn-edit" data-id="123">Edit</button>
<button class="btn-delete" data-id="123">Delete</button>
<button class="btn-view" data-id="123">View</button>

<!-- Custom actions -->
<button data-action="customFunction" data-args='["param1", 123]'>Action</button>
```

### 4. Dynamic content support

MutationObserver tự động xử lý:
- Newly added elements
- Dynamically generated HTML
- Modal content
- Table rows

## Testing

### 1. Kiểm tra Console
- Mở DevTools → Console
- Refresh trang
- Xem logs:
  ```
  [CSP Fix] Initializing global event delegation...
  [CSP Fix] Removed X onclick attributes
  [CSP Fix] MutationObserver started
  [CSP Fix] Initialization complete
  ```

### 2. Kiểm tra CSP Errors
- Trước: Nhiều CSP violations trong console
- Sau: Không còn CSP violations

### 3. Kiểm tra Functionality
- Tất cả buttons vẫn hoạt động bình thường
- Modal close buttons work
- Edit/Delete/View buttons work
- Tab switching works

## Troubleshooting

### Vấn đề: Button không hoạt động sau khi thêm CSP fix

**Nguyên nhân**: Function chưa được define khi CSP fix chạy

**Giải pháp**: Đảm bảo function được define TRƯỚC khi load csp-fix.js

### Vấn đề: Lỗi "Function not found"

**Console log**: `[CSP Fix] Function not found: functionName`

**Giải pháp**:
1. Kiểm tra function có trong window scope không
2. Kiểm tra typo trong onclick attribute
3. Đảm bảo script defining function load trước csp-fix.js

### Vấn đề: Dynamically added buttons không work

**Nguyên nhân**: MutationObserver chưa catch được

**Giải pháp**: Thêm data attributes thay vì onclick khi tạo dynamic content:

```javascript
// ❌ Bad (will be caught by observer but not optimal)
row.innerHTML = `<button onclick="view('${id}')">View</button>`;

// ✅ Good (explicit data attributes)
row.innerHTML = `<button class="btn-view" data-id="${id}">View</button>`;
```

## Advanced Usage

### Custom Action Handlers

Thêm custom handlers vào csp-fix.js:

```javascript
// In handleCommonPatterns function
if (element.classList.contains('your-custom-class')) {
    handleYourCustomAction(element, event);
    return;
}
```

### Page-specific Overrides

Nếu trang cần logic đặc biệt, có thể disable csp-fix và implement riêng:

```html
<!-- Don't include csp-fix.js -->
<!-- Implement custom event delegation instead -->
<script>
document.addEventListener('click', function(e) {
    // Your custom logic
});
</script>
```

## Performance

- ✅ Single global event listener (efficient)
- ✅ Event delegation (no memory leaks)
- ✅ MutationObserver (efficient DOM monitoring)
- ✅ No polling or intervals

## Security

- ✅ No eval() for user input
- ✅ No inline JavaScript execution
- ✅ CSP compliant
- ✅ XSS prevention maintained

## Maintenance

Khi thêm trang admin mới:
1. Thêm `<script src="/admin/js/csp-fix.js"></script>` vào cuối
2. Test functionality
3. Check console for errors

## Alternative Approach (Per-Page)

Nếu không muốn dùng global fix, có thể implement per-page như settings.html đã làm:

```javascript
document.addEventListener('DOMContentLoaded', function() {
    // Remove onclick attributes
    document.querySelectorAll('[onclick]').forEach(el => {
        el.removeAttribute('onclick');
    });

    // Add event delegation
    document.addEventListener('click', function(e) {
        // Your page-specific logic
    });
});
```

## Conclusion

CSP fix script cung cấp giải pháp toàn diện cho CSP violations trong admin panel mà không cần modify từng onclick handler một.

Chỉ cần include một script duy nhất vào mỗi trang admin là đủ!
