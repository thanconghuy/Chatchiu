const db = require('../config/database');
const PaymentRequest = require('../models/PaymentRequest');
const logger = require('../utils/logger');

/**
 * Payment Request Service
 * Business logic for payment request operations
 */
class PaymentRequestService {
  /**
   * Check user eligibility for creating payment request
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async checkEligibility(userId) {
    try {
      logger.info('Checking payment request eligibility', { userId });

      // Get available balance from view
      const balance = await PaymentRequest.getAvailableBalance(userId);

      const eligibility = {
        isEligible: balance.is_eligible,
        availableBalance: parseFloat(balance.available_balance || 0),
        totalConfirmedCashback: parseFloat(balance.total_confirmed_cashback || 0),
        totalRequested: parseFloat(balance.total_requested || 0),
        hasPendingRequest: balance.has_pending_request,
        minAmount: 100000,
        reasons: []
      };

      // Explain why not eligible
      if (!eligibility.isEligible) {
        if (eligibility.hasPendingRequest) {
          eligibility.reasons.push('Bạn đang có yêu cầu thanh toán chờ xử lý');
        }
        if (eligibility.availableBalance < 100000) {
          eligibility.reasons.push(`Số dư khả dụng phải ≥ 100,000 VNĐ (hiện tại: ${eligibility.availableBalance.toLocaleString('vi-VN')} VNĐ)`);
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
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} params.requestedAmount
   * @param {string} params.bankName
   * @param {string} params.bankAccountNumber
   * @param {string} params.bankAccountName
   * @param {string} params.bankBranch
   * @param {string} params.notes
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
      notes = null
    } = params;

    try {
      logger.info('Creating payment request', { userId, requestedAmount });

      // Validate input
      if (requestedAmount < 100000) {
        throw new Error('Số tiền yêu cầu phải ≥ 100,000 VNĐ');
      }

      if (!bankName || !bankAccountNumber || !bankAccountName) {
        throw new Error('Thông tin ngân hàng không đầy đủ');
      }

      if (bankAccountNumber.length < 6) {
        throw new Error('Số tài khoản không hợp lệ (tối thiểu 6 ký tự)');
      }

      // Check eligibility
      const eligibility = await this.checkEligibility(userId);
      if (!eligibility.isEligible) {
        throw new Error(`Không đủ điều kiện tạo yêu cầu: ${eligibility.reasons.join(', ')}`);
      }

      if (requestedAmount > eligibility.availableBalance) {
        throw new Error(`Số tiền yêu cầu vượt quá số dư khả dụng (${eligibility.availableBalance.toLocaleString('vi-VN')} VNĐ)`);
      }

      // Get items to include using FIFO
      const itemsSummary = await this.getAvailableItems(userId, requestedAmount);

      if (!itemsSummary.isSufficient) {
        throw new Error(`Không đủ số dư để tạo yêu cầu ${requestedAmount.toLocaleString('vi-VN')} VNĐ`);
      }

      // Create payment request with mapped items
      const reconciliationItemIds = itemsSummary.selectedItems.map(item => item.id);

      const paymentRequest = await PaymentRequest.create({
        userId,
        requestedAmount,
        bankName,
        bankAccountNumber,
        bankAccountName,
        bankBranch,
        notes,
        reconciliationItemIds
      });

      logger.success('Payment request created', {
        id: paymentRequest.id,
        requestedAmount,
        itemsCount: reconciliationItemIds.length
      });

      // Return full payment request with items
      return await PaymentRequest.findByIdWithItems(paymentRequest.id);

    } catch (error) {
      logger.error('Failed to create payment request', { error: error.message, params });
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
      return updated;

    } catch (error) {
      logger.error('Failed to reject payment request', { error: error.message, paymentRequestId });
      throw error;
    }
  }

  /**
   * Mark payment request as paid (Admin)
   * @param {string} paymentRequestId
   * @param {Object} adminInfo
   * @param {string} transactionReference - Required
   * @param {string} adminNotes
   * @returns {Promise<Object>}
   */
  async markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes = null) {
    try {
      logger.info('Marking payment request as paid', { paymentRequestId, adminId: adminInfo.id });

      if (!transactionReference) {
        throw new Error('Mã giao dịch là bắt buộc');
      }

      const updated = await PaymentRequest.updateStatus(paymentRequestId, 'paid', {
        adminId: adminInfo.id,
        adminNotes: adminNotes || 'Đã chuyển tiền thành công',
        transactionReference,
        performedBy: adminInfo
      });

      logger.success('Payment request marked as paid', {
        id: paymentRequestId,
        transactionReference
      });

      return updated;

    } catch (error) {
      logger.error('Failed to mark payment as paid', { error: error.message, paymentRequestId });
      throw error;
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
}

module.exports = new PaymentRequestService();
