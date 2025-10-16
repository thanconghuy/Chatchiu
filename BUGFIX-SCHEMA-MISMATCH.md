# Bug Fix: Schema Mismatch Issues

## Issue
Error khi chạy `matchConversionWithClick()`:
```
column cl.product_url does not exist
```

## Root Cause
Các model (Conversion.js và Click.js) đang reference các columns không tồn tại trong database schema:
- `product_url` - không có trong clicks table
- `user_cashback` - đã đổi thành `cashback_amount`
- `order_id` - đã đổi thành `order_code`
- `order_value` - đã đổi thành `order_amount`
- `ordered_at` - đã đổi thành `order_time`

Ngoài ra, các JOIN queries đang sử dụng `c.aff_sid = co.aff_sid` thay vì `c.id = co.click_id` (không chính xác).

## Changes Made

### 1. Fixed Conversion.js
**File:** `backend/models/Conversion.js`

- Line 120: Changed `cl.product_url` → `cl.original_url`
- Line 181: Changed `cl.product_url` → `cl.original_url`

### 2. Fixed Click.js
**File:** `backend/models/Click.js`

**getUserClicks() method:**
- Line 167: Changed `co.user_cashback` → `co.cashback_amount`
- Line 170: Changed `LEFT JOIN conversions co ON c.aff_sid = co.aff_sid` → `LEFT JOIN conversions co ON c.id = co.click_id`

**getConvertedClicks() method:**
- Line 193-197: Changed old field names to new ones:
  - `co.order_id` → `co.order_code`
  - `co.order_value` → `co.order_amount`
  - `co.user_cashback` → `co.cashback_amount`
  - `co.ordered_at` → `co.order_time`
- Line 199: Changed `INNER JOIN conversions co ON c.aff_sid = co.aff_sid` → `INNER JOIN conversions co ON c.id = co.click_id`
- Line 202: Changed `ORDER BY co.ordered_at DESC` → `ORDER BY co.order_time DESC`

**getStats() method:**
- Line 223: Changed `SUM(co.user_cashback)` → `SUM(co.cashback_amount)`
- Line 225: Changed `LEFT JOIN conversions co ON c.aff_sid = co.aff_sid` → `LEFT JOIN conversions co ON c.id = co.click_id`

## Key Changes Summary

### Column Name Updates
| Old Name | New Name |
|----------|----------|
| product_url | original_url |
| user_cashback | cashback_amount |
| order_id | order_code |
| order_value | order_amount |
| ordered_at | order_time |

### JOIN Strategy Update
**Old (Incorrect):**
```sql
LEFT JOIN conversions co ON c.aff_sid = co.aff_sid
```

**New (Correct):**
```sql
LEFT JOIN conversions co ON c.id = co.click_id
```

**Reason:**
- `aff_sid` is not a reliable FK because multiple conversions can have the same aff_sid
- `click_id` is the proper foreign key that directly links conversions to clicks
- This ensures accurate 1-to-1 relationship between clicks and conversions

## Testing
After these changes:
- ✅ `matchConversionWithClick()` should work without errors
- ✅ All Click model queries should use correct column names
- ✅ All Conversion model queries should use correct column names
- ✅ JOINs will use proper foreign key relationships

## Impact
- No breaking changes for API consumers
- Internal queries now match actual database schema
- More accurate click-to-conversion tracking
- Better performance with proper FK relationships

---

**Fixed by:** Claude Code
**Date:** 2025-10-16
**Related to:** UTM tracking improvements
