const db = require('../config/database');
const encryption = require('../utils/encryption');
const logger = require('../utils/logger');

/**
 * PaymentRequest Model with Encryption
 * Enhanced version with encrypted bank account information
 */
class PaymentRequestEncrypted {
  /**
   * Create a new payment request with encrypted bank info
   * @param {Object} data
   * @param {string} data.userId - User ID
   * @param {number} data.requestedAmount - Amount to withdraw
   * @param {string} data.bankName - Bank name
   * @param {string} data.bankAccountNumber - Bank account number (will be encrypted)
   * @param {string} data.bankAccountName - Account holder name (will be encrypted)
   * @param {string} data.bankBranch - Bank branch (optional)
   * @param {string} data.notes - User notes (optional)
   * @param {Array} data.reconciliationItemIds - Reconciliation item IDs
   * @returns {Promise<Object>} Created payment request (with masked bank info)
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
      reconciliationItemIds = []
    } = data;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // ENCRYPTION ENABLED - Encrypt sensitive bank account data
      logger.info('[PaymentRequest] Creating payment request with encryption', {
        userId,
        amount: requestedAmount,
        bankName
      });

      // Encrypt sensitive data
      const bankAccountNumberEncrypted = encryption.encrypt(bankAccountNumber);
      const bankAccountNameEncrypted = encryption.encrypt(bankAccountName);
      const bankAccountNumberHash = encryption.hash(bankAccountNumber);

      // Mask for display (show last 4 digits)
      const bankAccountNumberMasked = encryption.mask(bankAccountNumber, 4);
      const bankAccountNameMasked = encryption.mask(bankAccountName, 3);

      // Insert payment request WITH encryption
      const insertQuery = `
        INSERT INTO payment_requests (
          user_id,
          requested_amount,
          bank_name,
          bank_account_number,
          bank_account_name,
          bank_account_number_encrypted,
          bank_account_number_hash,
          bank_account_name_encrypted,
          encryption_version,
          bank_branch,
          notes,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING
          id, user_id, requested_amount, bank_name, bank_account_number,
          bank_account_name, bank_branch, notes, status, created_at, updated_at
      `;

      const values = [
        userId,
        requestedAmount,
        bankName,
        bankAccountNumberMasked,        // Masked for display
        bankAccountNameMasked,          // Masked for display
        bankAccountNumberEncrypted,     // Encrypted full data
        bankAccountNumberHash,          // Hash for duplicate detection
        bankAccountNameEncrypted,       // Encrypted full name
        1,                              // Encryption version
        bankBranch,
        notes,
        'pending'
      ];

      const result = await client.query(insertQuery, values);
      const paymentRequest = result.rows[0];

      // Map reconciliation items
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

      // Log creation
      await this._logAction(client, {
        paymentRequestId: paymentRequest.id,
        action: 'created',
        oldStatus: null,
        newStatus: 'pending',
        performedBy: userId,
        notes: 'Payment request created with encrypted bank data'
      });

      await client.query('COMMIT');

      logger.info('[PaymentRequest] Payment request created successfully', {
        id: paymentRequest.id,
        userId,
        amount: requestedAmount
      });

      return paymentRequest;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[PaymentRequest] Create failed:', {
        error: error.message,
        userId,
        amount: requestedAmount
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find payment request by ID with decrypted bank info
   * Only for admin or owner access
   * @param {string} id - Payment request ID
   * @param {string} requestUserId - User requesting the data
   * @param {boolean} isAdmin - Whether requester is admin
   * @returns {Promise<Object|null>} Payment request with decrypted data
   */
  static async findByIdWithDecryption(id, requestUserId, isAdmin = false) {
    const client = await db.pool.connect();

    try {
      const query = `
        SELECT
          pr.*,
          u.username,
          u.email,
          u.full_name
        FROM payment_requests pr
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE pr.id = $1
      `;

      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const paymentRequest = result.rows[0];

      // Authorization check
      if (!isAdmin && paymentRequest.user_id !== requestUserId) {
        logger.warn('[PaymentRequest] Unauthorized access attempt', {
          paymentRequestId: id,
          requestUserId,
          ownerId: paymentRequest.user_id
        });
        throw new Error('Unauthorized access');
      }

      // ENCRYPTION DISABLED - Use plain text fields directly
      // For backward compatibility, still check for encrypted data
      if (paymentRequest.bank_account_number_encrypted) {
        try {
          paymentRequest.bank_account_number_decrypted = encryption.decrypt(
            paymentRequest.bank_account_number_encrypted
          );
          paymentRequest.bank_account_name_decrypted = encryption.decrypt(
            paymentRequest.bank_account_name_encrypted
          );

          logger.info('[PaymentRequest] Decrypted legacy encrypted data', {
            paymentRequestId: id,
            requestUserId,
            isAdmin
          });

        } catch (decryptError) {
          logger.error('[PaymentRequest] Decryption failed, falling back to plain text', {
            paymentRequestId: id,
            error: decryptError.message
          });
          // Fallback to plain text if decryption fails
          paymentRequest.bank_account_number_decrypted = paymentRequest.bank_account_number || 'N/A';
          paymentRequest.bank_account_name_decrypted = paymentRequest.bank_account_name || 'N/A';
        }
      } else {
        // No encrypted data - use plain text (normal case now)
        paymentRequest.bank_account_number_decrypted = paymentRequest.bank_account_number || 'N/A';
        paymentRequest.bank_account_name_decrypted = paymentRequest.bank_account_name || 'N/A';
      }

      // Remove encrypted fields from response
      delete paymentRequest.bank_account_number_encrypted;
      delete paymentRequest.bank_account_number_hash;
      delete paymentRequest.bank_account_name_encrypted;

      return paymentRequest;

    } catch (error) {
      logger.error('[PaymentRequest] Find by ID failed:', {
        error: error.message,
        id
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find payment request by ID (without decryption)
   * Returns masked data only
   * @param {string} id - Payment request ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      const query = `
        SELECT
          pr.id,
          pr.user_id,
          pr.requested_amount,
          pr.bank_name,
          pr.bank_account_number, -- Already masked
          pr.bank_account_name,   -- Already masked
          pr.bank_branch,
          pr.notes,
          pr.status,
          pr.admin_id,
          pr.admin_notes,
          pr.transaction_reference,
          pr.payment_account_id,
          pr.created_at,
          pr.confirmed_at,
          pr.paid_at,
          pr.rejected_at,
          pr.updated_at,
          pr.cancelled_at,
          pr.cancelled_by,
          pr.cancellation_reason,
          pr.resubmitted_at,
          u.username,
          u.email,
          u.full_name
        FROM payment_requests pr
        LEFT JOIN users u ON u.id = pr.user_id
        WHERE pr.id = $1
      `;

      const result = await db.pool.query(query, [id]);
      return result.rows[0] || null;

    } catch (error) {
      logger.error('[PaymentRequest] Find by ID failed:', {
        error: error.message,
        id
      });
      throw error;
    }
  }

  /**
   * Verify bank account number matches (for duplicate check)
   * Uses hash comparison to avoid decryption
   * @param {string} userId - User ID
   * @param {string} bankAccountNumber - Plain bank account number
   * @returns {Promise<Object|null>} Existing payment request if found
   */
  static async findByBankAccountHash(userId, bankAccountNumber) {
    try {
      // Get all pending/processing requests for user
      const query = `
        SELECT id, bank_account_number_hash, status, created_at
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'processing')
          AND bank_account_number_hash IS NOT NULL
        ORDER BY created_at DESC
      `;

      const result = await db.pool.query(query, [userId]);

      // Check hash match (timing-safe comparison)
      for (const row of result.rows) {
        if (encryption.verifyHash(bankAccountNumber, row.bank_account_number_hash)) {
          logger.info('[PaymentRequest] Found matching bank account via hash', {
            userId,
            existingRequestId: row.id
          });
          return row;
        }
      }

      return null;

    } catch (error) {
      logger.error('[PaymentRequest] Bank account hash check failed:', {
        error: error.message,
        userId
      });
      // Don't throw - allow operation to continue
      return null;
    }
  }

  /**
   * Find payment requests by user ID
   * @param {string} userId
   * @param {Object} filters
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

    if (status) {
      paramCount++;
      query += ` AND pr.status = $${paramCount}`;
      values.push(status);
    }

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

    if (userId) {
      paramCount++;
      query += ` AND pr.user_id = $${paramCount}`;
      values.push(userId);
    }

    if (userFilter) {
      paramCount++;
      query += ` AND (LOWER(u.email) LIKE LOWER($${paramCount}) OR LOWER(u.username) LIKE LOWER($${paramCount}))`;
      values.push(`%${userFilter}%`);
    }

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
   * Get payment request with items detail
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithItems(id) {
    const paymentRequest = await this.findById(id);
    if (!paymentRequest) return null;

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
   * Update payment request status
   * @param {string} id
   * @param {string} status
   * @param {Object} updateData
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

    const current = await this.findById(id);
    if (!current) {
      throw new Error('Payment request not found');
    }

    this._validateStatusTransition(current.status, status);

    if (status === 'paid' && !transactionReference) {
      throw new Error('Transaction reference required for paid status');
    }
    if (status === 'rejected' && !adminNotes) {
      throw new Error('Admin notes required for rejected status');
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      let timestampField = null;
      if (status === 'confirmed') timestampField = 'confirmed_at';
      else if (status === 'paid') timestampField = 'paid_at';
      else if (status === 'rejected') timestampField = 'rejected_at';

      const updateQuery = `
        UPDATE payment_requests
        SET
          status = $1,
          admin_id = $2,
          admin_notes = $3,
          transaction_reference = $4,
          ${timestampField ? `${timestampField} = NOW(),` : ''}
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        status,
        adminId,
        adminNotes,
        transactionReference,
        id
      ]);

      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_updated',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        notes: adminNotes || `Status updated to ${status}`
      });

      await client.query('COMMIT');

      logger.info('[PaymentRequest] Status updated', {
        id,
        oldStatus: current.status,
        newStatus: status,
        adminId
      });

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[PaymentRequest] Update status failed:', {
        error: error.message,
        id,
        status
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel payment request
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  static async cancel(id, userId) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const paymentRequest = await this.findById(id);
      if (!paymentRequest) {
        return false;
      }

      if (paymentRequest.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      if (paymentRequest.status !== 'pending') {
        throw new Error('Only pending requests can be cancelled');
      }

      // Check if already cancelled
      if (paymentRequest.cancelled_at) {
        throw new Error('Payment request already cancelled');
      }

      // Delete payment mappings to free up reconciliation items
      await client.query(`
        DELETE FROM payment_system_reconciliation_mapping
        WHERE payment_request_id = $1
      `, [id]);

      await client.query(`
        DELETE FROM payment_reconciliation_mapping
        WHERE payment_request_id = $1
      `, [id]);

      // Soft delete: Update status to 'cancelled' and set cancelled fields
      const updateQuery = `
        UPDATE payment_requests
        SET
          status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by = $2,
          cancellation_reason = $3,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

      const reason = 'Cancelled by user';
      const result = await client.query(updateQuery, [id, userId, reason]);

      if (result.rows.length === 0) {
        throw new Error('Failed to cancel payment request');
      }

      // Log the cancellation
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'cancelled',
        oldStatus: 'pending',
        newStatus: 'cancelled',
        performedBy: userId,
        notes: reason
      });

      await client.query('COMMIT');

      logger.info('[PaymentRequest] Soft deleted (cancelled)', { id, userId });
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[PaymentRequest] Cancel failed:', {
        error: error.message,
        id,
        userId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resubmit a cancelled payment request (reactivate it)
   * @param {string} id - Payment request ID
   * @param {string} userId - User ID who is resubmitting
   * @returns {Promise<Object>}
   */
  static async resubmit(id, userId) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current request to check status
      const checkQuery = `
        SELECT id, user_id, status, cancelled_at
        FROM payment_requests
        WHERE id = $1 AND user_id = $2
      `;
      const checkResult = await client.query(checkQuery, [id, userId]);

      if (checkResult.rows.length === 0) {
        throw new Error('Payment request not found');
      }

      const request = checkResult.rows[0];

      if (!request.cancelled_at) {
        throw new Error('Payment request is not cancelled');
      }

      // Reactivate: Clear cancellation fields, set status back to pending, and record resubmit time
      const updateQuery = `
        UPDATE payment_requests
        SET
          status = 'pending',
          cancelled_at = NULL,
          cancelled_by = NULL,
          cancellation_reason = NULL,
          resubmitted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

      const result = await client.query(updateQuery, [id, userId]);

      if (result.rows.length === 0) {
        throw new Error('Failed to resubmit payment request');
      }

      // Log the resubmission
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'resubmitted',
        oldStatus: 'cancelled',
        newStatus: 'pending',
        performedBy: userId,
        notes: 'Request resubmitted by user'
      });

      await client.query('COMMIT');

      logger.info('[PaymentRequest] Resubmitted', { id, userId });
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[PaymentRequest] Resubmit failed:', {
        error: error.message,
        id,
        userId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get payment request stats
   * @returns {Promise<Object>}
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'confirmed'), 0) as confirmed_amount,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount
      FROM payment_requests
    `;

    const result = await db.query(query);
    return result.rows[0];
  }

  /**
   * Get payment request logs
   * @param {string} id
   * @returns {Promise<Array>}
   */
  static async getLogs(id) {
    const query = `
      SELECT
        prl.*,
        u.full_name as performed_by_name,
        u.email as performed_by_email
      FROM payment_request_logs prl
      LEFT JOIN users u ON prl.performed_by = u.id
      WHERE prl.payment_request_id = $1
      ORDER BY prl.created_at DESC
    `;

    const result = await db.query(query, [id]);
    return result.rows;
  }

  /**
   * Validate status transition
   * @private
   */
  static _validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      pending: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['paid', 'rejected'],
      paid: [],
      rejected: [],
      cancelled: []
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
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
      notes
    } = data;

    const logQuery = `
      INSERT INTO payment_request_logs (
        payment_request_id,
        action,
        old_status,
        new_status,
        performed_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await client.query(logQuery, [
      paymentRequestId,
      action,
      oldStatus,
      newStatus,
      performedBy,
      notes
    ]);
  }
}

module.exports = PaymentRequestEncrypted;
