# AccessTrade API - Quy tắc trạng thái đơn hàng

## Tổng quan

Tài liệu này mô tả chi tiết cách hệ thống xác định trạng thái của đơn hàng (conversion) dựa trên các field từ AccessTrade API.

## Các field quan trọng từ AccessTrade API

### 1. **status** (enum)
- **Type**: String
- **Values**: `'pending'`, `'approved'`, `'rejected'`
- **Ý nghĩa**:
  - `'approved'` = Đơn đã được duyệt hoàn toàn, có quyền nhận cashback
  - `'pending'` = Đơn đang chờ xử lý
  - `'rejected'` = Đơn bị từ chối

### 2. **order_reject** (integer)
- **Type**: Integer (0 hoặc 1)
- **Values**:
  - `0` = Đơn không bị reject
  - `1` = Đơn bị reject/huỷ
- **Ý nghĩa**: Flag đánh dấu đơn bị huỷ bởi merchant hoặc AccessTrade

### 3. **order_approved** (integer)
- **Type**: Integer (≥ 0)
- **Values**:
  - `0` = Chưa có sản phẩm nào được approve
  - `> 0` = Số lượng sản phẩm đã được approve tạm thời
- **Ý nghĩa**: Số sản phẩm trong đơn đã được merchant xác nhận (nhưng chưa đối soát)

### 4. **order_pending** (integer)
- **Type**: Integer (≥ 0)
- **Values**:
  - `0` = Không có sản phẩm nào đang pending
  - `> 0` = Số lượng sản phẩm đang chờ duyệt
- **Ý nghĩa**: Số sản phẩm trong đơn đang chờ merchant xác nhận

### 5. **products_count** (integer)
- **Type**: Integer (≥ 0)
- **Ý nghĩa**: Tổng số sản phẩm trong đơn hàng

---

## Hệ thống 4 trạng thái

### 🔴 1. Huỷ (Rejected)
**Điều kiện**: `order_reject === 1`

**Mô tả**: Đơn hàng đã bị huỷ/từ chối bởi merchant hoặc AccessTrade

**Badge CSS**: `.status-rejected`
- Background: `#f8d7da`
- Color: `#721c24`

**Ví dụ**:
```json
{
  "status": "rejected",
  "order_reject": 1,
  "order_approved": 0,
  "order_pending": 0
}
```

---

### ✅ 2. Đã duyệt (Approved)
**Điều kiện**: `status === 'approved'`

**Mô tả**: Đơn hàng đã được duyệt hoàn toàn, đã đối soát, user có quyền nhận cashback

**Badge CSS**: `.status-approved`
- Background: `#d4edda`
- Color: `#155724`

**Ví dụ**:
```json
{
  "status": "approved",
  "order_reject": 0,
  "order_approved": 2,
  "order_pending": 0,
  "products_count": 2
}
```

---

### 🔵 3. Tạm duyệt - Đợi đối soát (Temp Approved)
**Điều kiện**:
```javascript
order_approved > 0 &&
order_pending === 0 &&
order_reject === 0 &&
status === 'pending'
```

**Mô tả**:
- Đơn hàng đã được merchant xác nhận
- Tất cả sản phẩm đã được approve
- Đang chờ AccessTrade đối soát để chuyển sang trạng thái "Đã duyệt"
- Thời gian chờ thường: 45-60 ngày

**Badge CSS**: `.status-temp-approved`
- Background: `#d1ecf1`
- Color: `#0c5460`
- Border: `1px solid #bee5eb`

**Ví dụ**:
```json
{
  "status": "pending",
  "order_reject": 0,
  "order_approved": 3,
  "order_pending": 0,
  "products_count": 3
}
```

---

### 🟡 4. Chờ duyệt (Pending)
**Điều kiện**: Tất cả các trường hợp còn lại (fallback)

**Mô tả**:
- Đơn hàng mới được tạo
- Đang chờ merchant xác nhận
- Có thể có một số sản phẩm pending

**Badge CSS**: `.status-pending`
- Background: `#fff3cd`
- Color: `#856404`

**Ví dụ 1** - Đơn mới:
```json
{
  "status": "pending",
  "order_reject": 0,
  "order_approved": 0,
  "order_pending": 2,
  "products_count": 2
}
```

**Ví dụ 2** - Một phần được approve:
```json
{
  "status": "pending",
  "order_reject": 0,
  "order_approved": 1,
  "order_pending": 1,
  "products_count": 2
}
```

---

## Flow logic xác định trạng thái

```javascript
function determineStatus(conversion) {
    // Priority 1: Check if rejected
    if (conversion.order_reject === 1) {
        return { status: 'rejected', text: 'Huỷ' };
    }

    // Priority 2: Check if fully approved by AccessTrade
    if (conversion.status === 'approved') {
        return { status: 'approved', text: 'Đã duyệt' };
    }

    // Priority 3: Check if temp approved (all products approved, waiting for reconciliation)
    const isTempApproved =
        conversion.order_approved > 0 &&
        conversion.order_pending === 0 &&
        conversion.order_reject === 0;

    if (isTempApproved) {
        return { status: 'temp-approved', text: 'Tạm duyệt (đợi đối soát)' };
    }

    // Priority 4: Default to pending
    return { status: 'pending', text: 'Chờ duyệt' };
}
```

