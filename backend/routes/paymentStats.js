const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * GET /api/admin/payment-stats/summary
 * Get overall payment statistics summary
 */
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const {
      period = 'month',
      start_date,
      end_date,
      month,
      quarter,
      year = new Date().getFullYear()
    } = req.query;

    // Build date filter
    let dateFilter = '';
    const params = [];
    let paramIndex = 1;

    if (period === 'custom' && start_date && end_date) {
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at <= $${paramIndex++}`;
      params.push(start_date, end_date + ' 23:59:59');
    } else if (period === 'month' && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'quarter' && quarter) {
      const quarterStart = (quarter - 1) * 3 + 1;
      const quarterEnd = quarterStart + 2;
      const startDate = `${year}-${String(quarterStart).padStart(2, '0')}-01`;
      const endDate = new Date(year, quarterEnd, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(quarterEnd).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'year') {
      dateFilter = `AND EXTRACT(YEAR FROM pr.paid_at) = $${paramIndex++}`;
      params.push(year);
    }

    const summaryQuery = `
      SELECT
        COUNT(DISTINCT pr.user_id) as total_users,
        COUNT(pr.id) as total_requests,
        COALESCE(SUM(pr.requested_amount), 0) as total_amount_paid,
        COALESCE(AVG(pr.requested_amount), 0) as avg_amount_per_request

      FROM payment_requests pr
      WHERE pr.status = 'paid'
        ${dateFilter}
    `;

    const result = await pool.query(summaryQuery, params);
    const summary = result.rows[0];

    // Calculate average per user
    summary.avg_amount_per_user = summary.total_users > 0
      ? parseFloat(summary.total_amount_paid) / parseInt(summary.total_users)
      : 0;

    // NEW: Get available balance statistics from user_system_balance
    // FIXED: Tính từ conversions ĐÃ ĐỐI SOÁT
    const balanceQuery = `
      WITH user_balances AS (
        SELECT
          usb.user_id,
          GREATEST(0,
            COALESCE((
              SELECT SUM(cashback_amount)
              FROM system_conversions sc
              WHERE sc.user_id = usb.user_id
                AND sc.status = 'approved'
                AND sc.system_reconciliation_status = 'reconciled'
                AND (sc.payment_status IS NULL OR sc.payment_status = 'unpaid')
            ), 0) - COALESCE(usb.total_withdrawn, 0) - COALESCE(usb.pending_reserved, 0)
          ) as available_balance
        FROM user_system_balance usb
      )
      SELECT
        COALESCE(SUM(available_balance), 0) as total_available_balance,
        COUNT(*) FILTER (WHERE available_balance > 0) as users_with_balance,
        COALESCE(AVG(CASE WHEN available_balance > 0 THEN available_balance ELSE NULL END), 0) as avg_balance_per_user
      FROM user_balances
    `;

    const balanceResult = await pool.query(balanceQuery);
    const balanceStats = balanceResult.rows[0];

    // Merge balance stats into summary
    summary.total_available_balance = parseFloat(balanceStats.total_available_balance || 0);
    summary.users_with_balance = parseInt(balanceStats.users_with_balance || 0);
    summary.avg_balance_per_user = parseFloat(balanceStats.avg_balance_per_user || 0);

    res.json({
      success: true,
      data: summary,
      filters: {
        period,
        year,
        month,
        quarter,
        start_date,
        end_date
      }
    });

  } catch (error) {
    logger.error('Get payment stats summary error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/payment-stats/users
 * Get payment statistics by user with pagination and filters
 */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const {
      period = 'month',
      start_date,
      end_date,
      month,
      quarter,
      year = new Date().getFullYear(),
      page = 1,
      limit = 20,
      search = '',
      sort_by = 'total_paid',
      sort_order = 'DESC'
    } = req.query;

    // Build date filter
    let dateFilter = '';
    const params = [];
    let paramIndex = 1;

    if (period === 'custom' && start_date && end_date) {
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at <= $${paramIndex++}`;
      params.push(start_date, end_date + ' 23:59:59');
    } else if (period === 'month' && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'quarter' && quarter) {
      const quarterStart = (quarter - 1) * 3 + 1;
      const quarterEnd = quarterStart + 2;
      const startDate = `${year}-${String(quarterStart).padStart(2, '0')}-01`;
      const endDate = new Date(year, quarterEnd, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(quarterEnd).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'year') {
      dateFilter = `AND EXTRACT(YEAR FROM pr.paid_at) = $${paramIndex++}`;
      params.push(year);
    }

    // Search filter
    let searchFilter = '';
    if (search) {
      searchFilter = `AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total users
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      INNER JOIN payment_requests pr ON u.id = pr.user_id
      WHERE pr.status = 'paid'
        ${dateFilter}
        ${searchFilter}
    `;

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Validate sort column
    const validSortColumns = ['total_paid', 'total_requests', 'email', 'full_name', 'first_payment_date', 'last_payment_date', 'available_balance', 'pending_reserved'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'total_paid';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get paginated data
    const offset = (page - 1) * limit;
    const limitIndex = paramIndex++;
    const offsetIndex = paramIndex++;
    params.push(limit, offset);

    const dataQuery = `
      SELECT
        u.id as user_id,
        u.email,
        u.full_name,
        u.phone,

        -- Tổng số tiền đã thanh toán
        COALESCE(SUM(pr.requested_amount), 0) as total_paid,

        -- Số lượng requests
        COUNT(pr.id) as total_requests,

        -- Average per request
        COALESCE(AVG(pr.requested_amount), 0) as avg_per_request,

        -- Timestamps
        MIN(pr.paid_at) as first_payment_date,
        MAX(pr.paid_at) as last_payment_date,

        -- FIXED: Balance information - tính từ conversions ĐÃ ĐỐI SOÁT
        GREATEST(0,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions sc
            WHERE sc.user_id = u.id
              AND sc.status = 'approved'
              AND sc.system_reconciliation_status = 'reconciled'
              AND (sc.payment_status IS NULL OR sc.payment_status = 'unpaid')
          ), 0) - COALESCE(usb.total_withdrawn, 0) - COALESCE(usb.pending_reserved, 0)
        ) as available_balance,
        COALESCE(usb.pending_reserved, 0) as pending_reserved

      FROM users u
      INNER JOIN payment_requests pr ON u.id = pr.user_id
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE pr.status = 'paid'
        ${dateFilter}
        ${searchFilter}
      GROUP BY u.id, u.email, u.full_name, u.phone, usb.total_withdrawn, usb.pending_reserved
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const dataResult = await pool.query(dataQuery, params);

    // Format numbers for readability
    const formattedData = dataResult.rows.map(row => ({
      ...row,
      total_paid: parseFloat(row.total_paid),
      avg_per_request: parseFloat(row.avg_per_request)
    }));

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Get payment stats users error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/payment-stats/user/:userId
 * Get detailed payment history for a specific user
 */
router.get('/user/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const { userId } = req.params;
    const {
      period = 'month',
      year = new Date().getFullYear()
    } = req.query;

    // Validate period
    const validPeriods = ['month', 'quarter', 'year'];
    const groupByPeriod = validPeriods.includes(period) ? period : 'month';

    // Get user info first
    const userQuery = `
      SELECT id, email, full_name, phone
      FROM users
      WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Get payment breakdown by period
    const statsQuery = `
      SELECT
        DATE_TRUNC('${groupByPeriod}', pr.paid_at) as period_date,
        COUNT(pr.id) as request_count,
        COALESCE(SUM(pr.requested_amount), 0) as total_amount,

        -- Request details
        json_agg(
          json_build_object(
            'id', pr.id,
            'amount', pr.requested_amount,
            'paid_at', pr.paid_at,
            'bank_name', pr.bank_name,
            'account_number', pr.bank_account_number,
            'account_name', pr.bank_account_name
          ) ORDER BY pr.paid_at DESC
        ) as requests

      FROM payment_requests pr
      WHERE pr.user_id = $1
        AND pr.status = 'paid'
        AND EXTRACT(YEAR FROM pr.paid_at) = $2
      GROUP BY DATE_TRUNC('${groupByPeriod}', pr.paid_at)
      ORDER BY period_date DESC
    `;

    const statsResult = await pool.query(statsQuery, [userId, year]);

    // Get overall user summary
    const summaryQuery = `
      SELECT
        COUNT(pr.id) as total_requests,
        COALESCE(SUM(pr.requested_amount), 0) as total_paid,
        COALESCE(AVG(pr.requested_amount), 0) as avg_per_request,
        MIN(pr.paid_at) as first_payment,
        MAX(pr.paid_at) as last_payment
      FROM payment_requests pr
      WHERE pr.user_id = $1
        AND pr.status = 'paid'
        AND EXTRACT(YEAR FROM pr.paid_at) = $2
    `;

    const summaryResult = await pool.query(summaryQuery, [userId, year]);
    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        user,
        summary: {
          ...summary,
          total_paid: parseFloat(summary.total_paid),
          avg_per_request: parseFloat(summary.avg_per_request)
        },
        breakdown: statsResult.rows.map(row => ({
          ...row,
          total_amount: parseFloat(row.total_amount)
        }))
      },
      filters: {
        period: groupByPeriod,
        year
      }
    });

  } catch (error) {
    logger.error('Get user payment stats error', {
      error: error.message,
      userId: req.params.userId
    });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/payment-stats/export
 * Export payment statistics to CSV
 */
router.get('/export', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const {
      period = 'month',
      start_date,
      end_date,
      month,
      quarter,
      year = new Date().getFullYear(),
      search = ''
    } = req.query;

    // Build date filter (same as /users endpoint)
    let dateFilter = '';
    const params = [];
    let paramIndex = 1;

    if (period === 'custom' && start_date && end_date) {
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at <= $${paramIndex++}`;
      params.push(start_date, end_date + ' 23:59:59');
    } else if (period === 'month' && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'quarter' && quarter) {
      const quarterStart = (quarter - 1) * 3 + 1;
      const quarterEnd = quarterStart + 2;
      const startDate = `${year}-${String(quarterStart).padStart(2, '0')}-01`;
      const endDate = new Date(year, quarterEnd, 0);
      dateFilter = `AND pr.paid_at >= $${paramIndex++} AND pr.paid_at < $${paramIndex++}`;
      params.push(startDate, `${year}-${String(quarterEnd).padStart(2, '0')}-${endDate.getDate()} 23:59:59`);
    } else if (period === 'year') {
      dateFilter = `AND EXTRACT(YEAR FROM pr.paid_at) = $${paramIndex++}`;
      params.push(year);
    }

    // Search filter
    let searchFilter = '';
    if (search) {
      searchFilter = `AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    // Get all data (no pagination for export)
    const exportQuery = `
      SELECT
        u.email as "Email",
        u.full_name as "Họ Tên",
        u.phone as "Số Điện Thoại",
        COALESCE(SUM(pr.requested_amount), 0) as "Tổng Tiền Đã Thanh Toán",
        COUNT(pr.id) as "Số Lượng Requests",
        COALESCE(AVG(pr.requested_amount), 0) as "Trung Bình/Request",
        TO_CHAR(MIN(pr.paid_at), 'DD/MM/YYYY') as "Lần Đầu",
        TO_CHAR(MAX(pr.paid_at), 'DD/MM/YYYY') as "Lần Cuối"
      FROM users u
      INNER JOIN payment_requests pr ON u.id = pr.user_id
      WHERE pr.status = 'paid'
        ${dateFilter}
        ${searchFilter}
      GROUP BY u.id, u.email, u.full_name, u.phone
      ORDER BY "Tổng Tiền Đã Thanh Toán" DESC
    `;

    const result = await pool.query(exportQuery, params);

    // Generate CSV
    const headers = Object.keys(result.rows[0] || {});
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payment-stats-${Date.now()}.csv"`);

    // Add BOM for Excel UTF-8 support
    res.write('\uFEFF');
    res.send(csv);

    logger.info('Payment stats exported', {
      adminId: req.userId,
      rowCount: result.rows.length,
      period,
      year
    });

  } catch (error) {
    logger.error('Export payment stats error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

// trigger restart
