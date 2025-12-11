const db = require('../config/database');

/**
 * PaymentRequest Model
 * Manages user payment requests for cashback withdrawals
 * Corresponds to 'payment_requests' table
 */
class PaymentRequest {
  /**
   * Create a new payment request
   * @param {Object} data
   * @param {string} data.userId - User ID
   * @param {number} data.requestedAmount - Amount to withdraw (min 100,000)
   * @param {string} data.bankName - Bank name
   * @param {string} data.bankAccountNumber - Bank account number
   * @param {string} data.bankAccountName - Bank account holder name
   * @param {string} data.bankBranch - Bank branch (optional)
   * @param {string} data.notes - User notes (optional)
   * @param {number} data.paymentAccountId - Saved payment account ID (optional)
   * @param {Array} data.reconciliationItemIds - Array of reconciliation_item IDs to include
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const {
      userId,
      requestedAmount,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch = null,
      notes = null,
      paymentAccountId = null,
      reconciliationItemIds = []
    } = data;

    // Start transaction
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert payment request
      const insertQuery = `
        INSERT INTO payment_requests (
          user_id,
          requested_amount,
          bank_name,
          bank_account_number,
          bank_account_name,
          bank_branch,
          notes,
          payment_account_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        userId,
        requestedAmount,
        bankName,
        bankAccountNumber,
        bankAccountName,
        bankBranch,
        notes,
        paymentAccountId,
        'pending'
      ];

      const result = await client.query(insertQuery, values);
      const paymentRequest = result.rows[0];

      // Map reconciliation items to this payment request
      if (reconciliationItemIds.length > 0) {
        const mappingQuery = `
          INSERT INTO payment_reconciliation_mapping (
            payment_request_id,
            reconciliation_id,
            reconciliation_item_id,
            cashback_amount
          )
          SELECT
            $1,
            ri.reconciliation_id,
            ri.id,
            ri.cashback_amount
          FROM reconciliation_items ri
          WHERE ri.id = ANY($2::uuid[])
        `;

        await client.query(mappingQuery, [paymentRequest.id, reconciliationItemIds]);
      }

      // Log the creation
      await this._logAction(client, {
        paymentRequestId: paymentRequest.id,
        action: 'created',
        oldStatus: null,
        newStatus: 'pending',
        performedBy: userId,
        notes: 'Payment request created'
      });

      await client.query('COMMIT');
      return paymentRequest;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find payment request by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const query = `
      SELECT
        pr.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        admin.full_name as admin_name,
        admin.email as admin_email,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0)
         FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      LEFT JOIN users admin ON pr.admin_id = admin.id
      WHERE pr.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get payment request with reconciliation items detail
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithItems(id) {
    const paymentRequest = await this.findById(id);
    if (!paymentRequest) return null;

    // Get reconciliation items
    const itemsQuery = `
      SELECT
        ri.*,
        prm.cashback_amount as mapped_cashback_amount,
        c.order_code,
        c.merchant_name,
        c.order_time,
        r.period_label
      FROM payment_reconciliation_mapping prm
      JOIN reconciliation_items ri ON prm.reconciliation_item_id = ri.id
      JOIN conversions c ON ri.conversion_id = c.id
      JOIN reconciliations r ON prm.reconciliation_id = r.id
      WHERE prm.payment_request_id = $1
      ORDER BY c.order_time DESC
    `;

    const itemsResult = await db.query(itemsQuery, [id]);
    paymentRequest.items = itemsResult.rows;

    return paymentRequest;
  }

  /**
   * Find payment requests by user ID
   * @param {string} userId
   * @param {Object} filters
   * @param {string|null} filters.status - Filter by status
   * @param {number} filters.limit
   * @param {number} filters.offset
   * @returns {Promise<Array>}
   */
  static async findByUserId(userId, filters = {}) {
    const {
      status = null,
      limit = 20,
      offset = 0
    } = filters;

    let query = `
      SELECT
        pr.*,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0)
         FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      WHERE pr.user_id = $1
        AND pr.cancelled_at IS NULL
    `;

    const values = [userId];
    let paramCount = 1;

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      values.push(status);
    }

