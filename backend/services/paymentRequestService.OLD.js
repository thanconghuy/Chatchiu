const db = require('../config/database');
const PaymentRequest = require('../models/PaymentRequestEncrypted');
const PaymentAccount = require('../models/PaymentAccount');
const PaymentSystemReconciliationService = require('./paymentSystemReconciliationService');
const SystemSettingsService = require('./systemSettingsService');
const UserPaymentHistory = require('../models/UserPaymentHistory');
const UserPaymentDetail = require('../models/UserPaymentDetail');
const BalanceManagementService = require('./systemReconciliation/BalanceManagementService');
const logger = require('../utils/logger');

/**
 * Payment Request Service
 * Business logic for payment request operations
 */
class PaymentRequestService {
  /**
   * Check user eligibility for creating payment request
   * Uses System Reconciliation balance
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async checkEligibility(userId) {
    try {
      logger.info('Checking payment request eligibility', { userId });

      // Get available balance from system reconciliation
      const availableBalance = await PaymentSystemReconciliationService.calculateAvailableBalance(userId);

      // Get total confirmed cashback from system_conversions
      const totalCashbackQuery = `
        SELECT COALESCE(SUM(cashback_amount), 0) as total
        FROM system_conversions
        WHERE user_id = $1
          AND status = 'approved'
      `;
      const totalCashbackResult = await db.query(totalCashbackQuery, [userId]);
      const totalConfirmedCashback = parseFloat(totalCashbackResult.rows[0].total) || 0;

      // Get total requested amount (what user asked for)
      const totalRequestedQuery = `
        SELECT COALESCE(SUM(requested_amount), 0) as total
        FROM payment_requests
        WHERE user_id = $1
          AND status NOT IN ('rejected', 'cancelled')
      `;
      const totalRequestedResult = await db.query(totalRequestedQuery, [userId]);
      const totalRequested = parseFloat(totalRequestedResult.rows[0].total) || 0;

      // Check for pending requests (exclude cancelled)
      const pendingQuery = `
        SELECT COUNT(*) as count
        FROM payment_requests
        WHERE user_id = $1
          AND status = 'pending'
          AND cancelled_at IS NULL
      `;
      const pendingResult = await db.query(pendingQuery, [userId]);
      const hasPendingRequest = parseInt(pendingResult.rows[0].count) > 0;

      // Get minimum withdrawal amount from system settings
      const minAmount = await SystemSettingsService.getSetting('min_withdrawal_amount') || 50000;

      // 🔥 ENHANCED: Check for negative balance (data integrity issue)
      if (availableBalance < 0) {
        logger.warn('User has negative balance', {
          userId,
          availableBalance,
          totalConfirmedCashback,
          totalRequested
        });

        return {
          isEligible: false,
          availableBalance,
          totalConfirmedCashback,
          totalRequested,
          hasPendingRequest,
          minAmount,
          reasons: [
            'Số dư khả dụng của bạn hiện âm. Vui lòng liên hệ admin để kiểm tra.',
            `Số dư hiện tại: ${availableBalance.toLocaleString('vi-VN')} VNĐ`
          ]
        };
      }

      // 🔥 ENHANCED: More strict validation
      const isEligible = availableBalance >= minAmount && !hasPendingRequest && availableBalance > 0;

      const eligibility = {
        isEligible,
        availableBalance,
        totalConfirmedCashback,
        totalRequested,
        hasPendingRequest,
        minAmount,
        reasons: []
      };

      // Explain why not eligible
      if (!isEligible) {
        if (hasPendingRequest) {
          eligibility.reasons.push('Bạn đang có yêu cầu thanh toán chờ xử lý');
        }
        if (availableBalance <= 0) {
          eligibility.reasons.push('Số dư khả dụng không đủ. Vui lòng chờ kỳ đối soát tiếp theo.');
        } else if (availableBalance < minAmount) {
          eligibility.reasons.push(`Số dư khả dụng phải ≥ ${minAmount.toLocaleString('vi-VN')} VNĐ (hiện tại: ${availableBalance.toLocaleString('vi-VN')} VNĐ)`);
        }
      }

      logger.success('Eligibility check completed', eligibility);
      return eligibility;

    } catch (error) {
      logger.error('Failed to check eligibility', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get available reconciliation items for payment
   * Uses FIFO (First-In-First-Out) approach
   * @param {string} userId
   * @param {number} requestedAmount
   * @returns {Promise<Object>}
   */
  async getAvailableItems(userId, requestedAmount) {
    try {
      logger.info('Getting available reconciliation items', { userId, requestedAmount });

      // Query reconciliation items that:
      // 1. Belong to user
      // 2. From confirmed reconciliations
      // 3. Not yet included in any payment request
      // 4. Order by confirmed_time (FIFO)
      const query = `
        SELECT
          ri.id,
          ri.reconciliation_id,
          ri.conversion_id,
          ri.cashback_amount,
          c.order_code,
          c.merchant_name,
          c.order_time,
          c.confirmed_time,
          r.period_label,
          r.confirmed_at as reconciliation_confirmed_at
        FROM reconciliation_items ri
        JOIN conversions c ON ri.conversion_id = c.id
        JOIN reconciliations r ON ri.reconciliation_id = r.id
        LEFT JOIN payment_reconciliation_mapping prm ON ri.id = prm.reconciliation_item_id
        WHERE c.user_id = $1
          AND r.status = 'confirmed'
          AND prm.id IS NULL
        ORDER BY c.confirmed_time ASC
      `;

      const result = await db.query(query, [userId]);
      const availableItems = result.rows;

      // Calculate how many items needed using FIFO
      let runningTotal = 0;
      const selectedItems = [];

      for (const item of availableItems) {
        if (runningTotal >= requestedAmount) break;

        selectedItems.push(item);
        runningTotal += parseFloat(item.cashback_amount);
      }

      const summary = {
        requestedAmount,
        selectedItems,
        selectedCount: selectedItems.length,
        totalSelectedAmount: runningTotal,
        availableCount: availableItems.length,
        totalAvailableAmount: availableItems.reduce((sum, item) => sum + parseFloat(item.cashback_amount), 0),
        isSufficient: runningTotal >= requestedAmount
      };

      logger.success('Available items retrieved', {
        selectedCount: summary.selectedCount,
        totalSelectedAmount: summary.totalSelectedAmount
      });

      return summary;

    } catch (error) {
      logger.error('Failed to get available items', { error: error.message, userId, requestedAmount });
      throw error;
    }
  }