---

## Timeline của một đơn hàng

```
[Chưa mua] → [Chờ duyệt] → [Tạm duyệt] → [Đã duyệt]
                    ↓              ↓
                  [Huỷ]         [Huỷ]
```

1. **Chưa mua** (0-24h sau click): User chưa thực hiện mua hàng
2. **Chờ duyệt** (1-30 ngày): Đơn mới, chờ merchant xác nhận
3. **Tạm duyệt** (30-60 ngày): Merchant đã xác nhận, chờ AccessTrade đối soát
4. **Đã duyệt** (60+ ngày): AccessTrade đã đối soát xong, có quyền cashback
5. **Huỷ** (bất kỳ lúc nào): Đơn bị từ chối/huỷ

---

## Các trường hợp đặc biệt

### Trường hợp 1: Đơn có nhiều sản phẩm, một phần bị reject
```json
{
  "status": "pending",
  "order_reject": 0,  // Đơn chưa bị reject hoàn toàn
  "order_approved": 2,
  "order_pending": 0,
  "products_count": 3  // Có thể 1 sản phẩm bị reject riêng
}
```
→ Hiển thị: **Tạm duyệt**

### Trường hợp 2: Đơn bị reject sau khi đã temp approved
```json
{
  "status": "rejected",
  "order_reject": 1,
  "order_approved": 2,  // Trước đó đã được approve
  "order_pending": 0
}
```
→ Hiển thị: **Huỷ** (priority cao nhất)

### Trường hợp 3: Đơn không có conversion
```json
{
  "hasConversion": false,
  "conversion_id": null
}
```
→ Hiển thị: **Chưa mua** (không có badge màu)

---

## Database Schema

### Bảng `conversions`
```sql
CREATE TABLE conversions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  click_id UUID REFERENCES clicks(id),

  -- AccessTrade fields
  status conversion_status_enum DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  order_reject INTEGER DEFAULT 0,                   -- 0 = not rejected, 1 = rejected
  order_approved INTEGER DEFAULT 0,                 -- Count of approved products
  order_pending INTEGER DEFAULT 0,                  -- Count of pending products
  products_count INTEGER DEFAULT 0,                 -- Total products

  -- Financial fields
  order_amount DECIMAL(15, 2),
  commission DECIMAL(15, 2),
  cashback_amount DECIMAL(15, 2),

  -- Timestamps
  order_time TIMESTAMP,
  approval_time TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## API Endpoints

### GET /api/dashboard/recent-clicks
**Response**:
```json
{
  "success": true,
  "clicks": [
    {
      "id": "uuid",
      "merchantName": "Shopee",
      "hasConversion": true,
      "conversionStatus": "pending",
      "orderApproved": 2,
      "orderPending": 0,
      "orderReject": 0,
      "cashback": 15000
    }
  ]
}
```

### GET /api/admin/users/:userId
**Response**:
```json
{
  "success": true,
  "user": { ... },
  "stats": { ... },
  "clicks": [
    {
      "id": "uuid",
      "merchantName": "Lazada",
      "hasConversion": true,
      "conversionStatus": "approved",
      "orderApproved": 1,
      "orderPending": 0,
      "orderReject": 0,
      "cashback": 25000
    }
  ]
}
```

---

## Frontend Implementation

### Files implementing this logic:
1. `frontend/js/dashboard.js` (lines 136-167) - User dashboard
2. `frontend/admin/users.js` (lines 276-307) - Admin user detail modal
3. `frontend/admin/conversions.js` - Admin conversions page
4. `frontend/admin/at-orders.js` - Admin AT orders page

### CSS Classes:
- `.status-rejected` - Màu đỏ
- `.status-approved` - Màu xanh lá
- `.status-temp-approved` - Màu xanh dương nhạt
- `.status-pending` - Màu vàng

---

## Testing Checklist

- [ ] Đơn rejected hiển thị "Huỷ" (đỏ)
- [ ] Đơn approved hiển thị "Đã duyệt" (xanh lá)
- [ ] Đơn temp approved hiển thị "Tạm duyệt (đợi đối soát)" (xanh dương)
- [ ] Đơn pending hiển thị "Chờ duyệt" (vàng)
- [ ] Click chưa có conversion hiển thị "Chưa mua" (không màu)
- [ ] Logic nhất quán giữa user dashboard và admin pages

---

## Notes

- **QUAN TRỌNG**: Luôn check `order_reject` đầu tiên vì nó có priority cao nhất
- Đơn `status='approved'` nghĩa là đã qua đối soát và user chắc chắn được cashback
- Đơn "Tạm duyệt" có thể mất 45-60 ngày để chuyển sang "Đã duyệt"
- Field `order_pending` giúp phân biệt đơn đang chờ vs đơn đã tạm duyệt

---

**Last Updated**: 2025-01-06
**Version**: 1.0