    // Order and pagination
    query += ` ORDER BY pr.created_at DESC`;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Get all payment requests (admin view)
   * @param {Object} filters
   * @param {string|null} filters.status - Filter by status
   * @param {string|null} filters.userId - Filter by user
   * @param {Date|null} filters.fromDate - Filter from date
   * @param {Date|null} filters.toDate - Filter to date
   * @param {number} filters.limit
   * @param {number} filters.offset
   * @returns {Promise<Array>}
   */
  static async findAll(filters = {}) {
    const {
      status = null,
      userId = null,
      userFilter = null,
      fromDate = null,
      toDate = null,
      limit = 50,
      offset = 0
    } = filters;

    let query = `
      SELECT
        pr.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        u.username as user_username,
        admin.full_name as admin_name,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0)
         FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      LEFT JOIN users admin ON pr.admin_id = admin.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 0;

    // Filter by status - special handling for "cancelled"
    if (status === 'cancelled') {
      // Show only cancelled requests
      query += ` AND pr.cancelled_at IS NOT NULL`;
    } else if (status) {
      // Show non-cancelled requests with specific status
      query += ` AND pr.cancelled_at IS NULL`;
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      values.push(status);
    } else {
      // Show only non-cancelled requests by default
      query += ` AND pr.cancelled_at IS NULL`;
    }

    // Filter by user ID (exact match)
    if (userId) {
      paramCount++;
      query += ` AND pr.user_id = $${paramCount}`;
      values.push(userId);
    }

    // Filter by email or username (partial match)
    if (userFilter) {
      paramCount++;
      query += ` AND (LOWER(u.email) LIKE LOWER($${paramCount}) OR LOWER(u.username) LIKE LOWER($${paramCount}))`;
      values.push(`%${userFilter}%`);
    }

    // Filter by date range
    if (fromDate) {
      paramCount++;
      query += ` AND pr.created_at >= $${paramCount}`;
      values.push(fromDate);
    }

    if (toDate) {
      paramCount++;
      query += ` AND pr.created_at <= $${paramCount}`;
      values.push(toDate);
    }

    // Order and pagination
    query += ` ORDER BY pr.created_at DESC`;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Update payment request status
   * @param {string} id
   * @param {string} status - 'pending', 'confirmed', 'paid', 'rejected'
   * @param {Object} updateData
   * @param {string} updateData.adminId - Admin performing the action
   * @param {string} updateData.adminNotes - Admin notes
   * @param {string} updateData.transactionReference - Transaction reference (for 'paid' status)
   * @param {Object} updateData.performedBy - User info for logging
   * @returns {Promise<Object>}
   */
  static async updateStatus(id, status, updateData = {}) {
    const validStatuses = ['pending', 'confirmed', 'paid', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const {
      adminId = null,
      adminNotes = null,
      transactionReference = null,
      performedBy = {}
    } = updateData;

    // Get current payment request for logging
    const current = await this.findById(id);
    if (!current) {
      throw new Error('Payment request not found');
    }

    // Validate status transitions
    this._validateStatusTransition(current.status, status);

    // Validate required fields
    if (status === 'paid' && !transactionReference) {
      throw new Error('Transaction reference required for paid status');
    }
    if (status === 'rejected' && !adminNotes) {
      throw new Error('Admin notes required for rejected status');
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Determine which timestamp to update
      let timestampField = null;
      if (status === 'confirmed') timestampField = 'confirmed_at';
      else if (status === 'paid') timestampField = 'paid_at';
      else if (status === 'rejected') timestampField = 'rejected_at';

      let query = `
        UPDATE payment_requests
        SET status = $1,
            admin_id = $2,
            admin_notes = $3,
            transaction_reference = $4
      `;

      const values = [status, adminId, adminNotes, transactionReference, id];
      let paramCount = 4;

      if (timestampField) {
        paramCount++;
        query += `, ${timestampField} = NOW()`;
      }

      paramCount++;
      query += ` WHERE id = $${paramCount} RETURNING *`;

      const result = await client.query(query, values);

      // Log the status change
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || `Status changed from ${current.status} to ${status}`,
        metadata: { transactionReference }
      });

// Sync payment_status to system_conversions for all linked conversions      await client.query(`        UPDATE system_conversions sc        SET          payment_status = $1,          updated_at = NOW()        FROM payment_system_reconciliation_mapping psrm        WHERE psrm.payment_request_id = $2          AND sc.at_conversion_id = psrm.conversion_id      `, [status, id]);
      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel payment request (SOFT DELETE - user only, only if status is pending)
   * @param {string} id
   * @param {string} userId
   * @param {string} reason - Optional cancellation reason
   * @returns {Promise<Object>}
   */
  static async cancel(id, userId, reason = null) {
    const paymentRequest = await this.findById(id);

    if (!paymentRequest) {
      throw new Error('Payment request not found');
    }

    if (paymentRequest.user_id !== userId) {
      throw new Error('Unauthorized: Not your payment request');
    }

    if (paymentRequest.status !== 'pending') {
      throw new Error('Can only cancel pending requests');
    }

    // Check if already cancelled
    if (paymentRequest.cancelled_at) {
      throw new Error('Payment request already cancelled');
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Soft delete: Update cancelled fields instead of DELETE
      const query = `
        UPDATE payment_requests
        SET
          cancelled_at = NOW(),
          cancelled_by = $2,
          cancellation_reason = $3,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

      const result = await client.query(query, [id, userId, reason]);

      // Log the cancellation
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'cancelled',
        oldStatus: 'pending',
        newStatus: 'cancelled',
        performedBy: userId,
        notes: reason || 'Payment request cancelled by user'
      });

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user's available balance
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async getAvailableBalance(userId) {
    const query = `
      SELECT
        user_id,
        total_confirmed_cashback,
        total_requested,
        available_balance,
        has_pending_request,
        is_eligible
      FROM v_user_available_balances
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0] || {
      user_id: userId,
      total_confirmed_cashback: 0,
      total_requested: 0,
      available_balance: 0,
      has_pending_request: false,
      is_eligible: false
    };
  }

  /**
   * Get payment request logs
   * @param {string} paymentRequestId
   * @returns {Promise<Array>}
   */
  static async getLogs(paymentRequestId) {
    const query = `
      SELECT *
      FROM payment_request_logs
      WHERE payment_request_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [paymentRequestId]);
    return result.rows;
  }

  /**
   * Get payment request statistics
   * @returns {Promise<Object>}
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE cancelled_at IS NULL) as total_requests,
        COUNT(*) FILTER (WHERE cancelled_at IS NULL AND status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE cancelled_at IS NULL AND status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE cancelled_at IS NULL AND status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE cancelled_at IS NULL AND status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) as cancelled_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE cancelled_at IS NULL), 0) as total_amount,
        COALESCE(SUM(requested_amount) FILTER (WHERE cancelled_at IS NULL AND status = 'paid'), 0) as total_paid,
        COALESCE(SUM(requested_amount) FILTER (WHERE cancelled_at IS NULL AND status = 'pending'), 0) as total_pending,
        COALESCE(SUM(requested_amount) FILTER (WHERE cancelled_at IS NULL AND status = 'confirmed'), 0) as total_confirmed,
        COALESCE(SUM(requested_amount) FILTER (WHERE cancelled_at IS NOT NULL), 0) as total_cancelled
      FROM payment_requests
    `;

    const result = await db.query(query);
    return result.rows[0];
  }

  /**
   * Validate status transition
   * @private
   */
  static _validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      'pending': ['confirmed', 'rejected'],
      'confirmed': ['paid', 'rejected'],
      'paid': [],
      'rejected': []
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new Error(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
    }
  }

  /**
   * Log payment request action
   * @private
   */
  static async _logAction(client, data) {
    const {
      paymentRequestId,
      action,
      oldStatus,
      newStatus,
      performedBy,
      performedByName = null,
      performedByEmail = null,
      notes = null,
      metadata = null
    } = data;

    const query = `
      INSERT INTO payment_request_logs (
        payment_request_id,
        action,
        old_status,
        new_status,
        performed_by,
        performed_by_name,
        performed_by_email,
        notes,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    const values = [
      paymentRequestId,
      action,
      oldStatus,
      newStatus,
      performedBy,
      performedByName,
      performedByEmail,
      notes,
      metadata ? JSON.stringify(metadata) : null
    ];

    await client.query(query, values);
  }
}

module.exports = PaymentRequest;
