/**
 * Debt Management Service
 *
 * Handles debt creation and management when orders are rejected after payout
 */

const { pool } = require('../../config/database');
const emailService = require('../emailService');
const { ActivityLogger, ACTIVITY_TYPES } = require('../activityLogger');
const escapeHtml = require('../../utils/escapeHtml');

class DebtManagementService {
  /**
   * Handle order rejection after reconciliation payout
   * Creates debt and sends notification to user
   *
   * @param {Object} params
   * @param {string} params.conversionId - Conversion ID that was rejected
   * @param {string} params.userId - User ID
   * @param {number} params.cashbackAmount - Amount to charge back
   * @param {string} params.reason - Rejection reason
   * @returns {Object} Debt transaction details
   */
  static async handleRejectedOrder({ conversionId, userId, cashbackAmount, reason }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current balance
      const balanceResult = await client.query(
        'SELECT * FROM user_system_balance WHERE user_id = $1',
        [userId]
      );

      const currentBalance = balanceResult.rows[0] || {
        available_balance: 0,
        debt_balance: 0
      };

      const balanceBefore = parseFloat(currentBalance.available_balance);
      const debtBefore = parseFloat(currentBalance.debt_balance);

      // Deduct from available balance and add to debt
      await client.query(`
        INSERT INTO user_system_balance (
          user_id, available_balance, debt_balance, updated_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          available_balance = user_system_balance.available_balance - $2,
          debt_balance = user_system_balance.debt_balance + $3,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, cashbackAmount, cashbackAmount]);

      // Log transaction
      await client.query(`
        INSERT INTO user_balance_transactions (
          user_id, transaction_type, amount,
          balance_before, balance_after,
          reserved_before, reserved_after,
          description, conversion_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `, [
        userId,
        'chargeback',
        -cashbackAmount,
        balanceBefore,
        balanceBefore - cashbackAmount,
        debtBefore,
        debtBefore + cashbackAmount,
        `Đơn hàng bị từ chối sau đối soát: ${reason}`,
        conversionId
      ]);

      // Update conversion status
      await client.query(`
        UPDATE conversions
        SET system_reconciliation_status = 'api_rejected'
        WHERE id = $1
      `, [conversionId]);

      // Get conversion and user details for notification
      const convResult = await client.query(
        'SELECT order_code, merchant_name FROM conversions WHERE id = $1',
        [conversionId]
      );
      const conversion = convResult.rows[0];

      // Get user email for notification
      const userResult = await client.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      await client.query('COMMIT');

      // Send notification (async, don't wait)
      this.sendDebtNotification({
        userId,
        userEmail: user?.email,
        amount: cashbackAmount,
        orderCode: conversion?.order_code,
        merchantName: conversion?.merchant_name,
        reason
      }).catch(err => console.error('Failed to send debt notification:', err));

      return {
        conversionId,
        userId,
        chargebackAmount: cashbackAmount,
        newDebt: debtBefore + cashbackAmount,
        newBalance: balanceBefore - cashbackAmount
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Offset debt with new cashback earnings
   *
   * @param {string} userId
   * @param {number} newCashback - New cashback amount
   * @returns {Object} Offset details
   */
  static async offsetDebtWithCashback(userId, newCashback) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current debt
      const balanceResult = await client.query(
        'SELECT debt_balance FROM user_system_balance WHERE user_id = $1',
        [userId]
      );

      const currentDebt = parseFloat(balanceResult.rows[0]?.debt_balance || 0);

      if (currentDebt === 0) {
        // No debt, return full cashback as available
        await client.query('COMMIT');
        return {
          offsetAmount: 0,
          availableCashback: newCashback,
          remainingDebt: 0
        };
      }

      // Calculate offset
      const offsetAmount = Math.min(newCashback, currentDebt);
      const availableCashback = newCashback - offsetAmount;
      const remainingDebt = currentDebt - offsetAmount;

      // Update balance
      await client.query(`
        UPDATE user_system_balance
        SET debt_balance = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [remainingDebt, userId]);

      // Log offset transaction
      if (offsetAmount > 0) {
        await client.query(`
          INSERT INTO user_balance_transactions (
            user_id, transaction_type, amount,
            description, created_at
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
          userId,
          'debt_offset',
          offsetAmount,
          `Trừ nợ tự động: ${offsetAmount}₫ từ cashback mới`
        ]);
      }

      await client.query('COMMIT');

      return {
        offsetAmount,
        availableCashback,
        remainingDebt
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user has debt (blocks withdrawal)
   *
   * @param {string} userId
   * @returns {Object} { hasDebt, debtAmount }
   */
  static async checkUserDebt(userId) {
    const result = await pool.query(
      'SELECT debt_balance FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    const debtBalance = parseFloat(result.rows[0]?.debt_balance || 0);

    return {
      hasDebt: debtBalance > 0,
      debtAmount: debtBalance
    };
  }

  /**
   * Get debt history for user
   *
   * @param {string} userId
   * @param {Object} options - { page, limit }
   * @returns {Object} Debt transactions
   */
  static async getDebtHistory(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const query = `
      SELECT
        id, transaction_type, amount,
        balance_before, balance_after,
        description, conversion_id, created_at
      FROM user_balance_transactions
      WHERE user_id = $1
        AND transaction_type IN ('chargeback', 'debt_offset')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_balance_transactions
      WHERE user_id = $1
        AND transaction_type IN ('chargeback', 'debt_offset')
    `;

    const [transactionsResult, countResult] = await Promise.all([
      pool.query(query, [userId, limit, offset]),
      pool.query(countQuery, [userId])
    ]);

    return {
      transactions: transactionsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Send debt notification to user
   * Sends email notification and logs activity
   *
   * @param {Object} params
   */
  static async sendDebtNotification({ userId, userEmail, amount, orderCode, merchantName, reason }) {
    const startTime = Date.now();

    console.log(`[DEBT NOTIFICATION] User ${userId}:`);
    console.log(`  Order: ${orderCode} (${merchantName})`);
    console.log(`  Amount: ${amount}₫`);
    console.log(`  Reason: ${reason}`);

    const formattedAmount = new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);

    // Email subject and content
    const subject = `⚠️ Đơn hàng bị từ chối - ${orderCode}`;
    const message = `
Xin chào,

Đơn hàng #${orderCode} tại ${merchantName} đã bị merchant từ chối.

Số tiền cashback ${formattedAmount} đã được trừ vào số dư của bạn.
Vui lòng nạp tiền hoặc sử dụng cashback mới để thanh toán khoản nợ này.

Lý do từ chối: ${reason}

Trân trọng,
ChatChiu Cashback System
    `.trim();

    let emailSent = false;
    let notificationMethod = 'console';

    // Try to send email if user email is provided
    if (userEmail) {
      try {
        // Escape HTML in user-controlled content to prevent XSS
        const safeOrderCode = escapeHtml(orderCode);
        const safeMerchantName = escapeHtml(merchantName);
        const safeReason = escapeHtml(reason);
        // formattedAmount is already safe (from Intl.NumberFormat)

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f44336 0%, #e91e63 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
              .info-box { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ Đơn hàng bị từ chối</h1>
              </div>
              <div class="content">
                <p>Xin chào,</p>
                <div class="alert">
                  <strong>Đơn hàng #${safeOrderCode}</strong> tại <strong>${safeMerchantName}</strong> đã bị merchant từ chối.
                </div>
                <div class="info-box">
                  <p><strong>Số tiền cashback:</strong> ${formattedAmount}</p>
                  <p><strong>Lý do từ chối:</strong> ${safeReason}</p>
                </div>
                <p>Số tiền cashback <strong>${formattedAmount}</strong> đã được trừ vào số dư của bạn.</p>
                <p>Vui lòng nạp tiền hoặc sử dụng cashback mới để thanh toán khoản nợ này.</p>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">
                  Nếu bạn có thắc mắc, vui lòng liên hệ bộ phận hỗ trợ.
                </p>
              </div>
              <div class="footer">
                <p>© 2025 ChatChiu Cashback. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        emailSent = await emailService.sendEmail({
          to: userEmail,
          subject: subject,
          html: htmlContent,
          text: message
        });

        if (emailSent) {
          notificationMethod = 'email';
          console.log(`[DEBT NOTIFICATION] Email sent to ${userEmail}`);
        } else {
          console.log('[DEBT NOTIFICATION] Email sending failed - SMTP not configured');
        }
      } catch (error) {
        console.error('[DEBT NOTIFICATION] Failed to send email:', error.message);
      }
    } else {
      console.log('[DEBT NOTIFICATION] No email provided - skipping email notification');
    }

    // Log activity
    const responseTime = Date.now() - startTime;
    try {
      await ActivityLogger.log({
        activityType: ACTIVITY_TYPES.DEBT_NOTIFICATION,
        userId,
        eventData: {
          orderCode,
          merchantName,
          amount,
          reason,
          emailSent,
          notificationMethod
        },
        req: { headers: {}, ip: 'system' },
        status: 'success',
        responseTime
      });
    } catch (logError) {
      console.error('[DEBT NOTIFICATION] Failed to log activity:', logError.message);
    }

    return {
      sent: emailSent,
      method: notificationMethod,
      message
    };
  }
}

module.exports = DebtManagementService;