  /**
   * Create a new payment request
   * Enhanced with multi-layer validation for balance integrity
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} params.requestedAmount
   * @param {string} params.bankName
   * @param {string} params.bankAccountNumber
   * @param {string} params.bankAccountName
   * @param {string} params.bankBranch
   * @param {string} params.notes
   * @param {Object} params.context - Request context (IP, user agent)
   * @returns {Promise<Object>}
   */
  async createPaymentRequest(params) {
    const {
      userId,
      requestedAmount,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch = null,
      notes = null,
      paymentAccountId = null,
      context = {}
    } = params;

    try {
      logger.info('Creating payment request with enhanced validation', { userId, requestedAmount });

      // Get withdrawal limits from system settings
      const minWithdrawal = await SystemSettingsService.getSetting('min_withdrawal_amount') || 50000;
      const maxWithdrawal = await SystemSettingsService.getSetting('max_withdrawal_amount') || 5000000;

      // Basic input validation with dynamic limits
      if (requestedAmount < minWithdrawal) {
        const error = new Error(`Số tiền yêu cầu phải ≥ ${minWithdrawal.toLocaleString('vi-VN')} VNĐ`);
        error.code = 'BELOW_MIN_AMOUNT';
        throw error;
      }

      if (requestedAmount > maxWithdrawal) {
        const error = new Error(`Số tiền yêu cầu không được vượt quá ${maxWithdrawal.toLocaleString('vi-VN')} VNĐ`);
        error.code = 'ABOVE_MAX_AMOUNT';
        throw error;
      }

      if (!bankName || !bankAccountNumber || !bankAccountName) {
        const error = new Error('Thông tin ngân hàng không đầy đủ');
        error.code = 'INVALID_BANK_INFO';
        throw error;
      }

      if (bankAccountNumber.length < 6) {
        const error = new Error('Số tài khoản không hợp lệ (tối thiểu 6 ký tự)');
        error.code = 'INVALID_ACCOUNT_NUMBER';
        throw error;
      }

      // VALIDATION: Check available balance only (no item selection)
      const validation = await PaymentSystemReconciliationService.validatePaymentRequest(
        userId,
        requestedAmount,
        context
      );

      if (!validation.isValid) {
        const error = new Error(validation.errorMessage);
        error.code = validation.errorCode;
        error.validationDetails = validation;
        throw error;
      }

      // Auto-save payment account if not using saved account
      let finalPaymentAccountId = paymentAccountId;

      if (!paymentAccountId && bankName && bankAccountNumber && bankAccountName) {
        try {
          // Check if user already has 5 accounts (max limit)
          const accountCount = await PaymentAccount.count(userId);

          if (accountCount < 5) {
            // Check if this exact account already exists
            const existingAccounts = await PaymentAccount.findByUserId(userId);
            const accountExists = existingAccounts.some(acc =>
              acc.account_number === bankAccountNumber &&
              acc.account_holder_name === bankAccountName
            );

            if (!accountExists) {
              // Auto-save the payment account
              const newAccount = await PaymentAccount.create({
                userId,
                accountType: 'bank', // Default to bank for payment requests
                accountHolderName: bankAccountName,
                accountNumber: bankAccountNumber,
                bankName: bankName,
                bankBranch: bankBranch || null,
                isDefault: accountCount === 0, // Set as default if it's the first account
                notes: 'Tự động lưu từ yêu cầu thanh toán'
              });

              finalPaymentAccountId = newAccount.id;
              logger.info('Auto-saved payment account from payment request', {
                accountId: newAccount.id,
                userId
              });
            }
          }
        } catch (autoSaveError) {
          // Non-critical error, just log it and continue
          logger.warn('Failed to auto-save payment account', {
            error: autoSaveError.message,
            userId
          });
        }
      }

      // Create payment request
      const paymentRequest = await PaymentRequest.create({
        userId,
        requestedAmount,
        bankName,
        bankAccountNumber,
        bankAccountName,
        bankBranch,
        notes,
        paymentAccountId: finalPaymentAccountId
      });

      // Log successful validation and creation
      await PaymentSystemReconciliationService.logValidationAttempt({
        userId,
        requestedAmount,
        validationPassed: true,
        availableBalance: validation.availableBalance,
        selectedItemsCount: 0, // No auto-selection
        selectedItemsTotal: 0, // No auto-selection
        paymentRequestId: paymentRequest.id,
        context
      });

      logger.success('Payment request created successfully', {
        id: paymentRequest.id,
        requestedAmount
      });

      // Return payment request (no items linking)
      return {
        ...paymentRequest
      };

    } catch (error) {
      logger.error('Failed to create payment request', {
        error: error.message,
        code: error.code,
        details: error.details,
        validationDetails: error.validationDetails,
        params
      });
      throw error;
    }
  }

