# Fix: Import Conversion Status Mapping

## Vấn đề ban đầu

Khi import conversions từ AccessTrade API (tháng 7/2025):
- **Trên AT API**: TT Đơn hàng = "Đã duyệt", TT Đối soát = "Đã đối soát"
- **Sau khi import vào DB**: TT Đơn hàng = "Đang xử lý", TT Đối soát = "Chưa đối soát"

→ **Trạng thái bị mất khi import!**

## Nguyên nhân

AccessTrade API **KHÔNG** trả về field `status` trực tiếp, mà trả về qua các **order counters**:
- `order_approved`: Số lượng đơn đã duyệt
- `order_pending`: Số lượng đơn đang xử lý
- `order_reject`: Số lượng đơn bị hủy

Code cũ chỉ map từ field `status` (không tồn tại), nên luôn default về `'pending'`.

## Giải pháp

Cập nhật hàm `mapConversionStatus()` trong `trackingService.js` để:
1. **Ưu tiên** check order counters trước
2. **Fallback** về field `status` nếu counters không có

### Code mới

```javascript
// Map conversion status from AccessTrade 'status' field OR order counters
// Priority: order_approved > order_reject > order_pending
let status = 'pending'; // default
if (accesstradeData.order_approved && parseInt(accesstradeData.order_approved) > 0) {
  status = 'approved';
} else if (accesstradeData.order_reject && parseInt(accesstradeData.order_reject) > 0) {
  status = 'rejected';
} else if (accesstradeData.status !== null && accesstradeData.status !== undefined) {
  // Fallback to status field if counters are not available
  status = this.mapConversionStatus(accesstradeData.status);
}
```

## Các thay đổi

### File: `backend/services/trackingService.js`

#### 1. Function `handleNewConversion()` (dòng 189-199)
**Trước**:
```javascript
const status = this.mapConversionStatus(accesstradeData.status);
```

**Sau**:
```javascript
let status = 'pending';
if (accesstradeData.order_approved && parseInt(accesstradeData.order_approved) > 0) {
  status = 'approved';
} else if (accesstradeData.order_reject && parseInt(accesstradeData.order_reject) > 0) {
  status = 'rejected';
} else if (accesstradeData.status !== null && accesstradeData.status !== undefined) {
  status = this.mapConversionStatus(accesstradeData.status);
}
```

#### 2. Function `createConversionDirect()` (dòng 425-435)
**Áp dụng cùng logic**

#### 3. Thêm debug logging (dòng 444-458)
```javascript
logger.info('Extracted data for direct conversion', {
  rawStatus: accesstradeData.status,
  rawIsConfirmed: accesstradeData.is_confirmed,
  rawOrderApproved: accesstradeData.order_approved,
  rawOrderPending: accesstradeData.order_pending,
  rawOrderReject: accesstradeData.order_reject,
  mappedStatus: status,
  isConfirmed: confirmationData.isConfirmed,
  confirmedTime: confirmationData.confirmedTime,
  ...
});
```

## Workflow import mới

1. **Fetch từ AT API** → Nhận data với `order_approved`, `order_pending`, `order_reject`, `is_confirmed`
2. **Map status**:
   - `order_approved > 0` → `status = 'approved'`
   - `order_reject > 0` → `status = 'rejected'`
   - Còn lại → `status = 'pending'`
3. **Extract confirmation**:
   - `is_confirmed = 1` → Đã đối soát
   - `is_confirmed = 0` → Chưa đối soát
4. **Insert vào DB** với status và is_confirmed đúng

## Test lại

### Bước 1: Xóa dữ liệu đã import sai
```sql
-- Xóa conversions đã import sai từ tháng 7
DELETE FROM conversions
WHERE confirmed_time >= '2025-07-01'
  AND confirmed_time < '2025-08-01';
```

### Bước 2: Restart backend
```bash
cd backend
npm start
```

### Bước 3: Import lại
1. Vào **Admin > Tools**
2. Chọn **Từ ngày**: `01/07/2025`
3. Chọn **Đến ngày**: `08/07/2025`
4. Click **"📥 Import Conversions from AccessTrade"**

### Bước 4: Kiểm tra kết quả
1. Vào **Admin > Conversions**
2. Xem cột **"TT Đơn hàng"** → Phải là "Đã duyệt" (không còn "Đang xử lý")
3. Xem cột **"TT Đối soát"** → Phải là "Đã đối soát" (không còn "Chưa đối soát")

### Bước 5: Kiểm tra logs backend
```
[INFO] Extracted data for direct conversion {
  rawOrderApproved: 1,
  rawOrderPending: 0,
  rawOrderReject: 0,
  mappedStatus: 'approved',
  isConfirmed: 1,
  ...
}
[SUCCESS] Created conversion directly { status: 'approved', ... }
```

## Kiểm tra đối soát

Sau khi import đúng:
1. Vào **Admin > Đối soát**
2. Chọn:
   - Từ ngày: `01/07/2025`
   - Đến ngày: `08/07/2025`
   - UTM Source: `Tất cả`
3. Click **"🔍 Xem trước"**
4. **Kết quả mong đợi**: Hiển thị các đơn hàng đủ điều kiện (is_confirmed=1, status=approved)

## AccessTrade API Response Format

### Sample conversion data
```json
{
  "_id": "250708JY2UHS83",
  "order_id": "250708JY2UHS83",
  "merchant": "shopee",
  "billing": 182616,
  "pub_commission": 5844,
  "status": null,  // ← KHÔNG CÓ!
  "order_approved": 1,  // ← Dùng cái này
  "order_pending": 0,
  "order_reject": 0,
  "is_confirmed": 1,  // ← Trạng thái đối soát
  "confirmed_time": "2025-07-08T00:00:00Z",
  "sales_time": "2025-07-08T12:30:00Z",
  "click_time": "2025-07-08T11:45:00Z",
  "utm_source": "locknlock",
  "utm_campaign": "cashback",
  "aff_sid": "cashback"
}
```

## Mapping Reference

### Order Status (TT Đơn hàng)
| AT API | Field | Value | DB status | Display |
|--------|-------|-------|-----------|---------|
| ✅ | `order_approved` | > 0 | `approved` | Đã duyệt |
| ⏳ | `order_pending` | > 0 | `pending` | Đang xử lý |
| ❌ | `order_reject` | > 0 | `rejected` | Hủy |

### Reconciliation Status (TT Đối soát)
| AT API | Field | Value | DB field | Display |
|--------|-------|-------|----------|---------|
| ✅ | `is_confirmed` | 1 | `is_confirmed = 1` | Đã đối soát |
| ⏳ | `is_confirmed` | 0 | `is_confirmed = 0` | Chưa đối soát |

## Checklist hoàn thành

- [x] Cập nhật `handleNewConversion()` để map từ order counters
- [x] Cập nhật `createConversionDirect()` để map từ order counters
- [x] Thêm debug logging chi tiết
- [x] Tạo tài liệu hướng dẫn
- [ ] Test import lại dữ liệu tháng 7
- [ ] Verify trạng thái đúng trong Conversions table
- [ ] Verify reconciliation preview hoạt động

## Notes

- **QUAN TRỌNG**: Luôn check `order_approved/order_pending/order_reject` trước, KHÔNG dựa vào field `status`
- Field `is_confirmed` từ AT API map trực tiếp vào DB, không cần xử lý
- `confirmed_time` chỉ có khi `is_confirmed = 1`
