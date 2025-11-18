# DEBUG: Merchant Status Update Issue

## Vấn đề
Khi edit TikTok Shop merchant và thay đổi Status từ Active → Inactive, sau khi save vẫn hiển thị Active.

## Đã Fix
1. ✅ Fixed `logoutBtn` null error
2. ✅ Added debug logs để trace issue

## Debug Steps

### 1. Mở Browser Console (F12)
- Vào http://localhost:3007/admin/merchants
- Mở Console tab

### 2. Click Edit trên TikTok Shop merchant

**Expected logs:**
```
Form data: {
  isEditMode: true,
  merchantId: "tiktok",
  merchantName: "TikTok Shop",
  statusValue: "inactive",  // ← Check value này
  isActiveBoolean: false    // ← Should be false
}
```

### 3. Click Save Changes

**Check these logs:**

**A. Sending data:**
```
Sending merchant data: {
  id: "tiktok",
  name: "TikTok Shop",
  is_active: false  // ← CRITICAL: Should be false
}
```

**B. API Response:**
```
API Response: {
  success: true,
  merchant: {
    id: "tiktok",
    is_active: false  // ← Check if backend returns false
  }
}
```

**C. Reload merchants:**
```
Reloading merchants list...
Loaded merchants: (11) [{...}, {...}]
🔄 Rendering merchants. Total: 11
TikTok Shop merchant data: {
  id: "tiktok",
  is_active: false,  // ← Should be false after reload
  is_active_type: "boolean"
}
```

## Possible Issues

### Issue 1: Frontend không gửi đúng `is_active`
**Check:** Console log "Sending merchant data"
- Nếu `is_active: true` → Frontend bug
- Nếu `is_active: false` → Backend bug

### Issue 2: Backend không update database
**Check:** Console log "API Response"
- Nếu response.merchant.is_active vẫn là `true` → Backend không update
- Query database trực tiếp:
  ```sql
  SELECT id, name, is_active FROM merchants WHERE id = 'tiktok';
  ```

### Issue 3: Frontend cache data
**Check:** Console log "TikTok Shop merchant data" sau reload
- Nếu `is_active: true` → Backend trả về sai data
- Nếu `is_active: false` nhưng UI vẫn hiển thị Active → Render bug

## Quick Test

### Test 1: Check API directly với curl/Postman

**Get merchant status:**
```bash
curl http://localhost:3007/api/admin/merchant/tiktok \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Update merchant status:**
```bash
curl -X PUT http://localhost:3007/api/admin/merchant/tiktok \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "tiktok",
    "name": "TikTok Shop",
    "is_active": false
  }'
```

**Verify database:**
```sql
-- Connect to database
psql $DATABASE_URL

-- Check current status
SELECT id, name, is_active, updated_at
FROM merchants
WHERE id = 'tiktok';

-- Manually update if needed
UPDATE merchants
SET is_active = false, updated_at = CURRENT_TIMESTAMP
WHERE id = 'tiktok';
```

## Code Changes Made

### File: `frontend/admin/merchants.js`

**Line 54-60: Fixed logoutBtn error**
```javascript
// Before:
document.getElementById('logoutBtn').addEventListener('click', ...);

// After:
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', ...);
}
```

**Line 332-345: Added debug for form data**
```javascript
const statusValue = document.getElementById('merchantStatus').value;
const isActiveBoolean = statusValue === 'active';

console.log('Form data:', {
    statusValue,
    isActiveBoolean  // Check boolean conversion
});
```

**Line 392-402: Added debug for API response**
```javascript
console.log('✅ Update successful! Updated merchant:', response.merchant);
console.log('   - is_active in response:', response.merchant?.is_active);
console.log('Reloading merchants list...');
```

**Line 160-168: Added debug for render**
```javascript
const tiktokMerchant = pageItems.find(m => m.id === 'tiktok');
if (tiktokMerchant) {
    console.log('   TikTok Shop merchant data:', {
        is_active: tiktokMerchant.is_active,
        is_active_type: typeof tiktokMerchant.is_active
    });
}
```

## Next Steps

1. **Test với debug logs**
   - Edit TikTok Shop merchant
   - Đổi status thành Inactive
   - Click Save
   - Check tất cả console logs

2. **Identify where it fails:**
   - Frontend form data ❌
   - API request ❌
   - Backend response ❌
   - Frontend reload ❌
   - Render logic ❌

3. **Report findings:**
   - Copy tất cả console logs
   - Screenshot network tab (request/response)
   - Check database value

---

**Created:** 17/11/2025
**Status:** Ready for testing with debug logs
