const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * UserPaymentDetail Model
 * Manages detailed breakdown of payment by conversion
 */
class UserPaymentDetail {
  /**
   * Get all payment details for a payment history
   * @param {string} paymentHistoryId - Payment history ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Payment detail records
   */
  static async getByPaymentHistoryId(paymentHistoryId, options = {}) {
    try {
      const { status, limit = 1000, offset = 0 } = options;

      // Optimized query - only select fields needed for payment detail page
      let query = `
        SELECT
          upd.id,
          upd.cashback_amount,
          upd.created_at,
          c.order_code,
          c.approved_at,
          c.status,
          COALESCE(m.name, upd.merchant_name) as merchant_name
        FROM user_payment_details upd
        LEFT JOIN conversions c ON c.id = upd.conversion_id
        LEFT JOIN merchants m ON m.id = c.merchant_id
        WHERE upd.payment_history_id = $1
      `;

      const params = [paymentHistoryId];
      let paramCount = 1;

      // Filter by status
      if (status) {
        paramCount++;
        query += ` AND upd.status = $${paramCount}`;
        params.push(status);
      }

      query += `
        ORDER BY upd.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting payment details by payment history ID', {
        error: error.message,
        paymentHistoryId
      });
      throw error;
    }
  }

  /**
   * Get payment detail by ID
   * @param {string} id - Payment detail ID
   * @returns {Promise<object|null>} Payment detail record
   */
  static async getById(id) {
    try {
      const query = `
        SELECT
          upd.*,
          c.order_id,
          c.order_amount,
          c.commission_amount,
          c.confirmed_at,
          m.name as merchant_name_current,
          m.logo_url as merchant_logo,
          uph.payment_period,
          uph.user_id
        FROM user_payment_details upd
        LEFT JOIN conversions c ON c.id = upd.conversion_id
        LEFT JOIN merchants m ON m.id = c.merchant_id
        LEFT JOIN user_payment_history uph ON uph.id = upd.payment_history_id
        WHERE upd.id = $1
      `;

      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting payment detail by ID', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Create new payment detail record
   * @param {object} data - Payment detail data
   * @returns {Promise<object>} Created payment detail record
   */
  static async create(data) {
    try {
      const {
        paymentHistoryId,
        conversionId,
        merchantName,
        orderCode,
        cashbackAmount,
        reconciliationMonth,
        paymentMonth,
        status = 'pending',
        metadata
      } = data;

      const query = `
        INSERT INTO user_payment_details (
          payment_history_id,
          conversion_id,
          merchant_name,
          order_code,
          cashback_amount,
          reconciliation_month,
          payment_month,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const params = [
        paymentHistoryId,
        conversionId,
        merchantName,
        orderCode,
        cashbackAmount,
        reconciliationMonth,
        paymentMonth,
        status,
        metadata ? JSON.stringify(metadata) : null
      ];

      const result = await pool.query(query, params);
      logger.info('Created payment detail record', {
        id: result.rows[0].id,
        paymentHistoryId,
        conversionId
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating payment detail', { error: error.message, data });
      throw error;
    }
  }

  /**
   * Create multiple payment details in a transaction
   * @param {Array<object>} details - Array of payment detail data
   * @returns {Promise<Array>} Created payment detail records
   */
  static async bulkCreate(details) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const createdDetails = [];

      for (const data of details) {
        const {
          paymentHistoryId,
          conversionId,
          merchantName,
          orderCode,
          cashbackAmount,
          reconciliationMonth,
          paymentMonth,
          status = 'pending',
          metadata
        } = data;

        const query = `
          INSERT INTO user_payment_details (
            payment_history_id,
            conversion_id,
            merchant_name,
            order_code,
            cashback_amount,
            reconciliation_month,
            payment_month,
            status,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;

        const params = [
          paymentHistoryId,
          conversionId,
          merchantName,
          orderCode,
          cashbackAmount,
          reconciliationMonth,
          paymentMonth,
          status,
          metadata ? JSON.stringify(metadata) : null
        ];

        const result = await client.query(query, params);
        createdDetails.push(result.rows[0]);
      }

      await client.query('COMMIT');
      logger.info('Bulk created payment details', { count: createdDetails.length });
      return createdDetails;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error bulk creating payment details', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update payment detail record
   * @param {string} id - Payment detail ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated payment detail record
   */
  static async update(id, data) {
    try {
      const {
        cashbackAmount,
        reconciliationMonth,
        paymentMonth,
        status,
        metadata
      } = data;

      const updates = [];
      const params = [];
      let paramCount = 0;

      if (cashbackAmount !== undefined) {
        paramCount++;
        updates.push(`cashback_amount = $${paramCount}`);
        params.push(cashbackAmount);
      }

      if (reconciliationMonth !== undefined) {
        paramCount++;
        updates.push(`reconciliation_month = $${paramCount}`);
        params.push(reconciliationMonth);
      }

      if (paymentMonth !== undefined) {
        paramCount++;
        updates.push(`payment_month = $${paramCount}`);
        params.push(paymentMonth);
      }

      if (status !== undefined) {
        paramCount++;
        updates.push(`status = $${paramCount}`);
        params.push(status);
      }

      if (metadata !== undefined) {
        paramCount++;
        updates.push(`metadata = $${paramCount}`);
        params.push(JSON.stringify(metadata));
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      params.push(id);

      const query = `
        UPDATE user_payment_details
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Payment detail not found');
      }

      logger.info('Updated payment detail record', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating payment detail', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Delete payment detail record
   * @param {string} id - Payment detail ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    try {
      const query = 'DELETE FROM user_payment_details WHERE id = $1 RETURNING id';
      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error('Payment detail not found');
      }

      logger.info('Deleted payment detail record', { id });
      return true;
    } catch (error) {
      logger.error('Error deleting payment detail', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get statistics for a payment history
   * @param {string} paymentHistoryId - Payment history ID
   * @returns {Promise<object>} Statistics
   */
  static async getStatistics(paymentHistoryId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total_conversions,
          COALESCE(SUM(cashback_amount), 0) as total_cashback,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
          COUNT(DISTINCT merchant_name) as unique_merchants
        FROM user_payment_details
        WHERE payment_history_id = $1
      `;

      const result = await pool.query(query, [paymentHistoryId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting payment detail statistics', {
        error: error.message,
        paymentHistoryId
      });
      throw error;
    }
  }

  /**
   * Get breakdown by merchant for a payment history
   * @param {string} paymentHistoryId - Payment history ID
   * @returns {Promise<Array>} Merchant breakdown
   */
  static async getMerchantBreakdown(paymentHistoryId) {
    try {
      const query = `
        SELECT
          merchant_name,
          COUNT(*) as conversions_count,
          COALESCE(SUM(cashback_amount), 0) as total_cashback,
          MIN(created_at) as first_conversion,
          MAX(created_at) as last_conversion
        FROM user_payment_details
        WHERE payment_history_id = $1
        GROUP BY merchant_name
        ORDER BY total_cashback DESC
      `;

      const result = await pool.query(query, [paymentHistoryId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting merchant breakdown', {
        error: error.message,
        paymentHistoryId
      });
      throw error;
    }
  }
}

module.exports = UserPaymentDetail;
