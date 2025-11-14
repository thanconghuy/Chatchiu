# Hướng Dẫn Đồng Bộ Trạng Thái Conversion

## Tổng Quan

Tính năng **Đồng Bộ Trạng Thái** cho phép cập nhật trạng thái của các đơn hàng đã import từ AccessTrade API. Tính năng này hữu ích khi:

- Dữ liệu cũ trong database có trạng thái không chính xác
- Cần cập nhật trạng thái mới nhất từ AccessTrade cho các đơn đã tồn tại
- Muốn đồng bộ `status`, `is_confirmed`, và `confirmed_time` cho một khoảng thời gian cụ thể

## Cách Sử Dụng

### 1. Truy cập Tools Page

1. Đăng nhập vào Admin Panel
2. Chọn menu **Tools** (🔧)
3. Kéo xuống phần **"🔄 Đồng Bộ Trạng Thái Đơn Hàng"**

### 2. Chọn Khoảng Thời Gian

- **Từ ngày**: Chọn ngày bắt đầu (ví dụ: 01/07/2025)
- **Đến ngày**: Chọn ngày kết thúc (ví dụ: 08/07/2025)

### 3. Thực Hiện Đồng Bộ

1. Nhấn nút **"🔄 Đồng Bộ Trạng Thái"**
2. Đợi hệ thống xử lý (có thông báo "⏳ Đang đồng bộ...")
3. Xem kết quả hiển thị bên dưới

## Kết Quả Đồng Bộ

### Thông Tin Tổng Quan

- **Tổng đơn từ AT API**: Số đơn hàng lấy từ AccessTrade trong khoảng thời gian
- **Đã cập nhật**: Số đơn có thay đổi và đã được cập nhật
- **Bỏ qua (không thay đổi)**: Số đơn không có thay đổi
- **Lỗi**: Số đơn gặp lỗi khi xử lý

### Chi Tiết Cập Nhật

Hệ thống hiển thị chi tiết 10 đơn đầu tiên có thay đổi, bao gồm:
- Order ID
- Các trường đã thay đổi (status, is_confirmed, confirmed_time, v.v.)
- Giá trị cũ → Giá trị mới

## Trường Được Đồng Bộ

| Trường | Mô Tả |
|--------|-------|
| `status` | Trạng thái đơn hàng (pending, approved, rejected) |
| `is_confirmed` | Trạng thái đối soát (0 = Chưa đối soát, 1 = Đã đối soát) |
| `confirmed_time` | Thời gian xác nhận đối soát |
| `order_approved` | Số lượng đơn đã duyệt |
| `order_pending` | Số lượng đơn đang chờ |
| `order_reject` | Số lượng đơn bị từ chối |

## Logic Đồng Bộ

### 1. Lấy Dữ Liệu từ AccessTrade API

Hệ thống gọi API AccessTrade để lấy tất cả conversions trong khoảng thời gian đã chọn.

### 2. Map Trạng Thái

Trạng thái được map theo thứ tự ưu tiên:

```
Priority 1: order_approved > 0 → status = 'approved'
Priority 2: order_reject > 0 → status = 'rejected'
Priority 3: order_pending hoặc default → status = 'pending'
```

### 3. So Sánh và Cập Nhật

- Tìm đơn hàng trong database theo `order_id`
- So sánh từng trường
- Chỉ cập nhật nếu có thay đổi
- Bỏ qua nếu:
  - Đơn không tồn tại trong DB
  - Không có trường nào thay đổi

## Ví Dụ Sử Dụng

### Trường Hợp 1: Sửa Dữ Liệu Import Sai

**Vấn đề**: Import dữ liệu tháng 7/2025, tất cả đơn có status = 'pending' và is_confirmed = 0, nhưng trên AT đã là 'approved' và đã đối soát.

**Giải pháp**:
1. Chọn từ ngày: 01/07/2025
2. Chọn đến ngày: 31/07/2025
3. Nhấn "Đồng Bộ Trạng Thái"
4. Kiểm tra kết quả: Các đơn sẽ được cập nhật về đúng trạng thái

### Trường Hợp 2: Cập Nhật Trạng Thái Mới Nhất

**Vấn đề**: Muốn đảm bảo dữ liệu trong DB khớp với AT API.

**Giải pháp**:
- Chạy sync định kỳ (ví dụ: hàng tuần)
- Chọn khoảng thời gian cần cập nhật
- Hệ thống tự động cập nhật chỉ những đơn có thay đổi

## API Endpoint

### POST `/api/admin/sync-conversion-status`

**Request Body**:
```json
{
  "startDate": "2025-07-01",
  "endDate": "2025-07-08"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Sync completed: 15 updated, 5 skipped, 0 errors",
  "results": {
    "total": 20,
    "updated": 15,
    "skipped": 5,
    "errors": 0,
    "details": [
      {
        "order_id": "AT123456",
        "status": "updated",
        "changes": {
          "status": "approved",
          "is_confirmed": 1,
          "confirmed_time": "2025-07-05T10:30:00Z"
        },
        "old_values": {
          "status": "pending",
          "is_confirmed": 0,
          "confirmed_time": null
        }
      }
    ]
  }
}
```

## Lưu Ý

1. **Không ảnh hưởng đến user balance**: Tính năng này chỉ cập nhật metadata, không thay đổi số dư người dùng.

2. **An toàn với dữ liệu**: Chỉ cập nhật các trường thay đổi, không ghi đè toàn bộ.

3. **Rate Limiting**: Không có giới hạn số lượng đơn, nhưng nên sync theo từng tháng để dễ quản lý.

4. **Log đầy đủ**: Tất cả thay đổi được log chi tiết trong backend logs.

## Khắc Phục Sự Cố

### Lỗi "No conversions found in AccessTrade API"

**Nguyên nhân**: Không có dữ liệu trong khoảng thời gian đã chọn trên AT API.

**Giải pháp**: Kiểm tra lại khoảng thời gian hoặc xác nhận có đơn hàng trên AT.

### Tất cả đơn đều "skipped - not_found_in_db"

**Nguyên nhân**: Các đơn từ AT chưa được import vào database.

**Giải pháp**: Sử dụng tính năng "Import" trước khi sync.

### Lỗi "Failed to sync conversion status"

**Nguyên nhân**: Lỗi kết nối AT API hoặc database.

**Giải pháp**:
- Kiểm tra AT API token
- Kiểm tra kết nối database
- Xem backend logs để biết chi tiết

## Code Location

### Backend
- **Service**: `backend/services/trackingService.js` → `syncConversionStatus()`
- **Route**: `backend/routes/admin.js` → `POST /admin/sync-conversion-status`

### Frontend
- **UI**: `frontend/admin/tools.html` → "Đồng Bộ Trạng Thái Đơn Hàng" section
- **JS**: `frontend/admin/tools.js` → `syncConversionStatus()`

## Changelog

### Version 1.0 (2025-11-12)
- ✅ Tạo tính năng đồng bộ trạng thái conversion
- ✅ Hỗ trợ sync theo khoảng thời gian
- ✅ Hiển thị chi tiết thay đổi
- ✅ Log đầy đủ trong backend
