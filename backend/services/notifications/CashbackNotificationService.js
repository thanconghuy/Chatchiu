const { pool } = require('../../config/database');
const EmailService = require('../EmailService');
const logger = require('../../utils/logger');
const SystemSettings = require('../systemSettings');

/**
 * CashbackNotificationService
 * Manages automated email notifications for cashback withdrawals
 *
 * Features:
 * - Instant notification when user reaches withdrawal threshold
 * - Periodic reminders for users with pending cashback
 * - Urgent notifications before reconciliation deadline
 * - User preference management
 * - Rate limiting to prevent spam
 *
 * @class CashbackNotificationService
 */
class CashbackNotificationService {
  constructor() {
    this.BASE_URL = process.env.BASE_URL || 'https://chatchiu.online';

    // Rate limits to prevent spam
    this.RATE_LIMITS = {
      instant: { maxPerDay: 1, windowHours: 24 },
      periodic: { maxPerWeek: 1, windowDays: 7 },
      urgent: { maxPerDeadline: 2, windowDays: 5 }
    };
  }

  // ============================================================
  // TIER 1: INSTANT NOTIFICATIONS
  // ============================================================

  /**
   * Send instant notification when user reaches withdrawal threshold
   * Triggered when conversion is approved and available_balance >= min_threshold
   *
   * @param {string} userId - User ID
   * @param {number} availableBalance - Current available balance
   * @returns {Promise<Object>} Result of notification attempt
   */
  async sendInstantNotification(userId, availableBalance) {
    try {
      // Get minimum withdrawal threshold
      const minThreshold = await SystemSettings.get('min_withdrawal_amount', 50000);

      // Check if balance meets threshold
      if (availableBalance < minThreshold) {
        logger.info('Balance below threshold, skipping instant notification', {
          userId,
          availableBalance,
          minThreshold
        });
        return { status: 'skipped', reason: 'below_threshold' };
      }

      // Get user preferences
      const prefs = await this.getUserPreferences(userId);
      if (!prefs.cashback_instant_email) {
        logger.info('User opted out of instant notifications', { userId });
        return { status: 'skipped', reason: 'user_opted_out' };
      }

      // Check rate limit (max 1 per day)
      const canSend = await this.checkRateLimit(userId, 'instant');
      if (!canSend) {
        logger.info('Rate limit exceeded for instant notification', { userId });
        return { status: 'skipped', reason: 'rate_limit_exceeded' };
      }

      // Get user details
      const userResult = await pool.query(
        'SELECT id, email, full_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        logger.error('User not found', { userId });
        return { status: 'error', reason: 'user_not_found' };
      }

      const user = userResult.rows[0];

      // Send email
      const emailResult = await EmailService.sendEmailWithTemplate({
        to: user.email,
        subject: '🎉 Bạn có tiền cashback chờ rút!',
        template: 'cashback-available',
        context: {
          userName: user.full_name,
          amount: this.formatCurrency(availableBalance),
          minThreshold: this.formatCurrency(minThreshold),
          createRequestUrl: `${this.BASE_URL}/dashboard/payment-requests`,
          dashboardUrl: `${this.BASE_URL}/dashboard`,
          userId
        }
      });

      // Log notification
      await this.logNotification({
        userId,
        notificationType: 'instant',
        emailStatus: emailResult.success ? 'sent' : 'failed',
        availableBalance,
        minThreshold,
        emailTemplate: 'cashback-available',
        emailSubject: '🎉 Bạn có tiền cashback chờ rút!',
        emailMessageId: emailResult.messageId
      });

      // Update user preference timestamp
      await this.updateLastSentTimestamp(userId, 'last_instant_sent');

      logger.success('Instant notification sent successfully', {
        userId,
        email: user.email,
        availableBalance
      });

      return {
        status: 'sent',
        userId,
        email: user.email,
        availableBalance,
        messageId: emailResult.messageId
      };

    } catch (error) {
      logger.error('Failed to send instant notification', {
        userId,
        error: error.message,
        stack: error.stack
      });

      // Log failed attempt
      try {
        await this.logNotification({
          userId,
          notificationType: 'instant',
          emailStatus: 'failed',
          availableBalance,
          minThreshold: await SystemSettings.get('min_withdrawal_amount', 50000),
          emailTemplate: 'cashback-available',
          metadata: { error: error.message }
        });
      } catch (logError) {
        logger.error('Failed to log notification error', { logError });
      }

      return { status: 'error', error: error.message };
    }
  }

