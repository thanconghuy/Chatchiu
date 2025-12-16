# ✨ Feature: Add Waiting List Orders to Draft Reconciliation

## 🎯 Mục Tiêu

Cho phép thêm các đơn hàng từ danh sách chờ vào kỳ đối soát nháp (draft) có sẵn, thay vì chỉ tạo kỳ mới.

**User Flow:**
1. Có orders trong waiting list (grouped by month)
2. Click "Tạo Kỳ Đối Soát"
3. Hệ thống check xem có kỳ nháp nào trong cùng period không
4. Nếu có → Hỏi user: **Thêm vào kỳ nháp** hoặc **Tạo mới**
5. Nếu không → Tạo kỳ mới

---

## ✅ Implementation

### **Backend Changes**

#### **1. New API Endpoint: Check Draft Reconciliation**

**File:** `backend/routes/systemReconciliationAdmin.js` (Lines 935-991)

**Endpoint:** `GET /api/admin/system-reconciliation/auto-sync/check-draft-reconciliation`

**Purpose:** Check if there's an existing draft reconciliation for a given month

**Query Parameters:**
- `month` (required): Month in format `YYYY-MM-DD` (e.g., "2025-11-01")

**Response:**
```json
{
  "success": true,
  "data": {
    "has_draft": true,
    "draft_reconciliations": [
      {
        "id": "uuid",
        "period_label": "Tháng 11/2025 - Đợt 1",
        "period_start": "2025-11-01",
        "period_end": "2025-11-30",
        "total_orders": 10,
        "total_cashback": 50000,
        "status": "draft",
        "created_at": "2025-11-15T..."
      }
    ]
  }
}
```

**Query Logic:**
```sql
SELECT
  id, period_label, period_start, period_end,
  total_orders, total_cashback, status, created_at
FROM system_reconciliations
WHERE status = 'draft'
  AND period_start <= $2  -- Period end of requested month
  AND period_end >= $1    -- Period start of requested month
ORDER BY created_at DESC
LIMIT 5
```

**Why overlap check:**
- Allows finding drafts that partially overlap with requested period
- E.g., draft "Tháng 11/2025" overlaps with "Tháng 11/2025 - Tuần 1"

---

#### **2. Updated API Endpoint: Create/Add to Reconciliation**

**File:** `backend/routes/systemReconciliationAdmin.js` (Lines 993-1060)

**Endpoint:** `POST /api/admin/system-reconciliation/auto-sync/create-from-waiting`

**New Request Body:**
```json
{
  "month": "2025-11-01",
  "periodLabel": "Tháng 11/2025",
  "reconciliationId": "uuid-optional"  // ✅ NEW: If provided, add to existing draft
}
```

**Logic:**

**BEFORE (Always create new):**
```javascript
const reconciliation = await SystemReconciliationService.createReconciliation({
  periodStart,
  periodEnd,
  periodLabel,
  selectedOrderIds,
  createdBy: req.userId
});
```

**AFTER (Create new OR add to existing):**
```javascript
let reconciliation;
let action = 'created';

if (reconciliationId) {
  // Verify reconciliation exists and is draft
  const reconCheck = await pool.query(
    'SELECT id, status, period_label FROM system_reconciliations WHERE id = $1',
    [reconciliationId]
  );

  if (reconCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Kỳ đối soát không tồn tại'
    });
  }

  if (reconCheck.rows[0].status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: 'Chỉ có thể thêm đơn hàng vào kỳ đối soát ở trạng thái Nháp'
    });
  }

  // Add orders to existing draft
  await SystemReconciliationService.addOrdersToReconciliation(
    reconciliationId,
    selectedOrderIds
  );

  reconciliation = { id: reconciliationId };
  action = 'added';

} else {
  // Create new reconciliation
  reconciliation = await SystemReconciliationService.createReconciliation({
    periodStart,
    periodEnd,
    periodLabel,
    selectedOrderIds,
    createdBy: req.userId
  });

  action = 'created';
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã thêm 4 đơn hàng vào kỳ đối soát \"Tháng 11/2025 - Đợt 1\"",
  "data": {
    "reconciliation_id": "uuid",
    "order_count": 4,
    "total_cashback": 10423,
    "moved_count": 4,
    "remaining_in_waiting": 0,
    "action": "added"  // ✅ NEW: "created" or "added"
  }
}
```

