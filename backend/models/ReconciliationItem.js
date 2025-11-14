const db = require('../config/database');

/**
 * ReconciliationItem Model
 * Manages detailed orders within a reconciliation period
 * Corresponds to 'reconciliation_items' table (migration 003)
 *
 * IMPORTANT: This table stores SNAPSHOT data at the time of reconciliation
 * to prevent changes from affecting historical records.
 */
class ReconciliationItem {
  /**
   * Add a conversion to reconciliation period
   * Creates a snapshot of the conversion data
   * @param {Object} data
   * @param {string} data.reconciliationId
   * @param {string} data.conversionId
   * @param {string} data.userId
   * @param {string} data.clickId
   * @param {string} data.orderCode
   * @param {string} data.merchantName
   * @param {number} data.orderAmount
   * @param {number} data.commission
   * @param {number} data.cashbackAmount
   * @param {Date} data.orderTime
   * @param {Date} data.confirmedTime
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const {
      reconciliationId,
      conversionId,
      userId,
      clickId,
      orderCode,
      merchantName,
      orderAmount,
      commission,
      cashbackAmount,
      orderTime,
      confirmedTime
    } = data;

    const query = `
      INSERT INTO reconciliation_items (
        reconciliation_id,
        conversion_id,
        user_id,
        click_id,
        order_code,
        merchant_name,
        order_amount,
        commission,
        cashback_amount,
        order_time,
        confirmed_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      reconciliationId,
      conversionId,
      userId,
      clickId,
      orderCode,
      merchantName,
      orderAmount,
      commission,
      cashbackAmount,
      orderTime,
      confirmedTime
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Bulk insert multiple items (for performance)
   * @param {Array} items - Array of item data objects
   * @returns {Promise<Array>}
   */
  static async bulkCreate(items) {
    if (!items || items.length === 0) {
      return [];
    }

    // Build parameterized query with multiple VALUE rows
    const valuesPlaceholders = [];
    const allValues = [];
    let paramCount = 0;

    items.forEach((item, index) => {
      const rowPlaceholders = [];

      // 11 fields per row
      for (let i = 0; i < 11; i++) {
        paramCount++;
        rowPlaceholders.push(`$${paramCount}`);
      }

      valuesPlaceholders.push(`(${rowPlaceholders.join(', ')})`);

      // Add values in correct order
      allValues.push(
        item.reconciliationId,
        item.conversionId,
        item.userId,
        item.clickId,
        item.orderCode,
        item.merchantName,
        item.orderAmount,
        item.commission,
        item.cashbackAmount,
        item.orderTime,
        item.confirmedTime
      );
    });

    const query = `
      INSERT INTO reconciliation_items (
        reconciliation_id,
        conversion_id,
        user_id,
        click_id,
        order_code,
        merchant_name,
        order_amount,
        commission,
        cashback_amount,
        order_time,
        confirmed_time
      ) VALUES ${valuesPlaceholders.join(', ')}
      RETURNING *
    `;

    const result = await db.query(query, allValues);
    return result.rows;
  }

