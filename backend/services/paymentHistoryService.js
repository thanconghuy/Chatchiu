const { pool } = require('../config/database');
const UserPaymentHistory = require('../models/UserPaymentHistory');
const UserPaymentDetail = require('../models/UserPaymentDetail');
const logger = require('../utils/logger');

/**
 * Payment History Service
 * Handles automatic payment history generation and payment processing
 */
class PaymentHistoryService {
  /**
   * Create payment history for all users for a specific period
   * This collects all approved conversions and creates payment records
   *
   * @param {string} paymentPeriod - Payment period (YYYY-MM)
   * @param {object} options - Options
   * @param {Date} options.reconciliationDate - Reconciliation date (default: now)
   * @param {string} options.status - Initial status (default: 'pending')
   * @returns {Promise<object>} Results summary
   */
  async createPaymentHistoryForPeriod(paymentPeriod, options = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        reconciliationDate = new Date(),
        status = 'pending'
      } = options;

      logger.info('Creating payment history for period', { paymentPeriod });

      // 1. Get all conversions that are approved and in this period
      // Conversions are grouped by user_id
      const conversionsQuery = `
        SELECT
          c.user_id,
          c.id as conversion_id,
          c.order_id,
          c.commission_amount,
          c.confirmed_at,
          m.name as merchant_name,
          u.full_name,
          u.email
        FROM conversions c
        INNER JOIN users u ON u.id = c.user_id
        INNER JOIN merchants m ON m.id = c.merchant_id
        WHERE c.status = 'approved'
          AND c.confirmed_at IS NOT NULL
          AND TO_CHAR(c.confirmed_at, 'YYYY-MM') = $1
          AND NOT EXISTS (
            -- Exclude conversions already in a payment history
            SELECT 1 FROM user_payment_details upd
            WHERE upd.conversion_id = c.id
          )
        ORDER BY c.user_id, c.confirmed_at
      `;

      const conversionsResult = await client.query(conversionsQuery, [paymentPeriod]);
      const conversions = conversionsResult.rows;

