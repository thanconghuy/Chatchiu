# Báo cáo kỹ thuật tổng thể dự án ChatChiu

Ngày rà soát: 2026-03-14  
Phạm vi: toàn bộ repository `f:\VSCODE\Chatchiu` (backend, frontend, api, migration, docs kỹ thuật)  
Người thực hiện: Codex

## 1) Tóm tắt điều hành

Hệ thống đã có mức độ hoàn thiện cao về mặt chức năng: kiến trúc backend/frontend rõ ràng, nhiều module nghiệp vụ đã triển khai (cashback, payment request, đối soát hệ thống, auto-sync, notification/email), số lượng route và migration lớn cho thấy dự án đã đi vào vận hành thực tế.

Tuy nhiên, có một số rủi ro kỹ thuật quan trọng cần xử lý sớm:
- Có lỗ hổng SQL injection ở một số endpoint admin.
- Có endpoint debug/user có thể ghi đè dữ liệu balance theo công thức cũ.
- Một số module/job đang gọi method không tồn tại (có nguy cơ fail runtime khi chạy cron).
- Logic số dư đang phân tán giữa mô hình cũ và mô hình mới (nguy cơ lệch dữ liệu liên module).
- Tình trạng migration và file backup/old khá dày, tăng rủi ro vận hành.

## 2) Snapshot kỹ thuật hiện tại

- Tổng file JS: `391`
- Tổng file Markdown: `147`
- Route handlers trong `backend/routes`: `236` (18 file routes)
- Service files trong `backend/services`: `29`
- Trang HTML frontend: `50`
- Migration trong `backend/migrations`: `65` file
- Nhóm migration trùng prefix version: `13` nhóm (ví dụ `020`, `022`, ..., `068`)
- File backup/bak/old: `17` file
- Trạng thái git hiện tại: có thay đổi chưa commit ở nhiều file backend/frontend và có migration mới `backend/migrations/067_resync_all_user_balances.sql`

## 3) Những phần đã làm được (điểm mạnh)

### 3.1 Kiến trúc và module nghiệp vụ đã đầy đủ
- Backend Express phân lớp khá rõ: `routes`, `services`, `models`, `middleware`, `jobs`, `migrations`.
- Có hệ module rộng:
  - Auth/JWT/OAuth/Neon auth
  - Dashboard user/admin
  - Payment request workflow
  - System reconciliation + jobs
  - Notification + email templates + email logs
  - Auto-sync AccessTrade

### 3.2 Nâng cấp logic balance theo hướng đúng (gần đây)
- Các thay đổi mới trong working tree cho thấy đã chuyển dần sang dùng balance chuẩn từ `user_system_balance`:
  - `backend/routes/cashbackStats.js`
  - `backend/routes/paymentStats.js`
  - `backend/routes/systemReconciliationAdmin.js`
  - `backend/services/paymentRequestService.js`
  - `frontend/js/system-balance-widget.js`
- Migration mới `067_resync_all_user_balances.sql` bổ sung quy trình resync toàn bộ chỉ số tài chính quan trọng.

### 3.3 Tăng tính vận hành thực tế
- Đã có cơ chế lưu API token vào DB settings và reload runtime:
  - `backend/services/accessTradeLink.js`
  - `backend/routes/admin.js`
- Auto-sync service đã bổ sung `.start()` cho cron job v4 và thêm tham số sync type:
  - `backend/services/autoSyncService.js`

## 4) Các vấn đề đang gặp (phân loại ưu tiên)

## P0 - Khẩn cấp (ảnh hưởng an toàn dữ liệu/ bảo mật / tài chính)

### P0.1 SQL injection ở endpoint admin payment history
- Vị trí:
  - `backend/routes/admin.js:5389`
  - `backend/routes/admin.js:5390`
  - `backend/routes/admin.js:5391`
  - `backend/routes/admin.js:5394`
- Mô tả:
  - Query ghép chuỗi trực tiếp từ `period`, `status`, `user_id`, `limit`, `offset`.
  - Không parameterized đầy đủ.
- Tác động:
  - Rủi ro truy vấn sai, lộ dữ liệu, phá dữ liệu (tùy mức khai thác).
