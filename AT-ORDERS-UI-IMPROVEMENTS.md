# AT Orders Module UI Improvements

## Overview
Improvements to the AT Orders module filter section for better usability and functionality.

**Date:** 17/11/2025
**Module:** `/admin/at-orders`

---

## Changes Made

### 1. Search Icon Removal
**File:** [frontend/admin/at-orders.html:538](frontend/admin/at-orders.html#L538)

**Before:**
```html
<label for="searchKeyword">🔍 Tìm kiếm</label>
```

**After:**
```html
<label for="searchKeyword">Tìm kiếm</label>
```

**Reason:** Removed duplicate search icon to clean up the UI.

---

### 2. Button Alignment Adjustment
**File:** [frontend/admin/at-orders.html:555](frontend/admin/at-orders.html#L555)

**Before:**
```html
<div class="search-actions">
```

**After:**
```html
<div class="search-actions" style="justify-content: flex-end;">
```

**Reason:** Float Reset and Search buttons to the right for better visual balance with the filter fields.

---

### 3. Filter Dropdown Width Adjustments
**File:** [frontend/admin/at-orders.html:626-674](frontend/admin/at-orders.html#L626-L674)

Adjusted widths for better visual consistency:

| Filter | Width | Line |
|--------|-------|------|
| TT Đơn hàng | 220px | 626 |
| TT Đối soát | 220px | 642 |
| Merchant | 240px | 657 |
| UTM Source (NEW) | 220px | 676 |

**Additional Changes:**
- Removed 🔍 icon from merchant search input placeholder (line 666)

**Reason:** Wider filters provide better readability and visual balance. Merchant filter is slightly wider to accommodate longer merchant names.

---

### 4. UTM Source Filter Addition
**New filter dropdown with 2 options:**
- "Tất cả" (All)
- "chatchiu" (Filter orders with utm_source = 'chatchiu')

#### HTML Changes
**File:** [frontend/admin/at-orders.html:676-688](frontend/admin/at-orders.html#L676-L688)

```html
<div class="filter-group" style="width: 180px;">
    <label>UTM Source</label>
    <div class="filter-dropdown">
        <button class="filter-dropdown-btn" id="utmSourceFilterBtn" type="button">
            <span id="utmSourceFilterText">Tất cả</span>
            <span>▼</span>
        </button>
        <div class="filter-dropdown-menu" id="utmSourceFilterMenu">
            <div class="filter-option selected" data-value="">Tất cả</div>
            <div class="filter-option" data-value="chatchiu">chatchiu</div>
        </div>
    </div>
</div>
```

#### JavaScript Changes
**File:** [frontend/admin/at-orders.js](frontend/admin/at-orders.js)

**DOM Elements (lines 52-54):**
```javascript
const utmSourceFilterBtn = document.getElementById('utmSourceFilterBtn');
const utmSourceFilterText = document.getElementById('utmSourceFilterText');
const utmSourceFilterMenu = document.getElementById('utmSourceFilterMenu');
```

**Filter Setup (lines 318-341):**
```javascript
// UTM Source filter dropdown
utmSourceFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    utmSourceFilterMenu.classList.toggle('show');
    statusFilterMenu.classList.remove('show');
    confirmedFilterMenu.classList.remove('show');
    merchantFilterMenu.classList.remove('show');
});

utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(option => {
    option.addEventListener('click', () => {
        const value = option.getAttribute('data-value');
        currentFilters.utmSource = value;
        utmSourceFilterText.textContent = option.textContent;

        // Update selected state
        utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');

        utmSourceFilterMenu.classList.remove('show');
        currentPage = 1;
        loadOrders();
    });
});
```

**Reset Filter (lines 397-399):**
```javascript
utmSourceFilterText.textContent = 'Tất cả';
utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
utmSourceFilterMenu.querySelector('[data-value=""]').classList.add('selected');
```

**Build Filters (lines 426-428):**
```javascript
if (currentFilters.utmSource) {
    filters.utmSource = currentFilters.utmSource;
}
```

**Close on Outside Click (lines 177-179):**
```javascript
if (utmSourceFilterBtn && utmSourceFilterMenu && !utmSourceFilterBtn.contains(e.target)) {
    utmSourceFilterMenu.classList.remove('show');
}
```

**Other Filter Buttons (lines 249, 274, 299):**
Added `utmSourceFilterMenu.classList.remove('show');` to close UTM Source menu when other filters are opened.

#### Backend Changes
**File:** [backend/routes/admin.js:1740-1745](backend/routes/admin.js#L1740-L1745)

```javascript
// UTM Source filter
if (req.query.utmSource) {
  conditions.push(`c.utm_source = $${paramCount}`);
  values.push(req.query.utmSource);
  paramCount++;
}
```

**Reason:** Allow filtering orders by UTM Source to distinguish between traffic sources (e.g., chatchiu vs other sources).

---

## Testing Checklist

### Visual Tests
- [ ] Search button and Reset button are aligned to the right
- [ ] Search label no longer has the 🔍 icon
- [ ] Filter dropdowns (TT Đơn hàng, TT Đối soát, Merchant, UTM Source) have consistent, balanced widths
- [ ] New UTM Source filter appears after Merchant filter

### Functional Tests
- [ ] UTM Source filter dropdown opens/closes correctly
- [ ] Clicking "Tất cả" shows all orders (no utm_source filter)
- [ ] Clicking "chatchiu" filters to only orders with `utm_source = 'chatchiu'`
- [ ] Reset button clears UTM Source filter back to "Tất cả"
- [ ] Opening one filter closes other filters
- [ ] Clicking outside closes all filter dropdowns
- [ ] Pagination resets to page 1 when UTM Source filter changes

### Data Tests
```bash
# Test API directly
curl "http://localhost:3007/api/admin/at-orders?utmSource=chatchiu" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check database for utm_source values
psql $DATABASE_URL -c "
  SELECT utm_source, COUNT(*)
  FROM conversions
  WHERE utm_source IS NOT NULL
  GROUP BY utm_source;
"
```

---

### 5. Tổng Cashback Card Addition
**New statistics card to display total cashback amount**

#### HTML Changes
**File:** [frontend/admin/at-orders.html:562-579](frontend/admin/at-orders.html#L562-L579)

**Before:** 3 cards in stats-row (Tổng đơn hàng, Tổng giá trị, Tổng commission)

**After:** 4 cards with updated grid layout
```html
<div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
    <div class="stat-box">
        <div class="stat-label">Tổng đơn hàng</div>
        <div class="stat-value" id="statTotal">0</div>
    </div>
    <div class="stat-box">
        <div class="stat-label">Tổng giá trị</div>
        <div class="stat-value" id="statTotalValue">0đ</div>
    </div>
    <div class="stat-box">
        <div class="stat-label">Tổng commission</div>
        <div class="stat-value" id="statTotalCommission">0đ</div>
    </div>
    <div class="stat-box">
        <div class="stat-label">Tổng cashback</div>
        <div class="stat-value" id="statTotalCashback">0đ</div>
    </div>
</div>
```

#### JavaScript Changes
**File:** [frontend/admin/at-orders.js](frontend/admin/at-orders.js)

**DOM Element (line 60):**
```javascript
const statTotalCashback = document.getElementById('statTotalCashback');
```

**Update Stats Function (line 608):**
```javascript
statTotalCashback.textContent = formatCurrency(stats.totalCashback || 0);
```

**Backend:** No changes needed - backend already calculates and returns `totalCashback` in stats response ([admin.js:1817](backend/routes/admin.js#L1817), [admin.js:1874](backend/routes/admin.js#L1874))

**Reason:** Provides visibility into total cashback amount calculated for filtered date range, helping track user rewards.

---

## Files Modified

### Frontend
- ✅ [frontend/admin/at-orders.html](frontend/admin/at-orders.html)
  - Line 538: Removed 🔍 icon from search label
  - Line 555: Added `justify-content: flex-end` to search-actions
  - Lines 562-579: Added "Tổng cashback" card and updated grid to 4 columns
  - Lines 626-688: Adjusted filter widths (220px/240px) and added UTM Source filter
  - Line 666: Removed 🔍 icon from merchant search placeholder

- ✅ [frontend/admin/at-orders.js](frontend/admin/at-orders.js)
  - Line 60: Added statTotalCashback DOM element
  - Lines 249, 274, 299, 323: Close UTM Source menu when other filters open
  - Lines 318-341: UTM Source filter event handlers
  - Lines 177-179: Close UTM Source on outside click
  - Lines 397-399: Reset UTM Source filter
  - Lines 426-428: Add UTM Source to filter params
  - Line 608: Update total cashback stat display

### Backend
- ✅ [backend/routes/admin.js](backend/routes/admin.js)
  - Lines 1740-1745: Added UTM Source filter condition in SQL query

---

## User Guide

### How to Use UTM Source Filter

1. **View All Orders:**
   - Select "Tất cả" (default)
   - Shows all orders regardless of utm_source value

2. **View Only Chatchiu Orders:**
   - Select "chatchiu"
   - Shows only orders where `utm_source = 'chatchiu'`
   - Useful for analyzing traffic from Chatchiu platform specifically

3. **Reset Filters:**
   - Click "🔄 Reset" button
   - All filters including UTM Source reset to default

---

## Notes

- The UTM Source filter works with all other filters (Status, Confirmed, Merchant, Date Range, etc.)
- Filters are cumulative (AND logic)
- Backend already stored `utm_source` field, so historical data is available
- No database migration needed

---

**Status:** ✅ Ready for testing
**Commit:** Ready (waiting for user's local testing)