      if (conversions.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: `Không có conversions nào được approve trong kỳ ${paymentPeriod}`,
          created: 0,
          totalAmount: 0
        };
      }

      // 2. Group conversions by user
      const userConversions = {};
      conversions.forEach(conv => {
        if (!userConversions[conv.user_id]) {
          userConversions[conv.user_id] = {
            user_id: conv.user_id,
            full_name: conv.full_name,
            email: conv.email,
            conversions: []
          };
        }
        userConversions[conv.user_id].conversions.push(conv);
      });

      // 3. Create payment history for each user
      const results = {
        created: 0,
        skipped: 0,
        totalAmount: 0,
        users: []
      };

      for (const [userId, userData] of Object.entries(userConversions)) {
        // Calculate total cashback for this user
        const totalCashback = userData.conversions.reduce(
          (sum, conv) => sum + parseFloat(conv.commission_amount || 0),
          0
        );

        // Check if payment history already exists for this period
        const existingQuery = `
          SELECT id FROM user_payment_history
          WHERE user_id = $1 AND payment_period = $2
        `;
        const existingResult = await client.query(existingQuery, [userId, paymentPeriod]);

        if (existingResult.rows.length > 0) {
          logger.warn('Payment history already exists', { userId, paymentPeriod });
          results.skipped++;
          continue;
        }

        // Create payment history
        const paymentHistory = await this._createPaymentHistoryInTransaction(
          client,
          {
            userId,
            paymentPeriod,
            totalCashback,
            reconciliationDate,
            status
          }
        );

        // Create payment details for each conversion
        const details = userData.conversions.map(conv => ({
          paymentHistoryId: paymentHistory.id,
          conversionId: conv.conversion_id,
          merchantName: conv.merchant_name,
          orderCode: conv.order_id,
          cashbackAmount: parseFloat(conv.commission_amount || 0),
          reconciliationMonth: paymentPeriod,
          status: 'approved'
        }));

        await this._createPaymentDetailsInTransaction(client, details);

        results.created++;
        results.totalAmount += totalCashback;
        results.users.push({
          userId,
          fullName: userData.full_name,
          email: userData.email,
          conversionsCount: userData.conversions.length,
          totalCashback
        });

        logger.info('Created payment history', {
          userId,
          paymentPeriod,
          conversionsCount: userData.conversions.length,
          totalCashback
        });
      }

      await client.query('COMMIT');

      logger.success('Payment history creation completed', {
        period: paymentPeriod,
        created: results.created,
        skipped: results.skipped,
        totalAmount: results.totalAmount
      });

      return {
        success: true,
        message: `Đã tạo ${results.created} payment records cho kỳ ${paymentPeriod}`,
        ...results
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating payment history', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process payment (admin confirms payment)
   * This will:
   * 1. Update payment_history status to 'paid'
   * 2. Set payment_date
   * 3. Deduct from user's available_balance
   * 4. Update user's total_withdrawn
   * 5. Update all payment_details status to 'paid'
   *
   * @param {string} paymentHistoryId - Payment history ID
   * @param {object} paymentInfo - Payment information
   * @param {string} paymentInfo.paymentMethod - Payment method
   * @param {object} paymentInfo.paymentDetails - Payment details (bank info, transaction ID, etc.)
   * @returns {Promise<object>} Result
   */
  async processPayment(paymentHistoryId, paymentInfo = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Get payment history
      const paymentHistory = await UserPaymentHistory.getById(paymentHistoryId);

      if (!paymentHistory) {
        throw new Error('Không tìm thấy payment history');
      }

      if (paymentHistory.status === 'paid') {
        throw new Error('Payment đã được thanh toán trước đó');
      }

      if (paymentHistory.status === 'cancelled') {
        throw new Error('Payment đã bị hủy');
      }

      const { user_id, total_cashback } = paymentHistory;

      logger.info('Processing payment', {
        paymentHistoryId,
        userId: user_id,
        amount: total_cashback
      });

      // 2. Check user's available balance
      const balanceQuery = `
        SELECT available_balance
        FROM user_system_balance
        WHERE user_id = $1
        FOR UPDATE
      `;
      const balanceResult = await client.query(balanceQuery, [user_id]);

      if (balanceResult.rows.length === 0) {
        throw new Error('Không tìm thấy thông tin balance của user');
      }

      const currentBalance = parseFloat(balanceResult.rows[0].available_balance);

      if (currentBalance < total_cashback) {
        throw new Error(
          `Số dư khả dụng không đủ. Hiện có: ${currentBalance}, cần: ${total_cashback}`
        );
      }

      // 3. Deduct from available_balance and update total_withdrawn
      const updateBalanceQuery = `
        UPDATE user_system_balance
        SET
          available_balance = available_balance - $1,
          total_withdrawn = total_withdrawn + $1,
          updated_at = NOW()
        WHERE user_id = $2
        RETURNING available_balance, total_withdrawn
      `;
      const updateResult = await client.query(updateBalanceQuery, [total_cashback, user_id]);
      const newBalance = updateResult.rows[0];

      // 4. Create balance transaction record
      const txQuery = `
        INSERT INTO user_balance_transactions (
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          description,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      await client.query(txQuery, [
        user_id,
        'payment_deducted',
        total_cashback,
        currentBalance,
        newBalance.available_balance,
        `Thanh toán kỳ ${paymentHistory.payment_period}`,
        JSON.stringify({
          payment_history_id: paymentHistoryId,
          payment_period: paymentHistory.payment_period,
          ...paymentInfo
        })
      ]);

      // 5. Update payment history
      const paymentDate = new Date();
      await this._updatePaymentHistoryInTransaction(
        client,
        paymentHistoryId,
        {
          status: 'paid',
          paymentDate,
          paymentMethod: paymentInfo.paymentMethod || 'bank_transfer',
          paymentDetails: paymentInfo.paymentDetails || {}
        }
      );

      // 6. Update all payment details to 'paid'
      const updateDetailsQuery = `
        UPDATE user_payment_details
        SET
          status = 'paid',
          payment_month = $1
        WHERE payment_history_id = $2
        RETURNING id
      `;
      const detailsResult = await client.query(updateDetailsQuery, [
        paymentHistory.payment_period,
        paymentHistoryId
      ]);

      await client.query('COMMIT');

      logger.success('Payment processed successfully', {
        paymentHistoryId,
        userId: user_id,
        amount: total_cashback,
        detailsUpdated: detailsResult.rows.length,
        newBalance: newBalance.available_balance
      });

      return {
        success: true,
        message: 'Thanh toán thành công',
        payment_history_id: paymentHistoryId,
        user_id,
        amount: total_cashback,
        previous_balance: currentBalance,
        new_balance: newBalance.available_balance,
        details_updated: detailsResult.rows.length
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing payment', {
        error: error.message,
        paymentHistoryId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel payment history
   * @param {string} paymentHistoryId - Payment history ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<object>} Result
   */
  async cancelPayment(paymentHistoryId, reason = '') {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const paymentHistory = await UserPaymentHistory.getById(paymentHistoryId);

      if (!paymentHistory) {
        throw new Error('Không tìm thấy payment history');
      }

      if (paymentHistory.status === 'paid') {
        throw new Error('Không thể hủy payment đã được thanh toán');
      }

      // Update status to cancelled
      await this._updatePaymentHistoryInTransaction(
        client,
        paymentHistoryId,
        {
          status: 'cancelled',
          paymentDetails: {
            ...(paymentHistory.payment_details || {}),
            cancelled_at: new Date(),
            cancellation_reason: reason
          }
        }
      );

      // Update details status
      await client.query(`
        UPDATE user_payment_details
        SET status = 'cancelled'
        WHERE payment_history_id = $1
      `, [paymentHistoryId]);

      await client.query('COMMIT');

      logger.info('Payment cancelled', { paymentHistoryId, reason });

      return {
        success: true,
        message: 'Đã hủy payment'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error cancelling payment', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Create payment history within transaction
   */
  async _createPaymentHistoryInTransaction(client, data) {
    const query = `
      INSERT INTO user_payment_history (
        user_id,
        payment_period,
        total_cashback,
        reconciliation_date,
        status,
        payment_method,
        payment_details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await client.query(query, [
      data.userId,
      data.paymentPeriod,
      data.totalCashback,
      data.reconciliationDate,
      data.status || 'pending',
      data.paymentMethod || null,
      data.paymentDetails ? JSON.stringify(data.paymentDetails) : null
    ]);

    return result.rows[0];
  }

  /**
   * Helper: Create payment details within transaction
   */
  async _createPaymentDetailsInTransaction(client, details) {
    for (const detail of details) {
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
      `;

      await client.query(query, [
        detail.paymentHistoryId,
        detail.conversionId,
        detail.merchantName,
        detail.orderCode,
        detail.cashbackAmount,
        detail.reconciliationMonth,
        detail.paymentMonth || null,
        detail.status || 'approved',
        detail.metadata ? JSON.stringify(detail.metadata) : null
      ]);
    }
  }

  /**
   * Helper: Update payment history within transaction
   */
  async _updatePaymentHistoryInTransaction(client, id, data) {
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (data.totalCashback !== undefined) {
      paramCount++;
      updates.push(`total_cashback = $${paramCount}`);
      params.push(data.totalCashback);
    }

    if (data.reconciliationDate !== undefined) {
      paramCount++;
      updates.push(`reconciliation_date = $${paramCount}`);
      params.push(data.reconciliationDate);
    }

    if (data.paymentDate !== undefined) {
      paramCount++;
      updates.push(`payment_date = $${paramCount}`);
      params.push(data.paymentDate);
    }

    if (data.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(data.status);
    }

    if (data.paymentMethod !== undefined) {
      paramCount++;
      updates.push(`payment_method = $${paramCount}`);
      params.push(data.paymentMethod);
    }

    if (data.paymentDetails !== undefined) {
      paramCount++;
      updates.push(`payment_details = $${paramCount}`);
      params.push(JSON.stringify(data.paymentDetails));
    }

    if (updates.length === 0) {
      return;
    }

    paramCount++;
    params.push(id);

    const query = `
      UPDATE user_payment_history
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, params);
    return result.rows[0];
  }

  /**
   * Get payment history summary for admin
   * @param {object} options - Filter options
   * @returns {Promise<object>} Summary data
   */
  async getAdminSummary(options = {}) {
    try {
      const { period, status } = options;

      let query = `
        SELECT
          payment_period,
          status,
          COUNT(*) as records_count,
          COUNT(DISTINCT user_id) as users_count,
          SUM(total_cashback) as total_amount,
          MIN(reconciliation_date) as earliest_reconciliation,
          MAX(payment_date) as latest_payment
        FROM user_payment_history
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      if (period) {
        paramCount++;
        query += ` AND payment_period = $${paramCount}`;
        params.push(period);
      }

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        params.push(status);
      }

      query += ` GROUP BY payment_period, status ORDER BY payment_period DESC, status`;

      const result = await pool.query(query, params);
      return result.rows;

    } catch (error) {
      logger.error('Error getting admin summary', { error: error.message });
      throw error;
    }
  }
}

module.exports = new PaymentHistoryService();