  // ============================================================
  // TIER 2: PERIODIC REMINDERS
  // ============================================================

  /**
   * Send periodic reminders to users with pending cashback
   * Run as a cron job (daily or weekly)
   *
   * @returns {Promise<Object>} Summary of reminder operation
   */
  async sendPeriodicReminders() {
    logger.info('Starting periodic cashback reminders...');

    try {
      const minThreshold = await SystemSettings.get('min_withdrawal_amount', 50000);

      // Get eligible users for reminders
      const eligibleUsers = await this.getEligibleUsersForReminder(minThreshold);

      logger.info(`Found ${eligibleUsers.length} users eligible for reminders`);

      const results = {
        total: eligibleUsers.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        details: []
      };

      // Process in batches to avoid overwhelming email server
      const BATCH_SIZE = 10;
      for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
        const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (user) => {
          try {
            const result = await this.sendSingleReminder(user, minThreshold);

            if (result.status === 'sent') {
              results.sent++;
            } else {
              results.skipped++;
            }

            results.details.push({
              userId: user.id,
              email: user.email,
              status: result.status,
              reason: result.reason
            });

          } catch (error) {
            logger.error('Failed to send reminder to user', {
              userId: user.id,
              error: error.message
            });
            results.failed++;
            results.details.push({
              userId: user.id,
              email: user.email,
              status: 'error',
              error: error.message
            });
          }
        }));