  /**
   * Get all items for a reconciliation period
   * @param {string} reconciliationId
   * @param {Object} options
   * @param {number} options.limit
   * @param {number} options.offset
   * @returns {Promise<Array>}
   */
  static async findByReconciliationId(reconciliationId, options = {}) {
    const {
      limit = 100,
      offset = 0
    } = options;

    const query = `
      SELECT ri.*,
             u.full_name as user_name,
             u.email as user_email
      FROM reconciliation_items ri
      LEFT JOIN users u ON ri.user_id = u.id
      WHERE ri.reconciliation_id = $1
      ORDER BY ri.order_time DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [reconciliationId, limit, offset]);
    return result.rows;
  }

  /**
   * Get items for a specific user in a reconciliation period
   * @param {string} reconciliationId
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  static async findByReconciliationAndUser(reconciliationId, userId) {
    const query = `
      SELECT ri.*
      FROM reconciliation_items ri
      WHERE ri.reconciliation_id = $1
        AND ri.user_id = $2
      ORDER BY ri.order_time DESC
    `;

    const result = await db.query(query, [reconciliationId, userId]);
    return result.rows;
  }

  /**
   * Get item by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const query = `
      SELECT ri.*,
             u.full_name as user_name,
             u.email as user_email,
             c.status as conversion_current_status
      FROM reconciliation_items ri
      LEFT JOIN users u ON ri.user_id = u.id
      LEFT JOIN conversions c ON ri.conversion_id = c.id
      WHERE ri.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Check if a conversion is already in any reconciliation
   * @param {string} conversionId
   * @returns {Promise<Object|null>} Returns the reconciliation_item if found
   */
  static async findByConversionId(conversionId) {
    const query = `
      SELECT ri.*,
             r.period_label,
             r.status as reconciliation_status
      FROM reconciliation_items ri
      INNER JOIN reconciliations r ON ri.reconciliation_id = r.id
      WHERE ri.conversion_id = $1
    `;

    const result = await db.query(query, [conversionId]);
    return result.rows[0] || null;
  }

  /**
   * Count items in a reconciliation period
   * @param {string} reconciliationId
   * @returns {Promise<number>}
   */
  static async countByReconciliationId(reconciliationId) {
    const query = `
      SELECT COUNT(*) as count
      FROM reconciliation_items
      WHERE reconciliation_id = $1
    `;

    const result = await db.query(query, [reconciliationId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get statistics for a reconciliation period
   * @param {string} reconciliationId
   * @returns {Promise<Object>}
   */
  static async getStats(reconciliationId) {
    const query = `
      SELECT
        COUNT(*) as total_items,
        COUNT(DISTINCT user_id) as unique_users,
        COALESCE(SUM(order_amount), 0) as total_order_amount,
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(AVG(order_amount), 0) as avg_order_amount,
        COALESCE(AVG(cashback_amount), 0) as avg_cashback
      FROM reconciliation_items
      WHERE reconciliation_id = $1
    `;

    const result = await db.query(query, [reconciliationId]);
    return result.rows[0];
  }

  /**
   * Get user-level statistics within a reconciliation
   * @param {string} reconciliationId
   * @returns {Promise<Array>}
   */
  static async getUserStats(reconciliationId) {
    const query = `
      SELECT
        ri.user_id,
        u.full_name as user_name,
        u.email as user_email,
        COUNT(*) as order_count,
        COALESCE(SUM(ri.order_amount), 0) as total_order_amount,
        COALESCE(SUM(ri.cashback_amount), 0) as total_cashback
      FROM reconciliation_items ri
      LEFT JOIN users u ON ri.user_id = u.id
      WHERE ri.reconciliation_id = $1
      GROUP BY ri.user_id, u.full_name, u.email
      ORDER BY total_cashback DESC
    `;

    const result = await db.query(query, [reconciliationId]);
    return result.rows;
  }

  /**
   * Delete an item from reconciliation
   * Note: This should only be used for draft reconciliations
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  static async delete(id) {
    const query = `
      DELETE FROM reconciliation_items
      WHERE id = $1
      RETURNING id
    `;

    const result = await db.query(query, [id]);
    return result.rows.length > 0;
  }

  /**
   * Delete all items from a reconciliation
   * Note: This should only be used for draft reconciliations
   * @param {string} reconciliationId
   * @returns {Promise<number>} Number of deleted items
   */
  static async deleteByReconciliationId(reconciliationId) {
    const query = `
      DELETE FROM reconciliation_items
      WHERE reconciliation_id = $1
      RETURNING id
    `;

    const result = await db.query(query, [reconciliationId]);
    return result.rows.length;
  }

  /**
   * Export items to CSV format
   * @param {string} reconciliationId
   * @returns {Promise<Array>} Array of objects suitable for CSV export
   */
  static async exportToCSV(reconciliationId) {
    const query = `
      SELECT
        ri.order_code as "Mã đơn hàng",
        ri.merchant_name as "Merchant",
        u.full_name as "Tên user",
        u.email as "Email",
        ri.order_amount as "Giá trị đơn",
        ri.commission as "Hoa hồng",
        ri.cashback_amount as "Cashback",
        TO_CHAR(ri.order_time, 'DD/MM/YYYY HH24:MI') as "Thời gian đặt",
        TO_CHAR(ri.confirmed_time, 'DD/MM/YYYY HH24:MI') as "Thời gian xác nhận"
      FROM reconciliation_items ri
      LEFT JOIN users u ON ri.user_id = u.id
      WHERE ri.reconciliation_id = $1
      ORDER BY ri.order_time DESC
    `;

    const result = await db.query(query, [reconciliationId]);
    return result.rows;
  }
}

module.exports = ReconciliationItem;
