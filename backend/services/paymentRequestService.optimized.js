/**
 * OPTIMIZED Payment Request Service
 *
 * Key Optimizations:
 * 1. Consolidated 3-layer validation into atomic transaction
 * 2. Reduced N+1 queries with CTEs and JOINs
 * 3. Added caching for system settings
 * 4. Improved error handling with custom error classes
 * 5. Better separation of concerns
 * 6. Batch operations where possible
 *
 * Created: 2026-01-02
 */

const { pool } = require('../config/database');
const logger = require('../utils/logger');
const PaymentRequestEncrypted = require('../models/PaymentRequestEncrypted');
const PaymentSystemReconciliationService = require('./paymentSystemReconciliationService');

// =====================================================
// CUSTOM ERROR CLASSES
// =====================================================

class PaymentValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PaymentValidationError';
    this.code = code;
    this.details = details;
    this.statusCode = 400;
  }
}

class PaymentProcessingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PaymentProcessingError';
    this.details = details;
    this.statusCode = 500;
  }
}

// =====================================================
// CACHE LAYER
// =====================================================

class SettingsCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }

  invalidate(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

const settingsCache = new SettingsCache();

// =====================================================
// OPTIMIZED PAYMENT REQUEST SERVICE
// =====================================================

class PaymentRequestServiceOptimized {

  /**
   * Get system setting with caching
   */
  static async getSetting(key, defaultValue = null) {
    const cacheKey = `setting:${key}`;
    let value = settingsCache.get(cacheKey);

    if (value !== null) {
      return value;
    }

    try {
      const result = await pool.query(
        'SELECT value FROM system_settings WHERE key = $1',
        [key]
      );

      value = result.rows[0]?.value || defaultValue;
      settingsCache.set(cacheKey, value);

      return value;
    } catch (error) {
      logger.error('Failed to get setting', { key, error: error.message });
      return defaultValue;
    }
  }

  /**
   * OPTIMIZED: Create payment request with atomic validation
   *
   * Improvements:
   * - Single atomic transaction for all validation + creation
   * - No separate validation calls
   * - Reduced round trips to database
   * - Better error handling with custom error classes
   */
  static async createPaymentRequest({
    userId,
    requestedAmount,
    bankName,
    bankAccountNumber,
    bankAccountName,
    bankBranch = null,
    notes = null,
    context = {}
  }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // ===================================================
      // PHASE 1: Validate in single query using CTE
      // ===================================================
      const validationQuery = `
        WITH user_stats AS (
          -- Get user available balance and pending requests in one query
          SELECT
            calculate_user_available_balance_from_system_recon($1) as available_balance,
            EXISTS(
              SELECT 1 FROM payment_requests
              WHERE user_id = $1
                AND status IN ('pending', 'confirmed')
                AND cancelled_at IS NULL
            ) as has_pending
        ),
        settings AS (
          -- Get all required settings in one query
          SELECT
            (SELECT value FROM system_settings WHERE key = 'min_withdrawal_amount')::numeric as min_amount,
            (SELECT value FROM system_settings WHERE key = 'max_withdrawal_amount')::numeric as max_amount
        )
        SELECT
          us.available_balance,
          us.has_pending,
          s.min_amount,
          s.max_amount,
          -- Validation checks
          CASE
            WHEN us.has_pending THEN 'HAS_PENDING_REQUEST'
            WHEN $2 < s.min_amount THEN 'BELOW_MIN_AMOUNT'
            WHEN $2 > s.max_amount THEN 'ABOVE_MAX_AMOUNT'
            WHEN $2 > us.available_balance THEN 'INSUFFICIENT_BALANCE'
            ELSE NULL
          END as error_code,
          CASE
            WHEN us.has_pending THEN 'Bạn đã có yêu cầu thanh toán đang chờ xử lý'
            WHEN $2 < s.min_amount THEN 'Số tiền yêu cầu thấp hơn mức tối thiểu: ' || s.min_amount::text || ' VND'
            WHEN $2 > s.max_amount THEN 'Số tiền yêu cầu vượt quá mức tối đa: ' || s.max_amount::text || ' VND'
            WHEN $2 > us.available_balance THEN 'Số dư không đủ. Khả dụng: ' || us.available_balance::text || ' VND'
            ELSE NULL
          END as error_message
        FROM user_stats us, settings s
      `;

      const validationResult = await client.query(validationQuery, [userId, requestedAmount]);
      const validation = validationResult.rows[0];

      // Log validation attempt
      await this._logValidationAttempt(client, {
        userId,
        requestedAmount,
        validationPassed: !validation.error_code,
        errorCode: validation.error_code,
        errorMessage: validation.error_message,
        availableBalance: parseFloat(validation.available_balance),
        context
      });

      // If validation failed, rollback and throw
      if (validation.error_code) {
        await client.query('ROLLBACK');

        throw new PaymentValidationError(
          validation.error_code,
          validation.error_message,
          {
            availableBalance: parseFloat(validation.available_balance),
            minAmount: parseFloat(validation.min_amount),
            maxAmount: parseFloat(validation.max_amount),
            hasPending: validation.has_pending
          }
        );
      }

      // ===================================================
      // PHASE 2: Auto-select items with locking (FIFO)
      // ===================================================
      const itemsResult = await client.query(
        'SELECT * FROM get_and_lock_available_items_for_payment($1, $2)',
        [userId, requestedAmount]
      );

      const availableItems = itemsResult.rows;

      if (availableItems.length === 0) {
        await client.query('ROLLBACK');

        throw new PaymentValidationError(
          'NO_AVAILABLE_ITEMS',
          'Không có items khả dụng để thanh toán',
          { availableBalance: parseFloat(validation.available_balance) }
        );
      }

      // Calculate total and select items
      const selectedItems = [];
      let currentTotal = 0;

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

      // Validate sufficient balance
      if (currentTotal < requestedAmount) {
        await client.query('ROLLBACK');

        throw new PaymentValidationError(
          'INSUFFICIENT_BALANCE',
          `Số dư không đủ. Khả dụng: ${currentTotal.toLocaleString('vi-VN')} VND, Yêu cầu: ${requestedAmount.toLocaleString('vi-VN')} VND`,
          {
            availableBalance: currentTotal,
            requestedAmount,
            shortfall: requestedAmount - currentTotal
          }
        );
      }

      // ===================================================
      // PHASE 3: Create payment request
      // ===================================================
      const insertQuery = `
        INSERT INTO payment_requests (
          user_id,
          requested_amount,
          bank_name,
          bank_account_number,
          bank_account_name,
          bank_branch,
          notes,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        userId,
        requestedAmount,
        bankName,
        bankAccountNumber,
        bankAccountName,
        bankBranch,
        notes
      ]);

      const paymentRequest = insertResult.rows[0];

      // ===================================================
      // PHASE 4: Link items to payment request (batch)
      // ===================================================

      // Batch insert all mappings in single query
      const mappingValues = selectedItems.map((item, idx) => {
        const base = idx * 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
      }).join(', ');

      const mappingParams = selectedItems.flatMap(item => [
        paymentRequest.id,
        item.systemReconciliationId,
        item.itemId,
        item.conversionId,
        userId,
        item.cashbackAmount,
        item.merchantName,
        item.orderTime
      ]);

      const mappingQuery = `
        INSERT INTO payment_system_reconciliation_mapping (
          payment_request_id,
          system_reconciliation_id,
          system_reconciliation_item_id,
          conversion_id,
          user_id,
          cashback_amount,
          merchant_name,
          order_time
        ) VALUES ${mappingValues}
        RETURNING id
      `;

      const mappingResult = await client.query(mappingQuery, mappingParams);

      // Update payment status in system_conversions (batch)
      const conversionIds = selectedItems.map(item => item.conversionId);
      await client.query(
        `UPDATE system_conversions
         SET payment_status = 'pending',
             linked_payment_request_id = $1
         WHERE conversion_id = ANY($2::uuid[])`,
        [paymentRequest.id, conversionIds]
      );

      // ===================================================
      // PHASE 5: Log creation
      // ===================================================
      await client.query(
        `INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          notes
        ) VALUES ($1, 'created', NULL, 'pending', $2, $3)`,
        [
          paymentRequest.id,
          userId,
          `Payment request created with ${selectedItems.length} items, total: ${currentTotal.toLocaleString('vi-VN')} VND`
        ]
      );

      await client.query('COMMIT');

      logger.info('Payment request created successfully (optimized)', {
        paymentRequestId: paymentRequest.id,
        userId,
        requestedAmount,
        selectedItemsCount: selectedItems.length,
        totalAmount: currentTotal
      });

      return {
        paymentRequest,
        selectedItems,
        totalAmount: currentTotal,
        itemsCount: selectedItems.length
      };

    } catch (error) {
      await client.query('ROLLBACK');

      // Re-throw custom errors as-is
      if (error instanceof PaymentValidationError || error instanceof PaymentProcessingError) {
        throw error;
      }

      // Wrap unexpected errors
      logger.error('Create payment request failed (optimized)', {
        error: error.message,
        stack: error.stack,
        userId,
        requestedAmount
      });

      throw new PaymentProcessingError(
        'Không thể tạo yêu cầu thanh toán. Vui lòng thử lại sau.',
        { originalError: error.message }
      );

    } finally {
      client.release();
    }
  }

  /**
   * OPTIMIZED: Get payment requests for user
   *
   * Improvements:
   * - Single query with JOINs instead of N+1 queries
   * - Includes all related data in one fetch
   */
  static async getPaymentRequestsForUser(userId, filters = {}) {
    const {
      status = null,
      limit = 20,
      offset = 0
    } = filters;

    try {
      // Build query with CTEs for better performance
      let query = `
        WITH payment_stats AS (
          SELECT
            psrm.payment_request_id,
            COUNT(*) as items_count,
            SUM(psrm.cashback_amount) as total_from_items
          FROM payment_system_reconciliation_mapping psrm
          GROUP BY psrm.payment_request_id
        )
        SELECT
          pr.*,
          COALESCE(ps.items_count, 0) as items_count,
          COALESCE(ps.total_from_items, 0) as total_from_items
        FROM payment_requests pr
        LEFT JOIN payment_stats ps ON ps.payment_request_id = pr.id
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

      const result = await pool.query(query, values);

      return result.rows;

    } catch (error) {
      logger.error('Get payment requests failed (optimized)', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * OPTIMIZED: Get payment request details with all related data
   *
   * Improvements:
   * - Single query with multiple JOINs
   * - No separate queries for items
   */
  static async getPaymentRequestDetails(paymentRequestId, userId) {
    try {
      const query = `
        WITH payment_items AS (
          SELECT
            psrm.payment_request_id,
            json_agg(
              json_build_object(
                'itemId', psrm.system_reconciliation_item_id,
                'systemReconciliationId', psrm.system_reconciliation_id,
                'conversionId', psrm.conversion_id,
                'cashbackAmount', psrm.cashback_amount,
                'merchantName', psrm.merchant_name,
                'orderTime', psrm.order_time,
                'reconciliationPeriodLabel', sr.period_label
              ) ORDER BY psrm.order_time DESC
            ) as items
          FROM payment_system_reconciliation_mapping psrm
          LEFT JOIN system_reconciliations sr ON psrm.system_reconciliation_id = sr.id
          WHERE psrm.payment_request_id = $1
          GROUP BY psrm.payment_request_id
        )
        SELECT
          pr.*,
          u.username,
          u.email,
          u.full_name,
          admin_user.full_name as admin_name,
          COALESCE(pi.items, '[]'::json) as items,
          (SELECT COUNT(*) FROM payment_system_reconciliation_mapping WHERE payment_request_id = pr.id) as items_count
        FROM payment_requests pr
        LEFT JOIN users u ON pr.user_id = u.id
        LEFT JOIN users admin_user ON pr.admin_id = admin_user.id
        LEFT JOIN payment_items pi ON pi.payment_request_id = pr.id
        WHERE pr.id = $1 AND pr.user_id = $2
      `;

      const result = await pool.query(query, [paymentRequestId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      logger.error('Get payment request details failed (optimized)', {
        error: error.message,
        paymentRequestId,
        userId
      });
      throw error;
    }
  }

  /**
   * OPTIMIZED: Get admin list with all user info
   *
   * Improvements:
   * - Single query with CTEs
   * - Batch aggregation
   */
  static async getAdminPaymentRequests(filters = {}) {
    const {
      status = null,
      userId = null,
      userFilter = null,
      fromDate = null,
      toDate = null,
      limit = 50,
      offset = 0
    } = filters;

    try {
      let query = `
        WITH payment_stats AS (
          SELECT
            psrm.payment_request_id,
            COUNT(*) as items_count,
            SUM(psrm.cashback_amount) as total_from_items
          FROM payment_system_reconciliation_mapping psrm
          GROUP BY psrm.payment_request_id
        )
        SELECT
          pr.*,
          u.full_name as user_name,
          u.email as user_email,
          u.phone as user_phone,
          u.username as user_username,
          admin_user.full_name as admin_name,
          COALESCE(ps.items_count, 0) as items_count,
          COALESCE(ps.total_from_items, 0) as total_from_items
        FROM payment_requests pr
        LEFT JOIN users u ON pr.user_id = u.id
        LEFT JOIN users admin_user ON pr.admin_id = admin_user.id
        LEFT JOIN payment_stats ps ON ps.payment_request_id = pr.id
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 0;

      // Apply filters
      if (status === 'cancelled') {
        query += ` AND pr.cancelled_at IS NOT NULL`;
      } else if (status) {
        query += ` AND pr.cancelled_at IS NULL`;
        paramCount++;
        query += ` AND pr.status = $${paramCount}`;
        values.push(status);
      } else {
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

      const result = await pool.query(query, values);

      return result.rows;

    } catch (error) {
      logger.error('Get admin payment requests failed (optimized)', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Helper: Log validation attempt
   */
  static async _logValidationAttempt(client, data) {
    try {
      const {
        userId,
        requestedAmount,
        validationPassed,
        errorCode = null,
        errorMessage = null,
        availableBalance = null,
        context = {}
      } = data;

      await client.query(
        `INSERT INTO payment_validation_audit_log (
          user_id,
          requested_amount,
          validation_passed,
          error_code,
          error_message,
          available_balance,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          requestedAmount,
          validationPassed,
          errorCode,
          errorMessage,
          availableBalance,
          context.ipAddress || null,
          context.userAgent || null
        ]
      );
    } catch (error) {
      // Don't throw on logging failure
      logger.error('Failed to log validation attempt', {
        error: error.message,
        userId,
        requestedAmount
      });
    }
  }

  /**
   * Invalidate settings cache (call after updating settings)
   */
  static invalidateSettingsCache(key = null) {
    settingsCache.invalidate(key);
  }
}

module.exports = {
  PaymentRequestServiceOptimized,
  PaymentValidationError,
  PaymentProcessingError,
  settingsCache
};
