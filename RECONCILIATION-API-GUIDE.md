# 🔧 Reconciliation API - Quick Start Guide

## 📚 Table of Contents
- [Overview](#overview)
- [Admin Workflow](#admin-workflow)
- [User Workflow](#user-workflow)
- [API Reference](#api-reference)
- [Examples](#examples)

---

## Overview

Module đối soát cashback cho phép Admin tạo các kỳ đối soát để thanh toán cho users.

**Key Concepts:**
- **Eligible Orders**: Orders có `is_confirmed=1` và `utm_source='chatchiu'`
- **Reconciliation Period**: Kỳ đối soát (theo tháng, quý, hoặc custom range)
- **Status Workflow**: `draft` → `confirmed` → `paid`
- **Versioning**: Support re-run để tạo version mới

---

## Admin Workflow

### Step 1: Preview Eligible Orders

Trước khi tạo kỳ đối soát, preview để xem có bao nhiêu orders eligible.

```bash
POST /api/reconciliation/preview
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "userId": null,                    # null = all users
  "periodStart": "2025-11-01",
  "periodEnd": "2025-11-30",
  "utmSource": "chatchiu"            # optional, default: chatchiu
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "eligible": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "order_code": "ORDER123",
        "cashback_amount": 50000,
        "confirmed_time": "2025-11-15T10:00:00Z",
        ...
      }
    ],
    "alreadyReconciled": [...],
    "stats": {
      "eligible_count": 150,
      "eligible_total_cashback": 5000000,
      "eligible_total_order_amount": 150000000,
      "already_reconciled_count": 0,
      "total_found": 150
    }
  }
}
```

---

### Step 2: Create Reconciliation

Sau khi preview OK, tạo kỳ đối soát.

```bash
POST /api/reconciliation/create
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "userId": null,                    # null = all users, or specific user UUID
  "periodStart": "2025-11-01",
  "periodEnd": "2025-11-30",
  "periodLabel": "Tháng 11/2025",
  "notes": "Kỳ đối soát tháng 11",
  "utmSource": "chatchiu"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reconciliation created successfully",
  "data": {
    "reconciliation": {
      "id": "uuid",
      "period_label": "Tháng 11/2025",
      "status": "draft",
      "total_orders": 150,
      "total_cashback": 5000000,
      ...
    },
    "items": [...],
    "stats": { ... }
  }
}
```

---

### Step 3: View Details

```bash
GET /api/reconciliation/:id
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reconciliation": { ... },
    "items": [...],                  # All orders in this period
    "stats": {
      "total_items": 150,
      "unique_users": 45,
      "total_cashback": 5000000,
      ...
    },
    "userStats": [                   # Stats by user
      {
        "user_id": "uuid",
        "user_name": "Nguyen Van A",
        "order_count": 10,
        "total_cashback": 500000
      }
    ]
  }
}
```

---

### Step 4: Update Status

Khi ready, update status từ `draft` → `confirmed`.

```bash
PATCH /api/reconciliation/:id/status
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "status": "confirmed"              # draft | confirmed | paid | cancelled
}
```

**Status Workflow:**
- `draft` → `confirmed` ✅ (admin confirms reconciliation)
- `draft` → `cancelled` ✅ (admin cancels)
- `confirmed` → `paid` ✅ (after payment completed)
- `confirmed` → `cancelled` ✅
- `paid` → (final state) ❌
- `cancelled` → (final state) ❌

---

### Step 5: Export to CSV (Optional)

```bash
GET /api/reconciliation/:id/export
Authorization: Bearer <admin_token>
```

**Response:** CSV file download
```csv
Mã đơn hàng,Merchant,Tên user,Email,Giá trị đơn,Hoa hồng,Cashback,Thời gian đặt,Thời gian xác nhận
ORDER123,Shopee,Nguyen Van A,a@email.com,1000000,100000,50000,15/11/2025 10:00,20/11/2025 15:00
```

---

### Step 6: Re-run (Optional)

Nếu cần tạo version mới (ví dụ: có orders mới confirmed sau khi tạo):

```bash
POST /api/reconciliation/:id/rerun
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "notes": "Re-run vì có thêm 10 orders mới confirmed"
}
```

Sẽ tạo reconciliation mới với:
- Cùng `period_start`, `period_end`, `period_label`
- `version = parent.version + 1`
- `parent_reconciliation_id = parent.id`
- `is_latest = true` (parent's `is_latest` auto set to `false`)

---

### Other Admin Endpoints

**List All Reconciliations:**
```bash
GET /api/reconciliation/list?userId=&status=&latestOnly=true&limit=50&offset=0
```

**Delete Draft:**
```bash
DELETE /api/reconciliation/:id
# Only works for status=draft
```

**Overall Stats:**
```bash
GET /api/reconciliation/stats/summary
```

---

## User Workflow

Users chỉ có thể xem các kỳ đối soát đã `confirmed` của họ.

### View Reconciliation Periods

```bash
GET /api/dashboard/reconciliations?limit=50&offset=0
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "success": true,
  "reconciliations": [
    {
      "id": "uuid",
      "periodLabel": "Tháng 11/2025",
      "periodStart": "2025-11-01",
      "periodEnd": "2025-11-30",
      "totalOrders": 10,
      "totalOrderAmount": 10000000,
      "totalCashback": 500000,
      "status": "confirmed",
      "confirmedAt": "2025-12-05T10:00:00Z",
      "paidAt": null,
      "itemCount": 10
    }
  ]
}
```

---

### View Orders in Period

```bash
GET /api/dashboard/reconciliation/:id/items
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "orderCode": "ORDER123",
      "merchantName": "Shopee",
      "orderAmount": 1000000,
      "commission": 100000,
      "cashbackAmount": 50000,
      "orderTime": "2025-11-15T10:00:00Z",
      "confirmedTime": "2025-11-20T15:00:00Z"
    }
  ]
}
```

---

## API Reference

### Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/reconciliation/preview` | Admin | Preview eligible conversions |
| `POST` | `/api/reconciliation/create` | Admin | Create reconciliation |
| `GET` | `/api/reconciliation/list` | Admin | List all reconciliations |
| `GET` | `/api/reconciliation/:id` | Admin | Get details |
| `PATCH` | `/api/reconciliation/:id/status` | Admin | Update status |
| `POST` | `/api/reconciliation/:id/rerun` | Admin | Re-run (create version) |
| `DELETE` | `/api/reconciliation/:id` | Admin | Delete draft |
| `GET` | `/api/reconciliation/:id/export` | Admin | Export CSV |
| `GET` | `/api/reconciliation/stats/summary` | Admin | Overall stats |

### User Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/dashboard/reconciliations` | User | List confirmed periods |
| `GET` | `/api/dashboard/reconciliation/:id/items` | User | View orders in period |

---

## Examples

### Example 1: Monthly Reconciliation

```javascript
// Step 1: Preview
const previewRes = await fetch('/api/reconciliation/preview', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: null,                    // All users
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30'
  })
});

const preview = await previewRes.json();
console.log(`Found ${preview.data.stats.eligible_count} eligible orders`);
console.log(`Total cashback: ${preview.data.stats.eligible_total_cashback} VND`);

// Step 2: Create if preview OK
if (preview.data.stats.eligible_count > 0) {
  const createRes = await fetch('/api/reconciliation/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: null,
      periodStart: '2025-11-01',
      periodEnd: '2025-11-30',
      periodLabel: 'Tháng 11/2025',
      notes: 'Kỳ đối soát tháng 11'
    })
  });

  const result = await createRes.json();
  console.log('Reconciliation created:', result.data.reconciliation.id);
}
```

---

### Example 2: User-Specific Reconciliation

```javascript
// Preview cho 1 user cụ thể
const previewRes = await fetch('/api/reconciliation/preview', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: '123e4567-e89b-12d3-a456-426614174000',  // Specific user
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30'
  })
});
```

---

### Example 3: Re-run After New Orders Confirmed

```javascript
// Scenario: Đã tạo reconciliation vào ngày 5/12
// Ngày 10/12 có thêm orders confirmed trong tháng 11
// → Re-run để tạo version mới

const rerunRes = await fetch(`/api/reconciliation/${reconciliationId}/rerun`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    notes: 'Re-run vì có thêm 10 orders mới confirmed từ ngày 5-10/12'
  })
});

const newVersion = await rerunRes.json();
console.log('New version created:', newVersion.data.reconciliation.version);
```

---

### Example 4: User View Reconciliations

```javascript
// User fetch their reconciliation history
const userRes = await fetch('/api/dashboard/reconciliations', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
});

const reconciliations = await userRes.json();

// Display in UI
reconciliations.reconciliations.forEach(r => {
  console.log(`${r.periodLabel}: ${r.totalCashback} VND (${r.totalOrders} orders)`);
  console.log(`Status: ${r.status}`);
});
```

---

## Error Handling

**Common Errors:**

```json
// 400 - Missing required fields
{
  "success": false,
  "message": "periodStart and periodEnd are required"
}

// 400 - Invalid status transition
{
  "success": false,
  "message": "Invalid status transition: paid -> draft"
}

// 400 - Overlapping period
{
  "success": false,
  "message": "Reconciliation period overlaps with existing period"
}

// 404 - Not found
{
  "success": false,
  "message": "Reconciliation not found"
}

// 403 - Access denied (user trying to access other user's data)
{
  "success": false,
  "message": "Access denied"
}

// 500 - Server error
{
  "success": false,
  "message": "Failed to create reconciliation"
}
```

---

## Notes

1. **Filter Logic**: Chỉ reconcile orders có:
   - `is_confirmed = 1` (đã được AccessTrade xác nhận đối soát)
   - `confirmed_time` trong period
   - `utm_source = 'chatchiu'`
   - Chưa nằm trong reconciliation nào

2. **Versioning**:
   - Mỗi period có thể có nhiều versions
   - Chỉ 1 version có `is_latest = true`
   - Re-run tạo version mới với data mới nhất

3. **Status Workflow**:
   - `draft`: Mới tạo, có thể edit/delete
   - `confirmed`: Admin đã confirm, không thể delete
   - `paid`: Đã thanh toán, final state
   - `cancelled`: Đã hủy, final state

4. **Permissions**:
   - Admin: Full access tất cả endpoints
   - User: Chỉ xem được confirmed reconciliations của họ

---

**Last Updated:** 2025-11-11
**Version:** 2.0.0
