-- Migration: Add Email Templates for Payment Request Notifications
-- Date: 2026-01-16
-- Description: Add templates for admin notification (new request) and user cancellation confirmation

-- ========================================
-- 1. Admin Notification Email Template (New Payment Request)
-- ========================================

-- Subject
INSERT INTO system_settings (setting_key, setting_value, description, category, created_at, updated_at)
VALUES (
  'email_template_payment_request_created_admin_subject',
  '[ChatChiu Admin] Yêu cầu rút tiền mới: {{requestedAmount}}',
  'Email subject for admin notification when new payment request is created',
  'email_templates',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Content
INSERT INTO system_settings (setting_key, setting_value, description, category, created_at, updated_at)
VALUES (
  'email_template_payment_request_created_admin_content',
  '<p>Xin chào <strong>Admin</strong>,</p>

<p>Có một <strong style="color: #f59e0b;">yêu cầu rút tiền mới</strong> cần được xử lý!</p>

<!-- Alert Icon -->
<div style="text-align: center; margin: 30px 0;">
  <div style="font-size: 64px; color: #f59e0b;">🔔</div>
  <p style="font-size: 20px; font-weight: 600; color: #f59e0b; margin: 10px 0;">Yêu Cầu Mới</p>
</div>

<!-- User Info -->
<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin-top: 0;">👤 Thông tin người dùng</h3>
  <p><strong>Tên:</strong> {{userName}}</p>
  <p><strong>Email:</strong> {{userEmail}}</p>
  <p><strong>User ID:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">{{userId}}</code></p>
</div>

<!-- Request Details -->
<div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin-top: 0;">💳 Chi tiết yêu cầu rút tiền</h3>
  <p><strong>Mã yêu cầu:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">{{requestId}}</code></p>
  <p><strong>Số tiền yêu cầu:</strong> <span style="color: #dc2626; font-weight: 700; font-size: 24px;">{{requestedAmount}}</span></p>
  <p><strong>Số dư khả dụng:</strong> {{availableBalance}}</p>
  <p><strong>Ngân hàng:</strong> {{bankName}}</p>
  <p><strong>Số tài khoản:</strong> {{bankAccountNumber}}</p>
  <p><strong>Chủ tài khoản:</strong> {{bankAccountName}}</p>
  <p><strong>Chi nhánh:</strong> {{bankBranch}}</p>
  <p><strong>Thời gian tạo:</strong> {{createdAt}}</p>
</div>

<!-- User Notes (if any) -->
<div style="background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <p><strong>📝 Ghi chú từ người dùng:</strong></p>
  <p style="font-style: italic;">{{notes}}</p>
</div>

<!-- Action Required -->
<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <p><strong>⚠️ Cần xử lý:</strong></p>
  <p>Vui lòng kiểm tra và xét duyệt yêu cầu này trong vòng <strong>24 giờ</strong>.</p>
</div>

<!-- Action Buttons -->
<div style="text-align: center; margin: 30px 0;">
  <a href="{{adminPanelUrl}}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
    ✅ Xem & Xét Duyệt
  </a>
  <a href="{{userProfileUrl}}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
    👤 Xem Hồ Sơ User
  </a>
</div>

<!-- Statistics -->
<div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin-top: 0;">📊 Thống kê người dùng</h3>
  <p><strong>Tổng số dư:</strong> {{totalBalance}}</p>
  <p><strong>Tổng đã rút:</strong> {{totalWithdrawn}}</p>
  <p><strong>Số yêu cầu đang chờ:</strong> {{pendingRequestsCount}}</p>
  <p><strong>Tổng yêu cầu:</strong> {{totalRequestsCount}}</p>
</div>

<p>Email này được gửi tự động khi có yêu cầu rút tiền mới.</p>

<p>Trân trọng,<br><strong>ChatChiu System</strong></p>',
  'Email content for admin notification when new payment request is created',
  'email_templates',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ========================================
-- 2. User Cancellation Confirmation Email Template
-- ========================================

-- Subject
INSERT INTO system_settings (setting_key, setting_value, description, category, created_at, updated_at)
VALUES (
  'email_template_payment_cancelled_subject',
  '[ChatChiu] Yêu cầu rút tiền đã hủy: {{requestedAmount}}',
  'Email subject for user when payment request is cancelled',
  'email_templates',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Content
INSERT INTO system_settings (setting_key, setting_value, description, category, created_at, updated_at)
VALUES (
  'email_template_payment_cancelled_content',
  '<p>Xin chào <strong>{{userName}}</strong>,</p>

<p>Yêu cầu rút tiền của bạn đã được <strong style="color: #6b7280;">hủy thành công</strong>.</p>

<!-- Cancel Icon -->
<div style="text-align: center; margin: 30px 0;">
  <div style="font-size: 64px; color: #6b7280;">🚫</div>
  <p style="font-size: 20px; font-weight: 600; color: #6b7280; margin: 10px 0;">Đã Hủy</p>
</div>

<!-- Details -->
<div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin-top: 0;">💳 Thông tin yêu cầu đã hủy</h3>
  <p><strong>Mã yêu cầu:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">{{requestId}}</code></p>
  <p><strong>Số tiền:</strong> <span style="color: #6b7280; font-weight: 700; font-size: 20px;">{{requestedAmount}}</span></p>
  <p><strong>Ngân hàng:</strong> {{bankName}}</p>
  <p><strong>Số tài khoản:</strong> {{bankAccountNumber}}</p>
  <p><strong>Trạng thái:</strong> <span style="color: #6b7280; font-weight: 600;">Đã hủy</span></p>
  <p><strong>Hủy lúc:</strong> {{cancelledAt}}</p>
</div>

<!-- Balance Info -->
<div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <p><strong>💰 Số dư của bạn:</strong></p>
  <p>Số tiền <strong>{{requestedAmount}}</strong> đã được hoàn trả về số dư khả dụng của bạn.</p>
  <p><strong>Số dư khả dụng hiện tại:</strong> <span style="color: #10b981; font-weight: 700; font-size: 18px;">{{currentBalance}}</span></p>
</div>

<!-- Cancellation Reason (if provided) -->
<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <p><strong>📝 Lý do hủy:</strong></p>
  <p style="font-style: italic;">{{cancellationReason}}</p>
</div>

<!-- Next Steps -->
<div style="background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
  <p><strong>💡 Bạn có thể:</strong></p>
  <ul style="margin: 10px 0; padding-left: 20px;">
    <li>Tạo yêu cầu rút tiền mới bất kỳ lúc nào</li>
    <li>Số dư đã được hoàn trả và sẵn sàng sử dụng</li>
    <li>Kiểm tra lịch sử giao dịch của bạn</li>
  </ul>
</div>

<p>Nếu bạn không thực hiện thao tác hủy này, vui lòng liên hệ ngay với chúng tôi!</p>

<!-- Action Buttons -->
<div style="text-align: center; margin: 30px 0;">
  <a href="{{createNewRequestUrl}}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
    Tạo Yêu Cầu Mới
  </a>
  <a href="{{paymentHistoryUrl}}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px;">
    Xem Lịch Sử
  </a>
</div>

<p>Nếu có thắc mắc, vui lòng liên hệ <a href="{{supportUrl}}">Hỗ trợ</a> với mã yêu cầu: <code>{{requestId}}</code></p>

<p>Trân trọng,<br><strong>ChatChiu Team</strong></p>',
  'Email content for user when payment request is cancelled',
  'email_templates',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ========================================
-- 3. Admin Notification Email Setting
-- ========================================

INSERT INTO system_settings (setting_key, setting_value, description, category, created_at, updated_at)
VALUES (
  'admin_notification_email',
  'admin@chatchiu.com',
  'Email address to receive admin notifications (change this to your actual admin email)',
  'system',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO NOTHING;

-- ========================================
-- Verification Query
-- ========================================
-- Run this to verify the templates were added:
-- SELECT setting_key, LENGTH(setting_value) as content_length, description
-- FROM system_settings
-- WHERE setting_key LIKE 'email_template_payment%'
--    OR setting_key = 'admin_notification_email'
-- ORDER BY setting_key;
