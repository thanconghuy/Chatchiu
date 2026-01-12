const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const CashbackNotificationService = require('../services/notifications/CashbackNotificationService');
const SystemSettings = require('../services/systemSettings');
const cronJobs = require('../jobs/cronJobs');
const logger = require('../utils/logger');

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * GET /api/admin/notifications/stats
 * Get notification statistics
 */
router.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const stats = await CashbackNotificationService.getStatistics(start, end);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        statistics: stats
      }
    });

  } catch (error) {
    logger.error('Get notification stats error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/notifications/recent
 * Get recent notifications with pagination
 */
router.get('/admin/recent', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 20, offset = 0, type } = req.query;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM cashback_notifications cn
      JOIN users u ON cn.user_id = u.id
    `;

    let query = `
      SELECT
        cn.*,
        u.email,
        u.full_name as user_name
      FROM cashback_notifications cn
      JOIN users u ON cn.user_id = u.id
    `;

    const params = [];
    let whereClause = '';

    if (type) {
      whereClause = ` WHERE cn.notification_type = $1`;
      params.push(type);
    }

    // Get total count
    const countResult = await pool.query(countQuery + whereClause, type ? [type] : []);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    query += whereClause;
    query += `
      ORDER BY cn.email_sent_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(total / parseInt(limit)),
          currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1
        }
      }
    });

  } catch (error) {
    logger.error('Get recent notifications error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/notifications/test-instant
 * Test sending instant notification to a user
 */
router.post('/admin/test-instant', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get user balance
    const userResult = await pool.query(
      'SELECT available_balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const availableBalance = parseFloat(userResult.rows[0].available_balance);

    // Send test notification
    const result = await CashbackNotificationService.sendInstantNotification(
      userId,
      availableBalance
    );

    res.json({
      success: true,
      message: 'Test notification sent',
      data: result
    });

  } catch (error) {
    logger.error('Test instant notification error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/notifications/send-reminders
 * Manually trigger periodic reminders
 */
router.post('/admin/send-reminders', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Manual trigger: periodic reminders', { adminId: req.userId });

    const results = await CashbackNotificationService.sendPeriodicReminders();

    res.json({
      success: true,
      message: 'Periodic reminders sent',
      data: results
    });

  } catch (error) {
    logger.error('Send periodic reminders error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/notifications/settings
 * Get all notification settings (convenience endpoint)
 */
router.get('/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const settings = {
      cashback_reminder_enabled: await SystemSettings.get('cashback_reminder_enabled', true),
      cashback_reminder_frequency_days: await SystemSettings.get('cashback_reminder_frequency_days', 7),
      cashback_reminder_time: await SystemSettings.get('cashback_reminder_time', '10:00'),
      cashback_instant_enabled: await SystemSettings.get('cashback_instant_enabled', true)
    };

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    logger.error('Get notification settings error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/notifications/settings
 * Update notification settings and reload cron jobs
 */
router.put('/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const {
      cashback_reminder_enabled,
      cashback_reminder_frequency_days,
      cashback_reminder_time,
      cashback_instant_enabled
    } = req.body;

    const updates = {};

    // Update each setting that was provided
    if (cashback_reminder_enabled !== undefined) {
      await SystemSettings.set('cashback_reminder_enabled', cashback_reminder_enabled);
      updates.cashback_reminder_enabled = cashback_reminder_enabled;
    }

    if (cashback_reminder_frequency_days !== undefined) {
      const days = parseInt(cashback_reminder_frequency_days);
      if (isNaN(days) || days < 1 || days > 30) {
        return res.status(400).json({
          success: false,
          message: 'Số ngày phải từ 1 đến 30'
        });
      }
      await SystemSettings.set('cashback_reminder_frequency_days', days);
      updates.cashback_reminder_frequency_days = days;
    }

    if (cashback_reminder_time !== undefined) {
      // Validate time format HH:MM
      const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(cashback_reminder_time)) {
        return res.status(400).json({
          success: false,
          message: 'Thời gian phải có định dạng HH:MM (ví dụ: 10:00)'
        });
      }
      await SystemSettings.set('cashback_reminder_time', cashback_reminder_time);
      updates.cashback_reminder_time = cashback_reminder_time;
    }

    if (cashback_instant_enabled !== undefined) {
      await SystemSettings.set('cashback_instant_enabled', cashback_instant_enabled);
      updates.cashback_instant_enabled = cashback_instant_enabled;
    }

    // Reload cron jobs to apply new schedule
    if (cashback_reminder_time !== undefined || cashback_reminder_enabled !== undefined) {
      logger.info('Reloading cron jobs to apply new notification settings');
      await cronJobs.reload();
    }

    res.json({
      success: true,
      message: 'Cập nhật cấu hình thành công',
      data: updates
    });

  } catch (error) {
    logger.error('Update notification settings error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/admin/test-template
 * Send test email with specific template
 */
router.post('/admin/test-template', authenticateAdmin, async (req, res) => {
  try {
    const { templateType, recipientEmail } = req.body;

    if (!templateType || !recipientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Template type and recipient email are required'
      });
    }

    // Validate template type
    const validTypes = [
      'instant', 'reminder', 'urgent',
      'payment_confirmed', 'payment_rejected', 'payment_paid',
      'reconciliation_finalized'
    ];
    if (!validTypes.includes(templateType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template type. Must be one of: ' + validTypes.join(', ')
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Load template from SystemSettings
    const SystemSettings = require('../services/systemSettings');

    const subject = await SystemSettings.get(`email_template_${templateType}_subject`);
    let htmlContent = await SystemSettings.get(`email_template_${templateType}_content`);

    if (!subject || !htmlContent) {
      return res.status(404).json({
        success: false,
        message: `Template ${templateType} not found in database. Please reload the Notification Settings page first to load default templates.`
      });
    }

    // Sample data based on template type
    let sampleData = {};

    if (templateType === 'instant' || templateType === 'reminder' || templateType === 'urgent') {
      // Cashback notification templates
      sampleData = {
        userName: 'Nguyễn Văn A',
        amount: '250,000₫',
        totalAvailable: '1,500,000₫',
        merchant: 'Shopee',
        createRequestUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/payment-requests`,
        unsubscribeUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/notifications/unsubscribe/test/${templateType}`
      };
    } else if (templateType.startsWith('payment_')) {
      // Payment request templates
      sampleData = {
        userName: 'Nguyễn Văn A',
        paymentId: 'PR-2026-001',
        amount: '1,500,000₫',
        bankAccount: 'ACB - 1234567890 - Nguyễn Văn A',
        approvedDate: '04/01/2026',
        paidDate: '04/01/2026',
        transactionId: 'TXN-2026-ABC123',
        reason: 'Thông tin tài khoản ngân hàng không hợp lệ. Vui lòng kiểm tra lại số tài khoản và tên chủ tài khoản.'
      };
    } else if (templateType === 'reconciliation_finalized') {
      // Reconciliation template
      sampleData = {
        userName: 'Nguyễn Văn A',
        reconciliationId: 'REC-2026-Q1',
        period: 'Q1/2026 (01/01/2026 - 31/03/2026)',
        totalAmount: '15,750,000₫',
        finalizedDate: '04/01/2026',
        totalOrders: '127',
        totalPayments: '45'
      };
    }

    // Replace variables in subject and content
    let finalSubject = subject;
    let finalContent = htmlContent;

    for (const [key, value] of Object.entries(sampleData)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      finalSubject = finalSubject.replace(regex, value);
      finalContent = finalContent.replace(regex, value);
    }

    // Import EmailService
    const EmailService = require('../services/EmailService');

    // Send test email with custom HTML
    const emailResult = await EmailService.sendEmail({
      to: recipientEmail,
      subject: finalSubject,
      html: finalContent
    });

    if (emailResult.success) {
      logger.info('Test email sent successfully', {
        adminId: req.userId,
        templateType,
        recipientEmail
      });

      res.json({
        success: true,
        message: `Test email sent to ${recipientEmail}`,
        data: {
          templateType,
          recipient: recipientEmail
        }
      });
    } else {
      throw new Error(emailResult.error || 'Failed to send test email');
    }

  } catch (error) {
    logger.error('Send test template error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/notifications/cleanup
 * Clear old notification logs (older than X days)
 */
router.delete('/admin/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const { days = 90, confirmDelete } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: 'Confirmation required. Set confirmDelete: true to proceed.'
      });
    }

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Days must be a positive number'
      });
    }

    // Count logs to be deleted
    const countQuery = `
      SELECT COUNT(*) as count
      FROM cashback_notifications
      WHERE email_sent_at < NOW() - INTERVAL '${daysNum} days'
    `;

    const countResult = await pool.query(countQuery);
    const toDelete = parseInt(countResult.rows[0].count);

    // Delete old logs
    const deleteQuery = `
      DELETE FROM cashback_notifications
      WHERE email_sent_at < NOW() - INTERVAL '${daysNum} days'
    `;

    await pool.query(deleteQuery);

    logger.info('Notification logs cleaned up', {
      adminId: req.userId,
      days: daysNum,
      deleted: toDelete
    });

    res.json({
      success: true,
      message: `Đã xóa ${toDelete} logs cũ hơn ${daysNum} ngày`,
      data: {
        deleted: toDelete,
        days: daysNum
      }
    });

  } catch (error) {
    logger.error('Cleanup notifications error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/notifications/clear-all
 * Clear ALL notification logs (requires double confirmation)
 */
router.delete('/admin/clear-all', authenticateAdmin, async (req, res) => {
  try {
    const { confirmClearAll } = req.body;

    if (confirmClearAll !== 'DELETE_ALL_LOGS') {
      return res.status(400).json({
        success: false,
        message: 'Invalid confirmation. Send confirmClearAll: "DELETE_ALL_LOGS" to proceed.'
      });
    }

    // Count all logs
    const countResult = await pool.query('SELECT COUNT(*) as count FROM cashback_notifications');
    const totalLogs = parseInt(countResult.rows[0].count);

    // Delete all
    await pool.query('DELETE FROM cashback_notifications');

    logger.warn('ALL notification logs cleared', {
      adminId: req.userId,
      deleted: totalLogs
    });

    res.json({
      success: true,
      message: `Đã xóa tất cả ${totalLogs} notification logs`,
      data: {
        deleted: totalLogs
      }
    });

  } catch (error) {
    logger.error('Clear all notifications error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/notifications/admin/templates
 * Get all email templates
 */
router.get('/admin/templates', authenticateAdmin, async (req, res) => {
  try {
    const SystemSettings = require('../services/systemSettings');

    // Define default templates
    const defaultTemplates = {
      // === CASHBACK NOTIFICATION TEMPLATES ===
      instant: {
        subject: '🎉 Bạn có cashback mới từ {merchant}!',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #667eea;">Chúc mừng {{userName}}! 🎉</h2>
  <p>Bạn vừa nhận được <strong style="color: #10b981; font-size: 20px;">{{amount}}</strong> cashback!</p>
  <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; color: #065f46;">💰 Tổng số dư khả dụng: <strong>{{totalAvailable}}</strong></p>
  </div>
  <p>Bạn có thể tạo yêu cầu rút tiền ngay bây giờ!</p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Tạo Yêu Cầu Rút Tiền
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Không muốn nhận email này? <a href="{{unsubscribeUrl}}" style="color: #667eea;">Hủy đăng ký</a>
  </p>
</div>`
      },
      reminder: {
        subject: '⏰ Nhắc nhở: Bạn có {{totalAvailable}} cashback chờ rút!',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #f59e0b;">Xin chào {{userName}}! ⏰</h2>
  <p>Bạn vẫn còn cashback chưa rút:</p>
  <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
    <p style="margin: 0; font-size: 16px; color: #92400e;">Số dư khả dụng</p>
    <p style="margin: 10px 0; font-size: 32px; font-weight: bold; color: #f59e0b;">{{totalAvailable}}</p>
  </div>
  <p>Đừng để tiền nằm không nhé! Tạo yêu cầu rút tiền ngay hôm nay.</p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Rút Tiền Ngay
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Không muốn nhận email nhắc nhở? <a href="{{unsubscribeUrl}}" style="color: #f59e0b;">Hủy đăng ký</a>
  </p>
</div>`
      },
      urgent: {
        subject: '🚨 KHẨN: Deadline đối soát sắp hết! Rút tiền ngay!',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fee2e2; padding: 16px; border-left: 4px solid #ef4444; margin-bottom: 20px;">
    <h2 style="color: #991b1b; margin: 0;">⚠️ THÔNG BÁO KHẨN!</h2>
  </div>
  <p>Xin chào {{userName}},</p>
  <p><strong>Deadline đối soát sắp hết!</strong> Nếu không rút tiền trước deadline, cashback của bạn sẽ bị khóa và không thể rút được nữa.</p>
  <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
    <p style="margin: 0; font-size: 16px; color: #991b1b;">Số tiền sắp bị khóa</p>
    <p style="margin: 10px 0; font-size: 32px; font-weight: bold; color: #ef4444;">{{totalAvailable}}</p>
  </div>
  <p style="color: #991b1b; font-weight: bold;">⏰ Hành động ngay để không mất tiền!</p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #ef4444; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin: 10px 0; font-weight: bold;">
    TẠO YÊU CẦU RÚT TIỀN NGAY
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Email này rất quan trọng. <a href="{{unsubscribeUrl}}" style="color: #ef4444;">Hủy đăng ký</a> nếu bạn không muốn nhận nữa.
  </p>
</div>`
      },

      // === PAYMENT REQUEST TEMPLATES ===
      payment_confirmed: {
        subject: '✅ Yêu cầu thanh toán #{{paymentId}} đã được duyệt',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #d1fae5; padding: 16px; border-left: 4px solid #10b981; margin-bottom: 20px;">
    <h2 style="color: #065f46; margin: 0;">✅ Yêu cầu đã được duyệt!</h2>
  </div>
  <p>Xin chào {{userName}},</p>
  <p>Yêu cầu thanh toán <strong>#{{paymentId}}</strong> của bạn đã được duyệt thành công.</p>
  <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Mã yêu cầu:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{paymentId}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Số tiền:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #10b981; font-size: 18px;">{{amount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Tài khoản nhận:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{bankAccount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Ngày duyệt:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{approvedDate}}</td>
      </tr>
    </table>
  </div>
  <p>Chúng tôi sẽ xử lý thanh toán và chuyển tiền đến tài khoản của bạn trong vòng <strong>1-3 ngày làm việc</strong>.</p>
  <p>Bạn sẽ nhận được email xác nhận khi tiền đã được chuyển thành công.</p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Xem Chi Tiết Yêu Cầu
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Cảm ơn bạn đã sử dụng Chatchiu!
  </p>
</div>`
      },
      payment_rejected: {
        subject: '❌ Yêu cầu thanh toán #{{paymentId}} bị từ chối',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fee2e2; padding: 16px; border-left: 4px solid #ef4444; margin-bottom: 20px;">
    <h2 style="color: #991b1b; margin: 0;">❌ Yêu cầu bị từ chối</h2>
  </div>
  <p>Xin chào {{userName}},</p>
  <p>Rất tiếc, yêu cầu thanh toán <strong>#{{paymentId}}</strong> của bạn đã bị từ chối.</p>
  <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Mã yêu cầu:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{paymentId}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Số tiền:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; font-size: 18px;">{{amount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Lý do từ chối:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #ef4444;">{{reason}}</td>
      </tr>
    </table>
  </div>
  <p><strong>Bước tiếp theo:</strong></p>
  <ul style="color: #374151;">
    <li>Kiểm tra lại thông tin tài khoản ngân hàng</li>
    <li>Đảm bảo số dư cashback đủ để rút</li>
    <li>Tạo yêu cầu mới với thông tin chính xác</li>
  </ul>
  <p>Số tiền <strong>{{amount}}</strong> đã được hoàn lại vào số dư khả dụng của bạn.</p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Tạo Yêu Cầu Mới
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Nếu bạn có thắc mắc, vui lòng liên hệ support@chatchiu.com
  </p>
</div>`
      },
      payment_paid: {
        subject: '💸 Đã chuyển tiền cho yêu cầu #{{paymentId}}',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dbeafe; padding: 16px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
    <h2 style="color: #1e40af; margin: 0;">💸 Tiền đã được chuyển!</h2>
  </div>
  <p>Xin chào {{userName}},</p>
  <p>Chúng tôi đã chuyển tiền cho yêu cầu <strong>#{{paymentId}}</strong> đến tài khoản ngân hàng của bạn.</p>
  <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Mã yêu cầu:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{paymentId}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Số tiền:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #3b82f6; font-size: 20px;">{{amount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Tài khoản nhận:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{bankAccount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Ngày chuyển:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{paidDate}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Mã giao dịch:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; font-family: monospace;">{{transactionId}}</td>
      </tr>
    </table>
  </div>
  <p>Tiền sẽ xuất hiện trong tài khoản của bạn trong vòng <strong>vài phút đến vài giờ</strong> tùy ngân hàng.</p>
  <p style="background: #fef3c7; padding: 12px; border-radius: 6px; font-size: 14px;">
    💡 <strong>Lưu ý:</strong> Nếu sau 24 giờ bạn chưa nhận được tiền, vui lòng liên hệ ngân hàng hoặc support của chúng tôi.
  </p>
  <a href="https://chatchiu.online/payment-requests" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Xem Lịch Sử Giao Dịch
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Cảm ơn bạn đã tin tưởng sử dụng Chatchiu! 🎉
  </p>
</div>`
      },

      // === RECONCILIATION TEMPLATES ===
      reconciliation_finalized: {
        subject: '📊 Kỳ đối soát {{period}} đã hoàn thành',
        content: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f3e8ff; padding: 16px; border-left: 4px solid #9333ea; margin-bottom: 20px;">
    <h2 style="color: #581c87; margin: 0;">📊 Đối soát hoàn thành!</h2>
  </div>
  <p>Xin chào {{userName}},</p>
  <p>Kỳ đối soát <strong>{{period}}</strong> đã được hoàn tất và khóa sổ.</p>
  <div style="background: #faf5ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Mã đối soát:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{reconciliationId}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Kỳ đối soát:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{period}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Tổng thanh toán:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #9333ea; font-size: 20px;">{{totalAmount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Ngày hoàn thành:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{finalizedDate}}</td>
      </tr>
    </table>
  </div>
  <p><strong>Kết quả đối soát:</strong></p>
  <ul style="color: #374151;">
    <li>Tổng số đơn hàng: <strong>{{totalOrders}}</strong></li>
    <li>Tổng số yêu cầu thanh toán: <strong>{{totalPayments}}</strong></li>
    <li>Tổng số tiền đã chi trả: <strong>{{totalAmount}}</strong></li>
  </ul>
  <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #92400e;">
      ⚠️ <strong>Lưu ý:</strong> Các đơn hàng trong kỳ này đã được khóa. Cashback chưa rút sẽ không thể tạo yêu cầu thanh toán nữa.
    </p>
  </div>
  <p>Nếu bạn có thắc mắc về kết quả đối soát, vui lòng liên hệ bộ phận kế toán.</p>
  <a href="https://chatchiu.online/reconciliations" style="display: inline-block; background: #9333ea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 0;">
    Xem Chi Tiết Đối Soát
  </a>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="font-size: 12px; color: #6b7280;">
    Email tự động từ hệ thống Chatchiu
  </p>
</div>`
      }
    };

    // Get templates from SystemSettings or use defaults
    const templates = {};
    for (const [type, defaultTemplate] of Object.entries(defaultTemplates)) {
      const savedSubject = await SystemSettings.get(`email_template_${type}_subject`, defaultTemplate.subject);
      const savedContent = await SystemSettings.get(`email_template_${type}_content`, defaultTemplate.content);

      templates[type] = {
        subject: savedSubject,
        content: savedContent
      };
    }

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    logger.error('Get email templates error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/admin/templates/:type
 * Update email template for a specific type
 */
router.put('/admin/templates/:type', authenticateAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { subject, content } = req.body;

    // Validate type
    const validTypes = [
      'instant', 'reminder', 'urgent',
      'payment_confirmed', 'payment_rejected', 'payment_paid',
      'reconciliation_finalized'
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template type. Must be one of: ' + validTypes.join(', ')
      });
    }

    // Validate required fields
    if (!subject || !content) {
      return res.status(400).json({
        success: false,
        message: 'Subject and content are required'
      });
    }

    const SystemSettings = require('../services/systemSettings');

    // Save to SystemSettings
    await SystemSettings.set(`email_template_${type}_subject`, subject, req.userId);
    await SystemSettings.set(`email_template_${type}_content`, content, req.userId);

    logger.info('Email template updated', {
      adminId: req.userId,
      type,
      subjectLength: subject.length,
      contentLength: content.length
    });

    res.json({
      success: true,
      message: 'Template đã được lưu thành công',
      data: {
        type,
        subject,
        content
      }
    });

  } catch (error) {
    logger.error('Update email template error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/notifications/eligible-users
 * Get list of users eligible for notifications
 */
router.get('/admin/eligible-users', authenticateAdmin, async (req, res) => {
  try {
    const minThreshold = 50000; // Default minimum withdrawal

    const query = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.available_balance,
        u.pending_balance,
        unp.cashback_reminder_email,
        unp.last_reminder_sent,
        (
          SELECT COUNT(*)
          FROM payment_requests pr
          WHERE pr.user_id = u.id
          AND pr.status = 'pending'
        ) as pending_requests
      FROM users u
      LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
      WHERE u.available_balance >= $1
      ORDER BY u.available_balance DESC
      LIMIT 100
    `;

    const result = await pool.query(query, [minThreshold]);

    res.json({
      success: true,
      data: {
        users: result.rows,
        total: result.rows.length,
        minThreshold
      }
    });

  } catch (error) {
    logger.error('Get eligible users error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================
// USER ENDPOINTS
// ============================================================

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [req.userId]
    );

    let preferences = result.rows[0];

    if (!preferences) {
      // Create default preferences
      const insertResult = await pool.query(
        'INSERT INTO user_notification_preferences (user_id) VALUES ($1) RETURNING *',
        [req.userId]
      );
      preferences = insertResult.rows[0];
    }

    res.json({
      success: true,
      data: preferences
    });

  } catch (error) {
    logger.error('Get notification preferences error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const {
      cashback_instant_email,
      cashback_reminder_email,
      cashback_urgent_email,
      reminder_frequency_days
    } = req.body;

    const updates = [];
    const values = [req.userId];
    let paramCount = 2;

    if (cashback_instant_email !== undefined) {
      updates.push(`cashback_instant_email = $${paramCount++}`);
      values.push(cashback_instant_email);
    }

    if (cashback_reminder_email !== undefined) {
      updates.push(`cashback_reminder_email = $${paramCount++}`);
      values.push(cashback_reminder_email);
    }

    if (cashback_urgent_email !== undefined) {
      updates.push(`cashback_urgent_email = $${paramCount++}`);
      values.push(cashback_urgent_email);
    }

    if (reminder_frequency_days !== undefined) {
      updates.push(`reminder_frequency_days = $${paramCount++}`);
      values.push(reminder_frequency_days);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    const query = `
      UPDATE user_notification_preferences
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Update notification preferences error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/notifications/history
 * Get user's notification history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT
        cn.*,
        u.email,
        u.full_name as user_name
      FROM cashback_notifications cn
      JOIN users u ON cn.user_id = u.id
      WHERE cn.user_id = $1
      ORDER BY cn.email_sent_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [req.userId, parseInt(limit), parseInt(offset)]);

    // Count total
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM cashback_notifications WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    logger.error('Get notification history error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/notifications/unsubscribe/:userId/:type
 * Unsubscribe from specific notification type (public endpoint for email links)
 */
router.get('/unsubscribe/:userId/:type', async (req, res) => {
  try {
    const { userId, type } = req.params;

    // Map type to column name
    const typeMap = {
      'cashback-reminder': 'cashback_reminder_email',
      'cashback-instant': 'cashback_instant_email',
      'cashback-urgent': 'cashback_urgent_email'
    };

    const column = typeMap[type];

    if (!column) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Invalid Link</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Link không hợp lệ</h1>
          <p>Vui lòng kiểm tra lại link trong email.</p>
        </body>
        </html>
      `);
    }

    // Update preference
    await pool.query(
      `UPDATE user_notification_preferences
       SET ${column} = FALSE, unsubscribed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );

    logger.info('User unsubscribed from notification', { userId, type });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Đã Hủy Đăng Ký</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
          }
          .container {
            background: white;
            color: #333;
            max-width: 500px;
            margin: 0 auto;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          }
          .success-icon { font-size: 64px; margin-bottom: 20px; }
          h1 { color: #667eea; margin-bottom: 20px; }
          p { line-height: 1.6; color: #666; }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Đã Hủy Đăng Ký Thành Công</h1>
          <p>Bạn sẽ không nhận được email <strong>${type === 'cashback-reminder' ? 'nhắc nhở cashback' : 'thông báo cashback'}</strong> nữa.</p>
          <p>Bạn vẫn có thể quản lý cài đặt email trong trang Dashboard của mình.</p>
          <a href="${process.env.BASE_URL || 'https://chatchiu.online'}/dashboard/settings" class="btn">
            Quay về Dashboard
          </a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    logger.error('Unsubscribe error', {
      error: error.message,
      userId: req.params.userId,
      type: req.params.type
    });

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Lỗi</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <h1 class="error">❌ Đã xảy ra lỗi</h1>
        <p>Vui lòng thử lại sau hoặc liên hệ hỗ trợ.</p>
      </body>
      </html>
    `);
  }
});

module.exports = router;
