const { pool } = require('../config/database');

/**
 * AutoSyncHistory Model
 * Tracks auto-sync operations and changes
 */
class AutoSyncHistory {
  /**
   * Create a new sync history record
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async createSession(data) {
    const {
      syncType = 'auto',
      syncDays = null,
      startDate = null,
      endDate = null
    } = data;

    const query = `
      INSERT INTO auto_sync_history (
        sync_type,
        sync_started_at,
        sync_status,
        sync_days,
        start_date,
        end_date
      )
      VALUES ($1, NOW(), 'running', $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [
      syncType,
      syncDays,
      startDate,
      endDate
    ]);

    return result.rows[0];
  }

  /**
   * Update sync session with results
   * @param {string} sessionId
   * @param {Object} results
   * @returns {Promise<Object>}
   */
  static async completeSession(sessionId, results) {
    const {
      status = 'completed',
      total = 0,
      created = 0,
      updated = 0,
      skipped = 0,
      errors = 0,
      details = null,
      errorMessage = null,
      errorStack = null
    } = results;

    const query = `
      UPDATE auto_sync_history
      SET
        sync_completed_at = NOW(),
        sync_status = $1,
        total_fetched = $2,
        total_created = $3,
        total_updated = $4,
        total_skipped = $5,
        total_errors = $6,
        details = $7,
        error_message = $8,
        error_stack = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `;

    const result = await pool.query(query, [
      status,
      total,
      created,
      updated,
      skipped,
      errors,
      details ? JSON.stringify(details) : null,
      errorMessage,
      errorStack,
      sessionId
    ]);

    return result.rows[0];
  }

  /**
   * Log a change during sync
   * @param {string} sessionId
   * @param {Object} change
   * @returns {Promise<Object>}
   */
  static async logChange(sessionId, change) {
    const {
      conversionId = null,
      atConversionId = null,
      orderCode = null,
      userId = null,
      changeType,
      oldStatus = null,
      newStatus = null,
      oldReconciliationStatus = null,
      newReconciliationStatus = null,
      balanceChange = null,
      balanceOperation = null,
      reason = null,
      details = null
    } = change;

    const query = `
      INSERT INTO auto_sync_change_log (
        sync_history_id,
        conversion_id,
        at_conversion_id,
        order_code,
        user_id,
        change_type,
        old_status,
        new_status,
        old_reconciliation_status,
        new_reconciliation_status,
        balance_change,
        balance_operation,
        reason,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await pool.query(query, [
      sessionId,
      conversionId,
      atConversionId,
      orderCode,
      userId,
      changeType,
      oldStatus,
      newStatus,
      oldReconciliationStatus,
      newReconciliationStatus,
      balanceChange,
      balanceOperation,
      reason,
      details ? JSON.stringify(details) : null
    ]);

    return result.rows[0];
  }

  /**
   * Get recent sync history with pagination
   * @param {number} limit
   * @param {number} offset
   * @returns {Promise<Object>} { data: Array, total: number, page: number, totalPages: number }
   */
  static async getRecent(limit = 20, offset = 0) {
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM auto_sync_history`;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const query = `
      SELECT
        id,
        sync_type,
        sync_started_at,
        sync_completed_at,
        sync_status,
        sync_days,
        start_date,
        end_date,
        total_fetched,
        total_created,
        total_updated,
        total_skipped,
        total_errors,
        error_message,
        created_at
      FROM auto_sync_history
      ORDER BY sync_started_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get changes for a sync session with user and conversion details
   * @param {string} sessionId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getChanges(sessionId, limit = 100) {
    const query = `
      SELECT
        cl.*,
        u.email as user_email,
        u.full_name as user_name,
        c.merchant_name,
        c.merchant_id,
        c.cashback_amount,
        c.is_confirmed as api_confirmed
      FROM auto_sync_change_log cl
      LEFT JOIN users u ON cl.user_id = u.id
      LEFT JOIN conversions c ON cl.conversion_id = c.id
      WHERE cl.sync_history_id = $1
      ORDER BY cl.created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [sessionId, limit]);
    return result.rows;
  }

  /**
   * Get statistics for a date range
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<Object>}
   */
  static async getStats(startDate, endDate) {
    const query = `
      SELECT
        COUNT(*) as total_syncs,
        COUNT(CASE WHEN sync_status = 'completed' THEN 1 END) as successful_syncs,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_syncs,
        SUM(total_created) as total_created,
        SUM(total_updated) as total_updated,
        SUM(total_skipped) as total_skipped,
        SUM(total_errors) as total_errors
      FROM auto_sync_history
      WHERE sync_started_at >= $1 AND sync_started_at <= $2
    `;

    const result = await pool.query(query, [startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = AutoSyncHistory;
