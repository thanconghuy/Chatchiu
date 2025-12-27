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
    const validTypes = ['instant', 'reminder', 'urgent'];
    if (!validTypes.includes(templateType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template type. Must be: instant, reminder, or urgent'
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

    // Get template configurations
    const templates = {
      instant: {
        subject: '🎉 Bạn có cashback mới từ Shopee!',
        template: 'cashback-instant',
        context: {
          userName: 'Test User',
          amount: '250,000đ',
          totalAvailable: '1,500,000đ',
          merchant: 'Shopee',
          createRequestUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/payment-requests`,
          unsubscribeUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/notifications/unsubscribe/test/cashback-instant`
        }
      },
      reminder: {
        subject: '⏰ Nhắc nhở: Bạn có 1,500,000đ cashback chờ rút!',
        template: 'cashback-reminder',
        context: {
          userName: 'Test User',
          totalAvailable: '1,500,000đ',
          createRequestUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/payment-requests`,
          unsubscribeUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/notifications/unsubscribe/test/cashback-reminder`
        }
      },
      urgent: {
        subject: '🚨 KHẨN: Deadline đối soát sắp hết! Rút tiền ngay!',
        template: 'cashback-urgent',
        context: {
          userName: 'Test User',
          totalAvailable: '1,500,000đ',
          deadlineDate: '31/12/2025',
          createRequestUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/payment-requests`,
          unsubscribeUrl: `${process.env.BASE_URL || 'https://chatchiu.online'}/notifications/unsubscribe/test/cashback-urgent`
        }
      }
    };

    const templateConfig = templates[templateType];

    // Import EmailService
    const EmailService = require('../services/EmailService');

    // Send test email
    const emailResult = await EmailService.sendEmailWithTemplate({
      to: recipientEmail,
      subject: templateConfig.subject,
      template: templateConfig.template,
      context: templateConfig.context
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
