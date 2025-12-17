# Fix: Lỗi Column "is_confirmed" Không Tồn Tại

## Vấn Đề

**Hiện tượng:**
Khi sync conversion từ AccessTrade (click nút "Cập nhật trạng thái"), server trả về lỗi 500:

```
Error: column "is_confirmed" of relation "system_conversions" does not exist
```

**Console Error:**
```
[API Request Error] Object
  endpoint: "/admin/conversion/04b2140d-76c7-4f64-89a8-b2809cceba48/sync-from-at"
  error: "column \"is_confirmed\" of relation \"system_conversions\" does not exist"
```

## Nguyên Nhân

Code trong `backend/routes/admin.js` (endpoint `PUT /api/admin/conversion/:id/sync-from-at`) đang cố gắng UPDATE các columns không tồn tại trong bảng `system_conversions`:

**Code lỗi (dòng 1313-1321):**
```javascript
// Update is_confirmed if changed
if (newIsConfirmed !== undefined && newIsConfirmed !== oldIsConfirmed) {
  const confirmedTime = newIsConfirmed ? new Date() : null;
  await pool.query(
    'UPDATE system_conversions SET is_confirmed = $1, confirmed_time = $2 WHERE id = $3',
    [newIsConfirmed, confirmedTime, id]
  );
  logger.info(`Updated order ${conversion.at_conversion_id} confirmation: ${oldIsConfirmed} → ${newIsConfirmed}`);
}
```

**Vấn đề:**
- Columns `is_confirmed` và `confirmed_time` không được tạo trong database migrations
- Không có migration nào add các columns này vào `system_conversions`
- Code frontend không sử dụng hoặc hiển thị giá trị `is_confirmed`

## Giải Pháp

### Option 1: Xóa Code Liên Quan (Đã Chọn) ✅

Xóa hoàn toàn logic `is_confirmed` vì:
1. Column không tồn tại trong database
2. Frontend không sử dụng giá trị này
3. Không có business requirement cho field này

**Code sau khi sửa:**

```javascript
router.put('/conversion/:id/sync-from-at', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus } = req.body; // ✅ Removed newIsConfirmed

    const query = `SELECT * FROM system_conversions WHERE id = $1`;
    const result = await pool.query(query, [id]);
    const conversion = result.rows[0];

    if (!conversion) {
      return res.status(404).json({
        success: false,
        message: 'Conversion not found'
      });
    }

    const oldStatus = conversion.status;
    // ✅ Removed oldIsConfirmed
    let balanceUpdated = false;

    // Update status if changed
    if (newStatus && newStatus !== oldStatus) {
      const approvalTime = newStatus === 'approved' ? new Date() : null;

      await pool.query(
        'UPDATE system_conversions SET status = $1, approval_time = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, approvalTime, id]
      );

      // Update user balance if needed
      if (oldStatus === 'pending' && newStatus === 'approved') {
        await User.updateBalance(conversion.user_id, 'pending_to_available', conversion.cashback_amount);
        balanceUpdated = true;
      } else if (oldStatus === 'pending' && newStatus === 'rejected') {
        await User.updateBalance(conversion.user_id, 'reject_pending', conversion.cashback_amount);
        balanceUpdated = true;
      }

      logger.info(`Updated order ${conversion.at_conversion_id}: ${oldStatus} → ${newStatus}`);
    }

    // ✅ Removed is_confirmed update logic

    res.json({
      success: true,
      message: 'Conversion updated successfully',
      updated: {
        status: newStatus !== oldStatus,
        // ✅ Removed isConfirmed from response
        balanceUpdated
      },
      changes: {
        status: newStatus !== oldStatus ? { old: oldStatus, new: newStatus } : null
        // ✅ Removed isConfirmed from changes
      }
    });
  } catch (error) {
    console.error('Sync from AT error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync conversion'
    });
  }
});
```