- Đề xuất:
  - Refactor toàn bộ query theo whitelist + bind params (`$1...$n`), ép kiểu số cho `limit/offset`.

### P0.2 SQL injection qua sort param ở cashback stats
- Vị trí:
  - `backend/routes/cashbackStats.js:120`
- Mô tả:
  - `ORDER BY ${sortBy} ${sortOrder}` lấy trực tiếp từ query param, chưa whitelist.
- Tác động:
  - Có thể inject vào câu lệnh SQL.
- Đề xuất:
  - Áp dụng whitelist tương tự `paymentStats` (`validSortColumns`, `ASC/DESC`).

### P0.3 Endpoint user debug có thể ghi đè balance theo logic cũ
- Vị trí:
  - `backend/routes/dashboard.js:1003`
  - `backend/routes/dashboard.js:1034`
- Mô tả:
  - `POST /api/dashboard/sync-balance` cho user thường (`authenticateToken`) thực hiện resync balance theo công thức cũ và cập nhật trực tiếp cột `available_balance`.
  - Trong khi migration đã xác định `available_balance` là generated column.
- Tác động:
  - Rủi ro sai lệch số dư tài chính, xung đột với chuẩn mới.
  - Có thể gây lỗi runtime hoặc ghi đè dữ liệu không đúng nghiệp vụ.
- Đề xuất:
  - Disable ngay endpoint này trên production.
  - Chuyển thành admin-only internal tool, chỉ gọi service chuẩn và audit log đầy đủ.

## P1 - Cao (lỗi runtime định kỳ / lệch nghiệp vụ liên module)

### P1.1 APISyncJob gọi method không tồn tại
- Vị trí:
  - `backend/jobs/systemReconciliation/APISyncJob.js:97`
  - `backend/jobs/systemReconciliation/APISyncJob.js:109`
  - `backend/jobs/systemReconciliation/APISyncJob.js:255`
  - `backend/jobs/systemReconciliation/APISyncJob.js:262`
- Mô tả:
  - Job gọi `BalanceManagementService.releaseReserved()` và `deductReserved()`.
  - Nhưng `backend/services/systemReconciliation/BalanceManagementService.js` không có 2 method này.
  - Kiểm tra runtime cho thấy `undefined`.
- Tác động:
  - Cron/API sync job có thể fail khi gặp high-risk flow.
- Đề xuất:
  - Đồng bộ API contract giữa Job và Service (đổi tên method hoặc bổ sung implementation + test).

### P1.2 Mâu thuẫn nguồn dữ liệu số dư (mô hình cũ vs mới)
- Vị trí:
  - `backend/routes/notifications.js:131`
  - `backend/services/notifications/CashbackNotificationService.js:298-310`
  - `backend/models/User.js` (nhiều chỗ dùng `users.available_balance/pending_balance/total_cashback`)
- Mô tả:
  - Nhiều luồng đã chuyển sang `user_system_balance`.
  - Nhưng notification/auth/user model vẫn dùng cột balance trên `users`.
- Tác động:
  - Cùng một user có thể thấy số liệu khác nhau giữa dashboard/payment/notification.
- Đề xuất:
  - Chọn một source of truth duy nhất (khuyến nghị `user_system_balance`) và chuẩn hóa toàn bộ luồng đọc/ghi.

### P1.3 SIGTERM shutdown bug
- Vị trí:
  - `server-cashback.js:337`
  - `server-cashback.js:403`
- Mô tả:
  - Gọi `server.close()` nhưng không có biến `server` được gán từ `app.listen`.
- Tác động:
  - Shutdown graceful không đúng, ảnh hưởng deploy/restart.
- Đề xuất:
  - Gán `const server = app.listen(...)` trước khi dùng `server.close`.

## P2 - Trung bình (kỹ thuật nợ, vận hành khó, tăng nguy cơ lỗi tương lai)

### P2.1 Migration numbering trùng nhiều nhóm
- Bằng chứng:
  - `13` nhóm trùng prefix version trong `backend/migrations` (`020, 022, 029, ... 068`).
- Tác động:
  - Dễ chạy sai migration, khó audit lịch sử schema.
