/**
 * Balance Management Service
 *
 * Purpose: Manage user balance from system reconciliation
 * Separate from API reconciliation balance
 */

const { pool } = require('../../config/database');
const DebtManagementService = require('./DebtManagementService');
const SystemSettingsService = require('../systemSettingsService');

class BalanceManagementService {
  /**
   * Get user's system balance
   *
   * @param {string} userId
   * @returns {Object} Balance details
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
   * @returns {Object} Eligibility check
   */
  static async canWithdraw(userId, amount) {
    const balance = await this.getUserBalance(userId);
    const minAmount = await SystemSettingsService.getSetting('min_withdrawal_amount') || 50000;

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

    if (amount < minAmount) {
      return {
        eligible: false,
        reason: `Số tiền tối thiểu là ${this.formatMoney(minAmount)}`,
        available,
        requested: amount
      };
    }

    if (amount > available) {
      return {
        eligible: false,
        reason: `Số dư khả dụng không đủ (${this.formatMoney(available)})`,
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
   * Deduct balance for payment request
   *
   * @param {string} userId
   * @param {number} amount
   * @param {string} paymentRequestId
   * @returns {Object} Updated balance
   */
  static async deductBalance(userId, amount, paymentRequestId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check current balance
      const checkResult = await client.query(
        'SELECT available_balance FROM user_system_balance WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Người dùng chưa có số dư');
      }

      const currentBalance = parseFloat(checkResult.rows[0].available_balance);

      if (currentBalance < amount) {
        throw new Error(`Số dư không đủ. Hiện có: ${this.formatMoney(currentBalance)}`);
      }

      // Deduct balance
      const updateResult = await client.query(`
        UPDATE user_system_balance
        SET
          available_balance = available_balance - $2,
          total_withdrawn = total_withdrawn + $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING *
      `, [userId, amount]);

      await client.query('COMMIT');

      return updateResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refund balance (if payment request cancelled)
   *
   * @param {string} userId
   * @param {number} amount
   * @returns {Object} Updated balance
   */
  static async refundBalance(userId, amount) {
    const query = `
      UPDATE user_system_balance
      SET
        available_balance = available_balance + $2,
        total_withdrawn = total_withdrawn - $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [userId, amount]);
    return result.rows[0];
  }

  /**
   * Move reserved balance to available (after API confirms)
   *
   * @param {string} userId
   * @param {number} amount
   * @returns {Object} Updated balance
   */
  static async releaseReserved(userId, amount) {
    const query = `
      UPDATE user_system_balance
      SET
        available_balance = available_balance + $2,
        reserved_balance = reserved_balance - $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [userId, amount]);
    return result.rows[0];
  }

  /**
   * Deduct reserved balance (if order rejected by API)
   *
   * @param {string} userId
   * @param {number} amount
   * @returns {Object} Updated balance
   */
  static async deductReserved(userId, amount) {
    const query = `
      UPDATE user_system_balance
      SET
        reserved_balance = reserved_balance - $2,
        total_earned = total_earned - $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [userId, amount]);
    return result.rows[0];
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
}

module.exports = BalanceManagementService;