**Thay đổi:**
1. ✅ Removed `newIsConfirmed` from destructuring
2. ✅ Removed `oldIsConfirmed` variable
3. ✅ Removed entire `is_confirmed` update block
4. ✅ Removed `isConfirmed` from response object
5. ✅ Added `updated_at = NOW()` to status update query

### Option 2: Tạo Migration (Không Chọn) ❌

Nếu muốn giữ lại field `is_confirmed`, cần tạo migration:

```sql
-- Migration: Add is_confirmed to system_conversions
ALTER TABLE system_conversions
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmed_time TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_system_conversions_confirmed
ON system_conversions(is_confirmed);
```

**Lý do không chọn:**
- Không có business requirement rõ ràng cho field này
- Frontend không hiển thị hoặc sử dụng giá trị này
- Tránh thêm complexity không cần thiết vào database

## Files Đã Sửa

### backend/routes/admin.js

**Location:** Dòng 1270-1330

**Changes:**
- Line 1273: Removed `newIsConfirmed` parameter
- Line 1287: Removed `oldIsConfirmed` variable
- Line 1296: Added `updated_at = NOW()` to UPDATE query
- Line 1313-1321: Removed entire `is_confirmed` update block
- Line 1316: Removed `isConfirmed` from response
- Line 1320: Removed `isConfirmed` from changes object

**Before:**
```javascript
const { newStatus, newIsConfirmed } = req.body;
const oldIsConfirmed = conversion.is_confirmed;

// ... status update logic

// Update is_confirmed if changed
if (newIsConfirmed !== undefined && newIsConfirmed !== oldIsConfirmed) {
  // ... update is_confirmed
}

res.json({
  updated: {
    status: ...,
    isConfirmed: newIsConfirmed !== oldIsConfirmed,
    balanceUpdated
  }
});
```

**After:**
```javascript
const { newStatus } = req.body;

// ... status update logic only

res.json({
  updated: {
    status: ...,
    balanceUpdated
  }
});
```

## Testing Guide

### Test Case 1: Sync Conversion Status

**Setup:**
1. Vào `/admin/conversions`
2. Tìm conversion với status = "pending"
3. Click nút "⋮" → "Đồng bộ từ AT"

**Steps:**
1. Trong modal, chọn status mới (vd: "approved")
2. Click "Cập nhật"

**Expected Result:**
- ✅ API request thành công (200 OK)
- ✅ Toast message: "Conversion updated successfully"
- ✅ Status được update trong database
- ✅ Nếu status = approved → user balance được cập nhật
- ✅ Không có lỗi console

**Before Fix:**
- ❌ Error 500: column "is_confirmed" does not exist
- ❌ Conversion không được update

**After Fix:**
- ✅ Status update thành công
- ✅ Balance update (nếu applicable)
- ✅ No errors

### Test Case 2: Approve Pending Conversion

**Setup:**
1. User có conversion với status = "pending"
2. Cashback amount = 50,000đ
3. User balance: pending = 50,000đ, available = 0đ

**Steps:**
1. Admin sync conversion
2. Change status: pending → approved
3. Click update

**Expected Result:**
- ✅ Status updated to "approved"
- ✅ approval_time = NOW()
- ✅ User balance updated:
  - pending_balance: 50,000đ → 0đ
  - available_balance: 0đ → 50,000đ
- ✅ updated_at = NOW()

### Test Case 3: Reject Pending Conversion

**Setup:**
1. User có conversion với status = "pending"
2. Cashback amount = 30,000đ

**Steps:**
1. Admin sync conversion
2. Change status: pending → rejected
3. Click update

**Expected Result:**
- ✅ Status updated to "rejected"
- ✅ approval_time = NULL
- ✅ User pending_balance giảm 30,000đ
- ✅ No balance added to available

## Database Impact

**Không có thay đổi database schema:**
- Không cần migration
- Không tạo column mới
- Không xóa column (vì chưa tồn tại)