- Đề xuất:
  - Chuẩn hóa naming/version (timestamp hoặc sequence duy nhất), có bảng migration history bắt buộc.

### P2.2 Có 2 vùng migration (`backend/migrations` và `migrations/`)
- Tác động:
  - Dễ nhầm lẫn runner và thứ tự migration theo môi trường.
- Đề xuất:
  - Hợp nhất về một chuẩn duy nhất và cập nhật migration runner chính thức.

### P2.3 Nhiều file backup/old trong code chạy production
- Bằng chứng:
  - `17` file `.backup/.bak/.OLD`.
- Tác động:
  - Tăng nhiễu, dễ sửa nhầm, khó review.
- Đề xuất:
  - Di chuyển sang `archive/` hoặc xóa có kiểm soát.

### P2.4 Không có test command chuẩn ở cấp `package.json`
- Bằng chứng:
  - `package.json` hiện không có script `test`.
  - Có nhiều script test rời rạc/manual.
- Tác động:
  - Khó tích hợp CI, khó chống regression.
- Đề xuất:
  - Chuẩn hóa test runner (Jest/Vitest) + `npm test` + smoke test CI cho luồng payment/reconciliation.

## P3 - Thấp (chất lượng duy trì)

### P3.1 Tài liệu kỹ thuật phân tán và có chồng chéo logic theo thời gian
- Bằng chứng:
  - Nhiều file phân tích/fix/workflow ở root và docs.
- Tác động:
  - Onboarding và vận hành dễ đọc nhầm phiên bản logic.
- Đề xuất:
  - Gom thành bộ tài liệu chuẩn: `architecture`, `balance-formula`, `payment-state-machine`, `migration-policy`.

### P3.2 Một số script phụ có syntax lỗi
- Bằng chứng:
  - `temp_recon.js` (`Unexpected end of input`)
  - `backend/scripts/full-system-analysis.js` (`Invalid or unexpected token`)
- Tác động:
  - Chủ yếu ảnh hưởng công cụ nội bộ.
- Đề xuất:
  - Sửa hoặc loại bỏ nếu không dùng.

## 5) Đề xuất cải thiện theo lộ trình ưu tiên

## Giai đoạn 0-3 ngày (Hotfix)
- Vá ngay các điểm P0:
  - Refactor SQL ở `admin.js` payment-history.
  - Whitelist sort ở `cashbackStats`.
  - Tắt/giới hạn `/api/dashboard/sync-balance` và `/debug-balance`.
- Thêm test regression cho 3 lỗi trên.

## Giai đoạn 1-2 tuần
- Sửa contract APISyncJob ↔ BalanceManagementService.
- Chuẩn hóa source of truth cho balance trên toàn hệ thống.
- Sửa graceful shutdown ở `server-cashback.js`.
- Chuẩn hóa API response balance (field naming thống nhất camelCase/snake_case qua adapter rõ ràng).

## Giai đoạn 2-4 tuần
- Dọn technical debt:
  - Hợp nhất migration strategy.
  - Dọn backup/old files.
  - Chuẩn hóa test pipeline (`npm test`, CI smoke tests).
- Viết “Balance Consistency Check” chạy định kỳ + cảnh báo.

## 6) Khuyến nghị quản trị kỹ thuật

- Thiết lập checklist bắt buộc khi merge cho module tài chính:
  - Security query check (không string interpolation cho SQL input ngoài whitelist).
  - State machine check cho payment statuses.
  - Migration compatibility check (up/down và rollback plan).
  - Data consistency check (`total_earned`, `total_withdrawn`, `pending_reserved`, `available_balance`).

- Thiết lập “single metric definition document” làm chuẩn duy nhất cho toàn bộ backend/frontend/reporting.

## 7) Kết luận

Dự án có nền tảng chức năng tốt và đã xử lý được nhiều vấn đề thực chiến quan trọng, đặc biệt ở mảng balance và đối soát.  
Ưu tiên hiện tại là khóa các rủi ro P0/P1 để đảm bảo an toàn dữ liệu tài chính và ổn định vận hành. Sau đó tập trung chuẩn hóa migration, test và tài liệu để giảm nợ kỹ thuật dài hạn.

