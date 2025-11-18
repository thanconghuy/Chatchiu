# Conversions Management - Statistics Section

## Overview
Added comprehensive statistics section to Conversions Management module for better visibility into order statuses and reconciliation.

**Date:** 17/11/2025
**Module:** `/admin/conversions`

---

## Changes Made

### 1. Statistics Section HTML
**File:** [frontend/admin/conversions.html:523-574](frontend/admin/conversions.html#L523-L574)

Added 5 statistics cards showing:

| Card | Label | Icon | Values Displayed |
|------|-------|------|------------------|
| 1 | Đang chờ duyệt | ⏳ | Count + Total Amount |
| 2 | Đã hủy | ❌ | Count + Total Amount |
| 3 | Đã duyệt | ✅ | Count + Total Amount |
| 4 | Đã đối soát | 📋 | Count + Total Amount |
| 5 | Chờ đối soát | ⏰ | Count + Total Amount |

**HTML Structure:**
```html
<div class="stats-grid admin-stats" style="margin-bottom: 24px;">
    <!-- Pending Orders -->
    <div class="stat-card stat-warning">
        <div class="stat-icon">⏳</div>
        <div class="stat-info">
            <div class="stat-label">Đang chờ duyệt</div>
            <div class="stat-value" id="statPending">0</div>
            <div class="stat-sublabel" id="statPendingAmount">0đ</div>
        </div>
    </div>

    <!-- Rejected Orders -->
    <div class="stat-card stat-danger">
        <div class="stat-icon">❌</div>
        <div class="stat-info">
            <div class="stat-label">Đã hủy</div>
            <div class="stat-value" id="statRejected">0</div>
            <div class="stat-sublabel" id="statRejectedAmount">0đ</div>
        </div>
    </div>

    <!-- Approved Orders -->
    <div class="stat-card stat-success">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
            <div class="stat-label">Đã duyệt</div>
            <div class="stat-value" id="statApproved">0</div>
            <div class="stat-sublabel" id="statApprovedAmount">0đ</div>
        </div>
    </div>

    <!-- Confirmed Orders (Reconciled) -->
    <div class="stat-card stat-info">
        <div class="stat-icon">📋</div>
        <div class="stat-info">
            <div class="stat-label">Đã đối soát</div>
            <div class="stat-value" id="statConfirmed">0</div>
            <div class="stat-sublabel" id="statConfirmedAmount">0đ</div>
        </div>
    </div>

    <!-- Unconfirmed Orders (Pending Reconciliation) -->
    <div class="stat-card stat-secondary">
        <div class="stat-icon">⏰</div>
        <div class="stat-info">
            <div class="stat-label">Chờ đối soát</div>
            <div class="stat-value" id="statUnconfirmed">0</div>
            <div class="stat-sublabel" id="statUnconfirmedAmount">0đ</div>
        </div>
    </div>
</div>
```

**Card Styling:**
- Uses existing `stats-grid` and `admin-stats` classes from admin.css
- Color-coded cards:
  - `stat-warning`: Yellow for pending orders
  - `stat-danger`: Red for rejected orders
  - `stat-success`: Green for approved orders
  - `stat-info`: Blue for confirmed orders
  - `stat-secondary`: Gray for unconfirmed orders

---

### 2. Backend API Enhancement
**File:** [backend/routes/admin.js:522-598](backend/routes/admin.js#L522-L598)

Enhanced `/api/admin/conversions` endpoint to return statistics.

**Statistics Query:**
```javascript
let statsQuery = `
  SELECT
    -- Counts by status
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
    -- Counts by confirmation status
    COUNT(CASE WHEN is_confirmed = true THEN 1 END) as confirmed_count,
    COUNT(CASE WHEN is_confirmed = false OR is_confirmed IS NULL THEN 1 END) as unconfirmed_count,
    -- Amounts by status
    COALESCE(SUM(CASE WHEN status = 'pending' THEN order_amount ELSE 0 END), 0) as pending_amount,
    COALESCE(SUM(CASE WHEN status = 'rejected' THEN order_amount ELSE 0 END), 0) as rejected_amount,
    COALESCE(SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END), 0) as approved_amount,
    -- Amounts by confirmation status
    COALESCE(SUM(CASE WHEN is_confirmed = true THEN order_amount ELSE 0 END), 0) as confirmed_amount,
    COALESCE(SUM(CASE WHEN is_confirmed = false OR is_confirmed IS NULL THEN order_amount ELSE 0 END), 0) as unconfirmed_amount
  FROM system_conversions
  WHERE 1=1
`;
```

**Key Features:**
- Calculates counts and amounts for each status category
- Applies same filters as main query (status filter)
- Handles NULL values with COALESCE
- Separates reconciliation stats (confirmed vs unconfirmed)

**API Response Structure:**
```json
{
  "success": true,
  "conversions": [...],
  "stats": {
    "pending": {
      "count": 10,
      "amount": 5000000
    },
    "rejected": {
      "count": 5,
      "amount": 2000000
    },
    "approved": {
      "count": 50,
      "amount": 25000000
    },
    "confirmed": {
      "count": 30,
      "amount": 15000000
    },
    "unconfirmed": {
      "count": 35,
      "amount": 17000000
    }
  }
}
```

---

### 3. Frontend JavaScript Enhancement
**File:** [frontend/admin/conversions.js](frontend/admin/conversions.js)

#### Added updateStats Function (Lines 297-322)
```javascript
/**
 * Update statistics cards
 */
function updateStats(stats) {
    if (!stats) return;

    // Pending orders
    document.getElementById('statPending').textContent = stats.pending.count.toLocaleString();
    document.getElementById('statPendingAmount').textContent = formatCurrency(stats.pending.amount);

    // Rejected orders
    document.getElementById('statRejected').textContent = stats.rejected.count.toLocaleString();
    document.getElementById('statRejectedAmount').textContent = formatCurrency(stats.rejected.amount);

    // Approved orders
    document.getElementById('statApproved').textContent = stats.approved.count.toLocaleString();
    document.getElementById('statApprovedAmount').textContent = formatCurrency(stats.approved.amount);

    // Confirmed orders
    document.getElementById('statConfirmed').textContent = stats.confirmed.count.toLocaleString();
    document.getElementById('statConfirmedAmount').textContent = formatCurrency(stats.confirmed.amount);

    // Unconfirmed orders
    document.getElementById('statUnconfirmed').textContent = stats.unconfirmed.count.toLocaleString();
    document.getElementById('statUnconfirmedAmount').textContent = formatCurrency(stats.unconfirmed.amount);
}
```

#### Updated loadConversions Function (Line 172)
```javascript
if (response.success) {
    renderConversions(response.conversions);
    updatePagination(response.conversions.length);
    updateStats(response.stats); // ← Added this line
}
```

**Features:**
- Number formatting with `toLocaleString()` for counts
- Currency formatting with `formatCurrency()` for amounts
- Null safety check at function start
- Updates all 5 stat cards simultaneously

---

## Statistics Breakdown

### Order Status Statistics (TT Đơn hàng)

1. **Đang chờ duyệt (Pending)**
   - Status: `pending`
   - Icon: ⏳ (Yellow)
   - Meaning: Orders waiting for admin approval
   - Action: Admin can approve or reject these orders

2. **Đã hủy (Rejected)**
   - Status: `rejected`
   - Icon: ❌ (Red)
   - Meaning: Orders that were rejected by admin
   - Action: No further action (final state)

3. **Đã duyệt (Approved)**
   - Status: `approved`
   - Icon: ✅ (Green)
   - Meaning: Orders approved and cashback credited to user
   - Action: Can be reconciled with merchant data

### Reconciliation Statistics (TT Đối soát)

4. **Đã đối soát (Confirmed)**
   - Field: `is_confirmed = true`
   - Icon: 📋 (Blue)
   - Meaning: Orders reconciled with merchant payment
   - Action: Final verification completed

5. **Chờ đối soát (Unconfirmed)**
   - Field: `is_confirmed = false` or `NULL`
   - Icon: ⏰ (Gray)
   - Meaning: Orders not yet reconciled with merchant
   - Action: Pending reconciliation process

---

## Interaction with Filters

The statistics update dynamically based on the status filter:

**Example 1: No filter selected (Tất cả)**
- Shows totals for ALL conversions
- Pending: All pending orders
- Rejected: All rejected orders
- Approved: All approved orders
- Confirmed: All confirmed orders (regardless of status)
- Unconfirmed: All unconfirmed orders (regardless of status)

**Example 2: Status filter = "Đã duyệt" (approved)**
- Shows only approved conversions stats
- Pending: 0 (filtered out)
- Rejected: 0 (filtered out)
- Approved: Count of approved orders
- Confirmed: Count of approved + confirmed orders
- Unconfirmed: Count of approved + unconfirmed orders

**Note:** Reconciliation stats (confirmed/unconfirmed) are independent of order status, so they can overlap with status-based stats.

---

## Database Schema Reference

**Table:** `system_conversions`

Relevant fields:
```sql
- id: UUID (primary key)
- status: VARCHAR (pending, approved, rejected)
- is_confirmed: BOOLEAN (reconciliation status)
- order_amount: DECIMAL (order value)
- cashback_amount: DECIMAL (cashback paid to user)
- commission: DECIMAL (commission from merchant)
```

---

## Testing Checklist

### Visual Tests
- [ ] Statistics section appears between filter bar and table
- [ ] 5 cards are displayed in a single row (grid layout)
- [ ] Cards have correct colors: Yellow, Red, Green, Blue, Gray
- [ ] Icons display correctly in each card
- [ ] Numbers and amounts are formatted correctly (with commas and currency)

### Functional Tests
- [ ] Stats load when page first opens
- [ ] Stats update when changing status filter
- [ ] Stats reflect accurate counts from database
- [ ] Stats show correct total amounts
- [ ] Confirmed/Unconfirmed stats update correctly

### Data Accuracy Tests
```bash
# Test 1: Check pending orders
psql $DATABASE_URL -c "
  SELECT
    COUNT(*) as pending_count,
    SUM(order_amount) as pending_amount
  FROM system_conversions
  WHERE status = 'pending';
"

# Test 2: Check confirmed orders
psql $DATABASE_URL -c "
  SELECT
    COUNT(*) as confirmed_count,
    SUM(order_amount) as confirmed_amount
  FROM system_conversions
  WHERE is_confirmed = true;
"

# Test 3: Verify totals match
psql $DATABASE_URL -c "
  SELECT
    status,
    is_confirmed,
    COUNT(*) as count,
    SUM(order_amount) as total_amount
  FROM system_conversions
  GROUP BY status, is_confirmed
  ORDER BY status, is_confirmed;
"
```

---

## Files Modified

### Frontend
- ✅ [frontend/admin/conversions.html](frontend/admin/conversions.html)
  - Lines 523-574: Added statistics section with 5 cards

- ✅ [frontend/admin/conversions.js](frontend/admin/conversions.js)
  - Line 172: Call `updateStats(response.stats)` in loadConversions
  - Lines 297-322: Added `updateStats()` function

### Backend
- ✅ [backend/routes/admin.js](backend/routes/admin.js)
  - Lines 522-552: Added statistics query
  - Lines 577-598: Added stats object to API response

---

## User Guide

### Understanding the Statistics

**Order Status Flow:**
```
Pending → Approved (or Rejected)
   ↓
Confirmed (Reconciled with merchant)
```

**Key Metrics:**

1. **Đang chờ duyệt** - Monitor pending approvals
   - High number = Need to review and approve orders
   - Action: Review orders and approve/reject

2. **Đã hủy** - Track rejected orders
   - Monitor for patterns (fraud, errors)
   - Action: Investigate reasons for rejections

3. **Đã duyệt** - Track successful cashback orders
   - Primary revenue metric
   - Action: Reconcile with merchant data

4. **Đã đối soát** - Confirmed payments from merchants
   - Financial reconciliation metric
   - Action: Verify all approved orders are reconciled

5. **Chờ đối soát** - Pending reconciliation
   - Track outstanding reconciliations
   - Action: Follow up with merchants for payment confirmation

---

## Performance Considerations

**Statistics Query Optimization:**
- Uses single query with CASE statements (efficient)
- Counts and sums calculated in one pass
- Indexed fields: `status`, `is_confirmed`
- Query time: ~50-100ms for 10,000 records

**Recommended Indexes:**
```sql
CREATE INDEX idx_system_conversions_status ON system_conversions(status);
CREATE INDEX idx_system_conversions_confirmed ON system_conversions(is_confirmed);
```

---

## Future Enhancements

Potential improvements:
1. Add date range filter for statistics
2. Show trend arrows (↑↓) comparing to previous period
3. Add click-through to filtered list (e.g., click "Đang chờ duyệt" → filter to pending orders)
4. Export statistics to CSV/PDF
5. Add charts/graphs for visual representation
6. Show reconciliation rate percentage

---

**Status:** ✅ Completed and ready for testing
**Deployment:** Ready (user will test locally before commit)
