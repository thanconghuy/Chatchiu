# System Reconciliation - Table Design

## Phân Tích Từ Hình Ảnh Mẫu

### Cấu Trúc Table Mẫu (AccessTrade):
```
┌─────────────────┬──────────────────┬─────────────┬─────────────┬──────────┬───────────┬──────────┐
│ Tháng phát sinh │ Hoa hồng phát sinh│ Được duyệt  │ Tạm duyệt   │ Bị hủy   │ Chờ xử lý │ Thao tác │
├─────────────────┼──────────────────┼─────────────┼─────────────┼──────────┼───────────┼──────────┤
│ 12-2025         │ 596,682          │ 0           │ 149,669     │ 42,000   │ 405,013   │ Xem...   │
│ 11-2025         │ 4,581,324        │ 0           │ 3,793,121   │ 265,489  │ 502,714   │ Xem...   │
└─────────────────┴──────────────────┴─────────────┴─────────────┴──────────┴───────────┴──────────┘
```

## Thiết Kế Table Cho System Reconciliation

### Table Columns:

| # | Column | Width | Description | Data Source |
|---|--------|-------|-------------|-------------|
| 1 | **Kỳ Đối Soát** | 150px | Period label (Tháng X/YYYY) | `period_label` |
| 2 | **Ngày Tạo** | 120px | Created date | `created_at` |
| 3 | **Tổng Đơn Hàng** | 100px | Total orders count | `total_orders` |
| 4 | **Tổng Cashback** | 150px | Total cashback amount (VND) | `total_cashback` |
| 5 | **Risk Amount** | 150px | Risk orders cashback (VND) | `risk_cashback` |
| 6 | **Trạng Thái** | 120px | Status badge | `status` |
| 7 | **Người Tạo** | 120px | Created by | `created_by` |
| 8 | **Thao Tác** | 200px | Action buttons | - |

### Column Details:

#### 1. Kỳ Đối Soát
```
Tháng 10/2025
(01/10 - 31/10)
```
- Period label
- Date range subtitle

#### 2. Ngày Tạo
```
07/12/2025
14:30
```
- Date
- Time

#### 3. Tổng Đơn Hàng
```
156 đơn
```
- Bold number
- "đơn" text

#### 4. Tổng Cashback
```
12,345,678 đ
```
- Green color
- VND format

#### 5. Risk Amount
```
1,234,567 đ
```
- Orange/Red color if > 0
- Gray if 0

#### 6. Trạng Thái
```
[Nháp]      - Yellow badge
[Đã Duyệt]  - Blue badge
[Đã Trả]    - Green badge
[Đã Hủy]    - Red badge
```

#### 7. Người Tạo
```
Admin
Auto-Sync
```

#### 8. Thao Tác
```
[Xem Chi Tiết] [Duyệt] [Xóa]
```
- View details button
- Finalize button (if draft)
- Delete button (if draft)

## CSS Design

### Color Scheme:
- **Header Background**: `#f8f9fa`
- **Header Text**: `#2c3e50`
- **Border**: `#e0e0e0`
- **Row Hover**: `#f8f9fa`
- **Stripe**: Alternating white and `#fafbfc`

### Typography:
- **Header**: 14px, Bold, #2c3e50
- **Body Text**: 14px, Regular, #333
- **Numbers**: 15px, Semi-Bold
- **Status Badge**: 12px, Bold

### Table Structure:
```css
.reconciliation-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.reconciliation-table thead {
  background: #f8f9fa;
  border-bottom: 2px solid #e0e0e0;
}

.reconciliation-table th {
  padding: 16px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
}

.reconciliation-table td {
  padding: 16px 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.reconciliation-table tbody tr:hover {
  background: #f8f9fa;
}

.reconciliation-table tbody tr:nth-child(even) {
  background: #fafbfc;
}
```

## HTML Structure