---

### **Frontend Changes**

**File:** `frontend/admin/system-reconciliation.html` (Lines 3364-3444)

**Function:** `createReconciliationFromWaiting(month, periodLabel)`

**BEFORE (Always create new):**
```javascript
async function createReconciliationFromWaiting(month, periodLabel) {
    if (!confirm(`Tạo kỳ đối soát "${periodLabel}"?...`)) {
        return;
    }

    // Always create new
    const response = await fetch(..., {
        body: JSON.stringify({ month, periodLabel })
    });
}
```

**AFTER (Check draft first, then ask user):**
```javascript
async function createReconciliationFromWaiting(month, periodLabel) {
    try {
        // 1. Check if there's an existing draft reconciliation
        const checkResponse = await fetch(
            `${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/check-draft-reconciliation?month=${month}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const checkResult = await checkResponse.json();

        let reconciliationId = null;

        // 2. If draft exists, ask user what to do
        if (checkResult.success && checkResult.data.has_draft) {
            const drafts = checkResult.data.draft_reconciliations;

            let optionsText = `Đã tìm thấy ${drafts.length} kỳ đối soát nháp:\n\n`;
            drafts.forEach((draft, index) => {
                optionsText += `${index + 1}. ${draft.period_label} (${draft.total_orders} đơn hàng)\n`;
            });
            optionsText += `\nBạn muốn:\n`;
            optionsText += `- Chọn "OK" để THÊM vào kỳ nháp đầu tiên\n`;
            optionsText += `- Chọn "Cancel" để TẠO MỚI kỳ đối soát`;

            const addToExisting = confirm(optionsText);

            if (addToExisting) {
                reconciliationId = drafts[0].id;  // Add to first draft
            }
        } else {
            // 3. No draft found, confirm create new
            if (!confirm(`Tạo kỳ đối soát "${periodLabel}"?...`)) {
                return;
            }
        }

        // 4. Create or add to reconciliation
        const response = await fetch(..., {
            body: JSON.stringify({
                month,
                periodLabel,
                reconciliationId  // null = create new, id = add to existing
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            await loadWaitingList();
            await loadNewOrdersPreview();
            await loadReconciliations();  // ✅ NEW: Reload to show updated reconciliation
        }
    } catch (error) {
        showToast(`Lỗi: ${error.message}`, 'error');
    }
}
```

---

## 🔄 User Flow

### **Scenario 1: No Draft Reconciliation Exists**

**Steps:**
1. User có 4 orders trong waiting list (Tháng 11/2025)
2. Click button "Tạo Kỳ Đối Soát"
3. Frontend kiểm tra draft reconciliation → Không tìm thấy
4. Hiển thị confirm: "Tạo kỳ đối soát \"Tháng 11/2025\"?"
5. User click OK
6. Backend tạo kỳ mới với 4 orders
7. Toast: "Đã tạo kỳ đối soát \"Tháng 11/2025\" với 4 đơn hàng"

---

### **Scenario 2: Draft Reconciliation Exists - User Adds to Draft**

**Steps:**
1. Đã có kỳ nháp "Tháng 11/2025 - Đợt 1" với 5 orders
2. User có thêm 4 orders trong waiting list cùng tháng
3. Click button "Tạo Kỳ Đối Soát"
4. Frontend kiểm tra → Tìm thấy 1 kỳ nháp
5. Hiển thị dialog:
   ```
   Đã tìm thấy 1 kỳ đối soát nháp trong cùng khoảng thời gian:

   1. Tháng 11/2025 - Đợt 1 (5 đơn hàng, 12.000 đ)

   Bạn muốn:
   - Chọn "OK" để THÊM vào kỳ nháp đầu tiên
   - Chọn "Cancel" để TẠO MỚI kỳ đối soát
   ```
6. User click **OK** (Add to existing)
7. Backend thêm 4 orders vào kỳ nháp hiện có
8. Kỳ nháp giờ có: 5 + 4 = 9 orders
9. Toast: "Đã thêm 4 đơn hàng vào kỳ đối soát \"Tháng 11/2025 - Đợt 1\""

---

### **Scenario 3: Draft Reconciliation Exists - User Creates New**

**Steps:**
1-5. Same as Scenario 2
6. User click **Cancel** (Create new)
7. Backend tạo kỳ mới "Tháng 11/2025" với 4 orders
8. Giờ có 2 kỳ nháp:
   - "Tháng 11/2025 - Đợt 1" (5 orders)
   - "Tháng 11/2025" (4 orders - mới tạo)
9. Toast: "Đã tạo kỳ đối soát \"Tháng 11/2025\" với 4 đơn hàng"

---

## 🧪 Testing Guide

### **Test 1: Create New (No Draft Exists)**

**Setup:**
- Không có kỳ nháp nào
- Có 4 orders trong waiting list (Tháng 11/2025)

**Steps:**
1. Navigate to **Auto-Sync** tab → **Danh Sách Chờ**
2. Verify 4 orders shown under "Tháng 11/2025"
3. Click **"Tạo Kỳ Đối Soát"**
4. Confirm dialog appears

**Expected:**
- ✅ Confirm: "Tạo kỳ đối soát \"Tháng 11/2025\"?"
- ✅ Click OK → Toast success
- ✅ Waiting list now empty
- ✅ New draft reconciliation created
- ✅ Reconciliation has 4 orders

---

### **Test 2: Add to Existing Draft**

**Setup:**
1. Create draft reconciliation "Tháng 11/2025 - Đợt 1" with 5 orders
2. Add 4 new orders to waiting list (same month)

**Steps:**
1. Navigate to **Auto-Sync** tab → **Danh Sách Chờ**
2. Verify 4 orders shown
3. Click **"Tạo Kỳ Đối Soát"**
4. Dialog shows existing draft

**Expected:**
- ✅ Dialog shows: "Đã tìm thấy 1 kỳ đối soát nháp..."
- ✅ Lists: "Tháng 11/2025 - Đợt 1 (5 đơn hàng, ...)"
- ✅ Click OK → Toast: "Đã thêm 4 đơn hàng vào kỳ..."
- ✅ Waiting list now empty
- ✅ Draft reconciliation now has 9 orders (5 + 4)

**Verify in Database:**
```sql
SELECT id, period_label, total_orders, total_cashback
FROM system_reconciliations
WHERE status = 'draft' AND period_label LIKE '%Tháng 11/2025%';

-- Should show 1 row with total_orders = 9
```

---

### **Test 3: Create New Despite Draft Exists**

**Setup:** Same as Test 2

**Steps:**
1-4. Same as Test 2
5. Click **Cancel** (Create new)

**Expected:**
- ✅ Toast: "Đã tạo kỳ đối soát \"Tháng 11/2025\" với 4 đơn hàng"
- ✅ Waiting list now empty
- ✅ Now have 2 draft reconciliations:
  - Old: "Tháng 11/2025 - Đợt 1" (5 orders)
  - New: "Tháng 11/2025" (4 orders)

---

### **Test 4: Cannot Add to Finalized Reconciliation**

**Setup:**
1. Create reconciliation "Tháng 11/2025"
2. Finalize it (status = 'finalized')
3. Add orders to waiting list

**Steps:**
1. Click "Tạo Kỳ Đối Soát"
2. System finds finalized reconciliation

**Expected:**
- ✅ Dialog does NOT show finalized reconciliation
- ✅ Only shows drafts
- ✅ If no drafts → Create new

**Backend Validation:**
```javascript
if (reconCheck.rows[0].status !== 'draft') {
  return res.status(400).json({
    message: 'Chỉ có thể thêm đơn hàng vào kỳ đối soát ở trạng thái Nháp'
  });
}
```

---

## 📋 Files Changed

| File | Lines | Change |
|------|-------|--------|
| `backend/routes/systemReconciliationAdmin.js` | 935-991 | Added `GET /check-draft-reconciliation` endpoint |
| `backend/routes/systemReconciliationAdmin.js` | 997-1060 | Updated `POST /create-from-waiting` to support adding to existing draft (includes passing `req.userId` to service) |
| `frontend/admin/system-reconciliation.html` | 3364-3444 | Updated `createReconciliationFromWaiting()` to check for drafts and ask user |
| `backend/migrations/030_fix_autosync_system_conversions.sql` | 31, 71 | Fixed to use `at_conversion_id` instead of `id` for FK compatibility |

---

## 🚀 Deployment

### **1. Backend Already Running**
- Changes applied to running server
- No restart needed (nodemon auto-reload)

### **2. Test Immediately**
1. Hard refresh browser (Ctrl + Shift + R)
2. Navigate to **Auto-Sync** tab
3. Add orders to waiting list
4. Click "Tạo Kỳ Đối Soát"
5. Test both scenarios (create new, add to existing)

---

## 🔍 Debug Tips

### **If dialog doesn't show draft reconciliations:**

1. **Check API response:**
   - Open Network tab
   - Check `/check-draft-reconciliation` response
   - Verify `has_draft: true` if drafts exist

2. **Check database:**
   ```sql
   SELECT * FROM system_reconciliations
   WHERE status = 'draft'
     AND period_start <= '2025-11-30'
     AND period_end >= '2025-11-01';
   ```

---

### **If adding to draft fails:**

1. **Check reconciliation status:**
   ```sql
   SELECT id, period_label, status FROM system_reconciliations
   WHERE id = 'uuid-here';

   -- status MUST be 'draft', not 'finalized' or 'paid'
   ```

2. **Check backend logs:**
   - Look for error messages
   - Verify `SystemReconciliationService.addOrdersToReconciliation()` exists

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Hard refresh browser
- [ ] Navigate to Auto-Sync tab
- [ ] Have orders in waiting list
- [ ] **Test 1: No draft exists**
  - [ ] Click "Tạo Kỳ Đối Soát"
  - [ ] Confirm dialog shows
  - [ ] New reconciliation created
- [ ] **Test 2: Draft exists - Add to existing**
  - [ ] Create draft with 5 orders
  - [ ] Add 4 more to waiting list
  - [ ] Click "Tạo Kỳ Đối Soát"
  - [ ] Dialog shows draft info
  - [ ] Click OK
  - [ ] Orders added to existing draft
  - [ ] Draft now has 9 orders
- [ ] **Test 3: Draft exists - Create new**
  - [ ] Click "Tạo Kỳ Đối Soát"
  - [ ] Click Cancel
  - [ ] New draft created
  - [ ] Both drafts exist
- [ ] No JavaScript errors in console
- [ ] Toast messages appear correctly
- [ ] Waiting list updates after action
- [ ] Reconciliations list updates

---

**Created:** 2025-12-13
**Version:** 1.0
**Status:** ✅ Implemented

**Summary:**
1. Added API endpoint to check for existing draft reconciliations
2. Updated create-from-waiting endpoint to support adding to existing draft
3. Frontend now checks for drafts and asks user: add to existing or create new
4. Prevents accidental duplicate reconciliations
5. Allows consolidating orders into single reconciliation period