        // Small delay between batches
        if (i + BATCH_SIZE < eligibleUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      logger.success('Periodic reminders completed', results);
      return results;

    } catch (error) {
      logger.error('Failed to send periodic reminders', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send reminder to a single user
   * @private
   */
  async sendSingleReminder(user, minThreshold) {
    // Send email
    const emailResult = await EmailService.sendEmailWithTemplate({
      to: user.email,
      subject: '💰 Nhắc nhở: Bạn có tiền cashback chờ rút',
      template: 'cashback-reminder',
      context: {
        userName: user.full_name,
        amount: this.formatCurrency(user.available_balance),
        daysSinceEligible: user.days_since_eligible || 7,
        reminderFrequency: '7',
        createRequestUrl: `${this.BASE_URL}/dashboard/payment-requests`,
        dashboardUrl: `${this.BASE_URL}/dashboard`,
        unsubscribeUrl: `${this.BASE_URL}/api/notifications/unsubscribe/${user.id}/cashback-reminder`,
        userId: user.id
      }
    });

    // Log notification
    await this.logNotification({
      userId: user.id,
      notificationType: 'periodic',
      emailStatus: emailResult.success ? 'sent' : 'failed',
      availableBalance: user.available_balance,
      minThreshold,
      emailTemplate: 'cashback-reminder',
      emailSubject: '💰 Nhắc nhở: Bạn có tiền cashback chờ rút',
      emailMessageId: emailResult.messageId,
      metadata: {
        daysSinceEligible: user.days_since_eligible
      }
    });

    // Update last reminder sent timestamp
    await this.updateLastSentTimestamp(user.id, 'last_reminder_sent');

    logger.info('Reminder sent to user', {
      userId: user.id,
      email: user.email,
      availableBalance: user.available_balance
    });

    return {
      status: 'sent',
      userId: user.id,
      messageId: emailResult.messageId
    };
  }

  /**
   * Get list of users eligible for periodic reminders
   * @private
   */
  async getEligibleUsersForReminder(minThreshold) {
    const query = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.available_balance,
        EXTRACT(DAY FROM (NOW() - GREATEST(
          unp.last_reminder_sent,
          unp.last_instant_sent,
          u.updated_at
        )))::INTEGER as days_since_eligible
      FROM users u
      LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
      WHERE u.available_balance >= $1
        -- No pending payment request
        AND NOT EXISTS (
          SELECT 1 FROM payment_requests pr
          WHERE pr.user_id = u.id
          AND pr.status = 'pending'
        )
        -- User has not unsubscribed
        AND (unp.unsubscribed_at IS NULL)
        -- Reminder email preference is enabled
        AND (unp.cashback_reminder_email IS NULL OR unp.cashback_reminder_email = TRUE)
        -- Last reminder was sent more than X days ago
        AND (
          unp.last_reminder_sent IS NULL
          OR unp.last_reminder_sent < NOW() - (COALESCE(unp.reminder_frequency_days, 7) || ' days')::INTERVAL
        )
      ORDER BY u.available_balance DESC
      LIMIT 100
    `;

    const result = await pool.query(query, [minThreshold]);
    return result.rows;
  }

  // ============================================================
  // TIER 3: URGENT REMINDERS
  // ============================================================

  /**
   * Send urgent reminders before reconciliation deadline
   *
   * @param {number} daysBeforeDeadline - Send when deadline is X days away
   * @returns {Promise<Object>} Summary of urgent reminders
   */
  async sendUrgentReminders(daysBeforeDeadline = 3) {
    logger.info(`Checking for urgent reminders (${daysBeforeDeadline} days before deadline)...`);

    try {
      // TODO: Implement reconciliation deadline check
      // For now, skip if no reconciliation module integrated
      logger.info('Urgent reminders: Reconciliation integration pending');

      return {
        status: 'skipped',
        reason: 'reconciliation_not_integrated',
        message: 'Urgent reminders will be available after reconciliation module integration'
      };

    } catch (error) {
      logger.error('Failed to send urgent reminders', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    const result = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default preferences
      await pool.query(
        'INSERT INTO user_notification_preferences (user_id) VALUES ($1)',
        [userId]
      );

      return {
        cashback_instant_email: true,
        cashback_reminder_email: true,
        cashback_urgent_email: true,
        reminder_frequency_days: 7
      };
    }

    return result.rows[0];
  }

  /**
   * Check rate limit for notification type
   */
  async checkRateLimit(userId, notificationType) {
    const limit = this.RATE_LIMITS[notificationType];
    if (!limit) return true;

    const windowHours = limit.windowHours || (limit.windowDays * 24);

    const query = `
      SELECT COUNT(*) as count
      FROM cashback_notifications
      WHERE user_id = $1
      AND notification_type = $2
      AND email_sent_at > NOW() - INTERVAL '${windowHours} hours'
      AND email_status = 'sent'
    `;

    const result = await pool.query(query, [userId, notificationType]);
    const count = parseInt(result.rows[0].count);

    const maxAllowed = limit.maxPerDay || limit.maxPerWeek || limit.maxPerDeadline;

    return count < maxAllowed;
  }

  /**
   * Log notification to database
   */
  async logNotification(data) {
    const {
      userId,
      notificationType,
      emailStatus,
      availableBalance,
      minThreshold,
      emailTemplate,
      emailSubject,
      emailMessageId,
      metadata
    } = data;

    const query = `
      INSERT INTO cashback_notifications (
        user_id,
        notification_type,
        email_status,
        available_balance,
        min_threshold,
        email_template,
        email_subject,
        email_message_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const result = await pool.query(query, [
      userId,
      notificationType,
      emailStatus,
      availableBalance,
      minThreshold,
      emailTemplate,
      emailSubject || null,
      emailMessageId || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  }

  /**
   * Update last sent timestamp for user
   */
  async updateLastSentTimestamp(userId, field) {
    await pool.query(
      `UPDATE user_notification_preferences SET ${field} = NOW() WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Get notification statistics
   */
  async getStatistics(startDate, endDate) {
    const query = `
      SELECT
        notification_type,
        COUNT(*) as total_sent,
        COUNT(CASE WHEN email_status = 'sent' THEN 1 END) as successful,
        COUNT(CASE WHEN email_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN user_action = 'created_request' THEN 1 END) as conversions,
        AVG(available_balance) as avg_balance,
        SUM(available_balance) as total_balance
      FROM cashback_notifications
      WHERE email_sent_at BETWEEN $1 AND $2
      GROUP BY notification_type
      ORDER BY notification_type
    `;

    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  }
}

module.exports = new CashbackNotificationService();