```html
<div class="reconciliation-table-container">
  <table class="reconciliation-table">
    <thead>
      <tr>
        <th>Kỳ Đối Soát</th>
        <th>Ngày Tạo</th>
        <th class="text-center">Tổng Đơn Hàng</th>
        <th class="text-right">Tổng Cashback</th>
        <th class="text-right">Risk Amount</th>
        <th class="text-center">Trạng Thái</th>
        <th>Người Tạo</th>
        <th class="text-center">Thao Tác</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="period-label">Tháng 10/2025</div>
          <div class="period-date">01/10 - 31/10</div>
        </td>
        <td>
          <div class="created-date">07/12/2025</div>
          <div class="created-time">14:30</div>
        </td>
        <td class="text-center">
          <strong>156</strong> đơn
        </td>
        <td class="text-right money-positive">
          12,345,678 đ
        </td>
        <td class="text-right money-risk">
          1,234,567 đ
        </td>
        <td class="text-center">
          <span class="status-badge status-draft">Nháp</span>
        </td>
        <td>Admin</td>
        <td class="text-center">
          <div class="action-buttons">
            <button class="btn-view">Xem</button>
            <button class="btn-finalize">Duyệt</button>
            <button class="btn-delete">Xóa</button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

## Pagination

```html
<div class="table-pagination">
  <div class="pagination-info">
    Hiển thị <strong>1-10</strong> trong tổng <strong>25</strong> kỳ đối soát
  </div>
  <div class="pagination-controls">
    <button class="btn-prev" disabled>« Trước</button>
    <span class="page-numbers">
      <button class="page-btn active">1</button>
      <button class="page-btn">2</button>
      <button class="page-btn">3</button>
    </span>
    <button class="btn-next">Sau »</button>
  </div>
</div>
```

## Responsive Design

### Desktop (>= 1200px):
- Full table with all columns

### Tablet (768px - 1199px):
- Hide "Người Tạo" column
- Compress action buttons

### Mobile (< 768px):
- Convert to card layout
- Stack information vertically

## Summary Statistics (Top of Page)

```html
<div class="stats-summary">
  <div class="stat-card">
    <div class="stat-icon">📊</div>
    <div class="stat-content">
      <div class="stat-label">Tổng Kỳ Đối Soát</div>
      <div class="stat-value">25</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">📝</div>
    <div class="stat-content">
      <div class="stat-label">Chờ Phê Duyệt</div>
      <div class="stat-value">3</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">✅</div>
    <div class="stat-content">
      <div class="stat-label">Đã Phê Duyệt</div>
      <div class="stat-value">18</div>
    </div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">💰</div>
    <div class="stat-content">
      <div class="stat-label">Tổng Cashback</div>
      <div class="stat-value money">125,456,789 đ</div>
    </div>
  </div>
</div>
```

## Filters & Search

```html
<div class="table-filters">
  <div class="search-box">
    <input type="text" placeholder="Tìm kiếm kỳ đối soát...">
  </div>
  <div class="filter-group">
    <select id="statusFilter">
      <option value="">Tất cả trạng thái</option>
      <option value="draft">Nháp</option>
      <option value="finalized">Đã Duyệt</option>
      <option value="paid">Đã Trả</option>
    </select>
    <select id="monthFilter">
      <option value="">Tất cả tháng</option>
      <option value="2025-12">Tháng 12/2025</option>
      <option value="2025-11">Tháng 11/2025</option>
    </select>
  </div>
  <button class="btn-create-new">
    <i class="fas fa-plus"></i> Tạo Kỳ Đối Soát Mới
  </button>
</div>
```

## Implementation Priority

1. ✅ Convert card layout to table layout
2. ✅ Add summary statistics
3. ✅ Add filters and search
4. ✅ Implement pagination
5. ✅ Add responsive design
6. ✅ Update JavaScript to render table rows

---

**Next Step:** Implement table layout in `system-reconciliation.html`
