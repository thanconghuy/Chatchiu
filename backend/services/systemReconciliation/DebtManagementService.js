/**
 * Debt Management Service
 *
 * Handles debt creation and management when orders are rejected after payout
 */

const { pool } = require('../../config/database');

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

      // Get conversion details for notification
      const convResult = await client.query(
        'SELECT order_code, merchant_name FROM conversions WHERE id = $1',
        [conversionId]
      );
      const conversion = convResult.rows[0];

      await client.query('COMMIT');

      // Send notification (async, don't wait)
      this.sendDebtNotification({
        userId,
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
   * (Placeholder - integrate with your notification system)
   *
   * @param {Object} params
   */
  static async sendDebtNotification({ userId, amount, orderCode, merchantName, reason }) {
    // TODO: Integrate with email/SMS service
    console.log(`[DEBT NOTIFICATION] User ${userId}:`);
    console.log(`  Order: ${orderCode} (${merchantName})`);
    console.log(`  Amount: ${amount}₫`);
    console.log(`  Reason: ${reason}`);

    // Example email content:
    const emailContent = `
      Xin chào,

      Đơn hàng #${orderCode} tại ${merchantName} đã bị merchant từ chối.

      Số tiền cashback ${amount}₫ đã được trừ vào số dư của bạn.
      Vui lòng nạp tiền hoặc sử dụng cashback mới để thanh toán khoản nợ này.

      Lý do: ${reason}

      Trân trọng,
      Cashback System
    `;

    // TODO: Send email
    // await EmailService.send(userId, 'Thông báo đơn hàng bị từ chối', emailContent);
  }
}

module.exports = DebtManagementService;
