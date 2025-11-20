const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const { authenticateToken } = require('../middleware/auth');
const PaymentRequest = require('../models/PaymentRequest');
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
    const userId = req.user.id;
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
 * Body: { requestedAmount, bankName, bankAccountNumber, bankAccountName, bankBranch, notes }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      requestedAmount,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch,
      notes
    } = req.body;

    // Validate required fields
    if (!requestedAmount || !bankName || !bankAccountNumber || !bankAccountName) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: requestedAmount, bankName, bankAccountNumber, bankAccountName'
      });
    }

    const paymentRequest = await paymentRequestService.createPaymentRequest({
      userId,
      requestedAmount: parseFloat(requestedAmount),
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch: bankBranch || null,
      notes: notes || null
    });

    res.status(201).json({
      success: true,
      message: 'Yêu cầu thanh toán đã được tạo',
      data: paymentRequest
    });
  } catch (error) {
    logger.error('Create payment request failed', {
      error: error.message,
      userId: req.user?.id,
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
    const userId = req.user.id;
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
 * GET /api/payment-requests/:id
 * Get payment request detail
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const paymentRequest = await PaymentRequest.findByIdWithItems(id);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán'
      });
    }

    // Check if user owns this payment request
    if (paymentRequest.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem yêu cầu này'
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

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/payment-requests/:id
 * Cancel pending payment request
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deleted = await PaymentRequest.cancel(id, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán hoặc không thể hủy'
      });
    }

    res.json({
      success: true,
      message: 'Đã hủy yêu cầu thanh toán'
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
 * GET /api/payment-requests/admin/:id
 * Get payment request detail (admin view)
 */
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const paymentRequest = await PaymentRequest.findByIdWithItems(id);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu thanh toán'
      });
    }

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
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email
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
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email
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
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email
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
      req.user.id
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
