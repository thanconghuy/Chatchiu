/**
 * Payment System Reconciliation Service
 * Handles auto-linking payment requests with system reconciliation items
 * Enhanced with multi-layer validation for payment balance integrity
 */

const { pool } = require('../config/database');
const logger = require('../utils/logger');

class PaymentSystemReconciliationService {
  /**
   * Get available items for user (finalized but not yet paid)
   */
  static async getAvailableItemsForUser(userId) {
    try {
      const query = `SELECT * FROM get_available_system_recon_items_for_user($1)`;
      const result = await pool.query(query, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Get available items failed', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Calculate available balance for user from system reconciliation
   * Updated to use user_system_balance table (new system)
   */
  static async calculateAvailableBalance(userId) {
    try {
      // Read directly from user_system_balance table
      const query = `
        SELECT available_balance
        FROM user_system_balance
        WHERE user_id = $1
      `;
      const result = await pool.query(query, [userId]);

      // Return 0 if user doesn't have balance record yet
      if (result.rows.length === 0) {
        return 0;
      }

      return parseFloat(result.rows[0].available_balance) || 0;
    } catch (error) {
      logger.error('Calculate available balance failed', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * VALIDATION LAYER 1: Pre-request validation
   * Validates payment request before any processing
   * Returns detailed validation result with error codes
   */
  static async validatePaymentRequest(userId, requestedAmount, context = {}) {
    try {
      const query = `SELECT * FROM validate_payment_request_creation($1, $2)`;
      const result = await pool.query(query, [userId, requestedAmount]);

      const validation = result.rows[0];

      // Log validation attempt
      await this.logValidationAttempt({
        userId,
        requestedAmount,
        validationPassed: validation.is_valid,
        errorCode: validation.error_code,
        errorMessage: validation.error_message,
        availableBalance: parseFloat(validation.available_balance),
        context
      });

      return {
        isValid: validation.is_valid,
        errorCode: validation.error_code,
        errorMessage: validation.error_message,
        availableBalance: parseFloat(validation.available_balance),
        hasPendingRequest: validation.has_pending_request,
        minAmount: parseFloat(validation.min_amount)
      };

    } catch (error) {
      logger.error('Payment validation failed', {
        error: error.message,
        userId,
        requestedAmount
      });
      throw error;
    }
  }

  /**
   * VALIDATION LAYER 2: Auto-select items with locking
   * Uses database-level locks to prevent race conditions
   * Enhanced FIFO selection with transaction safety
   */
  static async autoSelectItemsForPayment(userId, requestedAmount, useDbLocking = true) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let availableItems;

      if (useDbLocking) {
        // Use database function with SELECT FOR UPDATE
        const query = `SELECT * FROM get_and_lock_available_items_for_payment($1, $2)`;
        const result = await client.query(query, [userId, requestedAmount]);
        availableItems = result.rows;
      } else {
        // Fallback to regular query (for backward compatibility)
        const query = `SELECT * FROM get_available_system_recon_items_for_user($1)`;
        const result = await client.query(query, [userId]);
        availableItems = result.rows;
      }

      if (availableItems.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          errorCode: 'NO_AVAILABLE_ITEMS',
          message: 'Không có items khả dụng để thanh toán',
          selectedItems: [],
          totalAmount: 0
        };
      }

      // Items are already sorted by FIFO in the database function
      const selectedItems = [];
      let currentTotal = 0;

      // Select items until we reach requested amount
      for (const item of availableItems) {
        if (currentTotal >= requestedAmount) break;

        selectedItems.push({
          itemId: item.item_id,
          systemReconciliationId: item.system_reconciliation_id,
          conversionId: item.conversion_id,
          cashbackAmount: parseFloat(item.cashback_amount),
          merchantName: item.merchant_name,
          orderTime: item.order_time,
          reconciliationPeriodLabel: item.reconciliation_period_label
        });

        currentTotal += parseFloat(item.cashback_amount);
      }

      // VALIDATION: Check if we have enough
      if (currentTotal < requestedAmount) {
        await client.query('ROLLBACK');
        return {
          success: false,
          errorCode: 'INSUFFICIENT_BALANCE',
          message: `Số dư không đủ. Khả dụng: ${currentTotal.toLocaleString('vi-VN')} VND, Yêu cầu: ${requestedAmount.toLocaleString('vi-VN')} VND`,
          selectedItems,
          totalAmount: currentTotal,
          shortfall: requestedAmount - currentTotal
        };
      }

      await client.query('COMMIT');

      logger.info('Items auto-selected with validation', {
        userId,
        requestedAmount,
        selectedItemsCount: selectedItems.length,
        totalAmount: currentTotal,
        useDbLocking
      });

      return {
        success: true,
        selectedItems,
        totalAmount: currentTotal,
        itemsCount: selectedItems.length
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Auto-select items failed', {
        error: error.message,
        userId,
        requestedAmount
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * VALIDATION LAYER 3: Verify items before linking
   * Double-check items are still available (race condition protection)
   */
  static async verifyItemsAvailability(itemIds) {
    try {
      const query = `SELECT * FROM verify_items_still_available($1)`;
      const result = await pool.query(query, [itemIds]);

      const verification = result.rows[0];

      if (!verification.all_available) {
        logger.warn('Items no longer available', {
          unavailableItems: verification.unavailable_items,
          message: verification.error_message
        });
      }

      return {
        allAvailable: verification.all_available,
        unavailableItems: verification.unavailable_items || [],
        errorMessage: verification.error_message
      };

    } catch (error) {
      logger.error('Verify items availability failed', {
        error: error.message,
        itemIds
      });
      throw error;
    }
  }

  /**
   * Link payment request with selected items
   * Creates records in payment_system_reconciliation_mapping
   * Enhanced with VALIDATION LAYER 3: Pre-linking verification
   */
  static async linkPaymentWithItems(paymentRequestId, selectedItems, userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // VALIDATION LAYER 3: Verify items are still available before linking
      const itemIds = selectedItems.map(item => item.itemId);
      const verification = await this.verifyItemsAvailability(itemIds);

      if (!verification.allAvailable) {
        await client.query('ROLLBACK');

        const error = new Error('Some items are no longer available');
        error.code = 'ITEMS_NO_LONGER_AVAILABLE';
        error.details = {
          unavailableItems: verification.unavailableItems,
          message: verification.errorMessage
        };

        throw error;
      }

      // All items verified, proceed with linking
      const insertPromises = selectedItems.map(item => {
        const query = `
          INSERT INTO payment_system_reconciliation_mapping (
            payment_request_id,
            system_reconciliation_id,
            system_reconciliation_item_id,
            conversion_id,
            user_id,
            cashback_amount,
            merchant_name,
            order_time
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `;

        return client.query(query, [
          paymentRequestId,
          item.systemReconciliationId,
          item.itemId,
          item.conversionId,
          userId,
          item.cashbackAmount,
          item.merchantName,
          item.orderTime
        ]);
      });

      const results = await Promise.all(insertPromises);

      // VALIDATION: Verify all inserts succeeded
      if (results.length !== selectedItems.length) {
        throw new Error(`Expected ${selectedItems.length} inserts, got ${results.length}`);
      }

      // Update payment_status in system_conversions for each linked conversion
      // Get payment request status first
      const prQuery = await client.query(
        'SELECT status FROM payment_requests WHERE id = $1',
        [paymentRequestId]
      );
      const paymentStatus = prQuery.rows[0]?.status || 'pending';

      // Update payment_status for all linked conversions
      for (const item of selectedItems) {
        await client.query(
          'SELECT update_payment_status_in_system_conversions($1, $2, $3)',
          [item.conversionId, paymentRequestId, paymentStatus]
        );
      }

      await client.query('COMMIT');

      logger.info('Payment linked with items successfully', {
        paymentRequestId,
        itemsCount: results.length,
        userId,
        validationPassed: true
      });

      return {
        success: true,
        linkedItemsCount: results.length,
        mappingIds: results.map(r => r.rows[0].id)
      };

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Link payment with items failed', {
        error: error.message,
        code: error.code,
        details: error.details,
        paymentRequestId,
        userId
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get linked items for a payment request
   */
  static async getLinkedItemsForPayment(paymentRequestId) {
    try {
      const query = `
        SELECT
          psrm.*,
          sr.period_label,
          sr.period_start,
          sr.period_end,
          sr.status as reconciliation_status
        FROM payment_system_reconciliation_mapping psrm
        LEFT JOIN system_reconciliations sr ON psrm.system_reconciliation_id = sr.id
        WHERE psrm.payment_request_id = $1
        ORDER BY psrm.order_time DESC
      `;

      const result = await pool.query(query, [paymentRequestId]);

      return result.rows;
    } catch (error) {
      logger.error('Get linked items failed', {
        error: error.message,
        paymentRequestId
      });
      throw error;
    }
  }

  /**
   * Unlink items when payment request is cancelled/deleted
   */
  static async unlinkPaymentItems(paymentRequestId) {
    try {
      const query = `
        DELETE FROM payment_system_reconciliation_mapping
        WHERE payment_request_id = $1
        RETURNING id
      `;

      const result = await pool.query(query, [paymentRequestId]);

      logger.info('Payment items unlinked', {
        paymentRequestId,
        deletedCount: result.rowCount
      });

      return {
        success: true,
        deletedCount: result.rowCount
      };

    } catch (error) {
      logger.error('Unlink payment items failed', {
        error: error.message,
        paymentRequestId
      });
      throw error;
    }
  }

  /**
   * Check if payment request has linked items
   */
  static async hasLinkedItems(paymentRequestId) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM payment_system_reconciliation_mapping
        WHERE payment_request_id = $1
      `;

      const result = await pool.query(query, [paymentRequestId]);
      return parseInt(result.rows[0].count) > 0;

    } catch (error) {
      logger.error('Check linked items failed', {
        error: error.message,
        paymentRequestId
      });
      throw error;
    }
  }

  /**
   * AUDIT: Log validation attempts for security and debugging
   * Records all validation attempts to payment_validation_audit_log table
   */
  static async logValidationAttempt({
    userId,
    requestedAmount,
    validationPassed,
    errorCode = null,
    errorMessage = null,
    availableBalance = null,
    selectedItemsCount = null,
    selectedItemsTotal = null,
    paymentRequestId = null,
    context = {}
  }) {
    try {
      const query = `
        INSERT INTO payment_validation_audit_log (
          user_id,
          requested_amount,
          validation_passed,
          error_code,
          error_message,
          available_balance,
          selected_items_count,
          selected_items_total,
          payment_request_id,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        userId,
        requestedAmount,
        validationPassed,
        errorCode,
        errorMessage,
        availableBalance,
        selectedItemsCount,
        selectedItemsTotal,
        paymentRequestId,
        context.ipAddress || null,
        context.userAgent || null
      ];

      const result = await pool.query(query, values);

      logger.info('Validation attempt logged', {
        auditLogId: result.rows[0].id,
        userId,
        validationPassed,
        errorCode
      });

      return result.rows[0].id;

    } catch (error) {
      // Don't throw error on audit logging failure - just log it
      logger.error('Failed to log validation attempt', {
        error: error.message,
        userId,
        requestedAmount
      });
    }
  }

  /**
   * Get validation history for user (for admin debugging)
   */
  static async getValidationHistory(userId, limit = 20) {
    try {
      const query = `
        SELECT *
        FROM payment_validation_audit_log
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await pool.query(query, [userId, limit]);

      return result.rows;

    } catch (error) {
      logger.error('Get validation history failed', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = PaymentSystemReconciliationService;