  /**
   * Confirm payment request (Admin)
   * @param {string} paymentRequestId
   * @param {Object} adminInfo
   * @param {string} adminInfo.id
   * @param {string} adminInfo.full_name
   * @param {string} adminInfo.email
   * @param {string} adminNotes
   * @returns {Promise<Object>}
   */
  async confirmPaymentRequest(paymentRequestId, adminInfo, adminNotes = null) {
    try {
      logger.info('Confirming payment request', { paymentRequestId, adminId: adminInfo.id });

      const updated = await PaymentRequest.updateStatus(paymentRequestId, 'confirmed', {
        adminId: adminInfo.id,
        adminNotes: adminNotes || 'Yêu cầu thanh toán đã được xác nhận',
        performedBy: adminInfo
      });

      logger.success('Payment request confirmed', { id: paymentRequestId });

      // Send email notification (async, don't block)
      setImmediate(async () => {
        try {
          const { sendPaymentConfirmedEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentConfirmedEmail(updated);
          logger.info('Payment confirmed email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment confirmed email', {
            error: emailError.message,
            paymentRequestId
          });
        }
      });

      return updated;

    } catch (error) {
      logger.error('Failed to confirm payment request', { error: error.message, paymentRequestId });
      throw error;
    }
  }

  /**
   * Reject payment request (Admin)
   * @param {string} paymentRequestId
   * @param {Object} adminInfo
   * @param {string} rejectionReason - Required
   * @returns {Promise<Object>}
   */
  async rejectPaymentRequest(paymentRequestId, adminInfo, rejectionReason) {
    try {
      logger.info('Rejecting payment request', { paymentRequestId, adminId: adminInfo.id });

      if (!rejectionReason) {
        throw new Error('Lý do từ chối là bắt buộc');
      }

      const updated = await PaymentRequest.updateStatus(paymentRequestId, 'rejected', {
        adminId: adminInfo.id,
        adminNotes: rejectionReason,
        performedBy: adminInfo
      });

      logger.success('Payment request rejected', { id: paymentRequestId });

      // Send email notification (async, don't block)
      setImmediate(async () => {
        try {
          const { sendPaymentRejectedEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentRejectedEmail(updated);
          logger.info('Payment rejected email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment rejected email', {
            error: emailError.message,
            paymentRequestId
          });
        }
      });

      return updated;

    } catch (error) {
      logger.error('Failed to reject payment request', { error: error.message, paymentRequestId });
      throw error;
    }
  }

  /**
   * Mark payment request as paid (Admin)
   * IMPORTANT: This now deducts balance from user_system_balance
   *
   * @param {string} paymentRequestId
   * @param {Object} adminInfo
   * @param {string} transactionReference - Required
   * @param {string} adminNotes
   * @returns {Promise<Object>}
   */
  async markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes = null) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      logger.info('Marking payment request as paid', { paymentRequestId, adminId: adminInfo.id });

      if (!transactionReference) {
        throw new Error('Mã giao dịch là bắt buộc');
      }

      // Step 1: Get payment request details
      const prQuery = 'SELECT * FROM payment_requests WHERE id = $1';
      const prResult = await client.query(prQuery, [paymentRequestId]);

      if (prResult.rows.length === 0) {
        throw new Error('Payment request không tồn tại');
      }

      const paymentRequest = prResult.rows[0];
      const requestedAmount = parseFloat(paymentRequest.requested_amount);

      logger.info('Payment request found', {
        paymentRequestId,
        userId: paymentRequest.user_id,
        requestedAmount
      });

      // Step 2: 🔥 DEDUCT BALANCE from user_system_balance
      // This will:
      // - Deduct available_balance
      // - Increase total_withdrawn
      // - Trigger auto-log to user_balance_transactions
      // Deduct based on REQUESTED amount (what user asked for)
      await BalanceManagementService.deductBalance(
        paymentRequest.user_id,
        requestedAmount,
        paymentRequestId
      );

      logger.success('Balance deducted successfully', {
        paymentRequestId,
        userId: paymentRequest.user_id,
        amount: requestedAmount
      });

      // Step 3: Update payment_requests status to 'paid'
      const updateQuery = `
        UPDATE payment_requests
        SET
          status = 'paid',
          paid_at = CURRENT_TIMESTAMP,
          transaction_reference = $2,
          admin_notes = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        paymentRequestId,
        transactionReference,
        adminNotes || 'Đã chuyển tiền thành công'
      ]);

      const updated = updateResult.rows[0];

      // Step 3.5: 🔥 UPDATE system_conversions.payment_status = 'paid'
      // Mark conversions as paid using FIFO (oldest first) up to requested amount
      const fifoQuery = `
        WITH selected_conversions AS (
          SELECT
            id,
            cashback_amount,
            SUM(cashback_amount) OVER (
              ORDER BY order_time ASC, id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as running_total
          FROM system_conversions
          WHERE user_id = $1
            AND status = 'approved'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        )
        UPDATE system_conversions
        SET
          payment_status = 'paid',
          payment_request_id = $2,
          payment_linked_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT id FROM selected_conversions WHERE running_total <= $3
        )
        RETURNING id
      `;
      const conversionUpdateResult = await client.query(fifoQuery, [paymentRequest.user_id, paymentRequestId, requestedAmount]);

      logger.info('Updated payment_status for system_conversions (FIFO)', {
        paymentRequestId,
        conversionCount: conversionUpdateResult.rowCount,
        requestedAmount
      });

      await client.query('COMMIT');

      logger.success('Payment request marked as paid', {
        id: paymentRequestId,
        transactionReference,
        balanceDeducted: requestedAmount,
        conversionsUpdated: conversionUpdateResult.rowCount
      });

      // Step 4: Create payment history record for user (async, non-blocking)
      setImmediate(async () => {
        try {
          await this._createPaymentHistoryFromRequest(updated);
          logger.info('Payment history created from payment request', { paymentRequestId });
        } catch (historyError) {
          logger.error('Failed to create payment history', {
            error: historyError.message,
            paymentRequestId
          });
          // Non-critical, don't block the main flow
        }
      });

      // Step 5: Send email notification (async, non-blocking)
      setImmediate(async () => {
        try {
          const { sendPaymentPaidEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentPaidEmail(updated);
          logger.info('Payment paid email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment paid email', {
            error: emailError.message,
            paymentRequestId
          });
        }
      });

      return updated;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to mark payment as paid - ROLLBACK executed', {
        error: error.message,
        paymentRequestId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get late reconciliation items
   * (Conversions confirmed after reconciliation period)
   * @param {Object} filters
   * @param {string} filters.userId
   * @param {string} filters.merchantName
   * @param {string} filters.periodMonth - Format: 'YYYY-MM'
   * @param {number} filters.minDaysLate
   * @param {number} filters.limit
   * @param {number} filters.offset
   * @returns {Promise<Object>}
   */
  async getLateReconciliationItems(filters = {}) {
    try {
      logger.info('Getting late reconciliation items', filters);

      const {
        userId = null,
        merchantName = null,
        periodMonth = null,
        minDaysLate = null,
        limit = 50,
        offset = 0
      } = filters;

      let query = `
        SELECT *
        FROM v_late_reconciliation_items
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 0;

      // Filter by user
      if (userId) {
        paramCount++;
        query += ` AND user_id = $${paramCount}`;
        values.push(userId);
      }

      // Filter by merchant
      if (merchantName) {
        paramCount++;
        query += ` AND merchant_name ILIKE $${paramCount}`;
        values.push(`%${merchantName}%`);
      }

      // Filter by period
      if (periodMonth) {
        paramCount++;
        query += ` AND original_period = $${paramCount}`;
        values.push(periodMonth);
      }

      // Filter by minimum days late
      if (minDaysLate) {
        paramCount++;
        query += ` AND days_late >= $${paramCount}`;
        values.push(minDaysLate);
      }

      // Pagination
      query += ` ORDER BY confirmed_time DESC`;
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(offset);

      const result = await db.query(query, values);

      // Get count
      let countQuery = `
        SELECT COUNT(*) as count
        FROM v_late_reconciliation_items
        WHERE 1=1
      `;

      const countValues = [];
      let countParamCount = 0;

      if (userId) {
        countParamCount++;
        countQuery += ` AND user_id = $${countParamCount}`;
        countValues.push(userId);
      }

      if (merchantName) {
        countParamCount++;
        countQuery += ` AND merchant_name ILIKE $${countParamCount}`;
        countValues.push(`%${merchantName}%`);
      }

      if (periodMonth) {
        countParamCount++;
        countQuery += ` AND original_period = $${countParamCount}`;
        countValues.push(periodMonth);
      }

      if (minDaysLate) {
        countParamCount++;
        countQuery += ` AND days_late >= $${countParamCount}`;
        countValues.push(minDaysLate);
      }

      const countResult = await db.query(countQuery, countValues);

      const response = {
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
        hasMore: offset + result.rows.length < parseInt(countResult.rows[0].count)
      };

      logger.success('Late items retrieved', {
        count: result.rows.length,
        total: response.total
      });

      return response;

    } catch (error) {
      logger.error('Failed to get late reconciliation items', { error: error.message, filters });
      throw error;
    }
  }

  /**
   * Add late items to existing reconciliation
   * @param {string} reconciliationId
   * @param {Array<string>} conversionIds - Array of conversion IDs to add
   * @param {string} adminId
   * @returns {Promise<Object>}
   */
  async addLateItemsToReconciliation(reconciliationId, conversionIds, adminId) {
    try {
      logger.info('Adding late items to reconciliation', {
        reconciliationId,
        conversionIds,
        adminId
      });

      // Check reconciliation exists and status is 'confirmed'
      const reconciliationQuery = `
        SELECT * FROM reconciliations WHERE id = $1
      `;
      const reconciliationResult = await db.query(reconciliationQuery, [reconciliationId]);

      if (reconciliationResult.rows.length === 0) {
        throw new Error('Kỳ đối soát không tồn tại');
      }

      const reconciliation = reconciliationResult.rows[0];

      if (reconciliation.status !== 'confirmed') {
        throw new Error('Chỉ có thể thêm đơn hàng vào kỳ đối soát đã xác nhận (confirmed)');
      }

      if (reconciliation.status === 'paid') {
        throw new Error('Không thể thêm đơn hàng vào kỳ đối soát đã thanh toán');
      }

      const client = await db.pool.connect();

      try {
        await client.query('BEGIN');

        // Insert reconciliation items
        const insertQuery = `
          INSERT INTO reconciliation_items (
            reconciliation_id,
            conversion_id,
            order_code,
            merchant_name,
            order_amount,
            commission,
            cashback_amount,
            order_time,
            confirmed_time,
            utm_source,
            utm_campaign
          )
          SELECT
            $1,
            c.id,
            c.order_code,
            c.merchant_name,
            c.order_amount,
            c.commission,
            c.cashback_amount,
            c.order_time,
            c.confirmed_time,
            c.utm_source,
            c.utm_campaign
          FROM conversions c
          WHERE c.id = ANY($2::uuid[])
            AND c.status = 'approved'
            AND c.is_confirmed = 1
          RETURNING *
        `;

        const insertResult = await client.query(insertQuery, [reconciliationId, conversionIds]);
        const addedItems = insertResult.rows;

        // Update reconciliation totals
        const updateQuery = `
          UPDATE reconciliations
          SET total_orders = (SELECT COUNT(*) FROM reconciliation_items WHERE reconciliation_id = $1),
              total_cashback = (SELECT COALESCE(SUM(cashback_amount), 0) FROM reconciliation_items WHERE reconciliation_id = $1)
          WHERE id = $1
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [reconciliationId]);

        // Log the action
        const logQuery = `
          INSERT INTO reconciliation_logs (
            reconciliation_id,
            action,
            performed_by,
            notes,
            metadata
          ) VALUES ($1, $2, $3, $4, $5)
        `;

        await client.query(logQuery, [
          reconciliationId,
          'late_items_added',
          adminId,
          `Đã thêm ${addedItems.length} đơn hàng muộn vào kỳ đối soát`,
          JSON.stringify({ conversionIds, addedCount: addedItems.length })
        ]);

        await client.query('COMMIT');

        logger.success('Late items added to reconciliation', {
          reconciliationId,
          addedCount: addedItems.length
        });

        return {
          reconciliation: updateResult.rows[0],
          addedItems,
          addedCount: addedItems.length
        };

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Failed to add late items', {
        error: error.message,
        reconciliationId,
        conversionIds
      });
      throw error;
    }
  }

  /**
   * Get order payment status
   * @param {string} conversionId
   * @returns {Promise<Object>}
   */
  async getOrderPaymentStatus(conversionId) {
    try {
      const query = `
        SELECT
          c.id,
          c.order_code,
          c.user_id,
          c.cashback_amount,
          c.status as conversion_status,
          c.is_confirmed,
          -- Check if in payment request
          pr.id as payment_request_id,
          pr.status as payment_status,
          pr.requested_amount,
          pr.created_at as payment_created_at,
          pr.paid_at,
          -- Check if in reconciliation
          ri.id as reconciliation_item_id,
          r.id as reconciliation_id,
          r.status as reconciliation_status,
          r.period_label
        FROM conversions c
        LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
        LEFT JOIN reconciliations r ON ri.reconciliation_id = r.id
        LEFT JOIN payment_reconciliation_mapping prm ON ri.id = prm.reconciliation_item_id
        LEFT JOIN payment_requests pr ON prm.payment_request_id = pr.id
        WHERE c.id = $1
      `;

      const result = await db.query(query, [conversionId]);

      if (result.rows.length === 0) {
        throw new Error('Conversion not found');
      }

      const data = result.rows[0];

      // Determine payment status
      let paymentStatusLabel = 'not_reconciled';
      let statusDisplay = 'Chưa đối soát';
      let statusColor = 'gray';

      if (data.payment_request_id) {
        if (data.payment_status === 'paid') {
          paymentStatusLabel = 'paid';
          statusDisplay = 'Đã thanh toán';
          statusColor = 'green';
        } else if (data.payment_status === 'confirmed') {
          paymentStatusLabel = 'payment_confirmed';
          statusDisplay = 'Đang xử lý thanh toán';
          statusColor = 'blue';
        } else if (data.payment_status === 'pending') {
          paymentStatusLabel = 'payment_pending';
          statusDisplay = 'Chờ duyệt thanh toán';
          statusColor = 'yellow';
        } else if (data.payment_status === 'rejected') {
          paymentStatusLabel = 'payment_rejected';
          statusDisplay = 'Yêu cầu thanh toán bị từ chối';
          statusColor = 'red';
        }
      } else if (data.reconciliation_id && data.reconciliation_status === 'confirmed') {
        paymentStatusLabel = 'reconciled';
        statusDisplay = 'Đã đối soát - Chưa tạo yêu cầu thanh toán';
        statusColor = 'blue';
      }

      return {
        conversionId: data.id,
        orderCode: data.order_code,
        paymentStatusLabel,
        statusDisplay,
        statusColor,
        paymentRequestId: data.payment_request_id,
        reconciliationId: data.reconciliation_id,
        periodLabel: data.period_label,
        paidAt: data.paid_at
      };

    } catch (error) {
      logger.error('Failed to get order payment status', { error: error.message, conversionId });
      throw error;
    }
  }

  /**
   * Create payment history record from paid payment request
   * This is called automatically when payment is marked as paid
   * @param {Object} paymentRequest - The paid payment request
   * @returns {Promise<Object>} Created payment history and details
   * @private
   */
  async _createPaymentHistoryFromRequest(paymentRequest) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      logger.info('Creating payment history from payment request', {
        paymentRequestId: paymentRequest.id,
        userId: paymentRequest.user_id,
        amount: paymentRequest.requested_amount
      });

      // 1. Determine payment period from payment date (YYYY-MM format)
      const paymentDate = new Date(paymentRequest.updated_at);
      const paymentPeriod = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

      // 3. Check if payment history already exists for this user and period
      const existingHistoryQuery = `
        SELECT id FROM user_payment_history
        WHERE user_id = $1 AND payment_period = $2
      `;
      const existingHistoryResult = await client.query(existingHistoryQuery, [
        paymentRequest.user_id,
        paymentPeriod
      ]);

      let paymentHistory;

      if (existingHistoryResult.rows.length > 0) {
        // Update existing payment history
        paymentHistory = existingHistoryResult.rows[0];
        logger.info('Payment history already exists, will append details', {
          paymentHistoryId: paymentHistory.id,
          paymentPeriod
        });

        // Update total_cashback
        const updateHistoryQuery = `
          UPDATE user_payment_history
          SET
            total_cashback = total_cashback + $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `;
        const updateResult = await client.query(updateHistoryQuery, [
          paymentRequest.requested_amount,
          paymentHistory.id
        ]);
        paymentHistory = updateResult.rows[0];

      } else {
        // Create new payment history record
        const createHistoryQuery = `
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

        const historyValues = [
          paymentRequest.user_id,
          paymentPeriod,
          paymentRequest.requested_amount,
          new Date(), // reconciliation_date
          paymentDate, // payment_date
          'paid',
          'bank_transfer', // default payment method
          JSON.stringify({
            payment_request_id: paymentRequest.id,
            bank_name: paymentRequest.bank_name,
            bank_account_number: paymentRequest.bank_account_number_decrypted || paymentRequest.bank_account_number
          })
        ];

        const historyResult = await client.query(createHistoryQuery, historyValues);
        paymentHistory = historyResult.rows[0];

        logger.info('Created new payment history', {
          paymentHistoryId: paymentHistory.id,
          paymentPeriod,
          totalCashback: paymentHistory.total_cashback
        });
      }

      await client.query('COMMIT');

      logger.success('Payment history created successfully', {
        paymentRequestId: paymentRequest.id,
        paymentHistoryId: paymentHistory.id,
        paymentPeriod,
        totalCashback: paymentHistory.total_cashback
      });

      return {
        paymentHistory
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create payment history from payment request', {
        error: error.message,
        paymentRequestId: paymentRequest.id,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new PaymentRequestService();
