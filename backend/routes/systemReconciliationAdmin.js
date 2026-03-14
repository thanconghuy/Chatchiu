/**
 * System Reconciliation Admin Routes
 *
 * Admin endpoints for managing system reconciliation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const SystemReconciliationService = require('../services/systemReconciliation/SystemReconciliationService');
const BalanceManagementService = require('../services/systemReconciliation/BalanceManagementService');
const { DailyCollectionJob, MonthlyReconciliationJob, APISyncJob } = require('../jobs/systemReconciliation');
const { pool } = require('../config/database');

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/system-reconciliation
 * List all system reconciliations with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const result = await SystemReconciliationService.listReconciliations({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      search
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error listing reconciliations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/stats
 * Get comprehensive statistics for the stats tab
 */
router.get('/stats', async (req, res) => {
  try {
    // 1. Overall Reconciliation Stats
    const reconciliationStatsQuery = `
      SELECT
        COUNT(*) as total_reconciliations,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COALESCE(SUM(total_cashback), 0) as total_cashback_all_time,
        COALESCE(SUM(CASE WHEN status = 'finalized' THEN total_cashback ELSE 0 END), 0) as total_cashback_finalized,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN total_cashback ELSE 0 END), 0) as total_cashback_pending,
        COALESCE(SUM(total_orders), 0) as total_orders_processed,
        COALESCE(SUM(total_users), 0) as total_users_in_reconciliations
      FROM system_reconciliations
    `;

    // 2. System Conversions Stats (from system_conversions table)
    const conversionsStatsQuery = `
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as approved_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending_cashback,
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(order_amount), 0) as total_order_amount,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT merchant_id) as unique_merchants,
        -- Reconciliation status breakdown
        COUNT(CASE WHEN system_reconciliation_status = 'reconciled' THEN 1 END) as reconciled_count,
        COUNT(CASE WHEN system_reconciliation_status = 'pending' OR system_reconciliation_status IS NULL THEN 1 END) as not_reconciled_count,
        COALESCE(SUM(CASE WHEN system_reconciliation_status = 'reconciled' THEN cashback_amount ELSE 0 END), 0) as reconciled_cashback,
        -- Payment status breakdown
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN cashback_amount ELSE 0 END), 0) as paid_cashback
      FROM system_conversions
    `;

    // 3. User Balance Stats
    const userBalanceStatsQuery = `
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN total_earned > 0 THEN 1 END) as users_with_earnings,
        COALESCE(SUM(total_earned), 0) as total_earned_all,
        COALESCE(SUM(total_withdrawn), 0) as total_withdrawn_all,
        COALESCE(SUM(pending_reserved), 0) as total_pending_reserved,
        -- Số dư khả dụng từ GENERATED COLUMN
        COALESCE(SUM(GREATEST(0, available_balance)), 0) as total_available_balance
      FROM user_system_balance
    `;

    // 4. Monthly Trend (last 12 months)
    const monthlyTrendQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', order_time), 'YYYY-MM') as month,
        COUNT(*) as order_count,
        COUNT(DISTINCT user_id) as user_count,
        COALESCE(SUM(cashback_amount), 0) as cashback_amount,
        COALESCE(SUM(commission), 0) as commission_amount,
        COALESCE(SUM(order_amount), 0) as order_amount,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
      FROM system_conversions
      WHERE order_time >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', order_time)
      ORDER BY month DESC
    `;

    // 5. Top Merchants
    const topMerchantsQuery = `
      SELECT
        merchant_id,
        COALESCE(MAX(merchant_name), merchant_id) as merchant_name,
        COUNT(*) as order_count,
        COUNT(DISTINCT user_id) as user_count,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(order_amount), 0) as total_order_amount,
        ROUND(COUNT(CASE WHEN status = 'approved' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as approval_rate
      FROM system_conversions
      WHERE status = 'approved'
      GROUP BY merchant_id
      ORDER BY total_cashback DESC
      LIMIT 10
    `;

    // 6. Recent Reconciliations
    const recentReconciliationsQuery = `
      SELECT
        id,
        period_label,
        period_start,
        period_end,
        status,
        total_orders,
        total_users,
        total_cashback,
        created_at,
        finalized_at
      FROM system_reconciliations
      ORDER BY created_at DESC
      LIMIT 5
    `;

    // 7. Users with highest balance (top 10)
    const topUsersQuery = `
      SELECT
        usb.user_id,
        u.email,
        u.full_name,
        COALESCE(usb.total_earned, 0) as total_earned,
        COALESCE(usb.total_withdrawn, 0) as total_withdrawn,
        GREATEST(0, COALESCE(usb.available_balance, 0)) as available_balance,
        (SELECT COUNT(*) FROM system_conversions WHERE user_id = usb.user_id AND status = 'approved') as order_count
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      ORDER BY available_balance DESC
      LIMIT 10
    `;

    // Execute all queries in parallel
    const [
      reconciliationStats,
      conversionsStats,
      userBalanceStats,
      monthlyTrend,
      topMerchants,
      recentReconciliations,
      topUsers
    ] = await Promise.all([
      pool.query(reconciliationStatsQuery),
      pool.query(conversionsStatsQuery),
      pool.query(userBalanceStatsQuery),
      pool.query(monthlyTrendQuery),
      pool.query(topMerchantsQuery),
      pool.query(recentReconciliationsQuery),
      pool.query(topUsersQuery)
    ]);

    res.json({
      success: true,
      data: {
        reconciliation_stats: reconciliationStats.rows[0],
        conversions_stats: conversionsStats.rows[0],
        user_balance_stats: userBalanceStats.rows[0],
        monthly_trend: monthlyTrend.rows,
        top_merchants: topMerchants.rows,
        recent_reconciliations: recentReconciliations.rows,
        top_users: topUsers.rows
      }
    });

  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/preview
 * Preview eligible orders from system_conversions for a specific period before creating reconciliation
 */
router.get('/preview', async (req, res) => {
  try {
    const { periodStart: startStr, periodEnd: endStr, page = 1, limit = 50 } = req.query;

    if (!startStr || !endStr) {
      return res.status(400).json({
        success: false,
        message: 'periodStart and periodEnd are required'
      });
    }

    // Parse dates
    const periodStart = new Date(startStr);
    const periodEnd = new Date(endStr);
    periodEnd.setHours(23, 59, 59, 999);

    if (periodStart > periodEnd) {
      return res.status(400).json({
        success: false,
        message: 'periodStart must be before periodEnd'
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Query from system_conversions only (Cashback System orders)
    // Only include orders that have NOT been reconciled yet
    // FIXED 2026-02-02: Thêm điều kiện payment_status để khớp với createReconciliation()
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_conversions sc
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
        AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = sc.id
        )
    `;

    const summaryQuery = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(DISTINCT sc.user_id) as total_users,
        COALESCE(SUM(sc.cashback_amount), 0) as total_cashback,
        COALESCE(SUM(sc.commission), 0) as total_commission,
        COALESCE(SUM(sc.order_amount), 0) as total_order_amount
      FROM system_conversions sc
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
        AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = sc.id
        )
    `;

    const ordersQuery = `
      SELECT
        sc.id,
        sc.user_id,
        COALESCE(u.full_name, u.username, 'N/A') as user_name,
        COALESCE(u.email, 'N/A') as user_email,
        'Cashback System' as aff_sid,
        sc.merchant_id,
        COALESCE(sc.merchant_name, 'Unknown') as merchant_name,
        COALESCE(sc.order_code, 'N/A') as order_code,
        COALESCE(sc.order_amount, 0) as order_amount,
        COALESCE(sc.commission, 0) as commission,
        COALESCE(sc.cashback_amount, 0) as cashback,
        sc.status as conversion_status,
        sc.payment_status,
        sc.order_time,
        sc.created_at,
        false as is_reconciled
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
        AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = sc.id
        )
      ORDER BY sc.order_time DESC
      LIMIT $3 OFFSET $4
    `;

    // Execute queries
    const countResult = await pool.query(countQuery, [periodStart, periodEnd]);
    const totalOrders = parseInt(countResult.rows[0].total);

    const summaryResult = await pool.query(summaryQuery, [periodStart, periodEnd]);
    const summary = summaryResult.rows[0];

    const result = await pool.query(ordersQuery, [periodStart, periodEnd, limitNum, offset]);
    const orders = result.rows;

    res.json({
      success: true,
      data: {
        orders,
        summary: {
          total_orders: parseInt(summary.total_orders),
          total_users: parseInt(summary.total_users),
          total_cashback: parseFloat(summary.total_cashback),
          total_commission: parseFloat(summary.total_commission),
          total_order_amount: parseFloat(summary.total_order_amount)
        },
        period: {
          start: periodStart,
          end: periodEnd
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalOrders,
          totalPages: Math.ceil(totalOrders / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Error previewing orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/create
 * Create a new reconciliation period
 */
router.post('/create', async (req, res) => {
  try {
    const { periodStart, periodEnd, periodLabel, selectedOrderIds } = req.body;

    if (!periodStart || !periodEnd || !periodLabel) {
      return res.status(400).json({
        success: false,
        message: 'periodStart, periodEnd, and periodLabel are required'
      });
    }

    if (!selectedOrderIds || !Array.isArray(selectedOrderIds) || selectedOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'selectedOrderIds is required and must contain at least one order'
      });
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'periodStart must be before periodEnd'
      });
    }

    const reconciliation = await SystemReconciliationService.createReconciliation({
      periodStart: startDate,
      periodEnd: endDate,
      periodLabel,
      selectedOrderIds,
      createdBy: req.userId
    });

    res.json({
      success: true,
      message: `Kỳ đối soát "${periodLabel}" đã được tạo với ${selectedOrderIds.length} đơn hàng`,
      data: reconciliation
    });

  } catch (error) {
    console.error('Error creating reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// DATA CHECK - KIỂM TRA TÌNH TRẠNG ĐỐI SOÁT
// ========================================

/**
 * GET /api/admin/system-reconciliation/data-check
 * Kiểm tra đơn hàng đủ điều kiện đối soát nhưng chưa được đối soát
 */
router.get('/data-check', async (req, res) => {
  try {
    // 1. Đơn hàng ĐÃ DUYỆT, đủ 15 ngày, CHƯA đối soát
    const eligibleQuery = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM system_conversions
      WHERE status = 'approved'
        AND approval_time IS NOT NULL
        AND approval_time <= NOW() - INTERVAL '15 days'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
        AND (payment_status IS NULL OR payment_status != 'paid')
    `);

    // 2. Đơn hàng PENDING quá lâu (>30 ngày)
    const pendingQuery = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM system_conversions
      WHERE status = 'pending'
        AND order_time <= NOW() - INTERVAL '30 days'
    `);

    // 3. Đơn hàng trong reconciliation_items nhưng status không khớp
    const mismatchQuery = await pool.query(`
      SELECT
        COUNT(*) as count
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sc.system_reconciliation_status != 'reconciled'
         OR sc.status != 'approved'
    `);

    const result = {
      eligible_orders: {
        count: parseInt(eligibleQuery.rows[0].count),
        total_cashback: parseFloat(eligibleQuery.rows[0].total_cashback)
      },
      pending_too_long: {
        count: parseInt(pendingQuery.rows[0].count),
        total_cashback: parseFloat(pendingQuery.rows[0].total_cashback)
      },
      status_mismatch: {
        count: parseInt(mismatchQuery.rows[0].count)
      }
    };

    const totalIssues = result.eligible_orders.count + result.pending_too_long.count + result.status_mismatch.count;

    res.json({
      success: true,
      data: {
        summary: result,
        total_issues: totalIssues,
        is_healthy: totalIssues === 0,
        checked_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[DATA-CHECK] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra dữ liệu: ' + error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/data-check/eligible-orders
 * Get detailed list of eligible orders not yet reconciled
 */
router.get('/data-check/eligible-orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM system_conversions
      WHERE status = 'approved'
        AND approval_time IS NOT NULL
        AND approval_time <= NOW() - INTERVAL '15 days'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
        AND (payment_status IS NULL OR payment_status != 'paid')
    `);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated orders
    const ordersResult = await pool.query(`
      SELECT
        sc.order_code,
        sc.cashback_amount,
        sc.approval_time,
        sc.order_time,
        sc.system_reconciliation_status,
        sc.payment_status,
        EXTRACT(DAY FROM (NOW() - sc.approval_time)) as days_since_approval,
        u.email as user_email,
        u.username as user_username,
        sc.merchant_name
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.status = 'approved'
        AND sc.approval_time IS NOT NULL
        AND sc.approval_time <= NOW() - INTERVAL '15 days'
        AND (sc.system_reconciliation_status IS NULL OR sc.system_reconciliation_status != 'reconciled')
        AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
      ORDER BY sc.approval_time ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      success: true,
      data: {
        orders: ordersResult.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('[DATA-CHECK] Error getting eligible orders:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy danh sách đơn hàng đủ điều kiện: ' + error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/data-check/pending-orders
 * Get detailed list of orders stuck in pending status for too long
 */
router.get('/data-check/pending-orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM system_conversions
      WHERE status = 'pending'
        AND order_time <= NOW() - INTERVAL '30 days'
    `);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated orders
    const ordersResult = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.cashback_amount,
        sc.order_time,
        sc.status,
        sc.system_reconciliation_status,
        EXTRACT(DAY FROM (NOW() - sc.order_time)) as days_pending,
        u.email as user_email,
        u.username as user_username,
        sc.merchant_name
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.status = 'pending'
        AND sc.order_time <= NOW() - INTERVAL '30 days'
      ORDER BY sc.order_time ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      success: true,
      data: {
        orders: ordersResult.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('[DATA-CHECK] Error getting pending orders:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy danh sách đơn hàng pending: ' + error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/data-check/user/:userId
 * Kiểm tra số dư user: so sánh user_system_balance vs tính toán từ system_conversions
 */
router.get('/data-check/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Lấy thông tin user
    const userResult = await pool.query(
      `SELECT id, email, full_name, username FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    const user = userResult.rows[0];

    // 2. Lấy số dư từ user_system_balance (nguồn chính thức)
    const balanceResult = await pool.query(`
      SELECT
        COALESCE(total_earned, 0) as total_earned,
        COALESCE(total_withdrawn, 0) as total_withdrawn,
        COALESCE(pending_reserved, 0) as pending_reserved,
        COALESCE(available_balance, 0) as available_balance
      FROM user_system_balance
      WHERE user_id = $1
    `, [userId]);

    const balance = balanceResult.rows.length > 0
      ? balanceResult.rows[0]
      : { total_earned: 0, total_withdrawn: 0, pending_reserved: 0, available_balance: 0 };

    // 3. Tính toán từ system_conversions
    const conversionsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN system_reconciliation_status = 'reconciled' THEN 1 END) as reconciled,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(CASE WHEN status = 'approved' AND system_reconciliation_status = 'reconciled'
                      THEN cashback_amount ELSE 0 END), 0) as reconciled_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending_cashback
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    const conv = conversionsResult.rows[0];

    // 4. Tính từ payment_requests
    const paymentsResult = await pool.query(`
      SELECT
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN requested_amount ELSE 0 END), 0) as paid_total,
        COUNT(CASE WHEN status = 'confirmed' AND cancelled_at IS NULL THEN 1 END) as pending_count,
        -- FIXED 2026-03-14: pending_reserved chỉ từ 'confirmed' (đã reserve balance)
        -- 'pending' chưa reserve → không tính vào pending_reserved
        COALESCE(SUM(CASE WHEN status = 'confirmed' AND cancelled_at IS NULL THEN requested_amount ELSE 0 END), 0) as pending_total
      FROM payment_requests
      WHERE user_id = $1
    `, [userId]);

    const payments = paymentsResult.rows[0];

    // 5. So sánh user_system_balance vs tính toán
    const dbTotalEarned = parseFloat(balance.total_earned);
    const dbTotalWithdrawn = parseFloat(balance.total_withdrawn);
    const dbPendingReserved = parseFloat(balance.pending_reserved);
    const dbAvailable = parseFloat(balance.available_balance);

    const calcTotalEarned = parseFloat(conv.reconciled_cashback);
    const calcTotalWithdrawn = parseFloat(payments.paid_total);
    const calcPendingReserved = parseFloat(payments.pending_total);
    const calcAvailable = calcTotalEarned - calcTotalWithdrawn - calcPendingReserved;

    const balanceChecks = {
      total_earned: {
        db: dbTotalEarned,
        calculated: calcTotalEarned,
        match: Math.abs(dbTotalEarned - calcTotalEarned) < 1
      },
      total_withdrawn: {
        db: dbTotalWithdrawn,
        calculated: calcTotalWithdrawn,
        match: Math.abs(dbTotalWithdrawn - calcTotalWithdrawn) < 1
      },
      pending_reserved: {
        db: dbPendingReserved,
        calculated: calcPendingReserved,
        match: Math.abs(dbPendingReserved - calcPendingReserved) < 1
      },
      available_balance: {
        db: dbAvailable,
        calculated: calcAvailable,
        match: Math.abs(dbAvailable - calcAvailable) < 1
      }
    };

    const isHealthy = Object.values(balanceChecks).every(c => c.match);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          username: user.username
        },
        is_healthy: isHealthy,
        balance_checks: balanceChecks,
        conversions_summary: {
          total: parseInt(conv.total),
          approved: parseInt(conv.approved),
          pending: parseInt(conv.pending),
          rejected: parseInt(conv.rejected),
          reconciled: parseInt(conv.reconciled),
          paid: parseInt(conv.paid),
          total_cashback: parseFloat(conv.total_cashback),
          reconciled_cashback: parseFloat(conv.reconciled_cashback)
        },
        sources: {
          reconciled_conversions: {
            count: parseInt(conv.reconciled),
            total: parseFloat(conv.reconciled_cashback)
          },
          paid_payments: {
            count: parseInt(payments.paid_count),
            total: parseFloat(payments.paid_total)
          },
          pending_payments: {
            count: parseInt(payments.pending_count),
            total: parseFloat(payments.pending_total)
          }
        }
      }
    });

  } catch (error) {
    console.error('[DATA-CHECK] Error checking user balance:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra số dư user: ' + error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/data-check/user/:userId/sync
 * Đồng bộ lại số dư user: tính toán lại từ source tables và cập nhật user_system_balance
 */
router.post('/data-check/user/:userId/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    await client.query('BEGIN');

    // 1. Kiểm tra user tồn tại
    const userResult = await client.query(
      `SELECT id, email FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
    }

    // 2. Lấy giá trị hiện tại từ user_system_balance
    const currentResult = await client.query(`
      SELECT
        COALESCE(total_earned, 0) as total_earned,
        COALESCE(total_withdrawn, 0) as total_withdrawn,
        COALESCE(pending_reserved, 0) as pending_reserved
      FROM user_system_balance
      WHERE user_id = $1
    `, [userId]);

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User chưa có bản ghi số dư' });
    }

    const current = {
      total_earned: parseFloat(currentResult.rows[0].total_earned),
      total_withdrawn: parseFloat(currentResult.rows[0].total_withdrawn),
      pending_reserved: parseFloat(currentResult.rows[0].pending_reserved)
    };

    // 3. Tính toán giá trị đúng từ source tables
    const calcEarned = await client.query(`
      SELECT COALESCE(SUM(cashback_amount), 0) as total
      FROM system_conversions
      WHERE user_id = $1 AND status = 'approved' AND system_reconciliation_status = 'reconciled'
    `, [userId]);

    const calcWithdrawn = await client.query(`
      SELECT COALESCE(SUM(requested_amount), 0) as total
      FROM payment_requests
      WHERE user_id = $1 AND status = 'paid'
    `, [userId]);

    const calcReserved = await client.query(`
      SELECT COALESCE(SUM(requested_amount), 0) as total
      FROM payment_requests
      WHERE user_id = $1 AND status = 'confirmed'
    `, [userId]);

    const correct = {
      total_earned: parseFloat(calcEarned.rows[0].total),
      total_withdrawn: parseFloat(calcWithdrawn.rows[0].total),
      pending_reserved: parseFloat(calcReserved.rows[0].total)
    };

    // 4. So sánh và cập nhật từng field khác biệt
    const changes = [];
    const fieldLabels = {
      total_earned: 'Tổng thu nhập (đã đối soát)',
      total_withdrawn: 'Đã rút',
      pending_reserved: 'Đang giữ (chờ thanh toán)'
    };

    for (const field of ['total_earned', 'total_withdrawn', 'pending_reserved']) {
      if (Math.abs(current[field] - correct[field]) >= 1) {
        // Cập nhật field
        await client.query(
          `UPDATE user_system_balance SET ${field} = $1, updated_at = NOW() WHERE user_id = $2`,
          [correct[field], userId]
        );

        // Ghi audit log vào balance_transactions
        const diff = correct[field] - current[field];
        await client.query(`
          INSERT INTO balance_transactions (
            user_id, transaction_type, amount, balance_before, balance_after,
            reference_type, description, created_by, metadata
          ) VALUES ($1, 'manual_adjustment', $2, $3, $4, 'admin_balance_sync', $5, $6, $7)
        `, [
          userId,
          diff,
          current[field],
          correct[field],
          `Admin đồng bộ ${fieldLabels[field]}: ${current[field].toLocaleString()} → ${correct[field].toLocaleString()}`,
          adminId,
          JSON.stringify({
            field,
            old_value: current[field],
            new_value: correct[field],
            source: field === 'total_earned'
              ? 'system_conversions (approved + reconciled)'
              : field === 'total_withdrawn'
                ? 'payment_requests (paid)'
                : 'payment_requests (confirmed)'
          })
        ]);

        changes.push({
          field,
          label: fieldLabels[field],
          old_value: current[field],
          new_value: correct[field],
          diff
        });
      }
    }

    await client.query('COMMIT');

    // 5. Lấy số dư sau khi sync
    const updatedResult = await client.query(`
      SELECT total_earned, total_withdrawn, pending_reserved, available_balance
      FROM user_system_balance WHERE user_id = $1
    `, [userId]);

    res.json({
      success: true,
      message: changes.length > 0
        ? `Đã đồng bộ ${changes.length} chỉ số cho user ${userResult.rows[0].email}`
        : 'Dữ liệu đã chính xác, không cần đồng bộ',
      data: {
        changes,
        updated_balance: updatedResult.rows[0]
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DATA-CHECK] Error syncing user balance:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi đồng bộ số dư: ' + error.message
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/system-reconciliation/:id
 * Get reconciliation details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await SystemReconciliationService.getReconciliationById(id);

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: 'Kỳ đối soát không tồn tại'
      });
    }

    res.json({
      success: true,
      data: reconciliation
    });

  } catch (error) {
    console.error('Error getting reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/items
 * Get reconciliation items with pagination
 */
router.get('/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, userId, isHighRisk } = req.query;

    const offset = (page - 1) * limit;
    const params = [id];
    let paramIndex = 2;
    let whereConditions = ['sri.system_reconciliation_id = $1'];

    if (userId) {
      whereConditions.push(`sri.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (isHighRisk !== undefined) {
      whereConditions.push(`sri.is_high_risk = $${paramIndex++}`);
      params.push(isHighRisk === 'true');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_reconciliation_items sri
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get items
    params.push(limit, offset);
    const itemsQuery = `
      SELECT
        sri.id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.system_conversion_id,
        sri.user_id,
        sri.merchant_id,
        sri.merchant_name,
        sri.order_time,
        sri.approval_time,
        sri.order_value,
        sri.commission_amount,
        sri.cashback_amount,
        sri.conversion_status,
        sri.api_reconciled,
        sri.api_reconciliation_id,
        sri.is_high_risk,
        sri.risk_score,
        sri.risk_notes,
        sri.created_at,
        sri.reconciled_at,
        u.full_name as user_name,
        u.email as user_email,
        COALESCE(sc.order_code, c.order_code, 'N/A') as order_code
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
      WHERE ${whereClause}
      ORDER BY sri.order_time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const itemsResult = await pool.query(itemsQuery, params);

    res.json({
      success: true,
      data: {
        items: itemsResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting reconciliation items:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/finalize
 * Finalize reconciliation and update user balances
 */
router.post('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await SystemReconciliationService.finalizeReconciliation(
      id,
      req.userId
    );

    res.json({
      success: true,
      message: 'Hoàn tất thành công! Số dư người dùng đã được cập nhật.',
      data: reconciliation
    });

  } catch (error) {
    console.error('Error finalizing reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/available-orders
 * Get available orders that can be added to reconciliation
 */
router.get('/:id/available-orders', async (req, res) => {
  try {
    const { id } = req.params;
    const { search = '', page = 1, limit = 20 } = req.query;

    const result = await SystemReconciliationService.getAvailableOrdersForReconciliation(id, {
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error getting available orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/add-orders
 * Add orders to an existing draft reconciliation
 */
router.post('/:id/add-orders', async (req, res) => {
  try {
    const { id } = req.params;
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderIds phải là mảng và không được rỗng'
      });
    }

    const result = await SystemReconciliationService.addOrdersToReconciliation(
      id,
      orderIds,
      req.userId
    );

    res.json({
      success: true,
      message: `Đã thêm ${result.added_count} đơn hàng vào kỳ đối soát`,
      data: result
    });

  } catch (error) {
    console.error('Error adding orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/admin/system-reconciliation/:id/label
 * Update reconciliation period label (draft only)
 */
router.patch('/:id/label', async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!label || label.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tên kỳ đối soát không được để trống'
      });
    }

    if (label.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Tên kỳ đối soát không được vượt quá 100 ký tự'
      });
    }

    // Check if reconciliation exists and is draft
    const checkQuery = `
      SELECT id, status, period_label
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kỳ đối soát không tồn tại'
      });
    }

    const reconciliation = checkResult.rows[0];

    if (reconciliation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể sửa tên kỳ đối soát ở trạng thái nháp'
      });
    }

    // Update period_label
    const updateQuery = `
      UPDATE system_reconciliations
      SET period_label = $1
      WHERE id = $2
      RETURNING *
    `;
    const updateResult = await pool.query(updateQuery, [label.trim(), id]);

    res.json({
      success: true,
      message: 'Cập nhật tên kỳ đối soát thành công',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating reconciliation label:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/system-reconciliation/:id
 * Update reconciliation (status, label)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { period_label, status } = req.body;

    const updates = {};
    if (period_label) updates.period_label = period_label;
    if (status) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có thông tin nào để cập nhật'
      });
    }

    const updatedRecon = await SystemReconciliationService.updateReconciliation(
      id,
      updates,
      req.userId
    );

    res.json({
      success: true,
      message: 'Cập nhật kỳ đối soát thành công',
      data: updatedRecon
    });

  } catch (error) {
    console.error('Error updating reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/system-reconciliation/:id
 * Delete reconciliation (only draft status)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if reconciliation exists and is draft
    const checkQuery = `
      SELECT id, status, period_label
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy kỳ đối soát'
      });
    }

    const reconciliation = checkResult.rows[0];

    if (reconciliation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể xóa kỳ đối soát ở trạng thái nháp (draft)'
      });
    }

    // IMPORTANT: Restore conversions before deleting
    // Get all conversion IDs (both system_conversion_id and conversion_id) from this reconciliation
    const getConversionsQuery = `
      SELECT system_conversion_id, conversion_id
      FROM system_reconciliation_items
      WHERE system_reconciliation_id = $1
    `;
    const conversionsResult = await pool.query(getConversionsQuery, [id]);

    // Separate system_conversion_ids and conversion_ids (old API)
    const systemConversionIds = conversionsResult.rows
      .filter(r => r.system_conversion_id)
      .map(r => r.system_conversion_id);
    const oldConversionIds = conversionsResult.rows
      .filter(r => r.conversion_id)
      .map(r => r.conversion_id);

    console.log(`[Delete Reconciliation] Restoring ${systemConversionIds.length} system_conversions and ${oldConversionIds.length} old conversions`);

    // Restore system_conversions: clear system_reconciliation_id and reset status
    if (systemConversionIds.length > 0) {
      const restoreSystemConversionsQuery = `
        UPDATE system_conversions
        SET
          system_reconciliation_id = NULL,
          system_reconciliation_status = NULL,
          system_reconciled_at = NULL,
          updated_at = NOW()
        WHERE id = ANY($1)
      `;
      await pool.query(restoreSystemConversionsQuery, [systemConversionIds]);

      console.log(`[Delete Reconciliation] Restored ${systemConversionIds.length} system_conversions`);
    }

    // Restore old conversions table (AccessTrade orders): clear system_reconciliation_id and reset status
    if (oldConversionIds.length > 0) {
      const restoreOldConversionsQuery = `
        UPDATE conversions
        SET
          system_reconciliation_id = NULL,
          system_reconciliation_status = NULL,
          system_reconciled_at = NULL
        WHERE id = ANY($1)
      `;
      await pool.query(restoreOldConversionsQuery, [oldConversionIds]);

      console.log(`[Delete Reconciliation] Restored ${oldConversionIds.length} old conversions`);
    }

    // Note: No need to restore waiting list status
    // Items were removed from waiting list when added to reconciliation
    // They won't be re-added automatically (user must manually add them again)
    const totalRestored = systemConversionIds.length + oldConversionIds.length;

    // Delete reconciliation (CASCADE will delete items and logs)
    const deleteQuery = `
      DELETE FROM system_reconciliations
      WHERE id = $1
      RETURNING id
    `;
    await pool.query(deleteQuery, [id]);

    console.log(`[Delete Reconciliation] Deleted reconciliation ${id}`);

    res.json({
      success: true,
      message: `Đã xóa kỳ đối soát "${reconciliation.period_label}" và trả ${totalRestored} đơn hàng về trạng thái chờ`
    });

  } catch (error) {
    console.error('Error deleting reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/logs
 * Get reconciliation logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        srl.*,
        u.full_name as performed_by_name
      FROM system_reconciliation_logs srl
      LEFT JOIN users u ON srl.performed_by = u.id
      WHERE srl.system_reconciliation_id = $1
      ORDER BY srl.created_at DESC
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/users/balances
 * Get all user balances
 */
router.get('/users/balances', async (req, res) => {
  try {
    const { page = 1, limit = 50, minBalance = 0 } = req.query;

    const result = await BalanceManagementService.getAllUserBalances({
      page: parseInt(page),
      limit: parseInt(limit),
      minBalance: parseFloat(minBalance)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error getting user balances:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/jobs/run
 * Manually run a job
 */
router.post('/jobs/run', async (req, res) => {
  try {
    const { jobName } = req.body;

    let result;

    switch (jobName) {
      case 'daily':
        result = await DailyCollectionJob.run();
        break;
      case 'monthly':
        result = await MonthlyReconciliationJob.run();
        break;
      case 'sync':
        result = await APISyncJob.run();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid job name. Use: daily, monthly, or sync'
        });
    }

    res.json({
      success: true,
      message: `Job ${jobName} completed`,
      data: result
    });

  } catch (error) {
    console.error('Error running job:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/jobs/stats
 * Get job statistics
 */
router.get('/jobs/stats', async (req, res) => {
  try {
    const syncStats = await APISyncJob.getStats();

    // Get daily collection stats for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const dailyStats = await DailyCollectionJob.getStats(startDate, endDate);

    res.json({
      success: true,
      data: {
        sync_stats: syncStats,
        daily_stats: dailyStats
      }
    });

  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/sync
 * Manually sync a specific reconciliation with API data
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify reconciliation exists
    const checkQuery = `
      SELECT id, period_label, status
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const reconciliation = checkResult.rows[0];

    // Run sync for this reconciliation
    const result = await APISyncJob.syncReconciliation(id);

    // Log the sync action
    await pool.query(`
      INSERT INTO system_reconciliation_logs (
        system_reconciliation_id,
        action,
        performed_by,
        metadata
      ) VALUES ($1, $2, $3, $4)
    `, [
      id,
      'api_sync',
      req.userId || 'system',
      JSON.stringify({
        synced: result.synced,
        released: result.released,
        released_amount: result.released_amount,
        deducted: result.deducted,
        deducted_amount: result.deducted_amount,
        duration: result.duration
      })
    ]);

    res.json({
      success: true,
      data: result,
      message: `Đã đồng bộ ${result.synced} items cho kỳ ${reconciliation.period_label}`
    });
  } catch (error) {
    console.error('Error syncing reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// AUTO-SYNC WAITING LIST ROUTES
// ========================================

/**
 * GET /api/admin/system-reconciliation/auto-sync/preview
 * Preview eligible orders not yet in waiting list
 */
router.get('/auto-sync/preview', async (req, res) => {
  try {
    // Get eligible conversions not yet in waiting list
    // Join with users to get user info
    // Note: e.conversion_id is actually system_conversions.id
    const eligibleQuery = `
      SELECT
        e.conversion_id,
        e.user_id,
        COALESCE(u.email, 'N/A') as user_email,
        COALESCE(u.full_name, u.username, 'N/A') as user_full_name,
        e.merchant_id,
        e.merchant_name,
        e.order_code,
        e.order_amount,
        e.commission,
        e.cashback_amount,
        e.order_time,
        e.approval_time,
        e.eligible_date,
        e.approval_month,
        e.days_since_approval
      FROM get_eligible_conversions_for_waiting_list() e
      LEFT JOIN users u ON e.user_id = u.id
    `;

    const result = await pool.query(eligibleQuery);
    const eligibleOrders = result.rows;

    // Group by month
    const byMonth = {};
    eligibleOrders.forEach(order => {
      const monthKey = order.approval_month;
      if (!byMonth[monthKey]) {
        const date = new Date(monthKey);
        byMonth[monthKey] = {
          month: monthKey,
          label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
          count: 0,
          cashback: 0,
          orders: []
        };
      }
      byMonth[monthKey].count++;
      byMonth[monthKey].cashback += parseFloat(order.cashback_amount);
      byMonth[monthKey].orders.push(order);
    });

    const summary = Object.values(byMonth);

    // Format response to match frontend expectations
    const totalCashback = eligibleOrders.reduce((sum, o) => sum + parseFloat(o.cashback_amount || 0), 0);
    const monthCount = Object.keys(byMonth).length;

    // Transform byMonth to array with period_label
    const byMonthArray = Object.values(byMonth).map(m => ({
      approval_month: m.month,
      period_label: m.label,
      order_count: m.count,
      total_cashback: m.cashback
    }));

    res.json({
      success: true,
      data: {
        summary: {
          total_count: eligibleOrders.length,
          total_cashback: totalCashback,
          month_count: monthCount
        },
        byMonth: byMonthArray,
        orders: eligibleOrders
      }
    });

  } catch (error) {
    console.error('Error previewing auto-sync:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/auto-sync/add-to-waiting
 * Add eligible orders to waiting list
 */
router.post('/auto-sync/add-to-waiting', async (req, res) => {
  try {
    const addedBy = req.userId || 'admin';

    const result = await pool.query(
      'SELECT * FROM add_eligible_conversions_to_waiting_list($1)',
      [addedBy]
    );

    const { added_count, total_cashback } = result.rows[0];

    // Get updated waiting list count (exclude already reconciled)
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM reconciliation_waiting_list rwl
      WHERE rwl.status = $1
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
    `, ['waiting']);
    const totalWaiting = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      message: `Đã thêm ${added_count} đơn hàng vào danh sách chờ đối soát`,
      data: {
        added_count: parseInt(added_count),
        total_cashback: parseFloat(total_cashback || 0),
        total_waiting: totalWaiting
      }
    });

  } catch (error) {
    console.error('Error adding to waiting list:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/auto-sync/waiting-list
 * Get waiting list with optional filters
 * FIXED: Exclude items already in reconciliation
 */
router.get('/auto-sync/waiting-list', async (req, res) => {
  try {
    const { month, status = 'waiting', page = 1, limit = 50 } = req.query;

    // FIXED: Add filter to exclude items already in system_reconciliation_items
    let query = `
      SELECT
        rwl.*,
        u.full_name as user_name,
        u.email as user_email
      FROM reconciliation_waiting_list rwl
      LEFT JOIN users u ON rwl.user_id = u.id
      WHERE rwl.status = $1
        -- FIXED: Exclude items already reconciled
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
    `;

    const params = [status];
    let paramIndex = 2;

    if (month) {
      query += ` AND rwl.approval_month = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }

    // Get total count (with same filter)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reconciliation_waiting_list rwl
      WHERE rwl.status = $1
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
        ${month ? `AND rwl.approval_month = $2` : ''}
    `;
    const countParams = month ? [status, month] : [status];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY rwl.approval_time ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get summary
    const summaryResult = await pool.query('SELECT * FROM get_waiting_list_summary()');

    // Map month_label to period_label for summary
    const summaryWithPeriodLabel = summaryResult.rows.map(s => ({
      approval_month: s.approval_month,
      period_label: s.month_label,
      count: s.order_count,
      total_cashback: s.total_cashback,
      user_count: s.user_count
    }));

    // Add period_label to each item
    const itemsWithLabels = result.rows.map(item => {
      const date = new Date(item.approval_month);
      return {
        ...item,
        period_label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
        username: item.user_name
      };
    });

    res.json({
      success: true,
      data: {
        items: itemsWithLabels,
        summary: summaryWithPeriodLabel,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting waiting list:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/auto-sync/check-draft-reconciliation
 * Check if there's an existing draft reconciliation for a given month
 */
router.get('/auto-sync/check-draft-reconciliation', async (req, res) => {
  try {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'month parameter is required'
      });
    }

    // Calculate period dates from month
    const monthDate = new Date(month);
    const periodStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const periodEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    // Check for draft reconciliations overlapping with this period
    const query = `
      SELECT
        id,
        period_label,
        period_start,
        period_end,
        total_orders,
        total_cashback,
        status,
        created_at
      FROM system_reconciliations
      WHERE status = 'draft'
        AND period_start <= $2
        AND period_end >= $1
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const result = await pool.query(query, [periodStart, periodEnd]);

    res.json({
      success: true,
      data: {
        has_draft: result.rows.length > 0,
        draft_reconciliations: result.rows
      }
    });

  } catch (error) {
    console.error('Error checking draft reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/auto-sync/create-from-waiting
 * Create reconciliation from waiting list orders
 */
router.post('/auto-sync/create-from-waiting', async (req, res) => {
  try {
    const { month, periodLabel, reconciliationId } = req.body;

    console.log('[create-from-waiting] Received:', { month, periodLabel, reconciliationId });

    if (!month || !periodLabel) {
      return res.status(400).json({
        success: false,
        message: 'month and periodLabel are required'
      });
    }

    // Get all orders from waiting list for this month
    // Use system_conversion_id for system reconciliation (migration 038)
    // FIXED: Exclude items already in reconciliation
    console.log('[create-from-waiting] Querying waiting list for month:', month);
    const waitingOrdersResult = await pool.query(`
      SELECT rwl.system_conversion_id, rwl.cashback_amount
      FROM reconciliation_waiting_list rwl
      WHERE rwl.approval_month = $1 AND rwl.status = 'waiting'
        -- FIXED: Exclude items already in reconciliation
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
      ORDER BY rwl.approval_time ASC
    `, [month]);

    console.log('[create-from-waiting] Found orders:', waitingOrdersResult.rows.length);

    if (waitingOrdersResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có đơn hàng nào trong danh sách chờ cho tháng này'
      });
    }

    const selectedOrderIds = waitingOrdersResult.rows.map(o => o.system_conversion_id);
    const totalCashback = waitingOrdersResult.rows.reduce((sum, o) => sum + parseFloat(o.cashback_amount || 0), 0);

    let reconciliation;
    let action = 'created'; // 'created' or 'added'

    // Check if reconciliationId provided (add to existing draft)
    if (reconciliationId) {
      // Verify reconciliation exists and is draft
      const reconCheck = await pool.query(
        'SELECT id, status, period_label FROM system_reconciliations WHERE id = $1',
        [reconciliationId]
      );

      if (reconCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Kỳ đối soát không tồn tại'
        });
      }

      if (reconCheck.rows[0].status !== 'draft') {
        return res.status(400).json({
          success: false,
          message: 'Chỉ có thể thêm đơn hàng vào kỳ đối soát ở trạng thái Nháp'
        });
      }

      // Add orders to existing draft
      await SystemReconciliationService.addOrdersToReconciliation(
        reconciliationId,
        selectedOrderIds,
        req.userId
      );

      reconciliation = { id: reconciliationId };
      action = 'added';

    } else {
      // Calculate period dates from month
      const monthDate = new Date(month);
      const periodStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const periodEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      periodEnd.setHours(23, 59, 59, 999);

      // Create new reconciliation using existing service
      reconciliation = await SystemReconciliationService.createReconciliation({
        periodStart,
        periodEnd,
        periodLabel,
        selectedOrderIds,
        createdBy: req.userId
      });

      action = 'created';
    }

    // Note: Waiting list cleanup is now handled automatically in SystemReconciliationService
    // Both createReconciliation() and addOrdersToReconciliation() delete from waiting list

    // Get remaining waiting list count (exclude already reconciled)
    const remainingResult = await pool.query(`
      SELECT COUNT(*) as remaining FROM reconciliation_waiting_list rwl
      WHERE rwl.status = $1
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
    `, ['waiting']);
    const remaining = parseInt(remainingResult.rows[0].remaining);

    const message = action === 'created'
      ? `Đã tạo kỳ đối soát "${periodLabel}" với ${selectedOrderIds.length} đơn hàng`
      : `Đã thêm ${selectedOrderIds.length} đơn hàng vào kỳ đối soát "${periodLabel}"`;

    res.json({
      success: true,
      message,
      data: {
        reconciliation_id: reconciliation.id,
        order_count: selectedOrderIds.length,
        total_cashback: totalCashback,
        remaining_in_waiting: remaining,
        action // 'created' or 'added'
      }
    });

  } catch (error) {
    console.error('[create-from-waiting] ERROR:', error);
    console.error('[create-from-waiting] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/system-reconciliation/auto-sync/waiting-list/:id
 * Remove order from waiting list
 */
router.delete('/auto-sync/waiting-list/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM reconciliation_waiting_list WHERE id = $1 AND status = $2 RETURNING *',
      [id, 'waiting']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng trong danh sách chờ'
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa đơn hàng khỏi danh sách chờ',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error removing from waiting list:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
 
