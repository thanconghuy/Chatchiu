/**
 * Balance Management Service - REDESIGNED
 *
 * Purpose: Manage user balance from system reconciliation
 * Version: 2.0 - With correct reserve/release logic
 *
 * Key Changes:
 * - Reserve balance when creating payment request
 * - Release balance when cancelling payment request
 * - Only update total_withdrawn when marking as paid (no balance deduction)
 * - Complete audit trail via balance_transactions
 */

const { pool } = require('../../config/database');
const DebtManagementService = require('./DebtManagementService');
const SystemSettingsService = require('../systemSettingsService');
const logger = require('../../utils/logger');

class BalanceManagementService {
  /**
   * Get user's system balance
   *
   * @param {string} userId
   * @returns {Promise<Object>} Balance details
   */
  static async getUserBalance(userId) {
    const query = `
      SELECT
        user_id,
        available_balance,
        pending_balance,
        reserved_balance,
        debt_balance,
        total_earned,
        total_withdrawn,
        last_reconciliation_date,
        updated_at
      FROM user_system_balance
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      // Return zero balance if not exists
      return {
        user_id: userId,
        available_balance: 0,
        pending_balance: 0,
        reserved_balance: 0,
        debt_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
        last_reconciliation_date: null,
        updated_at: null
      };
    }

    return result.rows[0];
  }

  /**
   * Check if user can withdraw amount
   *
   * @param {string} userId
   * @param {number} amount
   * @returns {Promise<Object>} Eligibility check
   */
  static async canWithdraw(userId, amount) {
    const balance = await this.getUserBalance(userId);
    const minAmount = await SystemSettingsService.getSetting('min_withdrawal_amount') || 40000;
    const maxAmount = await SystemSettingsService.getSetting('max_withdrawal_amount') || 500000;

    const available = parseFloat(balance.available_balance);
    const debt = parseFloat(balance.debt_balance || 0);

    // Block withdrawal if user has debt
    if (debt > 0) {
      return {
        eligible: false,
        reason: `Bạn có khoản nợ ${this.formatMoney(debt)} chưa thanh toán. Vui lòng thanh toán nợ trước khi rút tiền.`,
        available,
        debt,
        requested: amount
      };
    }

    // Check minimum amount
    if (amount < minAmount) {
      return {
        eligible: false,
        reason: `Số tiền tối thiểu là ${this.formatMoney(minAmount)}`,
        available,
        requested: amount,
        min_amount: minAmount
      };
    }

    // Check maximum amount
    if (amount > maxAmount) {
      return {
        eligible: false,
        reason: `Số tiền tối đa là ${this.formatMoney(maxAmount)}`,
        available,
        requested: amount,
        max_amount: maxAmount
      };
    }

    // Check available balance
    if (amount > available) {
      return {
        eligible: false,
        reason: `Số dư khả dụng không đủ. Hiện có: ${this.formatMoney(available)}, Yêu cầu: ${this.formatMoney(amount)}`,
        available,
        requested: amount
      };
    }

    return {
      eligible: true,
      reason: 'Đủ điều kiện rút tiền',
      available,
      requested: amount,
      remaining: available - amount
    };
  }

  /**
   * Reserve balance for payment request (NEW LOGIC)
   *
   * When user creates a payment request, we RESERVE the balance immediately
   * This prevents user from creating multiple requests exceeding their balance
   *
   * @param {Object} client - PostgreSQL client (transaction)
   * @param {string} userId
   * @param {number} amount
   * @param {string} paymentRequestId
   * @returns {Promise<Object>} Updated balance
   */
  static async reserveBalance(client, userId, amount, paymentRequestId) {
    try {
      // Lock balance row to prevent race conditions
      const lockResult = await client.query(`
        SELECT available_balance, total_earned, total_withdrawn
        FROM user_system_balance
        WHERE user_id = $1
        FOR UPDATE
      `, [userId]);

      if (lockResult.rows.length === 0) {
        throw new Error('User balance not found');
      }

      const currentBalance = lockResult.rows[0];
      const availableBefore = parseFloat(currentBalance.available_balance);

      // Double-check balance is sufficient
      if (amount > availableBefore) {
        throw new Error(`Số dư không đủ. Khả dụng: ${this.formatMoney(availableBefore)}, Yêu cầu: ${this.formatMoney(amount)}`);
      }

      // Reserve balance (deduct from available_balance)
      const updateResult = await client.query(`
        UPDATE user_system_balance
        SET available_balance = available_balance - $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, amount]);

      const updatedBalance = updateResult.rows[0];
      const availableAfter = parseFloat(updatedBalance.available_balance);

      // Log transaction to balance_transactions
      await client.query(`
        INSERT INTO balance_transactions (
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_type,
          reference_id,
          payment_request_id,
          description,
          created_by,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        userId,
        'payment_reserved',
        -amount, // Negative = debit (decrease)
        availableBefore,
        availableAfter,
        'payment_request',
        paymentRequestId,
        paymentRequestId,
        `Reserve balance for payment request ${paymentRequestId.substring(0, 8)}`,
        userId,
        JSON.stringify({ amount, operation: 'reserve' })
      ]);

      logger.info('Balance reserved', {
        userId,
        paymentRequestId,
        amount,
        availableBefore,
        availableAfter
      });

      return updatedBalance;

    } catch (error) {
      logger.error('Failed to reserve balance', {
        userId,
        amount,
        paymentRequestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Release balance when payment request is cancelled (NEW LOGIC)
   *
   * When user cancels a pending payment request, we RELEASE the reserved balance
   * This returns the balance back to available_balance
   *
   * @param {Object} client - PostgreSQL client (transaction)
   * @param {string} userId
   * @param {number} amount
   * @param {string} paymentRequestId
   * @returns {Promise<Object>} Updated balance
   */
  static async releaseBalance(client, userId, amount, paymentRequestId) {
    try {
      // Lock balance row
      const lockResult = await client.query(`
        SELECT available_balance, total_earned, total_withdrawn
        FROM user_system_balance
        WHERE user_id = $1
        FOR UPDATE
      `, [userId]);

      if (lockResult.rows.length === 0) {
        throw new Error('User balance not found');
      }

      const currentBalance = lockResult.rows[0];
      const availableBefore = parseFloat(currentBalance.available_balance);

      // Release balance (add back to available_balance)
      const updateResult = await client.query(`
        UPDATE user_system_balance
        SET available_balance = available_balance + $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, amount]);

      const updatedBalance = updateResult.rows[0];
      const availableAfter = parseFloat(updatedBalance.available_balance);

      // Log transaction
      await client.query(`
        INSERT INTO balance_transactions (
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_type,
          reference_id,
          payment_request_id,
          description,
          created_by,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        userId,
        'payment_released',
        amount, // Positive = credit (increase)
        availableBefore,
        availableAfter,
        'payment_request',
        paymentRequestId,
        paymentRequestId,
        `Release balance from cancelled payment request ${paymentRequestId.substring(0, 8)}`,
        userId,
        JSON.stringify({ amount, operation: 'release' })
      ]);

      logger.info('Balance released', {
        userId,
        paymentRequestId,
        amount,
        availableBefore,
        availableAfter
      });

      return updatedBalance;

    } catch (error) {
      logger.error('Failed to release balance', {
        userId,
        amount,
        paymentRequestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Record withdrawal when payment is marked as paid (NEW LOGIC)
   *
   * When admin marks payment as paid, we DON'T deduct available_balance
   * (already deducted when request was created)
   * We ONLY update total_withdrawn for tracking
   *
   * @param {Object} client - PostgreSQL client (transaction)
   * @param {string} userId
   * @param {number} amount
   * @param {string} paymentRequestId
   * @param {string} adminId
   * @param {Object} metadata - Additional info (transaction reference, etc.)
   * @returns {Promise<Object>} Updated balance
   */
  static async recordWithdrawal(client, userId, amount, paymentRequestId, adminId, metadata = {}) {
    try {
      // Lock balance row
      const lockResult = await client.query(`
        SELECT available_balance, total_earned, total_withdrawn
        FROM user_system_balance
        WHERE user_id = $1
        FOR UPDATE
      `, [userId]);

      if (lockResult.rows.length === 0) {
        throw new Error('User balance not found');
      }

      const currentBalance = lockResult.rows[0];
      const withdrawnBefore = parseFloat(currentBalance.total_withdrawn);
      const availableBefore = parseFloat(currentBalance.available_balance);

      // Update total_withdrawn ONLY (available_balance stays same)
      const updateResult = await client.query(`
        UPDATE user_system_balance
        SET total_withdrawn = total_withdrawn + $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, amount]);

      const updatedBalance = updateResult.rows[0];
      const withdrawnAfter = parseFloat(updatedBalance.total_withdrawn);

      // Log transaction
      await client.query(`
        INSERT INTO balance_transactions (
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_type,
          reference_id,
          payment_request_id,
          description,
          created_by,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        userId,
        'payment_withdrawn',
        -amount, // Negative for withdrawal (but doesn't affect available_balance)
        withdrawnBefore,
        withdrawnAfter,
        'payment_request',
        paymentRequestId,
        paymentRequestId,
        `Payment completed for request ${paymentRequestId.substring(0, 8)}`,
        adminId,
        JSON.stringify({
          amount,
          operation: 'withdrawal',
          available_balance: availableBefore, // Log for reference
          ...metadata
        })
      ]);

      logger.info('Withdrawal recorded', {
        userId,
        paymentRequestId,
        amount,
        withdrawnBefore,
        withdrawnAfter,
        available: availableBefore
      });

      return updatedBalance;

    } catch (error) {
      logger.error('Failed to record withdrawal', {
        userId,
        amount,
        paymentRequestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Refund a paid payment (admin action)
   *
   * If admin needs to refund a payment that was already marked as paid,
   * this will:
   * - Increase available_balance (refund)
   * - Decrease total_withdrawn
   *
   * @param {Object} client - PostgreSQL client (transaction)
   * @param {string} userId
   * @param {number} amount
   * @param {string} paymentRequestId
   * @param {string} adminId
   * @param {string} reason
   * @returns {Promise<Object>} Updated balance
   */
  static async refundPayment(client, userId, amount, paymentRequestId, adminId, reason) {
    try {
      // Lock balance row
      const lockResult = await client.query(`
        SELECT available_balance, total_withdrawn
        FROM user_system_balance
        WHERE user_id = $1
        FOR UPDATE
      `, [userId]);

      if (lockResult.rows.length === 0) {
        throw new Error('User balance not found');
      }

      const currentBalance = lockResult.rows[0];
      const availableBefore = parseFloat(currentBalance.available_balance);
      const withdrawnBefore = parseFloat(currentBalance.total_withdrawn);

      // Refund: increase available, decrease withdrawn
      const updateResult = await client.query(`
        UPDATE user_system_balance
        SET available_balance = available_balance + $2,
            total_withdrawn = total_withdrawn - $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [userId, amount]);

      const updatedBalance = updateResult.rows[0];
      const availableAfter = parseFloat(updatedBalance.available_balance);
      const withdrawnAfter = parseFloat(updatedBalance.total_withdrawn);

      // Log transaction
      await client.query(`
        INSERT INTO balance_transactions (
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_type,
          reference_id,
          payment_request_id,
          description,
          created_by,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        userId,
        'payment_refunded',
        amount, // Positive = credit (refund)
        availableBefore,
        availableAfter,
        'payment_request',
        paymentRequestId,
        paymentRequestId,
        `Refund payment request ${paymentRequestId.substring(0, 8)}: ${reason}`,
        adminId,
        JSON.stringify({
          amount,
          operation: 'refund',
          reason,
          withdrawn_before: withdrawnBefore,
          withdrawn_after: withdrawnAfter
        })
      ]);

      logger.info('Payment refunded', {
        userId,
        paymentRequestId,
        amount,
        availableBefore,
        availableAfter,
        withdrawnBefore,
        withdrawnAfter,
        reason
      });

      return updatedBalance;

    } catch (error) {
      logger.error('Failed to refund payment', {
        userId,
        amount,
        paymentRequestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get balance summary for all users (admin)
   */
  static async getAllUserBalances({ page = 1, limit = 50, minBalance = 0 }) {
    const offset = (page - 1) * limit;

    const countQuery = `
      SELECT COUNT(*) FROM user_system_balance
      WHERE available_balance >= $1
    `;
    const countResult = await pool.query(countQuery, [minBalance]);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT
        usb.*,
        u.full_name,
        u.email,
        u.username
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE usb.available_balance >= $1
      ORDER BY usb.available_balance DESC
      LIMIT $2 OFFSET $3
    `;

    const dataResult = await pool.query(dataQuery, [minBalance, limit, offset]);

    return {
      balances: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get total statistics
   */
  static async getTotalStats() {
    const query = `
      SELECT
        COUNT(*) as total_users,
        SUM(available_balance) as total_available,
        SUM(reserved_balance) as total_reserved,
        SUM(pending_balance) as total_pending,
        SUM(debt_balance) as total_debt,
        SUM(total_earned) as total_earned,
        SUM(total_withdrawn) as total_withdrawn
      FROM user_system_balance
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Format money helper
   */
  static formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Get balance transaction history
   *
   * @param {string} userId
   * @param {Object} options - { limit, offset, type }
   * @returns {Promise<Object>}
   */
  static async getBalanceTransactions(userId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      type = null
    } = options;

    let query = `
      SELECT
        bt.*,
        pr.requested_amount,
        pr.status as payment_status,
        u.full_name as created_by_name
      FROM balance_transactions bt
      LEFT JOIN payment_requests pr ON bt.payment_request_id = pr.id
      LEFT JOIN users u ON bt.created_by = u.id
      WHERE bt.user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND bt.transaction_type = $${paramCount}`;
      params.push(type);
    }

    query += ` ORDER BY bt.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      transactions: result.rows,
      limit,
      offset
    };
  }
}

module.exports = BalanceManagementService;
