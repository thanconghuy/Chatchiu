const express = require('express');
const router = express.Router();
const UserPaymentHistory = require('../models/UserPaymentHistory');
const UserPaymentDetail = require('../models/UserPaymentDetail');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');

/**
 * GET /api/user/payment-history
 * Get payment history list for current user
 * Query params:
 *   - year: Filter by year (YYYY)
 *   - status: Filter by status (pending, processing, paid, cancelled)
 *   - limit: Limit results (default 100)
 *   - offset: Offset for pagination (default 0)
 */
router.get('/payment-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { year, status, limit, offset } = req.query;

    const options = {
      year,
      status,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0
    };

    const paymentHistory = await UserPaymentHistory.getByUserId(userId, options);

    res.json({
      success: true,
      data: paymentHistory
    });
  } catch (error) {
    logger.error('Error getting payment history', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải lịch sử thanh toán'
    });
  }
});

/**
 * GET /api/user/payment-history/summary
 * Get payment summary statistics for current user
 */
router.get('/payment-history/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const summary = await UserPaymentHistory.getSummary(userId);
    const availableYears = await UserPaymentHistory.getAvailableYears(userId);

    res.json({
      success: true,
      data: {
        ...summary,
        available_years: availableYears
      }
    });
  } catch (error) {
    logger.error('Error getting payment summary', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải thống kê thanh toán'
    });
  }
});

/**
 * GET /api/user/payment-history/:period
 * Get payment details for a specific period
 * Params:
 *   - period: Payment period (YYYY-MM)
 * Query params:
 *   - status: Filter by status
 */
router.get('/payment-history/:period', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { period } = req.params;
    const { status } = req.query;

    // Validate period format
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng kỳ không hợp lệ. Sử dụng YYYY-MM'
      });
    }

    // Get payment history for this period
    const paymentHistory = await UserPaymentHistory.getByUserAndPeriod(userId, period);

    if (!paymentHistory) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch sử thanh toán cho kỳ này'
      });
    }

    // Get payment details
    const details = await UserPaymentDetail.getByPaymentHistoryId(paymentHistory.id, { status });

    // Get statistics
    const statistics = await UserPaymentDetail.getStatistics(paymentHistory.id);

    // Get merchant breakdown
    const merchantBreakdown = await UserPaymentDetail.getMerchantBreakdown(paymentHistory.id);

    res.json({
      success: true,
      data: {
        payment_history: paymentHistory,
        details,
        statistics,
        merchant_breakdown: merchantBreakdown
      }
    });
  } catch (error) {
    logger.error('Error getting payment details', { error: error.message, period: req.params.period });
    res.status(500).json({
      success: false,
      message: 'Không thể tải chi tiết thanh toán'
    });
  }
});

/**
 * GET /api/user/payment-history/:period/export
 * Export payment details to Excel
 * Params:
 *   - period: Payment period (YYYY-MM)
 * Query params:
 *   - format: Export format (xlsx or csv, default xlsx)
 */
router.get('/payment-history/:period/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { period } = req.params;
    const { format = 'xlsx' } = req.query;

    // Validate period format
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng kỳ không hợp lệ. Sử dụng YYYY-MM'
      });
    }

    // Get payment history
    const paymentHistory = await UserPaymentHistory.getByUserAndPeriod(userId, period);

    if (!paymentHistory) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch sử thanh toán cho kỳ này'
      });
    }

    // Get payment details
    const details = await UserPaymentDetail.getByPaymentHistoryId(paymentHistory.id);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lịch sử thanh toán');

    // Add title
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = `Cashback được duyệt - Kỳ đối soát ${period}`;
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    // Add summary
    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = 'Tổng Cashback:';
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('C2').value = paymentHistory.total_cashback;
    worksheet.getCell('C2').numFmt = '#,##0 ₫';

    worksheet.mergeCells('A3:B3');
    worksheet.getCell('A3').value = 'Trạng thái:';
    worksheet.getCell('A3').font = { bold: true };
    worksheet.getCell('C3').value = formatStatus(paymentHistory.status);

    // Add empty row
    worksheet.addRow([]);

    // Add headers
    const headerRow = worksheet.addRow([
      'STT',
      'Merchant',
      'Mã đơn hàng',
      'Cashback',
      'Tháng đối soát',
      'Tháng thanh toán',
      'Trạng thái',
      'Ngày tạo'
    ]);

    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    details.forEach((detail, index) => {
      worksheet.addRow([
        index + 1,
        detail.merchant_name,
        detail.order_code || '-',
        detail.cashback_amount,
        detail.reconciliation_month || '-',
        detail.payment_month || '-',
        formatStatus(detail.status),
        detail.created_at ? new Date(detail.created_at).toLocaleDateString('vi-VN') : '-'
      ]);
    });

    // Format columns
    worksheet.getColumn(1).width = 8;  // STT
    worksheet.getColumn(2).width = 25; // Merchant
    worksheet.getColumn(3).width = 20; // Mã đơn hàng
    worksheet.getColumn(4).width = 15; // Cashback
    worksheet.getColumn(5).width = 15; // Tháng đối soát
    worksheet.getColumn(6).width = 15; // Tháng thanh toán
    worksheet.getColumn(7).width = 15; // Trạng thái
    worksheet.getColumn(8).width = 15; // Ngày tạo

    // Format cashback column as currency
    worksheet.getColumn(4).numFmt = '#,##0 ₫';

    // Set response headers
    const filename = `cashback-${period}.${format}`;
    res.setHeader('Content-Type', format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    if (format === 'csv') {
      await workbook.csv.write(res);
    } else {
      await workbook.xlsx.write(res);
    }

    res.end();

    logger.info('Exported payment history', { userId, period, format });
  } catch (error) {
    logger.error('Error exporting payment history', {
      error: error.message,
      period: req.params.period
    });
    res.status(500).json({
      success: false,
      message: 'Không thể xuất file'
    });
  }
});

/**
 * Helper function to format status in Vietnamese
 */
function formatStatus(status) {
  const statusMap = {
    'pending': 'Chờ xử lý',
    'processing': 'Đang xử lý',
    'paid': 'Đã thanh toán',
    'cancelled': 'Đã hủy',
    'approved': 'Đã duyệt',
    'rejected': 'Từ chối'
  };

  return statusMap[status] || status;
}

module.exports = router;
