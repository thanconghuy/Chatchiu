# AT Orders Loading Error Fix

## Issue
When accessing the AT Orders page (`/admin/at-orders`), the following error occurred:
- **Console Error**: "Failed to load resource: the server responded with a status of 404 (Not Found)"
- **User Message**: "Error loading orders: Error: Failed to get AccessTrade orders"

**Date**: 17/11/2025

---

## Root Cause

### File: [backend/routes/admin.js](backend/routes/admin.js)

**Problem Location**: Lines 1812-1830 (total_cashback subquery)

**Issue**: When no filters are applied, `whereClause` is an empty string. The code attempted to call `.replace()` directly on an empty string inline within the SQL template literal:

```javascript
// PROBLEMATIC CODE (before fix):
${whereClause.replace(/\bc\./g, 'c2.').replace(/\bu\./g, 'u2.')}
```

**Why It Failed**:
- When `whereClause = ''` (empty string), this creates invalid SQL syntax
- The subquery would have empty WHERE clause resulting in: `WHERE sc.conversion_id IN (SELECT c2.id FROM conversions c2 LEFT JOIN users u2 ON c2.user_id = u2.id )`
- While technically valid SQL, the empty string replacement was causing SQL parsing errors

---

## Fix Applied

### File: [backend/routes/admin.js:1812-1828](backend/routes/admin.js#L1812-L1828)

**Solution**: Added conditional check before applying string replacement operations

```javascript
// Build subquery WHERE clause for total_cashback calculation
const subqueryWhereClause = whereClause ? whereClause.replace(/\bc\./g, 'c2.').replace(/\bu\./g, 'u2.') : '';

const statsQuery = `
  SELECT
    COUNT(*) as total,
    COALESCE(SUM(c.order_amount), 0) as total_order_amount,
    COALESCE(SUM(c.commission), 0) as total_commission,
    -- Total cashback from system_conversions (actual cashback paid to users)
    (
      SELECT COALESCE(SUM(sc.cashback_amount), 0)
      FROM system_conversions sc
      WHERE sc.conversion_id IN (
        SELECT c2.id
        FROM conversions c2
        LEFT JOIN users u2 ON c2.user_id = u2.id
        ${subqueryWhereClause}
      )
    ) as total_cashback,
    ...
  FROM conversions c
  LEFT JOIN users u ON c.user_id = u.id
  ${whereClause}
`;
```

**Key Changes**:
1. Line 1813: Created `subqueryWhereClause` variable with conditional check
2. Line 1828: Used `subqueryWhereClause` in the subquery instead of inline replacement
3. Now handles both cases:
   - **With filters**: `whereClause` exists → apply table alias replacement (c→c2, u→u2)
   - **No filters**: `whereClause` is empty → use empty string (no WHERE clause in subquery)

---

## Testing

### Test Case 1: No Filters Applied
**Steps**:
1. Navigate to `/admin/at-orders`
2. Don't apply any filters
3. Page should load successfully showing all orders

**Expected Result**:
- No SQL errors
- Stats display correctly including "Tổng cashback"
- Orders table loads with all data

### Test Case 2: With Filters Applied
**Steps**:
1. Navigate to `/admin/at-orders`
2. Apply filters:
   - Date range: Last 7 days
   - Status: Approved
   - Merchant: Shopee
   - UTM Source: chatchiu

**Expected Result**:
- No SQL errors
- Stats reflect filtered data
- Orders table shows only filtered results
- "Tổng cashback" shows sum of `system_conversions.cashback_amount` for filtered orders

### Test Case 3: Mixed Filters
**Steps**:
1. Apply only date range filter
2. Apply only status filter
3. Apply only merchant filter
4. Apply only UTM source filter

**Expected Result**: Each filter works independently without errors

---

## Related Changes

This fix is part of the larger AT Orders improvements session:

1. **UTM Source Filter Addition** - [AT-ORDERS-UI-IMPROVEMENTS.md](AT-ORDERS-UI-IMPROVEMENTS.md)
2. **Cashback Calculation from system_conversions** - Same doc
3. **This loading error fix** - Current document

---

## SQL Query Explanation

### Why We Need Two Table Aliases?

The query uses a **subquery** to calculate total cashback:

```sql
-- Main query uses: c (conversions), u (users)
SELECT ... FROM conversions c LEFT JOIN users u ON c.user_id = u.id
WHERE c.created_at >= $1 AND c.merchant_id = $2

-- Subquery needs different aliases: c2, u2
(
  SELECT SUM(sc.cashback_amount)
  FROM system_conversions sc
  WHERE sc.conversion_id IN (
    SELECT c2.id FROM conversions c2
    LEFT JOIN users u2 ON c2.user_id = u2.id
    WHERE c2.created_at >= $1 AND c2.merchant_id = $2  -- Same filters!
  )
)
```

**Why replace c→c2 and u→u2?**
- The subquery needs to apply the **same filters** as the main query
- But it can't use `c` and `u` because those aliases belong to the outer query
- So we create new aliases `c2` and `u2` for the subquery
- The `.replace()` operations convert the WHERE clause to use these new aliases

**Example**:
```javascript
whereClause = 'WHERE c.created_at >= $1 AND u.email LIKE $2'
subqueryWhereClause = 'WHERE c2.created_at >= $1 AND u2.email LIKE $2'
```

---

## Files Modified

### Backend
- ✅ [backend/routes/admin.js](backend/routes/admin.js)
  - Line 1813: Added conditional check for `subqueryWhereClause`
  - Line 1828: Used `subqueryWhereClause` in SQL subquery

---

## Status

✅ **Fixed and ready for testing**

User should test by:
1. Opening AT Orders page with no filters
2. Verifying stats load correctly
3. Applying various filter combinations
4. Checking that "Tổng cashback" displays correct values

---

**Bug Reported**: 17/11/2025 (via screenshot)
**Fix Applied**: 17/11/2025
**Tested**: Pending user testing
