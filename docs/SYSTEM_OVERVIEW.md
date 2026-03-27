# Tổng quan hệ thống Chắt Chiu Online (Cashback System)

Cập nhật: 2026-03-14
Tên package: `accesstrade-dashboard` v1.0.0
Entry point: `api/index.js` (Vercel), `server.js` (local)

---

## 1. Mô tả hệ thống

Nền tảng cashback hoàn tiền: người dùng mua hàng qua link affiliate của hệ thống, nhận cashback sau khi đơn hàng được duyệt và đối soát. Hệ thống tích hợp AccessTrade API, quản lý vòng đời đơn hàng, đối soát định kỳ, và thanh toán cashback cho người dùng.

---

## 2. Kiến trúc tổng thể

```
Chatchiu/
├── api/                         # Vercel serverless entry
├── server.js                    # Express entry (local/dev)
├── backend/
│   ├── config/                  # Database pool, env config
│   ├── database/
│   │   └── migrations/          # ← SQL migration files (chuẩn)
│   ├── docs/                    # Internal backend docs
│   ├── jobs/                    # Cron jobs định kỳ
│   │   └── systemReconciliation/
│   ├── middleware/              # Auth, rate limit, CORS
│   ├── models/                  # DB models (query helpers)
│   ├── routes/                  # Express route handlers
│   │   └── admin/               # Admin sub-routes
│   ├── services/                # Business logic
│   │   └── systemReconciliation/
│   ├── templates/email/         # Email HTML templates
│   └── utils/                   # Helpers (format, validate)
├── frontend/
│   ├── *.html                   # User-facing pages
│   ├── admin/                   # Admin panel pages
│   ├── css/                     # Stylesheets
│   └── js/                      # Frontend scripts
├── docs/                        # ← Tất cả .md files (chuẩn)
└── test-script/                 # ← Test/debug scripts (chuẩn)
```

---

## 3. Quy ước lưu trữ file (áp dụng từ 2026-03-14)

| Loại file | Thư mục |
|---|---|
| Tài liệu `.md` | `docs/` |
| SQL migration | `backend/database/migrations/` |
| Test / debug scripts | `test-script/` |

---

## 4. Module chức năng

### 4.1 Auth & User
- **Routes**: `backend/routes/auth.js`, `backend/routes/neonAuthRoutes.js`
- **Models**: `User.js`, `PendingOAuthLink.js`
- JWT authentication + OAuth (Google)
- Quản lý profile, đổi mật khẩu, reset password

### 4.2 Dashboard User
- **Route**: `backend/routes/dashboard.js`
- Thống kê cashback cá nhân: approved, pending, tổng đơn, tỷ lệ duyệt
- Số dư từ `user_system_balance` (GENERATED COLUMN)
- Lịch sử click gần đây, danh sách merchant

### 4.3 Affiliate Link & Tracking
- **Services**: `accessTradeLink.js`, `tiktokShopLink.js`, `linkGenerator.js`, `trackingService.js`
- Tạo affiliate link qua AccessTrade API hoặc Deeplink DIY
- Theo dõi click, ghi nhận conversion
- Token API lưu trong `system_settings` DB (không phải env)

### 4.4 Auto-Sync Conversions
- **Service**: `backend/services/autoSyncService.js`
- **Route**: `backend/routes/admin.js` (`/auto-sync/*`)
- Đồng bộ đơn hàng từ AccessTrade API định kỳ (cron)
- Lịch sync lưu trong `system_settings`; node-cron v4 cần `.start()` sau `cron.schedule()`
- Sync type: `'manual'` (khi admin click) vs `'auto'` (cron schedule)

### 4.5 System Reconciliation (Đối soát)
- **Routes**: `backend/routes/systemReconciliationAdmin.js`, `systemReconciliationUser.js`
- **Services**: `backend/services/systemReconciliation/`
- **Jobs**: `backend/jobs/systemReconciliation/`
- Tạo kỳ đối soát theo tháng, duyệt đơn hàng vào kỳ
- Trạng thái kỳ: `draft` → `finalized` → thanh toán
- Danh sách chờ (waiting list) để gom đơn trước khi tạo kỳ

### 4.6 Payment Request (Rút tiền)
- **Routes**: `backend/routes/paymentRequest.js`
- **Service**: `backend/services/paymentRequestService.js`
- **Model**: `PaymentRequest.js`, `PaymentAccount.js`
- User tạo yêu cầu rút tiền, admin duyệt và đánh dấu đã thanh toán
- FIFO marking: `system_conversions.payment_status = 'paid'` theo thứ tự
- Số dư khả dụng = `user_system_balance.available_balance` (GENERATED COLUMN)

### 4.7 Notification & Email
- **Routes**: `backend/routes/notifications.js`
- **Services**: `EmailService.js`, `EmailTemplateService.js`, `notifications/`
- Email template HTML trong `backend/templates/email/`
- Thông báo trong app + email khi đơn duyệt, kỳ đối soát finalized, v.v.

### 4.8 Admin Panel
- **Routes**: `backend/routes/admin.js` + `backend/routes/admin/` (sub-routes)
- Dashboard tổng hợp, quản lý user, conversions, merchants
- Settings: API token, auto-sync schedule, withdrawal limits
- Monitoring: AccessTrade API vs DIY link stats

---

## 5. Database — Bảng quan trọng

