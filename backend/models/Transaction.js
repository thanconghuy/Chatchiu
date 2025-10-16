const { pool } = require('../config/database');

/**
 * Transaction Model
 * Handles transaction tracking from AccessTrade API
 */

class Transaction {
  /**
   * Create transactions table if not exists
   */
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(50),
        merchant_id INTEGER REFERENCES merchants(id),
        order_id VARCHAR(255),
        amount DECIMAL(10, 2) DEFAULT 0,
        commission DECIMAL(10, 2) DEFAULT 0,
        description TEXT,
        status VARCHAR(50),
        time INTEGER,
        aff_sid VARCHAR(255),
        utm_source VARCHAR(255),
        utm_medium VARCHAR(255),
        utm_campaign VARCHAR(255),
        utm_content VARCHAR(255),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_aff_sid ON transactions(aff_sid);
      CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(time);
    `;

    await pool.query(query);
  }

  /**
   * Create or update a transaction
   * @param {Object} transactionData
   * @returns {Object} Created/updated transaction
   */
  static async upsert(transactionData) {
    const {
      transactionId,
      type,
      merchantId,
      orderId,
      amount,
      commission,
      description,
      status,
      time,
      affSid,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      rawData
    } = transactionData;

    const query = `
      INSERT INTO transactions (
        transaction_id, type, merchant_id, order_id, amount, commission,
        description, status, time, aff_sid,
        utm_source, utm_medium, utm_campaign, utm_content, raw_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (transaction_id)
      DO UPDATE SET
        type = EXCLUDED.type,
        merchant_id = EXCLUDED.merchant_id,
        order_id = EXCLUDED.order_id,
        amount = EXCLUDED.amount,
        commission = EXCLUDED.commission,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        time = EXCLUDED.time,
        aff_sid = EXCLUDED.aff_sid,
        utm_source = EXCLUDED.utm_source,
        utm_medium = EXCLUDED.utm_medium,
        utm_campaign = EXCLUDED.utm_campaign,
        utm_content = EXCLUDED.utm_content,
        raw_data = EXCLUDED.raw_data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      transactionId,
      type || null,
      merchantId || null,
      orderId || null,
      amount || 0,
      commission || 0,
      description || null,
      status || null,
      time || null,
      affSid || null,
      utmSource || null,
      utmMedium || null,
      utmCampaign || null,
      utmContent || null,
      rawData ? JSON.stringify(rawData) : null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find transaction by transaction_id
   * @param {string} transactionId
   * @returns {Object|null}
   */
  static async findByTransactionId(transactionId) {
    const query = `
      SELECT t.*, m.name as merchant_name
      FROM transactions t
      LEFT JOIN merchants m ON t.merchant_id = m.id
      WHERE t.transaction_id = $1
    `;

    const result = await pool.query(query, [transactionId]);
    return result.rows[0] || null;
  }

  /**
   * Get transactions with filters
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array}
   */
  static async getTransactions(filters = {}, limit = 50, offset = 0) {
    let query = `
      SELECT
        t.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo
      FROM transactions t
      LEFT JOIN merchants m ON t.merchant_id = m.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (filters.type) {
      query += ` AND t.type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters.merchantId) {
      query += ` AND t.merchant_id = $${paramCount}`;
      values.push(filters.merchantId);
      paramCount++;
    }

    if (filters.status) {
      query += ` AND t.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.affSid) {
      query += ` AND t.aff_sid = $${paramCount}`;
      values.push(filters.affSid);
      paramCount++;
    }

    query += ` ORDER BY t.time DESC, t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get transaction count
   * @param {Object} filters
   * @returns {number}
   */
  static async getCount(filters = {}) {
    let query = `SELECT COUNT(*) as count FROM transactions WHERE 1=1`;

    const values = [];
    let paramCount = 1;

    if (filters.type) {
      query += ` AND type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters.merchantId) {
      query += ` AND merchant_id = $${paramCount}`;
      values.push(filters.merchantId);
      paramCount++;
    }

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    const result = await pool.query(query, values);
    return parseInt(result.rows[0].count);
  }

  /**
   * Delete old transactions
   * @param {number} daysOld
   * @returns {number} Number of deleted transactions
   */
  static async deleteOldTransactions(daysOld = 90) {
    const query = `
      DELETE FROM transactions
      WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      RETURNING id
    `;

    const result = await pool.query(query);
    return result.rowCount;
  }
}

module.exports = Transaction;
