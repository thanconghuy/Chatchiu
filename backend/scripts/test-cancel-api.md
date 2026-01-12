# Test Cancel Payment Request từ Browser Console

## Bước 1: Lấy Payment Request ID

Mở DevTools Console và chạy:

```javascript
// Lấy danh sách payment requests
fetch('http://localhost:3007/api/payment-requests?limit=5', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
})
.then(r => r.json())
.then(data => {
  console.log('Payment requests:', data.requests);
  // Tìm request có status = 'pending'
  const pending = data.requests.find(r => r.status === 'pending');
  if (pending) {
    console.log('Pending request ID:', pending.id);
    console.log('Amount:', pending.requested_amount);
    console.log('Status:', pending.status);
  }
});
```

## Bước 2: Test Cancel API

Sau khi có ID, thay `<PAYMENT_REQUEST_ID>` bằng ID thực tế:

```javascript
// Test cancel API
fetch('http://localhost:3007/api/payment-requests/<PAYMENT_REQUEST_ID>', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
})
.then(r => r.json())
.then(data => {
  console.log('Cancel result:', data);
});
```

## Bước 3: Kiểm tra kết quả

Nếu thành công sẽ thấy:
```json
{
  "success": true,
  "message": "Đã hủy yêu cầu thanh toán"
}
```

Nếu lỗi sẽ thấy:
```json
{
  "success": false,
  "message": "<lý do lỗi>"
}
```

## Các lỗi có thể xảy ra:

1. **"Can only cancel pending requests"** → Request không còn status = 'pending'
2. **"Unauthorized"** → Không phải payment request của user
3. **"Payment request not found"** → ID không tồn tại

## Debug thêm:

Check request details:
```javascript
const id = '<PAYMENT_REQUEST_ID>';
fetch(`http://localhost:3007/api/payment-requests/${id}`, {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
  }
})
.then(r => r.json())
.then(data => console.log('Request details:', data));
```
