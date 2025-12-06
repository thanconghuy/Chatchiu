const { pool } = require('../config/database');
const logger = require('../utils/logger');
const UAParser = require('ua-parser-js');

/**
 * Activity Logger Service
 *
 * Tracks user activities for monitoring, analytics, and auditing
 * Features:
 * - Async logging (non-blocking)
 * - Device/browser detection
 * - Performance metrics
 * - Product URL tracking
 */

// Activity types
const ACTIVITY_TYPES = {
  LINK_GENERATE_ATTEMPT: 'link_generate_attempt',
  LINK_GENERATE_SUCCESS: 'link_generate_success',
  LINK_GENERATE_FAILED: 'link_generate_failed',
  LOGIN: 'login',
  LOGOUT: 'logout',
  VIEW_MERCHANT: 'view_merchant',
  SEARCH_MERCHANT: 'search_merchant',
  VIEW_CONVERSIONS: 'view_conversions',
  VIEW_CLICKS: 'view_clicks',
  API_ERROR: 'api_error',
  SYNC_CONVERSIONS_START: 'sync_conversions_start',
  SYNC_CONVERSIONS_SUCCESS: 'sync_conversions_success',
  SYNC_CONVERSIONS_FAILED: 'sync_conversions_failed',
  ADMIN_NOTIFICATION: 'admin_notification',
  DEBT_NOTIFICATION: 'debt_notification'
};

class ActivityLogger {
  /**
   * Log user activity (async, non-blocking)
   *
   * @param {Object} options
   * @param {string} options.userId - User UUID
   * @param {string} options.activityType - Activity type
   * @param {string} [options.merchantId] - Merchant ID (optional)
   * @param {Object} [options.eventData] - Additional event data
   * @param {string} [options.productUrl] - Product URL (for link generation)
   * @param {Object} options.req - Express request object
   * @param {string} [options.status] - 'success', 'failed', 'error'
   * @param {string} [options.errorMessage] - Error message if failed
   * @param {number} [options.responseTime] - Response time in ms
   */
  static async log(options) {
    try {
      const {
        userId,
        activityType,
        merchantId = null,
        eventData = {},
        productUrl = null,
        req,
        status = 'success',
        errorMessage = null,
        responseTime = null
      } = options;

      // Parse user agent
      const userAgent = req?.headers['user-agent'] || '';
      const deviceInfo = this.parseUserAgent(userAgent);

      // Get IP address
      const ipAddress = req?.ip || req?.connection?.remoteAddress || null;

      // Insert log (fire and forget - don't await)
      setImmediate(async () => {
        try {
          await pool.query(`
            INSERT INTO user_activity_logs
            (user_id, activity_type, merchant_id, event_data, product_url,
             ip_address, user_agent, device_type, browser, os,
             status, error_message, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            userId,
            activityType,
            merchantId,
            JSON.stringify(eventData),
            productUrl,
            ipAddress,
            userAgent,
            deviceInfo.deviceType,
            deviceInfo.browser,
            deviceInfo.os,
            status,
            errorMessage,
            responseTime
          ]);
        } catch (err) {
          // Silent fail - don't break main flow
          logger.error('Activity log insert failed:', err.message);
        }
      });

    } catch (error) {
      // Silent fail - logging should never break the app
      logger.error('Activity logger error:', error.message);
    }
  }

  /**
   * Parse user agent to extract device/browser info
   */
  static parseUserAgent(userAgent) {
    try {
      const parser = new UAParser(userAgent);
      const result = parser.getResult();

      return {
        deviceType: result.device.type || 'desktop',
        browser: result.browser.name || 'Unknown',
        os: result.os.name || 'Unknown'
      };
    } catch (error) {
      return {
        deviceType: 'unknown',
        browser: 'unknown',
        os: 'unknown'
      };
    }
  }

  /**
   * Get recent activity logs for a user
   *
   * @param {string} userId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getUserActivity(userId, limit = 50) {
    const result = await pool.query(`
      SELECT
        id,
        activity_type,
        merchant_id,
        event_data,
        product_url,
        device_type,
        browser,
        status,
        error_message,
        created_at
      FROM user_activity_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  }

  /**
   * Get activity statistics
   *
   * @param {string} [userId] - Optional user filter
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {Promise<Object>}
   */
  static async getStats(userId = null, dateFrom, dateTo) {
    const query = userId
      ? `WHERE user_id = $1 AND created_at BETWEEN $2 AND $3`
      : `WHERE created_at BETWEEN $1 AND $2`;

    const params = userId
      ? [userId, dateFrom, dateTo]
      : [dateFrom, dateTo];

    const result = await pool.query(`
      SELECT
        activity_type,
        COUNT(*) as count,
        AVG(response_time_ms)::integer as avg_response_time,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM user_activity_logs
      ${query}
      GROUP BY activity_type
      ORDER BY count DESC
    `, params);

    return result.rows;
  }

  /**
   * Get top products by clicks
   *
   * @param {number} limit
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {Promise<Array>}
   */
  static async getTopProducts(limit = 10, dateFrom, dateTo) {
    const result = await pool.query(`
      SELECT
        product_url,
        COUNT(*) as click_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_activity_logs
      WHERE activity_type = 'link_generate_success'
        AND product_url IS NOT NULL
        AND created_at BETWEEN $1 AND $2
      GROUP BY product_url
      ORDER BY click_count DESC
      LIMIT $3
    `, [dateFrom, dateTo, limit]);

    return result.rows;
  }

  /**
   * Delete old logs (90+ days)
   * Called by cron job
   *
   * @returns {Promise<number>} Number of deleted rows
   */
  static async cleanupOldLogs() {
    try {
      const result = await pool.query(`
        DELETE FROM user_activity_logs
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
      `);

      const deletedCount = result.rowCount;
      logger.info(`Activity logs cleanup: ${deletedCount} rows deleted`);
      return deletedCount;
    } catch (error) {
      logger.error('Activity logs cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete logs by date range
   * Admin manual cleanup
   *
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {Promise<number>}
   */
  static async deleteLogs(dateFrom, dateTo) {
    const result = await pool.query(`
      DELETE FROM user_activity_logs
      WHERE created_at BETWEEN $1 AND $2
    `, [dateFrom, dateTo]);

    return result.rowCount;
  }

  /**
   * Get device distribution stats
   */
  static async getDeviceStats(dateFrom, dateTo) {
    const result = await pool.query(`
      SELECT
        device_type,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER() * 100, 2) as percentage
      FROM user_activity_logs
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY device_type
      ORDER BY count DESC
    `, [dateFrom, dateTo]);

    return result.rows;
  }
}

// Export
module.exports = {
  ActivityLogger,
  ACTIVITY_TYPES
};