| Bảng | Mô tả |
|---|---|
| `users` | Tài khoản người dùng (balance columns là stale, dùng `user_system_balance`) |
| `user_system_balance` | **Source of truth** số dư. `available_balance` là GENERATED COLUMN = `total_earned - total_withdrawn - pending_reserved` |
| `system_conversions` | Đơn hàng đồng bộ từ AccessTrade. Status: `pending/approved/rejected` |
| `system_reconciliations` | Kỳ đối soát. Status: `draft/finalized` |
| `system_reconciliation_items` | Đơn hàng thuộc từng kỳ |
| `reconciliation_waiting_list` | Danh sách chờ để gom vào kỳ mới |
| `payment_requests` | Yêu cầu rút tiền. Status: `pending/confirmed/paid/cancelled` |
| `payment_accounts` | Tài khoản ngân hàng user (mã hóa) |
| `clicks` | Lịch sử click affiliate |
| `auto_sync_history` | Lịch sử chạy auto-sync |
| `system_settings` | Cài đặt hệ thống (API token, cron schedule, ...) |
| `cashback_notifications` | Thông báo cashback |
| `email_logs` | Log email đã gửi |

---

## 6. Công thức số dư chuẩn

```
user_system_balance.available_balance  (GENERATED COLUMN — PostgreSQL)
  = total_earned - total_withdrawn - pending_reserved

total_earned        = SUM(cashback) từ system_conversions reconciled
total_withdrawn     = SUM đã thanh toán thực tế (payment_status='paid')
pending_reserved    = SUM đang bị giữ bởi payment request confirmed/pending
```

> **Quan trọng**: KHÔNG tính lại thủ công bằng subquery từ `system_conversions`. Luôn đọc `GREATEST(0, COALESCE(usb.available_balance, 0))` từ `user_system_balance`.

---

## 7. Vấn đề kỹ thuật cần xử lý (từ audit 2026-03-14)

### P0 — Khẩn cấp
- **SQL injection** tại `admin.js:5389-5394` (payment history query ghép chuỗi)
- **SQL injection** tại `cashbackStats.js:120` (ORDER BY chưa whitelist)
- **Endpoint nguy hiểm** `POST /api/dashboard/sync-balance` — user thường có thể ghi đè balance theo logic cũ → cần disable hoặc chuyển admin-only

### P1 — Cao
- `APISyncJob.js` gọi `BalanceManagementService.releaseReserved()` và `deductReserved()` không tồn tại → runtime fail
- Notification/User model vẫn đọc balance từ `users` table thay vì `user_system_balance`

### P2 — Đã giải quyết một phần
- ~~Migration numbering trùng~~ → đã xóa toàn bộ migrations cũ, chuẩn hoá về `backend/database/migrations/`
- ~~File backup/old~~ → đã xóa
- ~~Tài liệu phân tán~~ → đã gom về `docs/`

---

## 8. Frontend pages

### User
| File | Chức năng |
|---|---|
| `index.html` | Trang chủ / landing |
| `login.html` / `register.html` | Đăng nhập / đăng ký |
| `dashboard.html` | Dashboard chính |
| `statistics.html` | Thống kê cashback |
| `history.html` | Lịch sử đơn hàng |
| `payment-requests.html` | Tạo / xem yêu cầu rút tiền |
| `reconciliation-history.html` | Lịch sử đối soát |
| `system-balance-history.html` | Lịch sử số dư |
| `profile.html` | Hồ sơ cá nhân |
| `shopping.html` | Danh sách merchant |

### Admin
| File | Chức năng |
|---|---|
| `index.html` | Dashboard admin tổng hợp |
| `conversions.html` | Quản lý đơn hàng conversion |
| `at-orders.html` | Đơn hàng AccessTrade |
| `system-reconciliation.html` | Quản lý kỳ đối soát |
| `payment-requests.html` | Duyệt yêu cầu rút tiền |
| `payment-stats.html` | Thống kê thanh toán |
| `cashback-stats.html` | Thống kê cashback user |
| `users.html` | Quản lý người dùng |
| `merchants.html` | Quản lý merchant |
| `settings.html` | Cài đặt hệ thống (API, cron, limits) |
| `monitoring.html` | Giám sát link API vs DIY |
| `activity-logs.html` | Log hoạt động |
| `email-logs.html` | Log email |

---

## 9. Shared Frontend Scripts

| File | Chức năng |
|---|---|
| `js/config.js` | API_BASE URL config |
| `js/auth.js` | `apiRequest`, `saveAuth`, `getToken` |
| `js/user-sidebar-v2.js` | Sidebar user (dynamic load) |
| `js/system-balance-widget.js` | Widget số dư (gọi `/api/dashboard/stats`) |
| `js/analytics.js` | Theo dõi analytics |
| `admin/shared/utils.js` | `PaginationManager`, helper dùng chung cho admin |
| `admin/shared/sidebar.js` | Sidebar admin |
| `admin/csp-fix.js` | Event delegation thay inline onclick |

---

## 10. Deployment

- **Production**: Vercel (entry `api/index.js`)
- **Database**: Neon PostgreSQL (serverless)
- **Env variables**: `.env` local, Vercel env cho production
- **API token AccessTrade**: Lưu trong `system_settings` DB, KHÔNG chỉ dùng `process.env`
