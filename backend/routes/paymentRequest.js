const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const { authenticateToken } = require('../middleware/auth');
const { validateIdempotencyKey } = require('../middleware/idempotency');
const PaymentRequest = require('../models/PaymentRequestEncrypted');
const paymentRequestService = require('../services/paymentRequestService');
const logger = require('../utils/logger');

// ========================================
// ADMIN ROUTES (must be first to avoid conflict with /:id)
// ========================================

/**
 * GET /api/payment-requests/admin/stats
 * Get payment request statistics
 */
router.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await PaymentRequest.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get payment stats failed', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/admin/list
 * Get all payment requests (admin view)
 */
router.get('/admin/list', authenticateAdmin, async (req, res) => {
  try {
    const { status, userId, userFilter, fromDate, toDate, limit, offset } = req.query;

    const filters = {
      status: status || null,
      userId: userId || null,
      userFilter: userFilter || null,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    };

    const paymentRequests = await PaymentRequest.findAll(filters);

    res.json({
      success: true,
      data: paymentRequests,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: paymentRequests.length
      }
    });
  } catch (error) {
    logger.error('Admin get payment requests failed', {
      error: error.message,
      query: req.query
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// USER ROUTES
// ========================================

/**
 * GET /api/payment-requests/eligibility
 * Check user eligibility for creating payment request
 */
router.get('/eligibility', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const eligibility = await paymentRequestService.checkEligibility(userId);

    res.json({
      success: true,
      data: eligibility
    });
  } catch (error) {
    logger.error('Check eligibility failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/payment-requests
 * Create a new payment request
 * Enhanced with idempotency, validation balance checking and audit logging
 * Headers: { Idempotency-Key: <UUID v4> }
 * Body: { requestedAmount, bankName, bankAccountNumber, bankAccountName, bankBranch, notes, paymentAccountId }
 */
router.post('/', authenticateToken, validateIdempotencyKey, async (req, res) => {
  try {
    console.log('=== CREATE PAYMENT REQUEST START ===');
    console.log('User ID:', req.userId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Idempotency Key:', req.idempotencyKey);

    const userId = req.userId;
    const {
      requestedAmount,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch,
      notes,
      paymentAccountId
    } = req.body;

    // Validate required fields
    if (!requestedAmount || !bankName || !bankAccountNumber || !bankAccountName) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: requestedAmount, bankName, bankAccountNumber, bankAccountName'
      });
    }

    // Collect context for audit logging
    const context = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    const paymentRequest = await paymentRequestService.createPaymentRequest({
      userId,
      requestedAmount: parseFloat(requestedAmount),
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch: bankBranch || null,
      notes: notes || null,
      paymentAccountId: paymentAccountId ? parseInt(paymentAccountId) : null,
      idempotencyKey: req.idempotencyKey, // NEW: Pass idempotency key
      context
    });

    res.status(201).json({
      success: true,
      message: 'Yêu cầu thanh toán đã được tạo',
      data: paymentRequest
    });
  } catch (error) {
    console.error('=== CREATE PAYMENT REQUEST ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Code:', error.code);

    logger.error('Create payment request failed', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      userId: req.userId,
      body: req.body
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests
 * Get user's payment requests
 * Query: ?status=pending&limit=20&offset=0
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { status, limit, offset } = req.query;

    const filters = {
      status: status || null,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0
    };

    const paymentRequests = await PaymentRequest.findByUserId(userId, filters);

    res.json({
      success: true,
      data: paymentRequests,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: paymentRequests.length
      }
    });
  } catch (error) {
    logger.error('Get payment requests failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/cancelled
 * Get cancelled payment requests (user's own)
 * IMPORTANT: This route must be before /:id to avoid route matching issues
 */
router.get('/cancelled', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0 } = req.query;

    // Use PaymentRequest model to get cancelled requests
    const db = require('../config/database');
    const query = `
      SELECT
        pr.*,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0)
         FROM payment_reconciliation_mapping
         WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      WHERE pr.user_id = $1
        AND pr.cancelled_at IS NOT NULL
      ORDER BY pr.cancelled_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [userId, parseInt(limit), parseInt(offset)]);

    logger.info('Get cancelled requests success', {
      userId,
      count: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Get cancelled requests failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/:id
 * Get payment request detail
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // Fixed: use req.userId instead of req.user.id

    // Use findByIdWithDecryption to decrypt bank account information
    const paymentRequest = await PaymentRequest.findByIdWithDecryption(id, userId, false);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán'
      });
    }

    res.json({
      success: true,
      data: paymentRequest
    });
  } catch (error) {
    logger.error('Get payment request detail failed', {
      error: error.message,
      id: req.params.id,
      userId: req.user?.id
    });

    // Handle unauthorized access
    if (error.message === 'Unauthorized access') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem yêu cầu này'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/payment-requests/:id
 * Cancel pending payment request (NEW LOGIC - releases balance)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { reason } = req.body;

    // Use new service method that handles balance release
    const cancelled = await paymentRequestService.cancelPaymentRequest(
      id,
      userId,
      reason || 'Người dùng hủy yêu cầu'
    );

    res.json({
      success: true,
      message: 'Đã hủy yêu cầu thanh toán và hoàn lại số dư',
      data: cancelled
    });
  } catch (error) {
    logger.error('Cancel payment request failed', {
      error: error.message,
      id: req.params.id,
      userId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/payment-requests/:id/resubmit
 * Resubmit a cancelled payment request (create new from old data)
 */
router.post('/:id/resubmit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Get the cancelled request
    const cancelledRequest = await PaymentRequest.findById(id);

    // Debug logging
    logger.info('Resubmit request debug', {
      requestId: id,
      userId,
      found: !!cancelledRequest,
      cancelledAt: cancelledRequest?.cancelled_at,
      status: cancelledRequest?.status
    });

    if (!cancelledRequest) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán'
      });
    }

    if (cancelledRequest.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền thực hiện thao tác này'
      });
    }

    if (!cancelledRequest.cancelled_at) {
      logger.warn('Attempt to resubmit non-cancelled request', {
        requestId: id,
        userId,
        cancelledAt: cancelledRequest.cancelled_at,
        status: cancelledRequest.status
      });
      return res.status(400).json({
        success: false,
        message: 'Yêu cầu này chưa bị hủy'
      });
    }

    // Check eligibility before resubmitting
    const eligibility = await paymentRequestService.checkEligibility(userId);
    if (!eligibility.isEligible) {
      return res.status(400).json({
        success: false,
        message: eligibility.reasons.join(', ')
      });
    }

    // Reactivate the cancelled request instead of creating new one
    const reactivatedRequest = await PaymentRequest.resubmit(id, userId);

    logger.info('Payment request resubmitted', {
      requestId: id,
      userId,
      resubmittedAt: reactivatedRequest.resubmitted_at
    });

    res.status(200).json({
      success: true,
      message: 'Đã gửi lại yêu cầu thanh toán',
      data: reactivatedRequest
    });
  } catch (error) {
    logger.error('Resubmit payment request failed', {
      error: error.message,
      id: req.params.id,
      userId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/:id/items
 * Get linked system reconciliation items for payment request
 */
router.get('/:id/items', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const PaymentSystemReconciliationService = require('../services/paymentSystemReconciliationService');
    const linkedItems = await PaymentSystemReconciliationService.getLinkedItemsForPayment(id);

    res.json({
      success: true,
      data: {
        paymentRequestId: id,
        items: linkedItems,
        itemsCount: linkedItems.length,
        totalAmount: linkedItems.reduce((sum, item) => sum + parseFloat(item.cashback_amount), 0)
      }
    });
  } catch (error) {
    logger.error('Get linked items failed', {
      error: error.message,
      id: req.params.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/admin/:id
 * Get payment request detail (admin view)
 */
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;

    // Use findByIdWithDecryption with admin privileges
    const paymentRequest = await PaymentRequest.findByIdWithDecryption(id, adminId, true);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán'
      });
    }

    // Also get linked system reconciliation items
    const PaymentSystemReconciliationService = require('../services/paymentSystemReconciliationService');
    const linkedItems = await PaymentSystemReconciliationService.getLinkedItemsForPayment(id);

    paymentRequest.systemReconciliationItems = linkedItems;
    paymentRequest.systemReconciliationItemsCount = linkedItems.length;
    paymentRequest.systemReconciliationTotalAmount = linkedItems.reduce(
      (sum, item) => sum + parseFloat(item.cashback_amount), 0
    );

    // Get logs
    const logs = await PaymentRequest.getLogs(id);
    paymentRequest.logs = logs;

    res.json({
      success: true,
      data: paymentRequest
    });
  } catch (error) {
    logger.error('Admin get payment request detail failed', {
      error: error.message,
      id: req.params.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/payment-requests/admin/:id/confirm
 * Confirm payment request
 * Body: { adminNotes }
 */
router.patch('/admin/:id/confirm', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const adminInfo = {
      id: req.userId,
      full_name: req.user?.full_name,
      email: req.user?.email
    };

    const updated = await paymentRequestService.confirmPaymentRequest(
      id,
      adminInfo,
      adminNotes
    );

    res.json({
      success: true,
      message: 'Đã xác nhận yêu cầu thanh toán',
      data: updated
    });
  } catch (error) {
    logger.error('Confirm payment request failed', {
      error: error.message,
      id: req.params.id,
      adminId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/payment-requests/admin/:id/reject
 * Reject payment request
 * Body: { rejectionReason } (required)
 */
router.patch('/admin/:id/reject', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Lý do từ chối là bắt buộc'
      });
    }

    const adminInfo = {
      id: req.userId,
      full_name: req.user?.full_name,
      email: req.user?.email
    };

    const updated = await paymentRequestService.rejectPaymentRequest(
      id,
      adminInfo,
      rejectionReason
    );

    res.json({
      success: true,
      message: 'Đã từ chối yêu cầu thanh toán',
      data: updated
    });
  } catch (error) {
    logger.error('Reject payment request failed', {
      error: error.message,
      id: req.params.id,
      adminId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/payment-requests/admin/:id/paid
 * Mark payment request as paid
 * Body: { transactionReference, adminNotes } (transactionReference required)
 */
router.patch('/admin/:id/paid', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionReference, adminNotes } = req.body;

    if (!transactionReference) {
      return res.status(400).json({
        success: false,
        message: 'Mã giao dịch là bắt buộc'
      });
    }

    const adminInfo = {
      id: req.userId,
      full_name: req.user?.full_name,
      email: req.user?.email
    };

    const updated = await paymentRequestService.markAsPaid(
      id,
      adminInfo,
      transactionReference,
      adminNotes
    );

    res.json({
      success: true,
      message: 'Đã đánh dấu thanh toán thành công',
      data: updated
    });
  } catch (error) {
    logger.error('Mark as paid failed', {
      error: error.message,
      id: req.params.id,
      adminId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/admin/stats
 * Get payment request statistics
 */
router.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await PaymentRequest.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get payment stats failed', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// LATE RECONCILIATION ITEMS ROUTES (Admin)
// ========================================

/**
 * GET /api/payment-requests/admin/late-items
 * Get late reconciliation items
 * Query: ?userId=xxx&merchantName=xxx&periodMonth=YYYY-MM&minDaysLate=7&limit=50&offset=0
 */
router.get('/admin/late-items', authenticateAdmin, async (req, res) => {
  try {
    const { userId, merchantName, periodMonth, minDaysLate, limit, offset } = req.query;

    const filters = {
      userId: userId || null,
      merchantName: merchantName || null,
      periodMonth: periodMonth || null,
      minDaysLate: minDaysLate ? parseInt(minDaysLate) : null,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    };

    const result = await paymentRequestService.getLateReconciliationItems(filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get late items failed', {
      error: error.message,
      query: req.query
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/payment-requests/admin/reconciliation/:id/add-late-items
 * Add late items to existing reconciliation
 * Body: { conversionIds: [uuid1, uuid2, ...] }
 */
router.post('/admin/reconciliation/:id/add-late-items', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { conversionIds } = req.body;

    if (!conversionIds || !Array.isArray(conversionIds) || conversionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'conversionIds phải là mảng và không được rỗng'
      });
    }

    const result = await paymentRequestService.addLateItemsToReconciliation(
      id,
      conversionIds,
      req.userId
    );

    res.json({
      success: true,
      message: `Đã thêm ${result.addedCount} đơn hàng vào kỳ đối soát`,
      data: result
    });
  } catch (error) {
    logger.error('Add late items failed', {
      error: error.message,
      reconciliationId: req.params.id,
      adminId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/payment-requests/order/:conversionId/payment-status
 * Get order payment status
 */
router.get('/order/:conversionId/payment-status', authenticateToken, async (req, res) => {
  try {
    const { conversionId } = req.params;

    const status = await paymentRequestService.getOrderPaymentStatus(conversionId);

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Get order payment status failed', {
      error: error.message,
      conversionId: req.params.conversionId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
