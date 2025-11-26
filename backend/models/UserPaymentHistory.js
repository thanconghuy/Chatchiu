const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * UserPaymentHistory Model
 * Manages user payment history records by reconciliation period
 */
class UserPaymentHistory {
  /**
   * Get all payment history for a user
   * @param {string} userId - User ID
   * @param {object} options - Query options
   * @param {string} options.year - Filter by year (YYYY)
   * @param {string} options.status - Filter by status
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Payment history records
   */
  static async getByUserId(userId, options = {}) {
    try {
      const { year, status, limit = 100, offset = 0 } = options;

      let query = `
        SELECT
          uph.*,
          COUNT(upd.id) as conversions_count
        FROM user_payment_history uph
        LEFT JOIN user_payment_details upd ON upd.payment_history_id = uph.id
        WHERE uph.user_id = $1
      `;

      const params = [userId];
      let paramCount = 1;

      // Filter by year
      if (year) {
        paramCount++;
        query += ` AND uph.payment_period LIKE $${paramCount}`;
        params.push(`${year}%`);
      }

      // Filter by status
      if (status) {
        paramCount++;
        query += ` AND uph.status = $${paramCount}`;
        params.push(status);
      }

      query += `
        GROUP BY uph.id
        ORDER BY uph.payment_period DESC, uph.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting payment history by user ID', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get payment history by ID
   * @param {string} id - Payment history ID
   * @returns {Promise<object|null>} Payment history record
   */
  static async getById(id) {
    try {
      const query = `
        SELECT
          uph.*,
          u.username,
          u.email,
          COUNT(upd.id) as conversions_count,
          SUM(upd.cashback_amount) as calculated_total
        FROM user_payment_history uph
        LEFT JOIN users u ON u.id = uph.user_id
        LEFT JOIN user_payment_details upd ON upd.payment_history_id = uph.id
        WHERE uph.id = $1
        GROUP BY uph.id, u.username, u.email
      `;

      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting payment history by ID', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get payment history by user ID and period
   * @param {string} userId - User ID
   * @param {string} paymentPeriod - Payment period (YYYY-MM)
   * @returns {Promise<object|null>} Payment history record
   */
  static async getByUserAndPeriod(userId, paymentPeriod) {
    try {
      const query = `
        SELECT uph.*
        FROM user_payment_history uph
        WHERE uph.user_id = $1 AND uph.payment_period = $2
      `;

      const result = await pool.query(query, [userId, paymentPeriod]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting payment history by user and period', {
        error: error.message,
        userId,
        paymentPeriod
      });
      throw error;
    }
  }

  /**
   * Create new payment history record
   * @param {object} data - Payment history data
   * @returns {Promise<object>} Created payment history record
   */
  static async create(data) {
    try {
      const {
        userId,
        paymentPeriod,
        totalCashback,
        reconciliationDate,
        paymentDate,
        status = 'pending',
        paymentMethod,
        paymentDetails
      } = data;

      const query = `
        INSERT INTO user_payment_history (
          user_id,
          payment_period,
          total_cashback,
          reconciliation_date,
          payment_date,
          status,
          payment_method,
          payment_details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const params = [
        userId,
        paymentPeriod,
        totalCashback,
        reconciliationDate,
        paymentDate,
        status,
        paymentMethod,
        paymentDetails ? JSON.stringify(paymentDetails) : null
      ];

      const result = await pool.query(query, params);
      logger.info('Created payment history record', { id: result.rows[0].id, userId, paymentPeriod });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating payment history', { error: error.message, data });
      throw error;
    }
  }

  /**
   * Update payment history record
   * @param {string} id - Payment history ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated payment history record
   */
  static async update(id, data) {
    try {
      const {
        totalCashback,
        reconciliationDate,
        paymentDate,
        status,
        paymentMethod,
        paymentDetails
      } = data;

      const updates = [];
      const params = [];
      let paramCount = 0;

      if (totalCashback !== undefined) {
        paramCount++;
        updates.push(`total_cashback = $${paramCount}`);
        params.push(totalCashback);
      }

      if (reconciliationDate !== undefined) {
        paramCount++;
        updates.push(`reconciliation_date = $${paramCount}`);
        params.push(reconciliationDate);
      }

      if (paymentDate !== undefined) {
        paramCount++;
        updates.push(`payment_date = $${paramCount}`);
        params.push(paymentDate);
      }

      if (status !== undefined) {
        paramCount++;
        updates.push(`status = $${paramCount}`);
        params.push(status);
      }

      if (paymentMethod !== undefined) {
        paramCount++;
        updates.push(`payment_method = $${paramCount}`);
        params.push(paymentMethod);
      }

      if (paymentDetails !== undefined) {
        paramCount++;
        updates.push(`payment_details = $${paramCount}`);
        params.push(JSON.stringify(paymentDetails));
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      params.push(id);

      const query = `
        UPDATE user_payment_history
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Payment history not found');
      }

      logger.info('Updated payment history record', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating payment history', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Delete payment history record (also deletes related details via CASCADE)
   * @param {string} id - Payment history ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    try {
      const query = 'DELETE FROM user_payment_history WHERE id = $1 RETURNING id';
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error('Payment history not found');
      }

      logger.info('Deleted payment history record', { id });
      return true;
    } catch (error) {
      logger.error('Error deleting payment history', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get summary statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<object>} Summary statistics
   */
  static async getSummary(userId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total_periods,
          COALESCE(SUM(total_cashback), 0) as total_cashback,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cashback ELSE 0 END), 0) as paid_cashback,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN total_cashback ELSE 0 END), 0) as pending_cashback,
          COALESCE(SUM(CASE WHEN status = 'processing' THEN total_cashback ELSE 0 END), 0) as processing_cashback,
          MAX(payment_date) as last_payment_date,
          MAX(payment_period) as latest_period
        FROM user_payment_history
        WHERE user_id = $1
      `;

      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting payment summary', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get available years for filtering
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of years
   */
  static async getAvailableYears(userId) {
    try {
      const query = `
        SELECT DISTINCT
          SUBSTRING(payment_period FROM 1 FOR 4) as year
        FROM user_payment_history
        WHERE user_id = $1
        ORDER BY year DESC
      `;

      const result = await pool.query(query, [userId]);
      return result.rows.map(row => row.year);
    } catch (error) {
      logger.error('Error getting available years', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = UserPaymentHistory;
