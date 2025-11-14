# Puzzler Dashboard Style Guide

This document describes how to implement the Puzzler Dashboard styling in your admin pages.

## Overview

The Puzzler Dashboard style features:
- Clean, modern table design with white background
- Soft rounded corners and subtle shadows
- Color-coded status badges
- Minimalist with whitespace
- Product images/icons in circular format

## Color Palette

### Status Badges

| Status | Background | Text Color | Class |
|--------|-----------|-----------|-------|
| Pending | `#FFF4E6` | `#FF9F43` | `.badge-pending` |
| Active | `#E8F5E9` | `#4CAF50` | `.badge-active` |
| Inactive | `#FFEBEE` | `#EF5350` | `.badge-inactive` |
| On Sale | `#E3F2FD` | `#2196F3` | `.badge-onsale` |
| Bouncing | `#F3E5F5` | `#AB47BC` | `.badge-bouncing` |

### Main Colors

- **Background**: White `#FFFFFF`
- **Text Primary**: Dark gray `#2D3748`
- **Text Secondary**: Light gray `#A0AEC0`
- **Border**: Very light gray `#E2E8F0`
- **Blue Accent**: `#3B82F6` (buttons, active page)

## Typography

### Font Family
```css
font-family: 'Inter', sans-serif;
```

### Sizes and Weights

| Element | Size | Weight | Transform |
|---------|------|--------|-----------|
| Table Headers | 12-13px | 500 (Medium) | Uppercase |
| Product Names | 14-15px | 600 (Semibold) | - |
| Product IDs | 13-14px | 400 (Regular) | - |
| Prices | 14px | 600 (Semibold) | - |
| Stock/Type | 13-14px | 400 (Regular) | - |

## Table Structure

### HTML Structure

```html
<!-- Table Controls -->
<div class="table-actions">
    <div style="display: flex; gap: 12px; align-items: center;">
        <div class="showing-dropdown">
            <select id="rowsPerPage">
                <option value="10">Showing 10</option>
                <option value="20">Showing 20</option>
                <option value="50">Showing 50</option>
            </select>
        </div>
        <button class="btn btn-filter">
            <span>🔽</span>
            <span>Filter</span>
        </button>
        <button class="btn btn-export">
            <span>📤</span>
            <span>Export</span>
        </button>
    </div>
    <button class="btn btn-add">
        <span>+</span>
        <span>Add New Product</span>
    </button>
</div>

<!-- Table -->
<div class="table-container">
    <table class="data-table">
        <thead>
            <tr>
                <th class="sortable">Product Name</th>
                <th>Product ID</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Type</th>
                <th>Status</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div class="product-cell">
                        <img src="..." alt="Product" class="product-image">
                        <div class="product-info">
                            <div class="product-name">Product Name</div>
                        </div>
                    </div>
                </td>
                <td class="product-id">#PROD-001</td>
                <td class="price-cell">$99.99</td>
                <td class="stock-cell">100 pcs</td>
                <td class="type-cell">Electronics</td>
                <td><span class="badge badge-active">Active</span></td>
                <td class="action-cell">
                    <span class="action-dots">•••</span>
                </td>
            </tr>
        </tbody>
    </table>
</div>

<!-- Pagination -->
<div class="pagination">
    <div class="rows-per-page">
        <label>Hiển thị:</label>
        <select>
            <option value="10">10</option>
            <option value="20">20</option>
        </select>
    </div>
    <button class="btn">Previous</button>
    <button class="page-number active">01</button>
    <button class="page-number">02</button>
    <button class="page-number">03</button>
    <button class="btn">Next</button>
</div>
```

### Table Specifications

#### Table Headers
- Background: Transparent or very light gray
- Text: Uppercase, 12px, medium weight (500)
- Padding: 16-20px vertical, 16-20px horizontal
- Sortable columns have arrow icon

#### Table Rows
- Height: 72px
- Padding: 16-20px vertical, 16-20px horizontal
- Border bottom: 1px solid `#F7FAFC`
- Hover: Background `#F9FAFB`
- Transition: 0.2s ease

## Cell Styles

### Product Name Cell
```html
<td>
    <div class="product-cell">
        <img src="..." alt="Product" class="product-image">
        <div class="product-info">
            <div class="product-name">Product Name</div>
        </div>
    </div>
</td>
```
- Product image: 40x40px, circular, object-fit cover
- Margin-right: 12px
- Text: Semibold, dark

### Product ID Cell
```html
<td class="product-id">#PROD-001</td>
```
- Monospace font or regular
- Gray color `#718096`
- Hash prefix

### Price Cell
```html
<td class="price-cell">$99.99</td>
```
- Semibold
- Dollar sign prefix
- Dark color

### Stock Cell
```html
<td class="stock-cell">150 pcs</td>
```
- Regular weight
- Unit suffix (pcs, kg, lt)
- Medium gray

### Type Cell
```html
<td class="type-cell">Electronics</td>
```
- Light gray color
- Capitalize first letter