**Tables Affected:**
- `system_conversions`: UPDATE status, approval_time, updated_at
- `users`: UPDATE balances (nếu status change)

## API Contract Changes

### Request Body

**Before:**
```json
{
  "newStatus": "approved",
  "newIsConfirmed": true
}
```

**After:**
```json
{
  "newStatus": "approved"
}
```

**Breaking Change:** ❌ NO
- Frontend chưa sử dụng `newIsConfirmed` parameter
- Backward compatible (server ignore unknown fields)

### Response Body

**Before:**
```json
{
  "success": true,
  "message": "Conversion updated successfully",
  "updated": {
    "status": true,
    "isConfirmed": true,
    "balanceUpdated": true
  },
  "changes": {
    "status": { "old": "pending", "new": "approved" },
    "isConfirmed": { "old": false, "new": true }
  }
}
```

**After:**
```json
{
  "success": true,
  "message": "Conversion updated successfully",
  "updated": {
    "status": true,
    "balanceUpdated": true
  },
  "changes": {
    "status": { "old": "pending", "new": "approved" }
  }
}
```

**Breaking Change:** ❌ NO
- Frontend không sử dụng `isConfirmed` field trong response
- Other fields unchanged

## Rollback Plan

Nếu cần rollback (không khả thi vì fix là remove broken code):

**Option 1: Revert commit**
```bash
git revert <commit-hash>
```

**Option 2: Add migration to support is_confirmed**
```sql
-- Tạo columns nếu cần field này trong tương lai
ALTER TABLE system_conversions
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmed_time TIMESTAMPTZ;

-- Restore code logic
-- (revert git commit)
```

## Related Files

**Checked (không cần sửa):**
- `frontend/admin/conversions.js` - Không sử dụng `is_confirmed`
- `frontend/admin/admin.js` - Không pass `newIsConfirmed` parameter
- `backend/models/Conversion.js` - Không có reference đến `is_confirmed`

**Migrations Reviewed:**
- `013_fix_timezone_columns.sql` - Không có `is_confirmed`
- `019_add_reconciliation_status_to_system_conversions.sql` - Không có `is_confirmed`
- Tất cả migrations khác - Không tạo column này

## Benefits

### Trước Khi Fix:
- ❌ API endpoint broken (500 error)
- ❌ Admin không thể sync conversion status
- ❌ User balance không được update khi approve
- ❌ Console errors gây confusion

### Sau Khi Fix:
- ✅ API endpoint hoạt động bình thường
- ✅ Admin có thể sync status successfully
- ✅ User balance update correctly
- ✅ Clean code, no unused fields
- ✅ No database migrations needed

## Lessons Learned

1. **Database-first development:** Luôn tạo migration trước khi code logic sử dụng column mới
2. **Code review:** Nên review database schema trước khi implement feature
3. **Integration testing:** Test API endpoints với real database để phát hiện lỗi sớm
4. **Remove unused code:** Dead code (như `is_confirmed`) nên được remove để tránh confusion

## Production Deployment

### Pre-deployment Checklist:

- [x] Code đã được test locally
- [x] Không cần database migration
- [x] API contract backward compatible
- [x] Frontend không bị ảnh hưởng
- [x] Error logs reviewed

### Deployment Steps:

1. Deploy code lên production
2. Monitor error logs
3. Test sync-from-at endpoint
4. Verify user balance updates

### Rollback:

Nếu có vấn đề, revert commit. Không cần rollback database (không có migration).

---

## Summary

✅ **Fixed:** Removed reference to non-existent `is_confirmed` column

✅ **Impact:** LOW - Chỉ remove dead code, không ảnh hưởng existing functionality

✅ **Testing:** Sync conversion status đã hoạt động correctly

✅ **Migration:** NONE required

**Status:** ✅ READY FOR PRODUCTION

**Risk Level:** 🟢 LOW (bug fix, no schema changes, backward compatible)
