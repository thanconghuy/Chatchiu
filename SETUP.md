# 🚀 Quick Setup Guide

## Bước 1: Lấy Access Key từ AccessTrade

1. Truy cập: http://pub.accesstrade.vn/accounts/profile
2. Đăng nhập vào tài khoản Publisher của bạn
3. Tìm phần "Access Key" hoặc "API Token"
4. Copy access key này

## Bước 2: Cài đặt Dependencies

```bash
npm install
```

## Bước 3: Cấu hình Environment

```bash
# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

Mở file `.env` và thay `your_access_token_here` bằng Access Key bạn vừa copy:

```env
ACCESSTRADE_API_TOKEN=abc123xyz456...
ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1
PORT=3000
```

## Bước 4: Chạy Server

```bash
npm start
```

## Bước 5: Mở Dashboard

Mở trình duyệt và truy cập: http://localhost:3000

## ✅ Test Kết Nối

1. Click nút "Test Connection"
2. Nếu thành công → Màu xanh "Connection successful"
3. Nếu lỗi → Kiểm tra lại Access Key

## 📊 Xem Transactions

1. Chọn Start Date và End Date (mặc định: 30 ngày gần nhất)
2. Click "Fetch Conversions"
3. Xem dữ liệu trong bảng và stats cards

## ⚠️ Common Issues

### "API Token not configured"
➜ Kiểm tra file `.env` có tồn tại và có `ACCESSTRADE_API_TOKEN`

### "Connection failed - 401 Unauthorized"
➜ Access Key sai hoặc đã hết hạn. Lấy lại key mới từ profile

### "Connection failed - Network Error"
➜ Kiểm tra internet connection

### Không có dữ liệu trong bảng
➜ Có thể không có transactions trong khoảng thời gian đó

## 📚 Tài liệu API

- API Documentation: https://developers.accesstrade.vn/api-publisher-vietnamese/
- Authentication: https://developers.accesstrade.vn/api-publisher-vietnamese/authentication
- Transactions API: https://developers.accesstrade.vn/api-publisher-vietnamese/lay-danh-sach-giao-dich

## 🎯 API Endpoints được sử dụng

| Endpoint | Method | Mục đích |
|----------|--------|----------|
| `/v1/transactions` | GET | Lấy danh sách giao dịch |
| `/v1/publishers/_me` | GET | Test connection |
| `/v1/offers` | GET | Lấy danh sách merchants |

## 💡 Tips

- **Rate Limit**: 10 requests/phút
- **Date Format**: Hệ thống tự chuyển YYYY-MM-DD thành ISO format
- **Console Logs**: Mở DevTools (F12) để xem chi tiết response từ API