### Status Badge
```html
<td>
    <span class="badge badge-active">Active</span>
    <span class="badge badge-pending">Pending</span>
    <span class="badge badge-inactive">Inactive</span>
    <span class="badge badge-onsale">On Sale</span>
    <span class="badge badge-bouncing">Bouncing</span>
</td>
```
- Padding: 6px 12px
- Border radius: 16-20px (pill shape)
- Font size: 12-13px
- Font weight: Medium (500)
- No border

### Action Cell
```html
<td class="action-cell">
    <span class="action-dots">•••</span>
</td>
```
- Three dots icon (•••)
- Gray color
- Clickable, hover effect
- Size: 32x32px

## Buttons

### Primary Button (Add New)
```html
<button class="btn btn-primary">
    <span>+</span>
    <span>Add New Product</span>
</button>
```
- Blue `#3B82F6`
- White text
- Icon + text
- Border radius: 8px
- Padding: 10px 16px
- Font weight: Medium (500)

### Secondary Buttons (Filter, Export)
```html
<button class="btn btn-secondary">
    <span>🔽</span>
    <span>Filter</span>
</button>
```
- White background
- Gray border
- Gray text
- Border radius: 8px
- Padding: 10px 16px

### Button Hover Effects
- Box shadow: `0 4px 6px rgba(0,0,0,0.1)`
- Transition: 0.2s ease

## Pagination

### Structure
```html
<div class="pagination">
    <div class="rows-per-page">
        <label>Hiển thị:</label>
        <select>
            <option value="10">10</option>
            <option value="20">20</option>
        </select>
    </div>
    <button class="btn">Previous</button>
    <button class="page-number">01</button>
    <button class="page-number active">02</button>
    <button class="page-number">03</button>
    <span class="page-dots">...</span>
    <button class="page-number">10</button>
    <button class="btn">Next</button>
</div>
```

### Styling
- Background: `#F9FAFB` rounded
- Padding: 8px 12px
- Gap: 4-6px between buttons
- Active page: Blue background `#3B82F6`, white text
- Inactive: Gray text, white background
- Hover: Light gray background

## Sidebar

### Specifications
- Width: 240px
- Background: White
- Selected item: Blue background `#3B82F6`, white text, rounded 8px
- Unselected: Dark gray text, transparent background
- Icons: 20x20px, left aligned
- Padding: 12px 16px per item
- Gap: 4-8px between items

### HTML Structure
```html
<nav class="nav">
    <a href="/admin" class="nav-item active">
        <span class="nav-icon">📊</span>
        <span class="nav-text">Dashboard</span>
    </a>
    <a href="/admin/users" class="nav-item">
        <span class="nav-icon">👥</span>
        <span class="nav-text">Users</span>
    </a>
</nav>
```

## Dropdown

### Structure
```html
<div class="showing-dropdown">
    <select id="rowsPerPage">
        <option value="10">Showing 10</option>
        <option value="20">Showing 20</option>
    </select>
</div>
```

### Styling
- Light gray background `#F7FAFC`
- Border radius: 6px
- Padding: 8px 12px
- Down arrow icon right side

## Search Bar

### Structure
```html
<div class="search-box">
    <input type="text" placeholder="Search...">
</div>
```

### Styling
- Light gray background `#F7FAFC`
- Border radius: 8px
- Padding: 10px 16px 10px 40px
- Search icon: 🔍 left side (40px from left)
- Placeholder: Gray

## Shadows

- **Main container**: `0 1px 3px rgba(0,0,0,0.1)`
- **Buttons hover**: `0 4px 6px rgba(0,0,0,0.1)`
- **Dropdown**: `0 2px 8px rgba(0,0,0,0.15)`

## Responsive Behavior

### Mobile
- Table has horizontal scroll
- Sticky header when scroll
- Fixed sidebar (can collapse)
- Minimum table width: 900px

### Media Queries
```css
@media (max-width: 768px) {
    .table-container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }

    .data-table {
        min-width: 900px;
    }
}
```

## Loading States

### Skeleton Loaders
```html
<tr class="skeleton-row">
    <td><div class="skeleton skeleton-text"></div></td>
    <td><div class="skeleton skeleton-text"></div></td>
    <td><div class="skeleton skeleton-badge"></div></td>
</tr>
```

### Classes
- `.skeleton` - Base skeleton style
- `.skeleton-text` - For text content
- `.skeleton-badge` - For badge-shaped content
- `.skeleton-avatar` - For circular avatars

## Examples

See `example-table.html` for a complete working example of the Puzzler Dashboard table styling.

## Migration Guide

To migrate existing tables to Puzzler Dashboard style:

1. Update table header classes to remove gradient backgrounds
2. Add proper cell classes (`.product-cell`, `.price-cell`, etc.)
3. Update status badges to use new color scheme
4. Add table controls section above table
5. Update pagination to new pill-style design
6. Ensure product images are circular (40x40px)
7. Update sidebar to white background with blue active state

## CSS Variables

All colors and spacing are defined as CSS variables in `:root`:

```css
:root {
    --text-primary: #2D3748;
    --text-secondary: #A0AEC0;
    --border-color: #E2E8F0;
    --color-blue: #3B82F6;
    --status-pending-bg: #FFF4E6;
    --status-pending-text: #FF9F43;
    /* ... and more */
}
```

You can customize the theme by overriding these variables.
