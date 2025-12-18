const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const User = require('../models/User');
const Conversion = require('../models/Conversion');
const Click = require('../models/Click');
const Merchant = require('../models/Merchant');
const Transaction = require('../models/Transaction');
const { pool } = require('../config/database');
const SystemConversion = require('../models/SystemConversion');
const accessTradeService = require('../services/accesstrade');
const accessTradeLinkService = require('../services/accessTradeLink');
const trackingService = require('../services/trackingService');
const { syncConversions } = require('../jobs/syncConversions');
const pendingOrdersUpdate = require('../services/pendingOrdersUpdate');
const retryService = require('../services/retryService');
const cronJobsService = require('../jobs/cronJobs');
const logger = require('../utils/logger');
const AutoSyncConfig = require('../models/AutoSyncConfig');
const autoSyncService = require('../services/autoSyncService');
const SystemSettings = require('../services/systemSettings');
const { ActivityLogger, ACTIVITY_TYPES } = require('../services/activityLogger');
const paymentHistoryService = require('../services/paymentHistoryService');
const UserPaymentHistory = require('../models/UserPaymentHistory');
const AutoSyncHistory = require('../models/AutoSyncHistory');

/**
 * GET /api/admin/dashboard/stats
 * Get enhanced dashboard statistics with charts data
 */
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
  try {
    // Get date ranges
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Users statistics
    const usersStats = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= $1 THEN 1 END) as new_this_month,
        COUNT(CASE WHEN created_at >= $2 AND created_at < $3 THEN 1 END) as last_month_users,
        0 as churned_users
      FROM users
      WHERE is_admin = FALSE
    `, [thisMonthStart, lastMonthStart, lastMonthEnd]);

    const users = usersStats.rows[0];
    const usersGrowth = users.last_month_users > 0
      ? ((users.new_this_month - users.last_month_users) / users.last_month_users) * 100
      : 0;

    // Revenue statistics (only from cashback system - conversions with click_id)
    const revenueStats = await pool.query(`
      SELECT
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(commission - cashback_amount), 0) as platform_fee,
        COALESCE(SUM(CASE WHEN created_at >= $1 THEN commission ELSE 0 END), 0) as this_month_revenue,
        COALESCE(SUM(CASE WHEN created_at >= $2 AND created_at < $3 THEN commission ELSE 0 END), 0) as last_month_revenue
      FROM conversions
      WHERE status = 'approved' AND click_id IS NOT NULL
    `, [thisMonthStart, lastMonthStart, lastMonthEnd]);

    const revenue = revenueStats.rows[0];
    const revenueGrowth = parseFloat(revenue.last_month_revenue) > 0
      ? ((parseFloat(revenue.this_month_revenue) - parseFloat(revenue.last_month_revenue)) / parseFloat(revenue.last_month_revenue)) * 100
      : 0;

    // Merchant conversion metrics (top 10 merchants by conversions in last 30 days)
    const merchantStats = await pool.query(`
      SELECT
        m.name,
        m.id,
        COUNT(DISTINCT c.id) as conversions,
        COUNT(DISTINCT cl.id) as clicks,
        CASE
          WHEN COUNT(DISTINCT cl.id) > 0
          THEN (COUNT(DISTINCT c.id)::float / COUNT(DISTINCT cl.id)::float * 100)
          ELSE 0
        END as conversion_rate
      FROM merchants m
      LEFT JOIN clicks cl ON cl.merchant_id = m.id AND cl.clicked_at >= NOW() - INTERVAL '30 days'
      LEFT JOIN conversions c ON c.merchant_id = m.id AND c.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY m.id, m.name
      HAVING COUNT(DISTINCT cl.id) > 0
      ORDER BY conversions DESC
      LIMIT 10
    `);

    const avgConversionRate = merchantStats.rows.length > 0
      ? merchantStats.rows.reduce((sum, m) => sum + parseFloat(m.conversion_rate), 0) / merchantStats.rows.length
      : 0;

    // Conversion statistics (overall + by year, only from cashback system)
    const conversionStats = await pool.query(`
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END), 0) as total_order_value
      FROM conversions
      WHERE click_id IS NOT NULL
    `);

    const conversionsByMonth = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM conversions
      WHERE created_at >= NOW() - INTERVAL '12 months' AND click_id IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `);

    // User balance statistics
    // Available balance = cashback from approved conversions
    // Pending balance = cashback from pending conversions
    const userBalanceStats = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.cashback_amount ELSE 0 END), 0) as total_available_balance,
        COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.cashback_amount ELSE 0 END), 0) as total_pending_balance
      FROM conversions c
      WHERE c.click_id IS NOT NULL
    `);

    // Total clicks and conversions for conversion rate
    const clickConversionStats = await pool.query(`
      SELECT
        COUNT(DISTINCT cl.id) as total_clicks,
        COUNT(DISTINCT c.id) as total_conversions
      FROM clicks cl
      LEFT JOIN conversions c ON c.click_id = cl.id AND c.click_id IS NOT NULL
    `);

    // Recent transactions (last 10 approved conversions from cashback system)
    const recentTransactions = await pool.query(`
      SELECT
        c.id,
        c.merchant_id,
        c.merchant_name,
        c.cashback_amount,
        c.created_at,
        u.username as user_name,
        u.full_name,
        u.email as user_email
      FROM conversions c
      JOIN clicks cl ON c.click_id = cl.id
      JOIN users u ON cl.user_id = u.id
      WHERE c.status = 'approved' AND c.click_id IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    const convStats = conversionStats.rows[0];
    const balanceStats = userBalanceStats.rows[0];
    const clickConvStats = clickConversionStats.rows[0];

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(users.total_users),
          newThisMonth: parseInt(users.new_this_month),
          churned: parseInt(users.churned_users),
          growth: parseFloat(usersGrowth.toFixed(2)),
          churnRate: users.total_users > 0 ? (parseInt(users.churned_users) / parseInt(users.total_users) * 100).toFixed(2) : 0
        },
        revenue: {
          total: parseFloat(revenue.total_commission),
          commissionRevenue: parseFloat(revenue.total_commission),
          cashbackPaid: parseFloat(revenue.total_cashback),
          platformFee: parseFloat(revenue.platform_fee),
          growth: parseFloat(revenueGrowth.toFixed(2)),
          totalOrderValue: parseFloat(convStats.total_order_value)
        },
        merchants: {
          topMerchants: merchantStats.rows.map(m => ({
            id: m.id,
            name: m.name,
            conversions: parseInt(m.conversions),
            clicks: parseInt(m.clicks),
            conversionRate: parseFloat(m.conversion_rate)
          })),
          avgConversionRate: parseFloat(avgConversionRate.toFixed(2)),
          activeCount: merchantStats.rows.length
        },
        conversions: {
          total: parseInt(convStats.total_conversions),
          approved: parseInt(convStats.approved),
          pending: parseInt(convStats.pending),
          rejected: parseInt(convStats.rejected),
          byMonth: conversionsByMonth.rows.map(m => ({
            month: m.month,
            approved: parseInt(m.approved),
            pending: parseInt(m.pending),
            rejected: parseInt(m.rejected)
          }))
        },
        transactions: recentTransactions.rows.map(tx => ({
          id: tx.id,
          merchantId: tx.merchant_id,
          merchantName: tx.merchant_name,
          cashbackAmount: parseFloat(tx.cashback_amount),
          createdAt: tx.created_at,
          userName: tx.user_name,
          fullName: tx.full_name,
          userEmail: tx.user_email,
          paymentMethod: 'cashback'
        })),
        balance: {
          availableBalance: parseFloat(balanceStats.total_available_balance),
          pendingBalance: parseFloat(balanceStats.total_pending_balance)
        },
        clicksAndConversions: {
          totalClicks: parseInt(clickConvStats.total_clicks),
          totalConversions: parseInt(clickConvStats.total_conversions),
          conversionRate: parseInt(clickConvStats.total_clicks) > 0
            ? (parseInt(clickConvStats.total_conversions) / parseInt(clickConvStats.total_clicks) * 100)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard statistics'
    });
  }
});

/**
 * GET /api/admin/dashboard/merchant-stats
 * Get merchant statistics for specific time period
 */
router.get('/dashboard/merchant-stats', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30; // Default to 30 days

    // Merchant conversion metrics for specified period
    const merchantStats = await pool.query(`
      SELECT
        m.name,
        m.id,
        COUNT(DISTINCT c.id) as conversions,
        COUNT(DISTINCT cl.id) as clicks,
        CASE
          WHEN COUNT(DISTINCT cl.id) > 0
          THEN (COUNT(DISTINCT c.id)::float / COUNT(DISTINCT cl.id)::float * 100)
          ELSE 0
        END as conversion_rate
      FROM merchants m
      LEFT JOIN clicks cl ON cl.merchant_id = m.id AND cl.clicked_at >= NOW() - INTERVAL '${days} days'
      LEFT JOIN conversions c ON c.merchant_id = m.id AND c.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY m.id, m.name
      HAVING COUNT(DISTINCT cl.id) > 0
      ORDER BY conversions DESC
      LIMIT 10
    `);

    const avgConversionRate = merchantStats.rows.length > 0
      ? merchantStats.rows.reduce((sum, m) => sum + parseFloat(m.conversion_rate), 0) / merchantStats.rows.length
      : 0;

    const topMerchants = merchantStats.rows.map(m => ({
      id: m.id,
      name: m.name,
      conversions: parseInt(m.conversions),
      clicks: parseInt(m.clicks),
      conversionRate: parseFloat(m.conversion_rate).toFixed(2)
    }));

    res.json({
      success: true,
      data: {
        topMerchants,
        avgConversionRate: avgConversionRate.toFixed(2),
        totalActiveMerchants: merchantStats.rows.length
      }
    });
  } catch (error) {
    console.error('Merchant stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load merchant statistics'
    });
  }
});

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_admin = false) as total_users,
        (SELECT COUNT(*) FROM system_conversions) as total_conversions,
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'pending') as pending_conversions,
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'approved') as approved_conversions,
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'rejected') as rejected_conversions,
        (SELECT COALESCE(SUM(order_amount), 0) FROM system_conversions WHERE status = 'approved') as total_order_value,
        (SELECT COALESCE(SUM(commission), 0) FROM system_conversions WHERE status = 'approved') as total_commission,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE status = 'approved') as total_cashback_paid,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE status = 'pending') as pending_cashback,
        (SELECT COALESCE(SUM(available_balance), 0) FROM users) as total_user_balance,
        (SELECT COALESCE(SUM(pending_balance), 0) FROM users) as total_pending_balance,
        (SELECT COUNT(*) FROM clicks) as total_clicks
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(stats.total_users),
        totalConversions: parseInt(stats.total_conversions),
        pendingConversions: parseInt(stats.pending_conversions),
        approvedConversions: parseInt(stats.approved_conversions),
        rejectedConversions: parseInt(stats.rejected_conversions),
        totalOrderValue: parseFloat(stats.total_order_value),
        totalCommission: parseFloat(stats.total_commission),
        totalCashbackPaid: parseFloat(stats.total_cashback_paid),
        pendingCashback: parseFloat(stats.pending_cashback),
        totalUserBalance: parseFloat(stats.total_user_balance),
        totalPendingBalance: parseFloat(stats.total_pending_balance),
        totalClicks: parseInt(stats.total_clicks),
        platformProfit: parseFloat(stats.total_commission) - parseFloat(stats.total_cashback_paid)
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
});

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    let query = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.full_name,
        u.phone,
        u.available_balance,
        u.pending_balance,
        u.total_cashback,
        u.is_admin,
        u.created_at,
        (SELECT COUNT(*) FROM clicks WHERE user_id = u.id) as total_clicks,
        (SELECT COUNT(*) FROM conversions c JOIN clicks cl ON c.click_id = cl.id WHERE cl.user_id = u.id) as total_conversions
      FROM users u
      WHERE u.is_admin = false
    `;

    const values = [];

    if (search) {
      query += ` AND (u.email ILIKE $1 OR u.username ILIKE $1 OR u.full_name ILIKE $1)`;
      values.push(`%${search}%`);
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    res.json({
      success: true,
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        username: u.username,
        fullName: u.full_name,
        phone: u.phone,
        availableBalance: parseFloat(u.available_balance),
        pendingBalance: parseFloat(u.pending_balance),
        totalCashback: parseFloat(u.total_cashback),
        isAdmin: u.is_admin,
        totalClicks: parseInt(u.total_clicks),
        totalConversions: parseInt(u.total_conversions),
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

/**
 * GET /api/admin/users/cashback-stats
 * Get user cashback statistics with date range filter
 * IMPORTANT: Must be BEFORE /users/:userId to avoid route conflict
 */
router.get('/users/cashback-stats', authenticateAdmin, async (req, res) => {
  try {
    const {
      from_date,
      to_date,
      page = 0,
      limit = 20,
      sort_by = 'cashback_desc'
    } = req.query;

    // Parse pagination
    const pageNum = parseInt(page) || 0;
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100
    const offset = pageNum * limitNum;

    // Default date range: last 30 days
    const defaultToDate = new Date();
    const defaultFromDate = new Date();
    defaultFromDate.setDate(defaultFromDate.getDate() - 30);

    const fromDate = from_date ? new Date(from_date) : defaultFromDate;
    const toDate = to_date ? new Date(to_date) : defaultToDate;

    // Validate date range
    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: 'from_date must be before to_date'
      });
    }

    // Determine sort order
    let orderByClause;
    if (sort_by === 'orders_desc') {
      orderByClause = 'ORDER BY total_orders DESC';
    } else if (sort_by === 'username_asc') {
      orderByClause = 'ORDER BY u.username ASC';
    } else {
      // Default: cashback_desc
      orderByClause = 'ORDER BY total_cashback_earned DESC';
    }

    // Query user cashback stats
    const statsQuery = `
      SELECT
        u.id AS user_id,
        u.username,
        u.email,
        u.full_name,
        u.available_balance,
        u.pending_balance,
        u.total_cashback AS total_cashback_all_time,

        -- Stats in date range
        COUNT(DISTINCT sc.id) AS total_orders,
        COALESCE(SUM(sc.order_amount), 0) AS total_order_value,
        COALESCE(SUM(sc.cashback_amount), 0) AS total_cashback_earned,

        -- Breakdown by status
        COUNT(DISTINCT CASE WHEN sc.status = 'approved' THEN sc.id END) AS approved_orders,
        COUNT(DISTINCT CASE WHEN sc.status = 'pending' THEN sc.id END) AS pending_orders,
        COUNT(DISTINCT CASE WHEN sc.status = 'rejected' THEN sc.id END) AS rejected_orders,

        COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.cashback_amount ELSE 0 END), 0) AS approved_cashback,
        COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.cashback_amount ELSE 0 END), 0) AS pending_cashback

      FROM users u
      LEFT JOIN system_conversions sc
        ON sc.user_id = u.id
        AND sc.order_time >= $1
        AND sc.order_time <= $2

      WHERE u.is_admin = false

      GROUP BY
        u.id, u.username, u.email, u.full_name,
        u.available_balance, u.pending_balance, u.total_cashback

      ${orderByClause}

      LIMIT $3 OFFSET $4
    `;

    console.log('Executing stats query with params:', { fromDate, toDate, limitNum, offset, orderByClause });
    const statsResult = await pool.query(statsQuery, [fromDate, toDate, limitNum, offset]);

    // Count total users for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total_users
      FROM users u
      LEFT JOIN system_conversions sc
        ON sc.user_id = u.id
        AND sc.order_time >= $1
        AND sc.order_time <= $2
      WHERE u.is_admin = false
    `;

    const countResult = await pool.query(countQuery, [fromDate, toDate]);
    const totalUsers = parseInt(countResult.rows[0].total_users);
    const totalPages = Math.ceil(totalUsers / limitNum);

    res.json({
      success: true,
      stats: statsResult.rows.map(row => ({
        userId: row.user_id,
        username: row.username,
        email: row.email,
        fullName: row.full_name,
        availableBalance: parseFloat(row.available_balance),
        pendingBalance: parseFloat(row.pending_balance),
        totalCashbackAllTime: parseFloat(row.total_cashback_all_time),

        periodStats: {
          totalOrders: parseInt(row.total_orders),
          totalOrderValue: parseFloat(row.total_order_value),
          totalCashbackEarned: parseFloat(row.total_cashback_earned),

          approvedOrders: parseInt(row.approved_orders),
          approvedCashback: parseFloat(row.approved_cashback),

          pendingOrders: parseInt(row.pending_orders),
          pendingCashback: parseFloat(row.pending_cashback),

          rejectedOrders: parseInt(row.rejected_orders)
        }
      })),
      pagination: {
        currentPage: pageNum,
        limit: limitNum,
        totalUsers: totalUsers,
        totalPages: totalPages
      },
      dateRange: {
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Get cashback stats error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to get cashback statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/users/cashback-stats/summary
 * Get total summary of cashback stats (not paginated)
 * IMPORTANT: Must be BEFORE /users/:userId to avoid route conflict
 */
router.get('/users/cashback-stats/summary', authenticateAdmin, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    // Default date range: last 30 days
    const defaultToDate = new Date();
    const defaultFromDate = new Date();
    defaultFromDate.setDate(defaultFromDate.getDate() - 30);

    const fromDate = from_date ? new Date(from_date) : defaultFromDate;
    const toDate = to_date ? new Date(to_date) : defaultToDate;

    // Validate date range
    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: 'from_date must be before to_date'
      });
    }

    // Query total summary (no pagination)
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT u.id) AS total_users,
        COUNT(DISTINCT sc.id) AS total_orders,
        COALESCE(SUM(sc.order_amount), 0) AS total_order_value,
        COALESCE(SUM(sc.cashback_amount), 0) AS total_cashback
      FROM users u
      LEFT JOIN system_conversions sc
        ON sc.user_id = u.id
        AND sc.order_time >= $1
        AND sc.order_time <= $2
      WHERE u.is_admin = false
    `;

    const summaryResult = await pool.query(summaryQuery, [fromDate, toDate]);
    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      summary: {
        totalUsers: parseInt(summary.total_users) || 0,
        totalOrders: parseInt(summary.total_orders) || 0,
        totalOrderValue: parseFloat(summary.total_order_value) || 0,
        totalCashback: parseFloat(summary.total_cashback) || 0
      },
      dateRange: {
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Get cashback stats summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cashback summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Get detailed information for a specific user
 */
router.get('/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user details
    const userQuery = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.full_name,
        u.phone,
        u.available_balance,
        u.pending_balance,
        u.total_cashback,
        u.is_admin,
        u.created_at
      FROM users u
      WHERE u.id = $1
    `;

    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Get user's clicks
    const clicksQuery = `
      SELECT COUNT(*) as total_clicks,
             COUNT(CASE WHEN click_type = 'button' THEN 1 END) as button_clicks,
             COUNT(CASE WHEN click_type = 'link' THEN 1 END) as link_clicks
      FROM clicks
      WHERE user_id = $1
    `;
    const clicksResult = await pool.query(clicksQuery, [userId]);

    // Get user's conversions
    const conversionsQuery = `
      SELECT COUNT(*) as total_conversions,
             COUNT(CASE WHEN c.status = 'approved' THEN 1 END) as approved_conversions,
             COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_conversions,
             COUNT(CASE WHEN c.status = 'rejected' THEN 1 END) as rejected_conversions,
             COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.cashback_amount ELSE 0 END), 0) as approved_cashback,
             COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.cashback_amount ELSE 0 END), 0) as pending_cashback
      FROM conversions c
      JOIN clicks cl ON c.click_id = cl.id
      WHERE cl.user_id = $1
    `;
    const conversionsResult = await pool.query(conversionsQuery, [userId]);

    // Get user's detailed clicks with conversion status
    const clicksDetailQuery = `
      SELECT
        cl.id as click_id,
        cl.merchant_id,
        COALESCE(m.name, cl.merchant_id) as merchant_name,
        cl.click_type,
        cl.clicked_at,
        cl.affiliate_url,
        c.id as conversion_id,
        c.status as conversion_status,
        c.cashback_amount,
        c.order_approved,
        c.order_pending,
        c.order_reject
      FROM clicks cl
      LEFT JOIN merchants m ON cl.merchant_id = m.id
      LEFT JOIN conversions c ON c.click_id = cl.id
      WHERE cl.user_id = $1
      ORDER BY cl.clicked_at DESC
      LIMIT 50
    `;
    const clicksDetailResult = await pool.query(clicksDetailQuery, [userId]);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        phone: user.phone,
        availableBalance: parseFloat(user.available_balance),
        pendingBalance: parseFloat(user.pending_balance),
        totalCashback: parseFloat(user.total_cashback),
        isAdmin: user.is_admin,
        createdAt: user.created_at
      },
      stats: {
        totalClicks: parseInt(clicksResult.rows[0].total_clicks),
        buttonClicks: parseInt(clicksResult.rows[0].button_clicks),
        linkClicks: parseInt(clicksResult.rows[0].link_clicks),
        totalConversions: parseInt(conversionsResult.rows[0].total_conversions),
        approvedConversions: parseInt(conversionsResult.rows[0].approved_conversions),
        pendingConversions: parseInt(conversionsResult.rows[0].pending_conversions),
        rejectedConversions: parseInt(conversionsResult.rows[0].rejected_conversions),
        approvedCashback: parseFloat(conversionsResult.rows[0].approved_cashback),
        pendingCashback: parseFloat(conversionsResult.rows[0].pending_cashback)
      },
      clicks: clicksDetailResult.rows.map(click => ({
        clickId: click.click_id,
        merchantId: click.merchant_id,
        merchantName: click.merchant_name,
        clickType: click.click_type,
        clickedAt: click.clicked_at,
        affiliateUrl: click.affiliate_url,
        hasConversion: !!click.conversion_id,
        conversionStatus: click.conversion_status,
        cashback: click.cashback_amount ? parseFloat(click.cashback_amount) : null,
        orderApproved: click.order_approved || 0,
        orderPending: click.order_pending || 0,
        orderReject: click.order_reject || 0
      }))
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user details'
    });
  }
});

/**
 * GET /api/admin/conversions
 * Get all system conversions (cashback conversions only - matched with users)
 */
router.get('/conversions', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const userSearch = req.query.userSearch || null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;

    // Query from system_conversions (cashback system only)
    let query = `
      SELECT
        sc.*,
        u.username,
        u.email,
        u.full_name,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        c.order_code as at_order_code
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE 1=1
    `;

    const values = [];

    // Status filter
    if (status) {
      values.push(status);
      query += ` AND sc.status = $${values.length}`;
    }

    // User search filter (search in username, email, full_name)
    if (userSearch) {
      values.push(`%${userSearch}%`);
      query += ` AND (
        u.username ILIKE $${values.length} OR
        u.email ILIKE $${values.length} OR
        u.full_name ILIKE $${values.length}
      )`;
    }

    // Date range filters
    if (dateFrom) {
      values.push(dateFrom);
      query += ` AND sc.order_time >= $${values.length}`;
    }

    if (dateTo) {
      // Add 1 day to include the entire end date
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      values.push(endDate.toISOString().split('T')[0]);
      query += ` AND sc.order_time < $${values.length}`;
    }

    query += ` ORDER BY sc.order_time DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get statistics from system_conversions
    let statsQuery = `
      SELECT
        -- Total counts
        COUNT(*) as total_count,
        -- Counts by status
        COUNT(CASE WHEN sc.status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN sc.status = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN sc.status = 'approved' THEN 1 END) as approved_count,
        -- Reconciliation status
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.conversion_id = sc.at_conversion_id
        ) THEN 1 END) as reconciled_count,
        COUNT(CASE WHEN NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.conversion_id = sc.at_conversion_id
        ) THEN 1 END) as not_reconciled_count,
        -- Amounts by status
        COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.order_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN sc.status = 'rejected' THEN sc.order_amount ELSE 0 END), 0) as rejected_amount,
        COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.order_amount ELSE 0 END), 0) as approved_amount,
        -- Commission by status
        COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.commission ELSE 0 END), 0) as pending_commission,
        COALESCE(SUM(CASE WHEN sc.status = 'rejected' THEN sc.commission ELSE 0 END), 0) as rejected_commission,
        COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.commission ELSE 0 END), 0) as approved_commission,
        -- Cashback by status
        COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.cashback_amount ELSE 0 END), 0) as pending_cashback,
        COALESCE(SUM(CASE WHEN sc.status = 'rejected' THEN sc.cashback_amount ELSE 0 END), 0) as rejected_cashback,
        COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.cashback_amount ELSE 0 END), 0) as approved_cashback,
        -- Total commission and cashback
        COALESCE(SUM(sc.commission), 0) as total_commission,
        COALESCE(SUM(sc.cashback_amount), 0) as total_cashback
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE 1=1
    `;

    const statsValues = [];

    // Apply same filters to stats
    if (status) {
      statsValues.push(status);
      statsQuery += ` AND sc.status = $${statsValues.length}`;
    }

    if (userSearch) {
      statsValues.push(`%${userSearch}%`);
      statsQuery += ` AND (
        u.username ILIKE $${statsValues.length} OR
        u.email ILIKE $${statsValues.length} OR
        u.full_name ILIKE $${statsValues.length}
      )`;
    }

    if (dateFrom) {
      statsValues.push(dateFrom);
      statsQuery += ` AND sc.order_time >= $${statsValues.length}`;
    }

    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      statsValues.push(endDate.toISOString().split('T')[0]);
      statsQuery += ` AND sc.order_time < $${statsValues.length}`;
    }

    let stats = {};
    try {
      const statsResult = await pool.query(statsQuery, statsValues);
      stats = statsResult.rows[0] || {};
    } catch (statsError) {
      console.error('Stats query error:', statsError.message);
      // Return empty stats if query fails
      stats = {};
    }

    res.json({
      success: true,
      conversions: result.rows.map(c => ({
        id: c.id,
        userId: c.user_id,
        username: c.username,
        email: c.email,
        fullName: c.full_name,
        merchantId: c.merchant_id,
        merchantName: c.merchant_name,
        merchantLogo: c.merchant_logo,
        orderCode: c.order_code,
        orderAmount: parseFloat(c.order_amount || 0),
        commission: parseFloat(c.commission || 0),
        cashbackAmount: parseFloat(c.cashback_amount || 0),
        status: c.status,
        orderTime: c.order_time,
        createdAt: c.created_at,
        affSid: c.aff_sid,
        // System reconciliation status fields
        system_reconciliation_status: c.system_reconciliation_status,
        system_reconciliation_id: c.system_reconciliation_id,
        system_reconciled_at: c.system_reconciled_at,
        // Payment status fields
        payment_status: c.payment_status,
        payment_request_id: c.payment_request_id,
        payment_linked_at: c.payment_linked_at
      })),
      stats: {
        total_count: parseInt(stats.total_count || 0),
        total_commission: parseFloat(stats.total_commission || 0),
        total_cashback: parseFloat(stats.total_cashback || 0),
        reconciled_count: parseInt(stats.reconciled_count || 0),
        not_reconciled_count: parseInt(stats.not_reconciled_count || 0),
        pending: {
          count: parseInt(stats.pending_count || 0),
          amount: parseFloat(stats.pending_amount || 0),
          commission: parseFloat(stats.pending_commission || 0),
          cashback: parseFloat(stats.pending_cashback || 0)
        },
        rejected: {
          count: parseInt(stats.rejected_count || 0),
          amount: parseFloat(stats.rejected_amount || 0),
          commission: parseFloat(stats.rejected_commission || 0),
          cashback: parseFloat(stats.rejected_cashback || 0)
        },
        approved: {
          count: parseInt(stats.approved_count || 0),
          amount: parseFloat(stats.approved_amount || 0),
          commission: parseFloat(stats.approved_commission || 0),
          cashback: parseFloat(stats.approved_cashback || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get conversions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversions'
    });
  }
});

/**
 * GET /api/admin/conversion/:id
 * Get single conversion details
 */
router.get('/conversion/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Try conversions table first (regular cashback conversions)
    let query = `
      SELECT
        c.*,
        u.username,
        u.email,
        u.full_name,
        m.name as merchant_name,
        m.logo_url as merchant_logo
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN merchants m ON c.merchant_id = m.id
      WHERE c.id = $1
    `;

    let result = await pool.query(query, [id]);

    // If not found in conversions, try system_conversions
    if (result.rows.length === 0) {
      query = `
        SELECT
          sc.*,
          u.username,
          u.email,
          u.full_name,
          m.logo_url as merchant_logo
        FROM system_conversions sc
        LEFT JOIN users u ON sc.user_id = u.id
        LEFT JOIN merchants m ON sc.merchant_id = m.id
        WHERE sc.id = $1
      `;

      result = await pool.query(query, [id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Conversion not found'
      });
    }

    res.json({
      success: true,
      conversion: result.rows[0]
    });
  } catch (error) {
    console.error('Get conversion details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversion details'
    });
  }
});

/**
 * GET /api/admin/conversions/merchants
 * Get list of merchants from conversions
 */
router.get('/conversions/merchants', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT merchant_name
      FROM conversions
      WHERE merchant_name IS NOT NULL AND merchant_name != ''
      ORDER BY merchant_name ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      merchants: result.rows.map(row => row.merchant_name)
    });
  } catch (error) {
    console.error('Get merchants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get merchants'
    });
  }
});

/**
 * PUT /api/admin/conversion/:id/status
 * Update conversion status (approve/reject)
 */
router.put('/conversion/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected'
      });
    }

    // Get conversion details
    const conversion = await Conversion.findById(id);

    if (!conversion) {
      return res.status(404).json({
        success: false,
        message: 'Conversion not found'
      });
    }

    if (conversion.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending conversions can be updated'
      });
    }

    const approvalTime = new Date();

    // Update conversion status
    await Conversion.updateStatus(id, status, approvalTime);

    // Update user balance
    if (status === 'approved') {
      // Move from pending to available balance
      await User.updateBalance(conversion.user_id, 'pending_to_available', conversion.cashback_amount);
    } else if (status === 'rejected') {
      // Remove from pending balance
      await User.updateBalance(conversion.user_id, 'reject_pending', conversion.cashback_amount);
    }

    res.json({
      success: true,
      message: `Conversion ${status} successfully`
    });
  } catch (error) {
    console.error('Update conversion status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update conversion status'
    });
  }
});

/**
 * GET /api/admin/conversion/:id/check-at-status
 * Check status of a single conversion from AccessTrade (no update)
 */
router.get('/conversion/:id/check-at-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Check AT status request - Conversion ID: ${id}`);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Conversion ID is required'
      });
    }

    // Get conversion details from system_conversions table with merchant from conversions
    const query = `
      SELECT sc.*,
             c.merchant_id as merchant_slug,
             c.merchant_name,
             c.accesstrade_id as at_order_id,
             c.order_code
      FROM system_conversions sc
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE sc.id = $1
    `;
    const result = await pool.query(query, [id]);
    const conversion = result.rows[0];

    if (!conversion) {
      logger.warn(`Conversion not found in database - ID: ${id}`);
      return res.status(404).json({
        success: false,
        message: `Conversion not found (ID: ${id})`
      });
    }

    // Use order_code if available, otherwise use at_order_id
    const orderIdForAPI = conversion.order_code || conversion.at_order_id;

    // Log for debugging
    logger.info(`Found conversion - Order Code: ${conversion.order_code}, AT Order ID: ${conversion.at_order_id}, Merchant: ${conversion.merchant_slug || 'N/A'}, Using for API: ${orderIdForAPI}`);

    if (!orderIdForAPI) {
      return res.status(400).json({
        success: false,
        message: `Conversion không có Order ID để tra cứu trên AccessTrade`
      });
    }

    // Get order details from AccessTrade
    // Try with merchant first, if that fails, try without merchant
    let orderDetails = null;

    if (conversion.merchant_slug) {
      try {
        orderDetails = await pendingOrdersUpdate.getOrderDetails(
          orderIdForAPI,
          conversion.merchant_slug
        );
      } catch (error) {
        logger.warn(`Failed to get order with merchant, trying without merchant`, {
          orderId: orderIdForAPI,
          merchant: conversion.merchant_slug,
          error: error.message
        });
      }
    }

    // If no merchant or failed with merchant, try without merchant
    if (!orderDetails) {
      orderDetails = await pendingOrdersUpdate.getOrderDetails(
        orderIdForAPI,
        null
      );
    }

    if (!orderDetails) {
      logger.warn(`Order not found on AccessTrade API`, {
        orderIdForAPI,
        merchant: conversion.merchant_slug
      });
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy đơn hàng trên AccessTrade (Order ID: ${orderIdForAPI}${conversion.merchant_slug ? ', Merchant: ' + conversion.merchant_slug : ''}). Đơn này có thể đã bị xóa hoặc chưa được đồng bộ.`
      });
    }

    // Map AT status to our status
    const atStatus = pendingOrdersUpdate.mapAccessTradeStatus(orderDetails.is_confirmed);
    const currentStatus = conversion.status;

    // Determine if confirmed (đối soát)
    const atIsConfirmed = parseInt(orderDetails.is_confirmed || 0) === 1;
    const currentIsConfirmed = conversion.is_confirmed;

    // Check for differences
    const hasStatusDifference = atStatus !== currentStatus;
    const hasConfirmedDifference = atIsConfirmed !== currentIsConfirmed;
    const hasDifference = hasStatusDifference || hasConfirmedDifference;

    res.json({
      success: true,
      hasDifference,
      current: {
        status: currentStatus,
        isConfirmed: currentIsConfirmed,
        orderCode: conversion.order_code,
        orderAmount: parseFloat(conversion.order_amount),
        commission: parseFloat(conversion.commission),
        cashbackAmount: parseFloat(conversion.cashback_amount)
      },
      accessTrade: {
        status: atStatus,
        isConfirmed: atIsConfirmed,
        orderId: orderDetails._id || orderDetails.order_id,
        merchant: orderDetails.merchant,
        billing: parseFloat(orderDetails.billing || 0),
        commission: parseFloat(orderDetails.pub_commission || 0),
        clickTime: orderDetails.click_time,
        salesTime: orderDetails.sales_time,
        orderApproved: orderDetails.order_approved,
        orderPending: orderDetails.order_pending,
        orderReject: orderDetails.order_reject
      },
      differences: {
        status: hasStatusDifference ? { old: currentStatus, new: atStatus } : null,
        isConfirmed: hasConfirmedDifference ? { old: currentIsConfirmed, new: atIsConfirmed } : null
      }
    });
  } catch (error) {
    console.error('Check AT status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check AT status'
    });
  }
});

/**
 * PUT /api/admin/conversion/:id/sync-from-at
 * Sync and update conversion from AccessTrade after user confirmation
 */
router.put('/conversion/:id/sync-from-at', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus } = req.body;

    // Get conversion details from system_conversions table
    const query = `SELECT * FROM system_conversions WHERE id = $1`;
    const result = await pool.query(query, [id]);
    const conversion = result.rows[0];

    if (!conversion) {
      return res.status(404).json({
        success: false,
        message: 'Conversion not found'
      });
    }

    const oldStatus = conversion.status;
    let balanceUpdated = false;

    // Update status if changed
    if (newStatus && newStatus !== oldStatus) {
      const approvalTime = newStatus === 'approved' ? new Date() : null;

      // Update in system_conversions table
      await pool.query(
        'UPDATE system_conversions SET status = $1, approval_time = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, approvalTime, id]
      );

      // Update user balance if needed
      if (oldStatus === 'pending' && newStatus === 'approved') {
        await User.updateBalance(conversion.user_id, 'pending_to_available', conversion.cashback_amount);
        balanceUpdated = true;
      } else if (oldStatus === 'pending' && newStatus === 'rejected') {
        await User.updateBalance(conversion.user_id, 'reject_pending', conversion.cashback_amount);
        balanceUpdated = true;
      }

      logger.info(`Updated order ${conversion.at_conversion_id}: ${oldStatus} → ${newStatus}`);
    }

    res.json({
      success: true,
      message: 'Conversion updated successfully',
      updated: {
        status: newStatus !== oldStatus,
        balanceUpdated
      },
      changes: {
        status: newStatus !== oldStatus ? { old: oldStatus, new: newStatus } : null
      }
    });
  } catch (error) {
    console.error('Sync from AT error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync conversion'
    });
  }
});

/**
 * GET /api/admin/user/:id
 * Get user details with statistics
 */
router.get('/user/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const conversionStats = await Conversion.getUserStats(id);
    const clickStats = await Click.getStats(id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        phone: user.phone,
        availableBalance: parseFloat(user.available_balance),
        pendingBalance: parseFloat(user.pending_balance),
        totalCashback: parseFloat(user.total_cashback),
        createdAt: user.created_at,
        stats: {
          totalConversions: parseInt(conversionStats.total_conversions),
          approvedConversions: parseInt(conversionStats.approved_conversions),
          pendingConversions: parseInt(conversionStats.pending_conversions),
          rejectedConversions: parseInt(conversionStats.rejected_conversions),
          totalClicks: parseInt(clickStats.total_clicks),
          convertedClicks: parseInt(clickStats.converted_clicks)
        }
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user details'
    });
  }
});

/**
 * GET /api/admin/check-database
 * Check database connection and tables
 */
router.get('/check-database', authenticateAdmin, async (req, res) => {
  try {
    const dbCheck = {
      connected: false,
      tables: {},
      error: null
    };

    // Test connection
    const testQuery = await pool.query('SELECT NOW()');
    dbCheck.connected = true;
    dbCheck.serverTime = testQuery.rows[0].now;

    // Check tables
    const tables = ['users', 'clicks', 'conversions', 'merchants'];

    for (const table of tables) {
      try {
        const countQuery = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        dbCheck.tables[table] = {
          exists: true,
          count: parseInt(countQuery.rows[0].count)
        };
      } catch (error) {
        dbCheck.tables[table] = {
          exists: false,
          error: error.message
        };
      }
    }

    res.json({
      success: true,
      database: dbCheck
    });
  } catch (error) {
    logger.error('Database check error:', error);
    res.status(500).json({
      success: false,
      message: 'Database check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/check-env
 * Check environment variables configuration
 */
router.get('/check-env', authenticateAdmin, async (req, res) => {
  try {
    const envStatus = {
      ACCESSTRADE_ACCESS_TOKEN: {
        configured: !!process.env.ACCESSTRADE_ACCESS_TOKEN,
        preview: process.env.ACCESSTRADE_ACCESS_TOKEN ?
          process.env.ACCESSTRADE_ACCESS_TOKEN.substring(0, 10) + '...' : 'NOT SET'
      },
      ACCESSTRADE_API_TOKEN: {
        configured: !!process.env.ACCESSTRADE_API_TOKEN,
        preview: process.env.ACCESSTRADE_API_TOKEN ?
          process.env.ACCESSTRADE_API_TOKEN.substring(0, 10) + '...' : 'NOT SET'
      },
      DATABASE_URL: {
        configured: !!process.env.DATABASE_URL,
        preview: process.env.DATABASE_URL ?
          'postgresql://...' + process.env.DATABASE_URL.split('@')[1]?.substring(0, 20) + '...' : 'NOT SET'
      },
      JWT_SECRET: {
        configured: !!process.env.JWT_SECRET,
        preview: process.env.JWT_SECRET ?
          process.env.JWT_SECRET.substring(0, 10) + '...' : 'NOT SET'
      },
      JWT_EXPIRES_IN: {
        configured: !!process.env.JWT_EXPIRES_IN,
        value: process.env.JWT_EXPIRES_IN || 'NOT SET'
      },
      COMMISSION_SPLIT: {
        configured: !!process.env.COMMISSION_SPLIT,
        value: process.env.COMMISSION_SPLIT || 'NOT SET'
      },
      NODE_ENV: {
        configured: !!process.env.NODE_ENV,
        value: process.env.NODE_ENV || 'NOT SET'
      },
      VERCEL: {
        configured: !!process.env.VERCEL,
        value: process.env.VERCEL || 'NOT SET'
      }
    };

    const allConfigured = Object.values(envStatus).every(env => env.configured);

    res.json({
      success: true,
      allConfigured,
      environment: envStatus,
      warnings: !allConfigured ?
        'Some environment variables are not configured. Please check Vercel dashboard.' : null
    });
  } catch (error) {
    logger.error('Check env error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check environment variables'
    });
  }
});

/**
 * GET /api/admin/test-accesstrade
 * Test AccessTrade API connection with debug info
 */
router.get('/test-accesstrade', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Testing AccessTrade API connection', {
      adminId: req.userId,
      hasToken: !!process.env.ACCESSTRADE_ACCESS_TOKEN
    });

    // Test với 7 ngày gần nhất
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const response = await accessTradeService.getConversions(startDate, endDate, { limit: 10 });

    res.json({
      success: true,
      message: 'AccessTrade API test successful',
      config: {
        baseURL: 'https://api.accesstrade.vn/v1',
        hasToken: !!process.env.ACCESSTRADE_ACCESS_TOKEN,
        tokenPrefix: process.env.ACCESSTRADE_ACCESS_TOKEN ?
          process.env.ACCESSTRADE_ACCESS_TOKEN.substring(0, 10) + '...' : 'N/A'
      },
      request: {
        since: startDate.toISOString(),
        until: endDate.toISOString(),
        limit: 10
      },
      response: {
        dataCount: response.data.length,
        pagination: response.pagination,
        sampleData: response.data[0] || null
      }
    });
  } catch (error) {
    logger.error('AccessTrade API test failed', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: 'AccessTrade API test failed',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

/**
 * GET /api/admin/fetch-conversions
 * Fetch conversions from AccessTrade API với pagination
 */
router.get('/fetch-conversions', authenticateAdmin, async (req, res) => {
  try {
    const { since, until, status, page, limit } = req.query;

    if (!since || !until) {
      return res.status(400).json({
        success: false,
        message: 'since and until parameters are required (ISO format: 2021-01-01T00:00:00Z)'
      });
    }

    const startDate = new Date(since);
    const endDate = new Date(until);

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 300,
      ...(status && { status: parseInt(status) }) // 0: Pending, 1: Approved, 2: Rejected
    };

    const response = await accessTradeService.getConversions(startDate, endDate, options);

    res.json({
      success: true,
      data: response.data,
      pagination: response.pagination
    });
  } catch (error) {
    console.error('Fetch conversions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch conversions'
    });
  }
});

/**
 * POST /api/admin/import-conversions
 * Import conversions to database with duplicate filtering
 */
router.post('/import-conversions', authenticateAdmin, async (req, res) => {
  try {
    const { conversions } = req.body;

    if (!conversions || !Array.isArray(conversions)) {
      return res.status(400).json({
        success: false,
        message: 'conversions array is required'
      });
    }

    logger.info('Import conversions triggered by admin', {
      adminId: req.userId,
      count: conversions.length,
      sampleConversion: conversions[0] || null
    });

    const results = {
      total: conversions.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process each conversion
    for (const conversion of conversions) {
      try {
        logger.info('Processing conversion', {
          orderId: conversion.order_id || conversion._id,
          affSid: conversion.aff_sid,
          merchantId: conversion.merchant_id,
          status: conversion.is_confirmed
        });

        // First try normal processing (requires matching click)
        let result = await trackingService.processConversion(conversion);

        // If skipped due to no matching click, try direct import
        if (result.status === 'skipped' && result.reason === 'no_matching_click') {
          logger.info('No matching click found, attempting direct import', {
            orderId: conversion.order_id || conversion._id
          });
          result = await trackingService.createConversionDirect(conversion, null);
        }

        logger.info('Conversion processed', {
          orderId: conversion.order_id || conversion._id,
          result: result.status,
          reason: result.reason
        });

        switch (result.status) {
          case 'created':
            results.created++;
            results.details.push({
              status: 'created',
              orderId: conversion.order_id || conversion._id,
              conversionId: result.conversionId
            });
            break;
          case 'updated':
            results.updated++;
            results.details.push({
              status: 'updated',
              orderId: conversion.order_id || conversion._id,
              conversionId: result.conversionId,
              oldStatus: result.oldStatus,
              newStatus: result.newStatus
            });
            break;
          case 'skipped':
            results.skipped++;
            results.details.push({
              status: 'skipped',
              orderId: conversion.order_id || conversion._id,
              reason: result.reason
            });
            break;
          case 'error':
            results.errors++;
            results.details.push({
              status: 'error',
              orderId: conversion.order_id || conversion._id,
              reason: result.reason
            });
            break;
        }

        // Small delay to avoid overwhelming database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        results.errors++;
        results.details.push({
          status: 'error',
          orderId: conversion.order_id || conversion._id,
          reason: error.message
        });
      }
    }

    logger.success('Import conversions completed', results);

    res.json({
      success: true,
      message: 'Import completed',
      result: results
    });
  } catch (error) {
    console.error('Import conversions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to import conversions'
    });
  }
});

/**
 * POST /api/admin/sync-conversions
 * Manually trigger conversion sync from AccessTrade
 */
router.post('/sync-conversions', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Manual conversion sync triggered by admin', {
      adminId: req.userId
    });

    // Run sync
    const results = await syncConversions();

    logger.info('Manual sync completed', results);

    res.json({
      success: true,
      message: 'Conversion sync completed',
      results: {
        total: results.total,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors
      }
    });
  } catch (error) {
    logger.error('Manual sync failed', {
      adminId: req.userId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync conversions'
    });
  }
});

/**
 * POST /api/admin/update-pending-orders
 * Update status of pending orders from AccessTrade
 * Rate limited to 10 requests/minute by AccessTrade API
 */
router.post('/update-pending-orders', authenticateAdmin, async (req, res) => {
  try {
    const { limit, olderThanDays } = req.body;

    logger.info('Pending orders update triggered by admin', {
      adminId: req.userId,
      limit: limit || 50,
      olderThanDays: olderThanDays || 1
    });

    // Run update with rate limiting
    const results = await pendingOrdersUpdate.updateAllPendingConversions({
      limit: limit || 50,
      olderThanDays: olderThanDays || 1
    });

    logger.info('Pending orders update completed', results);

    res.json({
      success: true,
      message: 'Pending orders update completed',
      results: {
        total: results.total,
        updated: results.updated,
        unchanged: results.unchanged,
        errors: results.errors
      },
      details: results.details
    });
  } catch (error) {
    logger.error('Pending orders update failed', {
      adminId: req.userId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update pending orders'
    });
  }
});

/**
 * GET /api/admin/fetch-transactions
 * Fetch transactions from AccessTrade API
 */
router.get('/fetch-transactions', authenticateAdmin, async (req, res) => {
  try {
    const { since, until, type, page, limit } = req.query;

    if (!since || !until) {
      return res.status(400).json({
        success: false,
        message: 'since and until parameters are required (ISO format: 2021-01-01T00:00:00Z)'
      });
    }

    const startDate = new Date(since);
    const endDate = new Date(until);

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 300,
      ...(type && { type })
    };

    logger.info('Fetching transactions from AccessTrade', {
      adminId: req.userId,
      since,
      until,
      options
    });

    const response = await accessTradeService.getTransactions(startDate, endDate, options);

    res.json({
      success: true,
      data: response.data,
      pagination: response.pagination
    });
  } catch (error) {
    logger.error('Fetch transactions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transactions'
    });
  }
});

/**
 * POST /api/admin/import-transactions
 * Import transactions to database
 */
router.post('/import-transactions', authenticateAdmin, async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        message: 'transactions array is required'
      });
    }

    logger.info('Import transactions triggered by admin', {
      adminId: req.userId,
      count: transactions.length
    });

    // Ensure transactions table exists
    await Transaction.createTable();

    const results = {
      total: transactions.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process each transaction
    for (const tx of transactions) {
      try {
        // Check if transaction already exists
        const existing = await Transaction.findByTransactionId(tx._id);

        // Find merchant by name or ID if available
        let merchantId = null;
        if (tx.merchant_name) {
          const merchantQuery = await pool.query(
            'SELECT id FROM merchants WHERE name ILIKE $1 LIMIT 1',
            [tx.merchant_name]
          );
          if (merchantQuery.rows.length > 0) {
            merchantId = merchantQuery.rows[0].id;
          }
        }

        const transactionData = {
          transactionId: tx._id,
          type: tx.type || null,
          merchantId,
          orderId: tx.order_id || null,
          amount: parseFloat(tx.amount) || 0,
          commission: parseFloat(tx.commission) || 0,
          description: tx.description || null,
          status: tx.status || null,
          time: tx.time || null,
          affSid: tx.aff_sid || null,
          utmSource: tx.utm_source || null,
          utmMedium: tx.utm_medium || null,
          utmCampaign: tx.utm_campaign || null,
          utmContent: tx.utm_content || null,
          rawData: tx
        };

        await Transaction.upsert(transactionData);

        if (existing) {
          results.updated++;
          results.details.push({
            status: 'updated',
            transactionId: tx._id
          });
        } else {
          results.created++;
          results.details.push({
            status: 'created',
            transactionId: tx._id
          });
        }

        // Small delay to avoid overwhelming database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        results.errors++;
        results.details.push({
          status: 'error',
          transactionId: tx._id,
          reason: error.message
        });
        logger.error('Error processing transaction', {
          transactionId: tx._id,
          error: error.message
        });
      }
    }

    logger.success('Import transactions completed', results);

    res.json({
      success: true,
      message: 'Import completed',
      result: results
    });
  } catch (error) {
    logger.error('Import transactions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to import transactions'
    });
  }
});

/**
 * GET /api/admin/transactions
 * Get stored transactions with filters
 */
router.get('/transactions', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const { type, merchantId, status, affSid } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (merchantId) filters.merchantId = merchantId;
    if (status) filters.status = status;
    if (affSid) filters.affSid = affSid;

    const transactions = await Transaction.getTransactions(filters, limit, offset);
    const total = await Transaction.getCount(filters);

    res.json({
      success: true,
      transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total
      }
    });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transactions'
    });
  }
});

/**
 * GET /api/admin/at-order/:id
 * Get single order detail by ID
 */
router.get('/at-order/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        c.id,
        c.accesstrade_id,
        c.order_code,
        c.merchant_id,
        c.merchant_name,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        c.status,
        c.aff_sid,
        c.utm_source,
        c.utm_medium,
        c.utm_campaign,
        c.utm_content,
        c.order_time,
        c.approval_time,
        c.created_at,
        c.updated_at,
        c.user_id,
        c.click_id,
        u.email as user_email,
        u.username as user_username,
        u.full_name as user_full_name,
        cl.aff_sid as click_aff_sid,
        cl.clicked_at
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN clicks cl ON c.click_id = cl.id
      WHERE c.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const row = result.rows[0];

    res.json({
      success: true,
      order: {
        id: row.id,
        accesstradeId: row.accesstrade_id,
        orderCode: row.order_code,
        merchantId: row.merchant_id,
        merchantName: row.merchant_name,
        orderAmount: parseFloat(row.order_amount),
        commission: parseFloat(row.commission),
        cashbackAmount: parseFloat(row.cashback_amount),
        status: row.status,
        affSid: row.aff_sid,
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        utmContent: row.utm_content,
        orderTime: row.order_time,
        approvalTime: row.approval_time,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
        userEmail: row.user_email,
        userUsername: row.user_username,
        userFullName: row.user_full_name,
        clickId: row.click_id,
        clickAffSid: row.click_aff_sid,
        clickedAt: row.clicked_at
      }
    });
  } catch (error) {
    logger.error('Get order detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order detail',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/at-orders
 * Get all AccessTrade orders (conversions) with smart search and filters
 * This is for lookup purposes - different from user conversions view
 */
router.get('/at-orders', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Build filter conditions
    const conditions = [];
    const values = [];
    let paramCount = 1;

    // Smart search - search across multiple fields
    if (req.query.search) {
      const searchTerm = `%${req.query.search}%`;
      conditions.push(`(
        c.order_code ILIKE $${paramCount} OR
        c.accesstrade_id ILIKE $${paramCount} OR
        c.merchant_name ILIKE $${paramCount} OR
        c.aff_sid ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        u.username ILIKE $${paramCount}
      )`);
      values.push(searchTerm);
      paramCount++;
    }

    // Status filter
    if (req.query.status) {
      conditions.push(`c.status = $${paramCount}`);
      values.push(req.query.status);
      paramCount++;
    }

    // Merchant filter
    if (req.query.merchant) {
      conditions.push(`c.merchant_name ILIKE $${paramCount}`);
      values.push(`%${req.query.merchant}%`);
      paramCount++;
    }

    // User filter
    if (req.query.user) {
      conditions.push(`(u.email ILIKE $${paramCount} OR u.id::text = $${paramCount})`);
      values.push(`%${req.query.user}%`);
      paramCount++;
    }

    // Confirmed status filter
    if (req.query.isConfirmed !== undefined && req.query.isConfirmed !== '') {
      conditions.push(`c.is_confirmed = $${paramCount}`);
      values.push(parseInt(req.query.isConfirmed));
      paramCount++;
    }

    // UTM Source filter
    if (req.query.utmSource) {
      conditions.push(`c.utm_source = $${paramCount}`);
      values.push(req.query.utmSource);
      paramCount++;
    }

    // Date range filter
    if (req.query.dateFrom) {
      conditions.push(`c.order_time >= $${paramCount}`);
      values.push(req.query.dateFrom);
      paramCount++;
    }

    if (req.query.dateTo) {
      // Add end of day
      const dateTo = new Date(req.query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      conditions.push(`c.order_time <= $${paramCount}`);
      values.push(dateTo.toISOString());
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get orders with pagination
    const ordersQuery = `
      SELECT
        c.id,
        c.accesstrade_id,
        c.order_code,
        c.merchant_id,
        c.merchant_name,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        c.status,
        c.is_confirmed,
        c.confirmed_time,
        c.aff_sid,
        c.utm_source,
        c.utm_medium,
        c.utm_campaign,
        c.utm_content,
        c.order_time,
        c.approval_time,
        c.created_at,
        c.user_id,
        u.email as user_email,
        u.username as user_username,
        u.full_name as user_full_name
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
      ORDER BY c.order_time DESC, c.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const limitParam = paramCount;
    const offsetParam = paramCount + 1;
    values.push(limit, offset);
    paramCount += 2;

    const ordersResult = await pool.query(ordersQuery, values);

    // Get statistics for current filter
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(c.order_amount), 0) as total_order_amount,
        COALESCE(SUM(c.commission), 0) as total_commission,
        -- Total cashback directly from conversions table
        COALESCE(SUM(c.cashback_amount), 0) as total_cashback,
        -- Status breakdown
        COUNT(CASE WHEN c.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN c.status = 'rejected' THEN 1 END) as rejected_count,
        -- Confirmed status breakdown
        COUNT(CASE WHEN c.is_confirmed = 1 THEN 1 END) as confirmed_count,
        COUNT(CASE WHEN c.is_confirmed = 0 THEN 1 END) as not_confirmed_count,
        -- Amount breakdown by status
        COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.order_amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.order_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN c.status = 'rejected' THEN c.order_amount ELSE 0 END), 0) as rejected_amount,
        -- Commission breakdown by status
        COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.commission ELSE 0 END), 0) as approved_status_commission,
        COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.commission ELSE 0 END), 0) as pending_status_commission,
        COALESCE(SUM(CASE WHEN c.status = 'rejected' THEN c.commission ELSE 0 END), 0) as rejected_status_commission,
        -- Commission breakdown by confirmed status
        COALESCE(SUM(CASE WHEN c.is_confirmed = 1 THEN c.commission ELSE 0 END), 0) as confirmed_commission,
        COALESCE(SUM(CASE WHEN c.is_confirmed = 0 THEN c.commission ELSE 0 END), 0) as not_confirmed_commission
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    `;

    let stats = {};
    try {
      const statsResult = await pool.query(statsQuery, values.slice(0, -2)); // Remove limit and offset
      stats = statsResult.rows[0] || {};
    } catch (statsError) {
      console.error('Stats query error:', statsError.message);
      stats = {
        total: 0,
        total_order_amount: 0,
        total_commission: 0,
        total_cashback: 0,
        approved_count: 0,
        pending_count: 0,
        rejected_count: 0,
        confirmed_count: 0,
        not_confirmed_count: 0,
        approved_amount: 0,
        pending_amount: 0,
        rejected_amount: 0,
        approved_status_commission: 0,
        pending_status_commission: 0,
        rejected_status_commission: 0,
        confirmed_commission: 0,
        not_confirmed_commission: 0
      };
    }

    res.json({
      success: true,
      orders: ordersResult.rows.map(row => ({
        id: row.id,
        accesstradeId: row.accesstrade_id,
        orderCode: row.order_code,
        merchantId: row.merchant_id,
        merchantName: row.merchant_name,
        orderAmount: parseFloat(row.order_amount),
        commission: parseFloat(row.commission),
        cashbackAmount: parseFloat(row.cashback_amount),
        status: row.status,
        isConfirmed: row.is_confirmed,
        confirmedTime: row.confirmed_time,
        affSid: row.aff_sid,
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        utmContent: row.utm_content,
        orderTime: row.order_time,
        approvalTime: row.approval_time,
        createdAt: row.created_at,
        userId: row.user_id,
        userEmail: row.user_email,
        userUsername: row.user_username,
        userFullName: row.user_full_name
      })),
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        total: parseInt(stats.total),
        totalOrderAmount: parseFloat(stats.total_order_amount),
        totalCommission: parseFloat(stats.total_commission),
        totalCashback: parseFloat(stats.total_cashback),
        // Status breakdown
        statusBreakdown: {
          approved: {
            count: parseInt(stats.approved_count) || 0,
            amount: parseFloat(stats.approved_amount) || 0,
            commission: parseFloat(stats.approved_status_commission) || 0
          },
          pending: {
            count: parseInt(stats.pending_count) || 0,
            amount: parseFloat(stats.pending_amount) || 0,
            commission: parseFloat(stats.pending_status_commission) || 0
          },
          rejected: {
            count: parseInt(stats.rejected_count) || 0,
            amount: parseFloat(stats.rejected_amount) || 0,
            commission: parseFloat(stats.rejected_status_commission) || 0
          }
        },
        // Confirmed status breakdown
        confirmedBreakdown: {
          confirmed: {
            count: parseInt(stats.confirmed_count) || 0,
            commission: parseFloat(stats.confirmed_commission) || 0
          },
          notConfirmed: {
            count: parseInt(stats.not_confirmed_count) || 0,
            commission: parseFloat(stats.not_confirmed_commission) || 0
          }
        }
      }
    });
  } catch (error) {
    logger.error('Get AT orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AccessTrade orders',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/check-conversions
 * Check and match conversions with clicks using UTM parameters
 * This replaces the old sync-conversions endpoint
 */
router.post('/check-conversions', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Check conversions triggered by admin', {
      adminId: req.userId
    });

    // Find all conversions without click_id
    const unmatchedQuery = `
      SELECT id, accesstrade_id, aff_sid, utm_campaign, utm_source
      FROM conversions
      WHERE click_id IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const unmatchedResult = await pool.query(unmatchedQuery);
    const unmatched = unmatchedResult.rows;

    logger.info(`Found ${unmatched.length} unmatched conversions`);

    const results = {
      total: unmatched.length,
      matched: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Try to match each conversion
    for (const conversion of unmatched) {
      try {
        const result = await trackingService.matchConversionWithClick(conversion.id);

        if (result.status === 'matched') {
          results.matched++;
          results.details.push({
            conversionId: conversion.id,
            accesstradeId: conversion.accesstrade_id,
            status: 'matched',
            clickId: result.clickId,
            userId: result.userId
          });
        } else if (result.status === 'skipped') {
          results.skipped++;
          results.details.push({
            conversionId: conversion.id,
            accesstradeId: conversion.accesstrade_id,
            status: 'skipped',
            reason: result.reason
          });
        } else {
          results.errors++;
          results.details.push({
            conversionId: conversion.id,
            accesstradeId: conversion.accesstrade_id,
            status: 'error',
            reason: result.reason
          });
        }

        // Small delay to avoid overwhelming database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        results.errors++;
        results.details.push({
          conversionId: conversion.id,
          status: 'error',
          reason: error.message
        });
      }
    }

    logger.success('Check conversions completed', results);

    res.json({
      success: true,
      message: 'Conversion check completed',
      results: {
        total: results.total,
        matched: results.matched,
        skipped: results.skipped,
        errors: results.errors
      },
      details: results.details
    });
  } catch (error) {
    logger.error('Check conversions failed', {
      adminId: req.userId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check conversions'
    });
  }
});

// ============================================
// MERCHANTS CRUD OPERATIONS
// ============================================

/**
 * GET /api/admin/merchants
 * Get all merchants
 */
router.get('/merchants', authenticateAdmin, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const merchants = await Merchant.getAll(activeOnly);

    res.json({
      success: true,
      merchants: merchants
    });
  } catch (error) {
    logger.error('Get merchants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get merchants'
    });
  }
});

/**
 * GET /api/admin/merchant/:id
 * Get merchant by ID
 */
router.get('/merchant/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const merchant = await Merchant.findById(id);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    res.json({
      success: true,
      merchant
    });
  } catch (error) {
    logger.error('Get merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get merchant'
    });
  }
});

/**
 * POST /api/admin/merchant
 * Create new merchant
 */
router.post('/merchant', authenticateAdmin, async (req, res) => {
  try {
    const {
      id,
      name,
      logo_url,
      campaign_id,
      commission_rate,
      policy_note,
      is_active,
      deep_link_base
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({
        success: false,
        message: 'ID and name are required'
      });
    }

    const merchant = await Merchant.create({
      id,
      name,
      logo_url,
      campaign_id,
      commission_rate,
      policy_note,
      is_active,
      deep_link_base
    });

    logger.success('Merchant created', {
      merchantId: merchant.id,
      merchantName: merchant.name,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Merchant created successfully',
      merchant
    });
  } catch (error) {
    logger.error('Create merchant error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create merchant'
    });
  }
});

/**
 * PUT /api/admin/merchant/:id
 * Update merchant
 */
router.put('/merchant/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const merchant = await Merchant.update(id, updates);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    logger.success('Merchant updated', {
      merchantId: id,
      merchantName: merchant.name,
      updates: Object.keys(updates),
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Merchant updated successfully',
      merchant
    });
  } catch (error) {
    logger.error('Update merchant error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update merchant'
    });
  }
});

/**
 * DELETE /api/admin/merchant/:id
 * Delete merchant
 */
router.delete('/merchant/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if merchant exists
    const merchant = await Merchant.findById(id);
    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Check if there are associated clicks or conversions
    const clicksQuery = await pool.query(
      'SELECT COUNT(*) as count FROM clicks WHERE merchant_id = $1',
      [id]
    );
    const clickCount = parseInt(clicksQuery.rows[0].count);

    if (clickCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete merchant with ${clickCount} associated clicks. Set as inactive instead.`
      });
    }

    const deleted = await Merchant.delete(id);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete merchant'
      });
    }

    logger.success('Merchant deleted', {
      merchantId: id,
      merchantName: merchant.name,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Merchant deleted successfully'
    });
  } catch (error) {
    logger.error('Delete merchant error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete merchant'
    });
  }
});

/**
 * POST /api/admin/sync-conversion-status
 * Sync conversion status from AccessTrade API
 * Updates existing conversions with latest status and confirmation data
 */
router.post('/sync-conversion-status', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    logger.info('Admin initiated conversion status sync', {
      adminId: req.userId,
      startDate,
      endDate
    });

    // Call the sync service
    const results = await trackingService.syncConversionStatus(
      new Date(startDate),
      new Date(endDate)
    );

    logger.success('Conversion status sync completed', {
      adminId: req.userId,
      results: {
        total: results.total,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors
      }
    });

    res.json({
      success: true,
      message: `Sync completed: ${results.updated} updated, ${results.skipped} skipped, ${results.errors} errors`,
      results
    });

  } catch (error) {
    logger.error('Conversion status sync error:', {
      error: error.message,
      stack: error.stack,
      adminId: req.userId
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync conversion status'
    });
  }
});

/**
 * POST /api/admin/sync-conversion-status-stream
 * Sync conversion status with real-time progress updates using SSE
 */
router.post('/sync-conversion-status-stream', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logger.info('Admin initiated conversion status sync with streaming', {
      adminId: req.userId,
      startDate,
      endDate
    });

    // Progress callback function
    const progressCallback = (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        ...progress
      })}\n\n`);
    };

    try {
      // Call the sync service with progress callback
      const results = await trackingService.syncConversionStatus(
        new Date(startDate),
        new Date(endDate),
        progressCallback
      );

      // Send final result
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        results
      })}\n\n`);

      logger.success('Conversion status sync completed', {
        adminId: req.userId,
        results: {
          total: results.total,
          updated: results.updated,
          skipped: results.skipped,
          errors: results.errors
        }
      });

    } catch (syncError) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: syncError.message
      })}\n\n`);
      logger.error('Sync error during streaming:', syncError);
    }

    res.end();

  } catch (error) {
    logger.error('Conversion status sync stream error:', {
      error: error.message,
      stack: error.stack,
      adminId: req.userId
    });

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to start sync'
      });
    }
  }
});

/**
 * POST /api/admin/tools/check-pending-orders
 * Check and update pending orders status from AccessTrade
 */
router.post('/tools/check-pending-orders', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Check pending orders triggered by admin', {
      adminId: req.userId
    });

    // Get all pending conversions
    const pendingQuery = `
      SELECT id, accesstrade_id, user_id, cashback_amount, status
      FROM conversions
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(pendingQuery);
    const pendingOrders = result.rows;

    logger.info(`Found ${pendingOrders.length} pending orders to check`);

    const results = {
      total: pendingOrders.length,
      updated: 0,
      notFound: 0,
      errors: 0,
      details: []
    };

    // Check each pending order
    for (const order of pendingOrders) {
      try {
        const orderDetails = await pendingOrdersUpdate.getOrderDetails(order.accesstrade_id);

        if (!orderDetails) {
          results.notFound++;
          results.details.push({
            orderId: order.accesstrade_id,
            status: 'not_found',
            message: 'Order not found in AccessTrade'
          });
          continue;
        }

        // Map AccessTrade status
        const newStatus = pendingOrdersUpdate.mapOrderStatus(orderDetails);

        // Only update if status changed
        if (newStatus !== 'pending') {
          const approvalTime = new Date();

          // Update conversion status
          await Conversion.updateStatus(order.id, newStatus, approvalTime);

          // Update user balance based on new status
          if (newStatus === 'approved') {
            // Move from pending to available
            await User.updateBalance(order.user_id, 'pending_to_available', order.cashback_amount);
          } else if (newStatus === 'rejected') {
            // Remove from pending
            await User.updateBalance(order.user_id, 'reject_pending', order.cashback_amount);
          }

          results.updated++;
          results.details.push({
            orderId: order.accesstrade_id,
            status: 'updated',
            oldStatus: 'pending',
            newStatus: newStatus
          });

          logger.info(`Updated order ${order.accesstrade_id}: pending → ${newStatus}`);
        }
      } catch (error) {
        results.errors++;
        results.details.push({
          orderId: order.accesstrade_id,
          status: 'error',
          error: error.message
        });
        logger.error('Error checking pending order', {
          orderId: order.accesstrade_id,
          error: error.message
        });
      }
    }

    logger.info('Check pending orders completed', results);

    res.json({
      success: true,
      message: `Checked ${results.total} pending orders`,
      ...results
    });
  } catch (error) {
    logger.error('Failed to check pending orders', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check pending orders'
    });
  }
});

/**
 * POST /api/admin/tools/retry-unmatched
 * Retry matching for unmatched clicks
 * Checks for clicks that haven't been matched with conversions and retries
 */
router.post('/tools/retry-unmatched', authenticateAdmin, async (req, res) => {
  try {
    const { daysOld = 1, limit = 100 } = req.body;

    logger.info('Retry unmatched clicks triggered by admin', {
      adminId: req.userId,
      daysOld,
      limit
    });

    const results = await retryService.retryUnmatchedClicks({ daysOld, limit });

    logger.success('Retry unmatched clicks completed', results);

    res.json({
      success: true,
      message: `Processed ${results.total} unmatched clicks`,
      ...results
    });
  } catch (error) {
    logger.error('Failed to retry unmatched clicks', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retry unmatched clicks'
    });
  }
});

/**
 * GET /api/admin/auto-sync/config
 * Get auto-sync configuration
 */
router.get('/auto-sync/config', authenticateAdmin, async (req, res) => {
  try {
    const config = await AutoSyncConfig.getConfig();
    const status = autoSyncService.getStatus();

    res.json({
      success: true,
      data: config,  // Frontend expects 'data' field
      status
    });
  } catch (error) {
    logger.error('Get auto-sync config error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get auto-sync config'
    });
  }
});

/**
 * GET /api/admin/tools/retry-stats
 * Get retry service statistics
 */
router.get('/tools/retry-stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await retryService.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get retry stats', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get retry stats'
    });
  }
});

/**
 * PUT /api/admin/auto-sync/config
 * Update auto-sync configuration
 */
router.put('/auto-sync/config', authenticateAdmin, async (req, res) => {
  try {
    const { enabled, cron_schedule, sync_days } = req.body;

    // Validate inputs
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid enabled value'
      });
    }

    if (sync_days !== undefined && (sync_days < 1 || sync_days > 30)) {
      return res.status(400).json({
        success: false,
        message: 'Sync days must be between 1 and 30'
      });
    }

    const updated = await autoSyncService.updateConfig({
      enabled,
      cron_schedule,
      sync_days
    });

    logger.info('Auto-sync config updated', {
      enabled: updated.enabled,
      schedule: updated.cron_schedule,
      syncDays: updated.sync_days,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Auto-sync configuration updated successfully',
      data: updated
    });
  } catch (error) {
    logger.error('Update auto-sync config error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update auto-sync config'
    });
  }
});

/**
 * POST /api/admin/auto-sync/config
 * Update auto-sync configuration (alias for PUT, frontend uses POST)
 */
router.post('/auto-sync/config', authenticateAdmin, async (req, res) => {
  try {
    const { enabled, cron_schedule, sync_days } = req.body;

    // Validate inputs
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid enabled value'
      });
    }

    if (sync_days !== undefined && (sync_days < 1 || sync_days > 30)) {
      return res.status(400).json({
        success: false,
        message: 'Sync days must be between 1 and 30'
      });
    }

    const updated = await autoSyncService.updateConfig({
      enabled,
      cron_schedule,
      sync_days
    });

    logger.info('Auto-sync config updated via POST', {
      enabled: updated.enabled,
      schedule: updated.cron_schedule,
      syncDays: updated.sync_days,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Auto-sync configuration updated successfully',
      data: updated
    });
  } catch (error) {
    logger.error('Update auto-sync config error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update auto-sync config'
    });
  }
});

/**
 * POST /api/admin/auto-sync/run
 * Manually trigger auto-sync (run sync now)
 */
router.post('/auto-sync/run', authenticateAdmin, async (req, res) => {
  try {
    const { sync_days } = req.body;

    // Get config to use default sync_days if not provided
    const config = await AutoSyncConfig.getConfig();
    const days = sync_days || config.sync_days || 3;

    if (days < 1 || days > 30) {
      return res.status(400).json({
        success: false,
        message: 'Sync days must be between 1 and 30'
      });
    }

    logger.info('Manual auto-sync triggered', {
      syncDays: days,
      adminId: req.userId
    });

    // Import conversions directly
    const { syncConversions } = require('../jobs/syncConversions');
    const result = await syncConversions(days);

    logger.success('Manual auto-sync completed', {
      imported: result.imported,
      duplicates: result.duplicates,
      adminId: req.userId
    });

    // Update last run status in database
    const message = `Đã import ${result.imported} conversions, ${result.duplicates} trùng lặp`;
    await AutoSyncConfig.updateLastRun('success', message);

    res.json({
      success: true,
      message: `Đồng bộ thành công`,
      data: {
        imported: result.imported,
        duplicates: result.duplicates,
        skipped: result.skipped || 0,
        errors: result.errors || 0
      }
    });
  } catch (error) {
    logger.error('Manual auto-sync failed', {
      error: error.message,
      stack: error.stack
    });

    // Update last run status to error
    await AutoSyncConfig.updateLastRun('error', `Lỗi: ${error.message}`);

    res.status(500).json({
      success: false,
      message: `Lỗi đồng bộ: ${error.message}`
    });
  }
});

/**
 * GET /api/admin/tools/expiring-clicks
 * Get clicks that are expiring soon
 */
router.get('/tools/expiring-clicks', authenticateAdmin, async (req, res) => {
  try {
    const { days = 3, limit = 100 } = req.query;

    const expiringClicks = await retryService.getExpiringClicksReport(
      parseInt(days),
      parseInt(limit)
    );

    res.json({
      success: true,
      count: expiringClicks.length,
      expiringClicks
    });
  } catch (error) {
    logger.error('Failed to get expiring clicks', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get expiring clicks'
    });
  }
});

/**
 * POST /api/admin/auto-sync/test
 * Test auto-sync manually
 */
router.post('/auto-sync/test', authenticateAdmin, async (req, res) => {
  try {
    const { sync_days } = req.body;
    const days = sync_days || 2;

    if (days < 1 || days > 30) {
      return res.status(400).json({
        success: false,
        message: 'Sync days must be between 1 and 30'
      });
    }

    logger.info('Manual auto-sync test triggered', {
      syncDays: days,
      adminId: req.userId
    });

    const result = await autoSyncService.triggerManualSync(days);

    res.json({
      success: true,
      message: 'Manual sync completed successfully',
      result
    });
  } catch (error) {
    logger.error('Manual auto-sync test error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to run manual sync'
    });
  }
});

/**
 * GET /api/admin/tools/test-at-api
 * Test AccessTrade API connection for link generation
 */
router.get('/tools/test-at-api', authenticateAdmin, async (req, res) => {
  try {
    const result = await accessTradeLinkService.testConnection();

    res.json({
      success: result.success,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error('Failed to test AccessTrade API', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test API connection'
    });
  }
});

/**
 * POST /api/admin/cron/auto-sync
 * Endpoint for Vercel Cron Jobs to trigger auto-sync
 * Requires CRON_SECRET in Authorization header for security
 */
router.post('/cron/auto-sync', async (req, res) => {
  try {
    // Verify cron secret
    const cronSecret = req.headers.authorization?.replace('Bearer ', '');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || cronSecret !== expectedSecret) {
      logger.warn('Unauthorized cron request', {
        hasSecret: !!cronSecret,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get config to determine sync days
    const config = await AutoSyncConfig.getConfig();
    const syncDays = config.sync_days || 2;

    logger.info('Cron auto-sync triggered', {
      syncDays,
      ip: req.ip
    });

    const result = await autoSyncService.triggerManualSync(syncDays);

    res.json({
      success: true,
      message: 'Cron sync completed successfully',
      result
    });
  } catch (error) {
    logger.error('Cron auto-sync error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to run cron sync'
    });
  }
});

/**
 * GET /api/admin/tools/link-mode-status
 * Get current link generation mode status
 */
router.get('/tools/link-mode-status', authenticateAdmin, async (req, res) => {
  try {
    const useApiMode = process.env.USE_ACCESSTRADE_API === 'true';
    const apiAvailable = accessTradeLinkService.isAvailable();

    res.json({
      success: true,
      data: {
        currentMode: useApiMode && apiAvailable ? 'api' : 'diy',
        apiModeEnabled: useApiMode,
        apiAvailable: apiAvailable,
        apiToken: accessTradeLinkService.accessToken ? 'configured' : 'not_configured',
        recommendation: !apiAvailable
          ? 'Configure ACCESSTRADE_ACCESS_TOKEN in .env file'
          : useApiMode
            ? 'Using AccessTrade API (recommended)'
            : 'Using DIY mode (set USE_ACCESSTRADE_API=true to enable API)'
      }
    });
  } catch (error) {
    logger.error('Failed to get link mode status', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get status'
    });
  }
});

// ===========================
// MONITORING DASHBOARD
// ===========================

/**
 * GET /api/admin/monitoring/metrics
 * Get comprehensive monitoring metrics for tracking performance
 */
router.get('/monitoring/metrics', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7; // Default to 7 days

    // Get conversion match rate trends
    const matchRateQuery = `
      SELECT
        DATE(c.clicked_at) as date,
        COUNT(*) as total_clicks,
        COUNT(co.id) as matched_conversions,
        ROUND(COUNT(co.id)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as match_rate
      FROM clicks c
      LEFT JOIN conversions co ON c.id = co.click_id
      WHERE c.clicked_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(c.clicked_at)
      ORDER BY date DESC
    `;

    // Get match method breakdown
    // Match priority (from trackingService.js:218-265):
    // Conversion from AccessTrade has: utm_content, sub2 (via aff_sid), aff_sid
    // Click has: utm_content (=click.id), sub2 (=click.id), aff_sid
    // Match method = which parameter linked conversion to click
    const matchMethodQuery = `
      SELECT
        CASE
          -- Priority 1: Matched by utm_content
          -- Both conversion and click have utm_content, and they match
          WHEN co.utm_content IS NOT NULL
               AND c.utm_content IS NOT NULL
               AND co.utm_content = c.utm_content THEN 'utm_content'
          -- Priority 2: Matched by sub2
          -- Conversion came via sub2/aff_sid that matches click's sub2
          WHEN c.sub2 IS NOT NULL
               AND c.sub2 = c.id::text
               AND (co.utm_content IS NULL OR co.utm_content != c.utm_content)
               THEN 'sub2'
          -- Priority 3: Matched by aff_sid (fallback)
          WHEN co.aff_sid IS NOT NULL
               AND c.aff_sid IS NOT NULL
               AND co.aff_sid = c.aff_sid
               AND (co.utm_content IS NULL OR co.utm_content != c.utm_content)
               AND (c.sub2 IS NULL OR c.sub2 != c.id::text)
               THEN 'aff_sid'
          ELSE 'unknown'
        END as match_method,
        COUNT(*) as count
      FROM conversions co
      JOIN clicks c ON co.click_id = c.id
      WHERE co.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY match_method
    `;

    // Get link generation mode distribution
    const linkModeQuery = `
      SELECT
        CASE
          WHEN link_source = 'api' THEN 'api'
          WHEN link_source = 'api-fallback' THEN 'api-fallback'
          WHEN link_source = 'tiktok-api' THEN 'tiktok-api'
          WHEN link_source = 'tiktok-api-fallback' THEN 'tiktok-api-fallback'
          WHEN link_source = 'deeplink' THEN 'deeplink'
          WHEN link_source = 'deeplink-fallback' THEN 'deeplink-fallback'
          WHEN link_source IN ('diy', 'diy-fallback') THEN link_source
          WHEN affiliate_url LIKE '%go.isclix.com%' THEN 'deeplink'
          WHEN affiliate_url LIKE '%click.accesstrade.vn%' THEN 'api'
          ELSE 'deeplink'
        END as link_mode,
        COUNT(*) as count
      FROM clicks
      WHERE clicked_at >= NOW() - INTERVAL '${days} days'
      GROUP BY link_mode
    `;

    // Execute all queries in parallel
    const [matchRateResult, matchMethodResult, linkModeResult, retryStats] = await Promise.all([
      pool.query(matchRateQuery),
      pool.query(matchMethodQuery),
      pool.query(linkModeQuery),
      retryService.getStats()
    ]);

    // Get cron job status
    const cronStatus = cronJobsService.getStatus();

    // Calculate overall statistics
    const totalClicks = matchRateResult.rows.reduce((sum, row) => sum + parseInt(row.total_clicks), 0);
    const totalMatched = matchRateResult.rows.reduce((sum, row) => sum + parseInt(row.matched_conversions), 0);
    const overallMatchRate = totalClicks > 0 ? ((totalMatched / totalClicks) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalClicks,
          totalMatched,
          overallMatchRate: parseFloat(overallMatchRate),
          unmatchedClicks: retryStats.unmatchedClicks,
          expiringClicks: retryStats.expiringClicks
        },
        matchRateTrends: matchRateResult.rows.map(row => ({
          date: row.date,
          totalClicks: parseInt(row.total_clicks),
          matchedConversions: parseInt(row.matched_conversions),
          matchRate: parseFloat(row.match_rate)
        })),
        matchMethodBreakdown: matchMethodResult.rows.map(row => ({
          method: row.match_method,
          count: parseInt(row.count)
        })),
        linkModeDistribution: linkModeResult.rows.map(row => ({
          mode: row.link_mode,
          count: parseInt(row.count)
        })),
        cronJobsStatus: cronStatus,
        retryServiceStats: retryStats,
        period: {
          days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get monitoring metrics', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get monitoring metrics'
    });
  }
});

// ===========================
// CRON JOBS MANAGEMENT
// ===========================

/**
 * GET /api/admin/cron/status
 * Get status of all cron jobs
 */
router.get('/cron/status', authenticateAdmin, async (req, res) => {
  try {
    const status = cronJobsService.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get cron status', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get cron status'
    });
  }
});

/**
 * POST /api/admin/check-pending-orders
 * Check pending conversions status from AccessTrade
 */
router.post('/check-pending-orders', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Checking pending orders status', {
      adminId: req.userId
    });

    // Get all pending conversions from database
    const pendingQuery = `
      SELECT
        c.id,
        c.order_code,
        c.merchant_id,
        c.merchant_name,
        c.order_time,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        u.email as user_email
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.status = 'pending'
      ORDER BY c.order_time DESC
    `;

    const pendingResult = await pool.query(pendingQuery);
    const pendingOrders = pendingResult.rows;

    logger.info(`Found ${pendingOrders.length} pending orders to check`);

    if (pendingOrders.length === 0) {
      return res.json({
        success: true,
        message: 'No pending orders to check',
        results: {
          total: 0,
          approved: [],
          stillPending: [],
          rejected: [],
          errors: []
        }
      });
    }

    // Fetch conversions from AccessTrade for the date range covering all pending orders
    // AccessTrade API requires date range < 31 days, so we need to split into chunks
    const oldestOrder = pendingOrders[pendingOrders.length - 1];
    const newestOrder = pendingOrders[0];

    const fullStartDate = new Date(oldestOrder.order_time);
    fullStartDate.setDate(fullStartDate.getDate() - 1); // Add 1 day buffer

    const fullEndDate = new Date(newestOrder.order_time);
    fullEndDate.setDate(fullEndDate.getDate() + 1); // Add 1 day buffer

    logger.info('Fetching conversions from AccessTrade in chunks', {
      fullStartDate: fullStartDate.toISOString(),
      fullEndDate: fullEndDate.toISOString()
    });

    // Fetch all pages of conversions in 30-day chunks
    let allConversions = [];
    let currentStartDate = new Date(fullStartDate);

    while (currentStartDate < fullEndDate) {
      // Calculate chunk end date (30 days from start, or fullEndDate if sooner)
      let chunkEndDate = new Date(currentStartDate);
      chunkEndDate.setDate(chunkEndDate.getDate() + 30);

      if (chunkEndDate > fullEndDate) {
        chunkEndDate = fullEndDate;
      }

      logger.info('Fetching chunk', {
        chunkStart: currentStartDate.toISOString(),
        chunkEnd: chunkEndDate.toISOString()
      });

      // Fetch all pages for this chunk
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await accessTradeService.getConversions(currentStartDate, chunkEndDate, {
          page: currentPage,
          limit: 300
        });

        allConversions = allConversions.concat(response.data);

        if (currentPage >= response.pagination.totalPages) {
          hasMorePages = false;
        } else {
          currentPage++;
        }
      }

      // Move to next chunk
      currentStartDate = new Date(chunkEndDate);
      currentStartDate.setSeconds(currentStartDate.getSeconds() + 1); // Add 1 second to avoid overlap
    }

    logger.info(`Fetched ${allConversions.length} conversions from AccessTrade`);

    // Create a map of order_code to status from AccessTrade
    const atOrderMap = new Map();
    allConversions.forEach(order => {
      const orderCode = order.order_id || order._id;
      if (orderCode) {
        atOrderMap.set(orderCode.toString(), {
          status: order.is_confirmed, // 0: Pending, 1: Approved, 2: Rejected
          order: order
        });
      }
    });

    // Check each pending order
    const results = {
      total: pendingOrders.length,
      approved: [],
      stillPending: [],
      rejected: [],
      errors: []
    };

    for (const pendingOrder of pendingOrders) {
      try {
        const orderCode = pendingOrder.order_code;
        const atOrder = atOrderMap.get(orderCode.toString());

        if (!atOrder) {
          // Order not found in AccessTrade
          results.errors.push({
            id: pendingOrder.id,
            order_code: orderCode,
            merchant_name: pendingOrder.merchant_name,
            reason: 'Order not found in AccessTrade'
          });
          continue;
        }

        const atStatus = atOrder.status;

        if (atStatus === 1) {
          // Approved on AccessTrade
          results.approved.push({
            id: pendingOrder.id,
            order_code: orderCode,
            merchant_name: pendingOrder.merchant_name,
            order_amount: pendingOrder.order_amount,
            cashback_amount: pendingOrder.cashback_amount,
            user_email: pendingOrder.user_email,
            order_time: pendingOrder.order_time
          });
        } else if (atStatus === 2) {
          // Rejected on AccessTrade
          results.rejected.push({
            id: pendingOrder.id,
            order_code: orderCode,
            merchant_name: pendingOrder.merchant_name,
            reason: 'Rejected on AccessTrade'
          });
        } else {
          // Still pending on AccessTrade
          results.stillPending.push({
            id: pendingOrder.id,
            order_code: orderCode,
            merchant_name: pendingOrder.merchant_name
          });
        }
      } catch (error) {
        logger.error('Error checking order', {
          orderId: pendingOrder.id,
          orderCode: pendingOrder.order_code,
          error: error.message
        });
        results.errors.push({
          id: pendingOrder.id,
          order_code: pendingOrder.order_code,
          merchant_name: pendingOrder.merchant_name,
          reason: error.message
        });
      }
    }

    logger.success('Pending orders check completed', {
      total: results.total,
      approved: results.approved.length,
      stillPending: results.stillPending.length,
      rejected: results.rejected.length,
      errors: results.errors.length
    });

    res.json({
      success: true,
      message: 'Check completed successfully',
      results
    });

  } catch (error) {
    logger.error('Check pending orders error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check pending orders'
    });
  }
});

/**
 * POST /api/admin/cron/start
 * Start/initialize all cron jobs
 */
router.post('/cron/start', authenticateAdmin, async (req, res) => {
  try {
    cronJobsService.initialize();
    const status = cronJobsService.getStatus();

    res.json({
      success: true,
      message: `Cron jobs started: ${status.jobsCount} jobs running`,
      data: status
    });
  } catch (error) {
    logger.error('Failed to start cron jobs', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start cron jobs'
    });
  }
});

/**
 * POST /api/admin/approve-pending-orders
 * Approve multiple pending orders at once
 */
router.post('/approve-pending-orders', authenticateAdmin, async (req, res) => {
  try {
    const { order_ids } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'order_ids array is required'
      });
    }

    logger.info('Batch approving pending orders', {
      adminId: req.userId,
      count: order_ids.length
    });

    const results = {
      total: order_ids.length,
      approved: 0,
      errors: []
    };

    for (const orderId of order_ids) {
      try {
        // Update conversion status to approved
        const updateQuery = `
          UPDATE conversions
          SET
            status = 'approved',
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;

        const result = await pool.query(updateQuery, [orderId]);

        if (result.rows.length > 0) {
          const conversion = result.rows[0];

          // Update user balance
          const balanceQuery = `
            UPDATE users
            SET balance = balance + $1
            WHERE id = $2
          `;
          await pool.query(balanceQuery, [conversion.cashback_amount, conversion.user_id]);

          results.approved++;

          logger.success('Order approved', {
            orderId,
            userId: conversion.user_id,
            cashback: conversion.cashback_amount
          });
        } else {
          results.errors.push({
            order_id: orderId,
            reason: 'Order not found'
          });
        }
      } catch (error) {
        logger.error('Error approving order', {
          orderId,
          error: error.message
        });
        results.errors.push({
          order_id: orderId,
          reason: error.message
        });
      }
    }

    logger.success('Batch approval completed', {
      approved: results.approved,
      errors: results.errors.length
    });

    res.json({
      success: true,
      message: `Approved ${results.approved} orders`,
      results
    });

  } catch (error) {
    logger.error('Batch approve error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve orders'
    });
  }
});

/**
 * POST /api/admin/cron/stop
 * Stop all cron jobs
 */
router.post('/cron/stop', authenticateAdmin, async (req, res) => {
  try {
    cronJobsService.stopAll();

    res.json({
      success: true,
      message: 'All cron jobs stopped'
    });
  } catch (error) {
    logger.error('Failed to stop cron jobs', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to stop cron jobs'
    });
  }
});

/**
 * POST /api/admin/cron/trigger/:jobName
 * Manually trigger a specific cron job
 */
router.post('/cron/trigger/:jobName', authenticateAdmin, async (req, res) => {
  try {
    const { jobName } = req.params;

    logger.info(`Admin manually triggering cron job: ${jobName}`, {
      adminId: req.user.id
    });

    const result = await cronJobsService.triggerJob(jobName);

    res.json({
      success: true,
      message: `Job '${jobName}' triggered successfully`,
      data: result
    });
  } catch (error) {
    logger.error('Failed to trigger cron job', {
      jobName: req.params.jobName,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to trigger job'
    });
  }
});

/**
 * GET /api/admin/check-single-order
 * Check single order status using order-products API
 */
router.get('/check-single-order', authenticateAdmin, async (req, res) => {
  try {
    const { order_code, merchant } = req.query;

    if (!order_code || !merchant) {
      return res.status(400).json({
        success: false,
        message: 'order_code and merchant are required'
      });
    }

    logger.info('Checking single order', {
      orderCode: order_code,
      merchant,
      adminId: req.userId
    });

    // Call AccessTrade order-products API
    const url = `/order-products?order_id=${encodeURIComponent(order_code)}&merchant=${encodeURIComponent(merchant)}`;

    try {
      const response = await accessTradeService.axiosInstance.get(url);

      logger.info('AccessTrade order-products response', {
        status: response.status,
        hasData: !!response.data,
        data: response.data
      });

      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        const orderItems = response.data.data;

        if (orderItems.length === 0) {
          return res.json({
            success: true,
            status: 'not_found',
            details: []
          });
        }

        // Check if all items are approved
        // An item is approved if quantity.approved > 0 or billing.approved > 0
        const allApproved = orderItems.every(item => {
          const qtyApproved = item.quantity?.approved > 0;
          const billingApproved = item.billing?.approved > 0;
          return qtyApproved || billingApproved;
        });

        // Check if any items are rejected
        const anyRejected = orderItems.some(item => {
          const qtyRejected = item.quantity?.reject > 0;
          const billingRejected = item.billing?.reject > 0;
          return qtyRejected || billingRejected;
        });

        // Sum all commissions from commission.approved
        const totalCommission = orderItems.reduce((sum, item) => {
          return sum + (parseFloat(item.commission?.approved || 0));
        }, 0);

        // Get confirmed time from first item (should be same for all items)
        const confirmedTime = orderItems[0]?.confirmed_time;

        // Determine status
        let status = 'pending';
        if (allApproved) {
          status = 'approved';
        } else if (anyRejected) {
          status = 'rejected';
        }

        res.json({
          success: true,
          status,
          totalCommission,
          confirmedTime,
          details: orderItems
        });
      } else {
        res.json({
          success: true,
          status: 'not_found',
          details: []
        });
      }
    } catch (apiError) {
      logger.warn('AccessTrade API error for single order', {
        orderCode: order_code,
        merchant,
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data
      });

      // If 404 or order not found, return not_found status
      if (apiError.response?.status === 404 || apiError.response?.data?.status === 'fail') {
        res.json({
          success: true,
          status: 'not_found',
          details: []
        });
      } else {
        throw apiError;
      }
    }

  } catch (error) {
    logger.error('Check single order error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check order'
    });
  }
});

/**
 * GET /api/admin/settings
 * Get all system settings
 */
router.get('/settings', authenticateAdmin, async (req, res) => {
  try {
    // Read from database for persistence (default: true for auto_cron_enabled)
    const autoCronEnabled = await SystemSettings.get('auto_cron_enabled', true);
    const apiModeEnabled = await SystemSettings.get('api_mode_enabled', false);

    const settings = {
      AUTO_CRON_ENABLED: autoCronEnabled ? 'true' : 'false',
      RETRY_CRON_SCHEDULE: process.env.RETRY_CRON_SCHEDULE || '0 */6 * * *',
      USE_ACCESSTRADE_API: apiModeEnabled ? 'true' : 'false',
      ACCESSTRADE_API_URL: process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn/v1',
      COMMISSION_SPLIT: process.env.COMMISSION_SPLIT || '0.7',
      PORT: process.env.PORT || '3007'
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get settings'
    });
  }
});

/**
 * POST /api/admin/settings/auto-cron
 * Toggle auto cron enabled
 */
router.post('/settings/auto-cron', authenticateAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;

    // Save to database for persistence across restarts
    await SystemSettings.set('auto_cron_enabled', enabled, req.userId);

    // Reload cron jobs to apply new setting immediately
    const status = await cronJobsService.reload();

    logger.info(`Auto cron jobs ${enabled ? 'enabled' : 'disabled'}`, {
      adminId: req.userId,
      enabled,
      jobsCount: status.jobsCount,
      isInitialized: status.isInitialized
    });

    res.json({
      success: true,
      message: enabled ? 'Đã bật Auto Cron Jobs' : 'Đã tắt Auto Cron Jobs',
      data: {
        enabled,
        status
      }
    });
  } catch (error) {
    logger.error('Update auto cron setting error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/cron-reload
 * Force reload cron jobs from database
 */
router.post('/settings/cron-reload', authenticateAdmin, async (req, res) => {
  try {
    logger.info('Force reloading cron jobs', { adminId: req.userId });

    const status = await cronJobsService.reload();

    res.json({
      success: true,
      message: 'Cron jobs đã được reload thành công',
      data: status
    });
  } catch (error) {
    logger.error('Reload cron jobs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reload cron jobs'
    });
  }
});

/**
 * POST /api/admin/settings/api-mode
 * Toggle API mode
 */
router.post('/settings/api-mode', authenticateAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;

    // Save to database for persistence across restarts
    await SystemSettings.set('api_mode_enabled', enabled, req.userId);

    // Update runtime value
    process.env.USE_ACCESSTRADE_API = enabled ? 'true' : 'false';

    logger.info('API mode setting updated', {
      enabled,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: enabled ? 'Đã bật API Mode' : 'Đã tắt API Mode (dùng DIY)'
    });
  } catch (error) {
    logger.error('Update API mode setting error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/retry-schedule
 * Update retry schedule
 */
router.post('/settings/retry-schedule', authenticateAdmin, async (req, res) => {
  try {
    const { schedule } = req.body;

    // Basic validation
    if (!schedule || typeof schedule !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid schedule format'
      });
    }

    // Update runtime value
    process.env.RETRY_CRON_SCHEDULE = schedule;

    logger.info('Retry schedule updated', {
      schedule,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
    });
  } catch (error) {
    logger.error('Update retry schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/api-token
 * Update API token
 */
router.post('/settings/api-token', authenticateAdmin, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Update runtime value
    process.env.ACCESSTRADE_ACCESS_TOKEN = token;

    logger.info('API token updated', {
      tokenLength: token.length,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
    });
  } catch (error) {
    logger.error('Update API token error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/api-url
 * Update API URL
 */
router.post('/settings/api-url', authenticateAdmin, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    // Update runtime value
    process.env.ACCESSTRADE_API_URL = url;

    logger.info('API URL updated', {
      url,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
    });
  } catch (error) {
    logger.error('Update API URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/commission-split
 * Update commission split
 */
router.post('/settings/commission-split', authenticateAdmin, async (req, res) => {
  try {
    const { split } = req.body;

    if (typeof split !== 'number' || split < 0 || split > 1) {
      return res.status(400).json({
        success: false,
        message: 'Split must be a number between 0 and 1'
      });
    }

    // Update runtime value
    process.env.COMMISSION_SPLIT = split.toString();

    logger.info('Commission split updated', {
      split,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
    });
  } catch (error) {
    logger.error('Update commission split error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update setting'
    });
  }
});

/**
 * POST /api/admin/settings/test-api
 * Test AccessTrade API connection
 */
router.post('/settings/test-api', authenticateAdmin, async (req, res) => {
  try {
    const accessTradeLinkService = require('../services/accessTradeLink');

    // Test API by fetching campaigns
    logger.info('Testing AccessTrade API connection...');
    const testResult = await accessTradeLinkService.testConnection();
    logger.info('Test result:', testResult);

    if (testResult.success) {
      res.json({
        success: true,
        message: testResult.message || 'API connection successful',
        data: {
          merchants: testResult.merchantsCount || 0,
          token: accessTradeLinkService.accessToken ? 'configured' : 'not_configured'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: testResult.message || 'API test failed',
        error: testResult.error
      });
    }
  } catch (error) {
    logger.error('Test API error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test API'
    });
  }
});

/**
 * GET /api/admin/monitoring/link-generation
 * Get link generation metrics for monitoring dashboard
 */
router.get('/monitoring/link-generation', authenticateAdmin, async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    // Calculate time range
    let hoursAgo;
    switch (period) {
      case '24h':
        hoursAgo = 24;
        break;
      case '7d':
        hoursAgo = 24 * 7;
        break;
      case '30d':
        hoursAgo = 24 * 30;
        break;
      default:
        hoursAgo = 24;
    }

    const startTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    // Get total clicks created in period
    const totalClicksQuery = `
      SELECT COUNT(*) as total
      FROM clicks
      WHERE clicked_at >= $1
    `;
    const totalClicksResult = await pool.query(totalClicksQuery, [startTime]);
    const totalClicks = parseInt(totalClicksResult.rows[0].total);

    // Get clicks with successful link generation (have affiliate_url)
    const successfulLinksQuery = `
      SELECT COUNT(*) as successful
      FROM clicks
      WHERE clicked_at >= $1
        AND affiliate_url IS NOT NULL
        AND aff_sid IS NOT NULL
    `;
    const successfulLinksResult = await pool.query(successfulLinksQuery, [startTime]);
    const successfulLinks = parseInt(successfulLinksResult.rows[0].successful);

    // Get clicks with missing tracking data (orphaned clicks)
    const orphanedClicksQuery = `
      SELECT COUNT(*) as orphaned
      FROM clicks
      WHERE clicked_at >= $1
        AND (affiliate_url IS NULL OR aff_sid IS NULL OR sub2 IS NULL)
    `;
    const orphanedClicksResult = await pool.query(orphanedClicksQuery, [startTime]);
    const orphanedClicks = parseInt(orphanedClicksResult.rows[0].orphaned);

    // Calculate success rate
    const successRate = totalClicks > 0
      ? ((successfulLinks / totalClicks) * 100).toFixed(2)
      : 0;

    // Calculate failure rate
    const failureRate = totalClicks > 0
      ? ((orphanedClicks / totalClicks) * 100).toFixed(2)
      : 0;

    // Get hourly breakdown for chart
    const hourlyQuery = `
      SELECT
        DATE_TRUNC('hour', clicked_at) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN affiliate_url IS NOT NULL AND aff_sid IS NOT NULL THEN 1 END) as successful,
        COUNT(CASE WHEN affiliate_url IS NULL OR aff_sid IS NULL OR sub2 IS NULL THEN 1 END) as failed
      FROM clicks
      WHERE clicked_at >= $1
      GROUP BY DATE_TRUNC('hour', clicked_at)
      ORDER BY hour DESC
      LIMIT 24
    `;
    const hourlyResult = await pool.query(hourlyQuery, [startTime]);

    const hourlyData = hourlyResult.rows.map(row => ({
      hour: row.hour,
      total: parseInt(row.total),
      successful: parseInt(row.successful),
      failed: parseInt(row.failed),
      successRate: row.total > 0 ? ((row.successful / row.total) * 100).toFixed(2) : 0
    }));

    res.json({
      success: true,
      data: {
        period,
        summary: {
          totalClicks,
          successfulLinks,
          orphanedClicks,
          successRate: parseFloat(successRate),
          failureRate: parseFloat(failureRate)
        },
        hourlyData
      }
    });

  } catch (error) {
    logger.error('Get link generation metrics error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get link generation metrics'
    });
  }
});

/**
 * GET /api/admin/monitoring/tiktok-api
 * Monitor TikTok Shop API performance and usage
 */
router.get('/monitoring/tiktok-api', authenticateAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    // Calculate time range
    let daysAgo;
    switch (period) {
      case '24h':
        daysAgo = 1;
        break;
      case '7d':
        daysAgo = 7;
        break;
      case '30d':
        daysAgo = 30;
        break;
      default:
        daysAgo = 7;
    }

    const startTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // Get TikTok Shop link statistics
    const tiktokStatsQuery = `
      SELECT
        COUNT(*) as total_links,
        COUNT(CASE WHEN link_source = 'tiktok-api' THEN 1 END) as api_links,
        COUNT(CASE WHEN link_source = 'diy-fallback' AND merchant_id = 'tiktok' THEN 1 END) as fallback_links,
        COUNT(CASE WHEN product_info IS NOT NULL THEN 1 END) as links_with_product_info
      FROM clicks
      WHERE clicked_at >= $1
        AND (merchant_id = 'tiktok' OR link_source = 'tiktok-api')
    `;

    const statsResult = await pool.query(tiktokStatsQuery, [startTime]);
    const stats = statsResult.rows[0];

    // Calculate success rate
    const totalLinks = parseInt(stats.total_links) || 0;
    const apiLinks = parseInt(stats.api_links) || 0;
    const fallbackLinks = parseInt(stats.fallback_links) || 0;
    const apiSuccessRate = totalLinks > 0 ? ((apiLinks / totalLinks) * 100).toFixed(2) : 0;
    const apiFailureRate = totalLinks > 0 ? ((fallbackLinks / totalLinks) * 100).toFixed(2) : 0;

    // Get daily breakdown
    const dailyQuery = `
      SELECT
        DATE(clicked_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN link_source = 'tiktok-api' THEN 1 END) as api_success,
        COUNT(CASE WHEN link_source = 'diy-fallback' THEN 1 END) as api_fallback,
        COUNT(CASE WHEN product_info IS NOT NULL THEN 1 END) as with_product_info
      FROM clicks
      WHERE clicked_at >= $1
        AND (merchant_id = 'tiktok' OR link_source = 'tiktok-api')
      GROUP BY DATE(clicked_at)
      ORDER BY date DESC
    `;

    const dailyResult = await pool.query(dailyQuery, [startTime]);
    const dailyData = dailyResult.rows.map(row => ({
      date: row.date,
      total: parseInt(row.total),
      apiSuccess: parseInt(row.api_success),
      apiFallback: parseInt(row.api_fallback),
      withProductInfo: parseInt(row.with_product_info),
      successRate: row.total > 0 ? ((row.api_success / row.total) * 100).toFixed(2) : 0
    }));

    // Get product info statistics
    const productInfoQuery = `
      SELECT
        COUNT(*) as total_products,
        AVG((product_info->>'commission'->>'rate')::numeric) as avg_commission_rate,
        SUM((product_info->>'price'->>'amount')::numeric) as total_product_value
      FROM clicks
      WHERE clicked_at >= $1
        AND product_info IS NOT NULL
        AND link_source = 'tiktok-api'
    `;

    const productInfoResult = await pool.query(productInfoQuery, [startTime]);
    const productStats = productInfoResult.rows[0];

    // Get conversion rate for TikTok links
    const conversionQuery = `
      SELECT
        COUNT(DISTINCT c.id) as total_clicks,
        COUNT(DISTINCT co.id) as conversions
      FROM clicks c
      LEFT JOIN conversions co ON c.id = co.click_id
      WHERE c.clicked_at >= $1
        AND (c.merchant_id = 'tiktok' OR c.link_source = 'tiktok-api')
    `;

    const conversionResult = await pool.query(conversionQuery, [startTime]);
    const conversionData = conversionResult.rows[0];
    const conversionRate = conversionData.total_clicks > 0
      ? ((conversionData.conversions / conversionData.total_clicks) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        period,
        summary: {
          totalLinks,
          apiLinks,
          fallbackLinks,
          apiSuccessRate: parseFloat(apiSuccessRate),
          apiFailureRate: parseFloat(apiFailureRate),
          linksWithProductInfo: parseInt(stats.links_with_product_info),
          conversionRate: parseFloat(conversionRate)
        },
        productMetrics: {
          totalProducts: parseInt(productStats.total_products) || 0,
          avgCommissionRate: parseFloat(productStats.avg_commission_rate) || 0,
          totalProductValue: parseFloat(productStats.total_product_value) || 0
        },
        dailyData,
        recommendations: getApiRecommendations(apiSuccessRate, fallbackLinks, totalLinks)
      }
    });

  } catch (error) {
    logger.error('Get TikTok API metrics error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get TikTok API metrics'
    });
  }
});

/**
 * Helper function to generate API recommendations
 */
function getApiRecommendations(successRate, fallbackCount, totalCount) {
  const recommendations = [];

  if (totalCount === 0) {
    recommendations.push({
      type: 'info',
      message: 'No TikTok Shop links generated yet. Start creating links to see metrics.'
    });
  } else {
    if (successRate < 50) {
      recommendations.push({
        type: 'warning',
        message: `Low API success rate (${successRate}%). Check AccessTrade API token configuration.`
      });
    }

    if (successRate >= 90) {
      recommendations.push({
        type: 'success',
        message: `Excellent API performance! ${successRate}% success rate.`
      });
    }

    if (fallbackCount > totalCount * 0.3) {
      recommendations.push({
        type: 'warning',
        message: `High fallback rate detected. ${fallbackCount} links fell back to DIY mode.`
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'TikTok Shop API performing normally.'
      });
    }
  }

  return recommendations;
}

// ========================================
// ACTIVITY LOGS ENDPOINTS
// ========================================

/**
 * GET /api/admin/activity-logs
 * Get activity logs with filters and pagination
 */
router.get('/activity-logs', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      activityType,
      userId,
      merchantId,
      status,
      dateFrom,
      dateTo
    } = req.query;

    const offset = (page - 1) * limit;
    const queryParams = [];
    let whereConditions = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (activityType) {
      whereConditions.push(`activity_type = $${paramIndex++}`);
      queryParams.push(activityType);
    }

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex++}`);
      queryParams.push(userId);
    }

    if (merchantId) {
      whereConditions.push(`merchant_id = $${paramIndex++}`);
      queryParams.push(merchantId);
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (dateFrom) {
      whereConditions.push(`ual.created_at >= $${paramIndex++}`);
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      // Add 23:59:59 to include the entire day
      whereConditions.push(`ual.created_at <= $${paramIndex++}::date + interval '1 day' - interval '1 second'`);
      queryParams.push(dateTo);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_activity_logs ual
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT
        ual.*,
        u.email as user_email,
        u.full_name as user_name,
        m.name as merchant_name
      FROM user_activity_logs ual
      LEFT JOIN users u ON ual.user_id = u.id
      LEFT JOIN merchants m ON ual.merchant_id = m.id
      ${whereClause}
      ORDER BY ual.created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;
    queryParams.push(limit, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: {
        logs: dataResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get activity logs'
    });
  }
});

/**
 * GET /api/admin/activity-logs/stats
 * Get activity logs statistics
 */
router.get('/activity-logs/stats', authenticateAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const queryParams = [];
    let whereConditions = [];
    let paramIndex = 1;

    if (dateFrom) {
      whereConditions.push(`ual.created_at >= $${paramIndex++}`);
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      // Add 23:59:59 to include the entire day
      whereConditions.push(`ual.created_at <= $${paramIndex++}::date + interval '1 day' - interval '1 second'`);
      queryParams.push(dateTo);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get overall stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_activities,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        AVG(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END)::INTEGER as avg_response_time,
        COUNT(CASE WHEN activity_type = 'link_generate_success' THEN 1 END) as total_links_generated
      FROM user_activity_logs ual
      ${whereClause}
    `;
    const statsResult = await pool.query(statsQuery, queryParams);

    // Get activity breakdown by type
    const breakdownQuery = `
      SELECT
        activity_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM user_activity_logs ual
      ${whereClause}
      GROUP BY activity_type
      ORDER BY count DESC
    `;
    const breakdownResult = await pool.query(breakdownQuery, queryParams);

    // Get top merchants
    const merchantsQuery = `
      SELECT
        m.id,
        m.name,
        COUNT(*) as activity_count
      FROM user_activity_logs ual
      JOIN merchants m ON ual.merchant_id = m.id
      ${whereClause}
      GROUP BY m.id, m.name
      ORDER BY activity_count DESC
      LIMIT 10
    `;
    const merchantsResult = await pool.query(merchantsQuery, queryParams);

    res.json({
      success: true,
      data: {
        overall: statsResult.rows[0],
        breakdown: breakdownResult.rows,
        topMerchants: merchantsResult.rows
      }
    });

  } catch (error) {
    logger.error('Get activity stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get activity stats'
    });
  }
});

/**
 * GET /api/admin/activity-logs/top-products
 * Get top products by link generation count
 */
router.get('/activity-logs/top-products', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 20, dateFrom, dateTo } = req.query;

    const queryParams = [limit];
    let paramIndex = 2;
    let dateConditions = '';

    if (dateFrom && dateTo) {
      dateConditions = `AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(dateFrom, dateTo);
    } else if (dateFrom) {
      dateConditions = `AND created_at >= $${paramIndex++}`;
      queryParams.push(dateFrom);
    } else if (dateTo) {
      dateConditions = `AND created_at <= $${paramIndex++}`;
      queryParams.push(dateTo);
    }

    const topProducts = await pool.query(`
      SELECT
        product_url,
        COUNT(*) as click_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_clicked
      FROM user_activity_logs
      WHERE activity_type = 'link_generate_success'
        AND product_url IS NOT NULL
        ${dateConditions}
      GROUP BY product_url
      ORDER BY click_count DESC
      LIMIT $1
    `, queryParams);

    res.json({
      success: true,
      data: topProducts.rows
    });

  } catch (error) {
    logger.error('Get top products error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get top products'
    });
  }
});

/**
 * DELETE /api/admin/activity-logs
 * Delete activity logs by date range
 */
router.delete('/activity-logs', authenticateAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'dateFrom and dateTo are required'
      });
    }

    const result = await pool.query(`
      DELETE FROM user_activity_logs
      WHERE created_at BETWEEN $1 AND $2
    `, [dateFrom, dateTo]);

    logger.info(`Deleted ${result.rowCount} activity logs from ${dateFrom} to ${dateTo}`);

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} activity logs`,
      deletedCount: result.rowCount
    });

  } catch (error) {
    logger.error('Delete activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete activity logs'
    });
  }
});

/**
 * POST /api/admin/activity-logs/cleanup
 * Manual cleanup of logs older than 90 days
 */
router.post('/activity-logs/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      DELETE FROM user_activity_logs
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
    `);

    logger.info(`Manual cleanup: Deleted ${result.rowCount} activity logs older than 90 days`);

    res.json({
      success: true,
      message: `Cleaned up ${result.rowCount} logs older than 90 days`,
      deletedCount: result.rowCount
    });

  } catch (error) {
    logger.error('Cleanup activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cleanup activity logs'
    });
  }
});

/**
 * POST /api/admin/conversions/sync-to-system
 * Sync missing cashback conversions from conversions to system_conversions
 */
router.post('/conversions/sync-to-system', authenticateAdmin, async (req, res) => {
  try {
    const startTime = Date.now();

    // Find conversions that have click_id (cashback orders) but not in system_conversions
    const query = `
      SELECT
        c.id as conversion_id,
        c.click_id,
        cl.user_id,
        c.merchant_id,
        c.merchant_name,
        c.order_code,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        c.status,
        c.order_time,
        c.created_at
      FROM conversions c
      INNER JOIN clicks cl ON c.click_id = cl.id
      LEFT JOIN system_conversions sc ON sc.at_conversion_id = c.id
      WHERE sc.id IS NULL
        AND cl.user_id IS NOT NULL
      ORDER BY c.order_time DESC
    `;

    const result = await pool.query(query);
    const missingConversions = result.rows;

    if (missingConversions.length === 0) {
      return res.json({
        success: true,
        message: 'Không có đơn hàng nào cần đồng bộ',
        synced: 0,
        duration: Date.now() - startTime
      });
    }

    // Insert missing conversions into system_conversions
    let syncedCount = 0;
    const errors = [];

    for (const conv of missingConversions) {
      try {
        await pool.query(`
          INSERT INTO system_conversions (
            at_conversion_id,
            user_id,
            click_id,
            merchant_id,
            merchant_name,
            order_code,
            order_amount,
            commission,
            cashback_amount,
            status,
            order_time,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (at_conversion_id) DO NOTHING
        `, [
          conv.conversion_id,
          conv.user_id,
          conv.click_id,
          conv.merchant_id,
          conv.merchant_name,
          conv.order_code,
          conv.order_amount,
          conv.commission,
          conv.cashback_amount,
          conv.status,
          conv.order_time,
          conv.created_at
        ]);

        syncedCount++;
      } catch (err) {
        errors.push({
          conversion_id: conv.conversion_id,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Đã đồng bộ ${syncedCount}/${missingConversions.length} đơn hàng`,
      synced: syncedCount,
      total: missingConversions.length,
      errors: errors.length > 0 ? errors : undefined,
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Sync to system conversions error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/conversions/sync-status
 * Sync status from conversions to system_conversions
 */
router.post('/conversions/sync-status', authenticateAdmin, async (req, res) => {
  try {
    const startTime = Date.now();

    // Update system_conversions status based on conversions table
    const query = `
      UPDATE system_conversions sc
      SET
        status = c.status,
        order_amount = c.order_amount,
        commission = c.commission,
        cashback_amount = c.cashback_amount,
        updated_at = NOW()
      FROM conversions c
      WHERE sc.at_conversion_id = c.id
        AND sc.status != c.status
      RETURNING sc.id, sc.order_code, sc.status as new_status, c.status as old_status
    `;

    const result = await pool.query(query);
    const updatedCount = result.rows.length;

    res.json({
      success: true,
      message: `Đã cập nhật ${updatedCount} đơn hàng`,
      updated: updatedCount,
      changes: result.rows.slice(0, 10), // Return first 10 changes
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =====================================================
// PAYMENT HISTORY MANAGEMENT
// =====================================================

/**
 * POST /api/admin/payment-history/create-period
 * Create payment history for all users for a specific period
 * Body: { payment_period: "YYYY-MM", reconciliation_date?: Date, status?: string }
 */
router.post('/payment-history/create-period', authenticateAdmin, async (req, res) => {
  try {
    const { payment_period, reconciliation_date, status } = req.body;

    if (!payment_period || !/^\d{4}-\d{2}$/.test(payment_period)) {
      return res.status(400).json({
        success: false,
        message: 'payment_period phải có định dạng YYYY-MM'
      });
    }

    const result = await paymentHistoryService.createPaymentHistoryForPeriod(
      payment_period,
      {
        reconciliationDate: reconciliation_date ? new Date(reconciliation_date) : new Date(),
        status: status || 'pending'
      }
    );

    // Log activity
    await ActivityLogger.log({
      userId: req.user.id,
      activityType: ACTIVITY_TYPES.PAYMENT_HISTORY_CREATED,
      description: `Tạo payment history cho kỳ ${payment_period}`,
      metadata: {
        payment_period,
        created: result.created,
        total_amount: result.totalAmount
      },
      req
    });

    res.json(result);

  } catch (error) {
    logger.error('Error creating payment history period', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể tạo payment history'
    });
  }
});

/**
 * GET /api/admin/payment-history
 * Get all payment history records with filters
 * Query params: period, status, user_id, limit, offset
 */
router.get('/payment-history', authenticateAdmin, async (req, res) => {
  try {
    const { period, status, user_id, limit, offset } = req.query;

    const query = `
      SELECT
        uph.*,
        u.full_name,
        u.email,
        COUNT(upd.id) as conversions_count
      FROM user_payment_history uph
      INNER JOIN users u ON u.id = uph.user_id
      LEFT JOIN user_payment_details upd ON upd.payment_history_id = uph.id
      WHERE 1=1
      ${period ? `AND uph.payment_period = '${period}'` : ''}
      ${status ? `AND uph.status = '${status}'` : ''}
      ${user_id ? `AND uph.user_id = '${user_id}'` : ''}
      GROUP BY uph.id, u.full_name, u.email
      ORDER BY uph.payment_period DESC, uph.created_at DESC
      LIMIT ${limit || 100} OFFSET ${offset || 0}
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error getting payment history', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải payment history'
    });
  }
});

/**
 * GET /api/admin/payment-history/summary
 * Get payment history summary for admin dashboard
 * Query params: period, status
 */
router.get('/payment-history/summary', authenticateAdmin, async (req, res) => {
  try {
    const { period, status } = req.query;

    const summary = await paymentHistoryService.getAdminSummary({ period, status });

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Error getting payment summary', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải thống kê'
    });
  }
});

/**
 * GET /api/admin/payment-history/:id
 * Get payment history detail by ID
 */
router.get('/payment-history/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const paymentHistory = await UserPaymentHistory.getById(id);

    if (!paymentHistory) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy payment history'
      });
    }

    res.json({
      success: true,
      data: paymentHistory
    });

  } catch (error) {
    logger.error('Error getting payment history detail', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải chi tiết'
    });
  }
});

/**
 * POST /api/admin/payment-history/:id/process
 * Process payment (admin confirms payment)
 * Body: { payment_method: string, payment_details: object }
 */
router.post('/payment-history/:id/process', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, payment_details } = req.body;

    const result = await paymentHistoryService.processPayment(id, {
      paymentMethod: payment_method || 'bank_transfer',
      paymentDetails: payment_details || {}
    });

    // Log activity
    await ActivityLogger.log({
      userId: req.user.id,
      activityType: ACTIVITY_TYPES.PAYMENT_PROCESSED,
      description: `Xác nhận thanh toán ID: ${id}`,
      metadata: {
        payment_history_id: id,
        amount: result.amount,
        payment_method
      },
      req
    });

    res.json(result);

  } catch (error) {
    logger.error('Error processing payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể xử lý thanh toán'
    });
  }
});

/**
 * POST /api/admin/payment-history/:id/cancel
 * Cancel payment history
 * Body: { reason: string }
 */
router.post('/payment-history/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await paymentHistoryService.cancelPayment(id, reason || '');

    // Log activity
    await ActivityLogger.log({
      userId: req.user.id,
      activityType: ACTIVITY_TYPES.PAYMENT_CANCELLED,
      description: `Hủy payment ID: ${id}`,
      metadata: {
        payment_history_id: id,
        reason
      },
      req
    });

    res.json(result);

  } catch (error) {
    logger.error('Error cancelling payment', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể hủy payment'
    });
  }
});

/**
 * PUT /api/admin/payment-history/:id
 * Update payment history
 * Body: { status, payment_method, payment_details, etc. }
 */
router.put('/payment-history/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updated = await UserPaymentHistory.update(id, updateData);

    // Log activity
    await ActivityLogger.log({
      userId: req.user.id,
      activityType: ACTIVITY_TYPES.PAYMENT_UPDATED,
      description: `Cập nhật payment ID: ${id}`,
      metadata: {
        payment_history_id: id,
        changes: updateData
      },
      req
    });

    res.json({
      success: true,
      data: updated,
      message: 'Cập nhật thành công'
    });

  } catch (error) {
    logger.error('Error updating payment history', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể cập nhật'
    });
  }
});

/**
 * DELETE /api/admin/payment-history/:id
 * Delete payment history (cascade deletes details)
 */
router.delete('/payment-history/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if payment is already paid
    const payment = await UserPaymentHistory.getById(id);
    if (payment && payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa payment đã được thanh toán'
      });
    }

    await UserPaymentHistory.delete(id);

    // Log activity
    await ActivityLogger.log({
      userId: req.user.id,
      activityType: ACTIVITY_TYPES.PAYMENT_DELETED,
      description: `Xóa payment ID: ${id}`,
      metadata: {
        payment_history_id: id
      },
      req
    });

    res.json({
      success: true,
      message: 'Xóa thành công'
    });

  } catch (error) {
    logger.error('Error deleting payment history', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể xóa'
    });
  }
});

// ===================================================================
// PHASE 3: AUTO-SYNC HISTORY & MONITORING ENDPOINTS
// ===================================================================

/**
 * GET /api/admin/auto-sync/history
 * Get recent sync history with pagination
 * Query params: page (default 1), limit (default 20)
 */
router.get('/auto-sync/history', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await AutoSyncHistory.getRecent(limit, offset);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error fetching sync history', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy lịch sử sync'
    });
  }
});

/**
 * GET /api/admin/auto-sync/history/:sessionId/changes
 * Get detailed changes for a specific sync session
 */
router.get('/auto-sync/history/:sessionId/changes', authenticateAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const changes = await AutoSyncHistory.getChanges(sessionId, limit);

    res.json({
      success: true,
      data: changes
    });
  } catch (error) {
    logger.error('Error fetching sync changes', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy chi tiết thay đổi'
    });
  }
});

/**
 * GET /api/admin/auto-sync/stats
 * Get sync statistics for a date range
 */
router.get('/auto-sync/stats', authenticateAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await AutoSyncHistory.getStats(start, end);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching sync stats', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy thống kê sync'
    });
  }
});

// ===================================================================
// EMAIL LOGS MANAGEMENT ENDPOINTS
// ===================================================================

/**
 * GET /api/admin/email-logs/stats
 * Get email logs statistics
 */
router.get('/email-logs/stats', authenticateAdmin, async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
        COUNT(DISTINCT user_id) as unique_users
      FROM email_logs
      WHERE sent_at >= NOW() - INTERVAL '7 days'
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      total: parseInt(stats.total) || 0,
      sent: parseInt(stats.sent) || 0,
      failed: parseInt(stats.failed) || 0,
      skipped: parseInt(stats.skipped) || 0,
      uniqueUsers: parseInt(stats.unique_users) || 0
    });

  } catch (error) {
    logger.error('Error fetching email stats', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch email stats'
    });
  }
});

/**
 * GET /api/admin/email-logs
 * Get email logs with filters and pagination
 */
router.get('/email-logs', authenticateAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      email_type,
      status,
      email,
      date_from,
      date_to
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const queryParams = [];
    let whereConditions = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (email_type) {
      whereConditions.push(`email_type = $${paramIndex++}`);
      queryParams.push(email_type);
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (email) {
      whereConditions.push(`email_to ILIKE $${paramIndex++}`);
      queryParams.push(`%${email}%`);
    }

    if (date_from) {
      whereConditions.push(`sent_at >= $${paramIndex++}`);
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push(`sent_at <= $${paramIndex++}::date + interval '1 day' - interval '1 second'`);
      queryParams.push(date_to);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM email_logs
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT *
      FROM email_logs
      ${whereClause}
      ORDER BY sent_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;
    queryParams.push(parseInt(limit), offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      logs: dataResult.rows,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    logger.error('Error fetching email logs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch email logs'
    });
  }
});

/**
 * GET /api/admin/email-logs/:id
 * Get single email log by ID
 */
router.get('/email-logs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM email_logs WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Error fetching email log', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch email log'
    });
  }
});

/**
 * DELETE /api/admin/email-logs/cleanup
 * Cleanup old email logs (older than specified days)
 */
router.delete('/email-logs/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const { days = 90 } = req.query;

    const result = await pool.query(`
      DELETE FROM email_logs
      WHERE sent_at < NOW() - INTERVAL '${parseInt(days)} days'
    `);

    logger.info(`Cleaned up ${result.rowCount} email logs older than ${days} days`);

    res.json({
      success: true,
      deleted: result.rowCount,
      message: `Cleaned up ${result.rowCount} email logs`
    });

  } catch (error) {
    logger.error('Error cleaning up email logs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cleanup email logs'
    });
  }
});

/**
 * POST /api/admin/email-logs/retry-failed
 * Retry failed emails from last 24 hours
 * NOTE: This requires implementing email retry logic
 */
router.post('/email-logs/retry-failed', authenticateAdmin, async (req, res) => {
  try {
    // Get failed emails from last 24 hours
    const failedEmailsResult = await pool.query(`
      SELECT * FROM email_logs
      WHERE status = 'failed'
        AND sent_at >= NOW() - INTERVAL '24 hours'
      ORDER BY sent_at DESC
    `);

    const failedEmails = failedEmailsResult.rows;

    logger.info(`Found ${failedEmails.length} failed emails to retry`);

    // For now, just return count
    // TODO: Implement actual retry logic with EmailService
    res.json({
      success: true,
      retried: 0,
      total: failedEmails.length,
      message: 'Email retry feature coming soon'
    });

  } catch (error) {
    logger.error('Error retrying failed emails', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retry emails'
    });
  }
});

/**
 * GET /api/admin/email-logs/export
 * Export email logs to CSV
 */
router.get('/email-logs/export', authenticateAdmin, async (req, res) => {
  try {
    const {
      email_type,
      status,
      email,
      date_from,
      date_to
    } = req.query;

    const queryParams = [];
    let whereConditions = [];
    let paramIndex = 1;

    // Build WHERE conditions (same as list endpoint)
    if (email_type) {
      whereConditions.push(`email_type = $${paramIndex++}`);
      queryParams.push(email_type);
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (email) {
      whereConditions.push(`email_to ILIKE $${paramIndex++}`);
      queryParams.push(`%${email}%`);
    }

    if (date_from) {
      whereConditions.push(`sent_at >= $${paramIndex++}`);
      queryParams.push(date_from);
    }

    if (date_to) {
      whereConditions.push(`sent_at <= $${paramIndex++}::date + interval '1 day' - interval '1 second'`);
      queryParams.push(date_to);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const dataQuery = `
      SELECT
        id,
        sent_at,
        email_to,
        email_type,
        subject,
        status,
        error_message,
        context_type,
        context_id
      FROM email_logs
      ${whereClause}
      ORDER BY sent_at DESC
      LIMIT 5000
    `;
    const result = await pool.query(dataQuery, queryParams);

    // Convert to CSV
    const headers = ['ID', 'Sent At', 'Email To', 'Type', 'Subject', 'Status', 'Error', 'Context Type', 'Context ID'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      const values = [
        row.id,
        row.sent_at,
        `"${row.email_to}"`,
        row.email_type,
        `"${row.subject}"`,
        row.status,
        `"${row.error_message || ''}"`,
        row.context_type || '',
        row.context_id || ''
      ];
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="email-logs-${Date.now()}.csv"`);
    res.send(csvContent);

  } catch (error) {
    logger.error('Error exporting email logs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export email logs'
    });
  }
});

/**
 * GET /api/admin/smtp/config
 * Get SMTP configuration (password masked)
 */
router.get('/smtp/config', authenticateAdmin, async (req, res) => {
  try {
    const SystemSettings = require('../services/systemSettings');

    // Load SMTP settings from database
    const host = await SystemSettings.get('smtp_host', '');
    const port = await SystemSettings.get('smtp_port', '587');
    const user = await SystemSettings.get('smtp_user', '');
    const passwordEncrypted = await SystemSettings.get('smtp_password_encrypted', '');
    const from = await SystemSettings.get('smtp_from', 'ChatChiu Cashback <noreply@chatchiu.com>');

    res.json({
      success: true,
      data: {
        host: host || '',
        port: parseInt(port) || 587,
        user: user || '',
        password_set: !!passwordEncrypted, // Don't return actual password
        from: from || 'ChatChiu Cashback <noreply@chatchiu.com>'
      }
    });

  } catch (error) {
    logger.error('Error loading SMTP config', {
      error: error.message,
      adminId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load SMTP config'
    });
  }
});

/**
 * PUT /api/admin/smtp/config
 * Update SMTP configuration
 */
router.put('/smtp/config', authenticateAdmin, async (req, res) => {
  try {
    const SystemSettings = require('../services/systemSettings');
    const encryption = require('../utils/encryption');
    const { host, port, user, password, from } = req.body;

    // Validation
    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'SMTP host is required'
      });
    }

    if (!port || isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        message: 'Invalid SMTP port (must be 1-65535)'
      });
    }

    if (!user || typeof user !== 'string' || !user.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Valid SMTP user email is required'
      });
    }

    if (!from || typeof from !== 'string' || from.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'SMTP from is required'
      });
    }

    logger.info('Updating SMTP configuration', {
      adminId: req.userId,
      host,
      port,
      user,
      hasPassword: !!password
    });

    // Save settings to database
    await SystemSettings.set('smtp_host', host.trim(), req.userId);
    await SystemSettings.set('smtp_port', port.toString(), req.userId);
    await SystemSettings.set('smtp_user', user.trim(), req.userId);
    await SystemSettings.set('smtp_from', from.trim(), req.userId);

    // Encrypt and save password if provided
    if (password && password.length > 0) {
      const encryptedPassword = encryption.encrypt(password);
      await SystemSettings.set('smtp_password_encrypted', encryptedPassword, req.userId);
      logger.info('SMTP password updated and encrypted');
    }

    logger.info('SMTP configuration updated successfully', {
      adminId: req.userId
    });

    // Reinitialize EmailService with new config
    const EmailService = require('../services/EmailService');
    await EmailService.reinitialize();

    res.json({
      success: true,
      message: 'SMTP configuration updated successfully',
      data: {
        host: host.trim(),
        port: parseInt(port),
        user: user.trim(),
        password_set: !!password,
        from: from.trim()
      }
    });

  } catch (error) {
    logger.error('Error updating SMTP config', {
      error: error.message,
      adminId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update SMTP config'
    });
  }
});

/**
 * POST /api/admin/email-test
 * Send test email to verify SMTP configuration
 */
router.post('/email-test', authenticateAdmin, async (req, res) => {
  try {
    const EmailService = require('../services/EmailService');
    const { pool } = require('../config/database');
    const { to, subject, content } = req.body;

    // Get admin email from database
    const adminResult = await pool.query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [req.userId]
    );

    if (!adminResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found'
      });
    }

    const admin = adminResult.rows[0];

    // Use custom recipient if provided, otherwise use admin email
    const testEmailTo = to && to.trim() ? to.trim() : admin.email;

    // Use custom subject if provided, otherwise use default
    const emailSubject = subject && subject.trim() ? subject.trim() : '✅ Test Email từ ChatChiu Cashback System';

    // Check if custom content is provided
    const hasCustomContent = content && content.trim();

    logger.info('Sending test email', {
      adminId: req.userId,
      to: testEmailTo,
      customContent: !!hasCustomContent
    });

    // If custom content is provided, use simple plain text email
    let html;
    if (hasCustomContent) {
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="white-space: pre-wrap; color: #333; font-size: 14px; line-height: 1.6;">${content.trim()}</div>
          </div>
        </body>
        </html>
      `;
    } else {
      // Use default template
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">ChatChiu Cashback</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Test Email Configuration</p>
            </div>

            <!-- Body -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
                <h2 style="color: #333; margin: 0 0 10px 0; font-size: 24px;">Email Configuration Hoạt Động!</h2>
                <p style="color: #666; margin: 0; font-size: 16px;">SMTP configuration của bạn đã được thiết lập đúng cách.</p>
              </div>

              <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📧 Thông Tin Test</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Gửi đến:</td>
                    <td style="padding: 8px 0; color: #333; font-weight: 600; font-size: 14px; text-align: right;">${testEmailTo}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Admin:</td>
                    <td style="padding: 8px 0; color: #333; font-weight: 600; font-size: 14px; text-align: right;">${admin.full_name || 'Admin'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Thời gian:</td>
                    <td style="padding: 8px 0; color: #333; font-weight: 600; font-size: 14px; text-align: right;">${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
                  </tr>
                </table>
              </div>

              <div style="border-left: 4px solid #4CAF50; padding-left: 16px; margin-bottom: 30px;">
                <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.6;">
                  Đây là email test để xác nhận rằng hệ thống email của ChatChiu Cashback đang hoạt động bình thường.
                  Bạn sẽ nhận được các thông báo tự động về:
                </p>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #666; font-size: 14px; line-height: 1.8;">
                  <li>Reconciliation finalized</li>
                  <li>Payment confirmed</li>
                  <li>Payment rejected</li>
                  <li>Payment paid</li>
                </ul>
              </div>

              <div style="text-align: center; margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3007'}/admin/email-logs"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Xem Email Logs Dashboard
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                © ${new Date().getFullYear()} ChatChiu Cashback. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                Email này được gửi từ hệ thống tự động. Vui lòng không reply.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    const result = await EmailService.sendEmail({
      to: testEmailTo,
      subject: emailSubject,
      html: html,
      context: {
        emailType: 'system_test',
        contextType: 'admin',
        contextId: req.userId
      }
    });

    if (result.success) {
      logger.info('Test email sent successfully', {
        adminId: req.userId,
        to: testEmailTo
      });

      res.json({
        success: true,
        message: `Test email đã được gửi đến ${testEmailTo}`,
        data: {
          to: testEmailTo,
          sentAt: new Date().toISOString()
        }
      });
    } else {
      // Email failed to send
      logger.error('Test email failed', {
        adminId: req.userId,
        to: testEmailTo,
        error: result.error
      });

      res.status(500).json({
        success: false,
        message: `Không thể gửi email: ${result.error || 'Unknown error'}`
      });
    }

  } catch (error) {
    logger.error('Error sending test email', {
      error: error.message,
      adminId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test email'
    });
  }
});

/**
 * GET /api/admin/email-logs/stats
 * Get email statistics
 */
router.get('/email-logs/stats', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');

    // Get total emails count
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM email_logs');
    const total = parseInt(totalResult.rows[0].total);

    // Get sent emails count (last 7 days)
    const sentResult = await pool.query(`
      SELECT COUNT(*) as sent
      FROM email_logs
      WHERE status = 'sent' AND created_at >= NOW() - INTERVAL '7 days'
    `);
    const sent = parseInt(sentResult.rows[0].sent);

    // Get failed emails count (last 7 days)
    const failedResult = await pool.query(`
      SELECT COUNT(*) as failed
      FROM email_logs
      WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '7 days'
    `);
    const failed = parseInt(failedResult.rows[0].failed);

    // Get skipped emails count (dev mode, last 7 days)
    const skippedResult = await pool.query(`
      SELECT COUNT(*) as skipped
      FROM email_logs
      WHERE status = 'skipped' AND created_at >= NOW() - INTERVAL '7 days'
    `);
    const skipped = parseInt(skippedResult.rows[0].skipped);

    // Get unique recipients count (last 7 days)
    const uniqueResult = await pool.query(`
      SELECT COUNT(DISTINCT email_to) as unique_recipients
      FROM email_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const uniqueRecipients = parseInt(uniqueResult.rows[0].unique_recipients);

    res.json({
      success: true,
      data: {
        total,
        sent_7d: sent,
        failed_7d: failed,
        skipped_7d: skipped,
        unique_recipients_7d: uniqueRecipients
      }
    });

  } catch (error) {
    logger.error('Error loading email stats', {
      error: error.message,
      adminId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load email stats'
    });
  }
});

/**
 * GET /api/admin/email-logs/:id
 * Get single email log detail
 */
router.get('/email-logs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        user_id,
        email_to,
        email_type,
        subject,
        status,
        error_message,
        context_id,
        context_type,
        created_at
      FROM email_logs
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error loading email log detail', {
      error: error.message,
      adminId: req.userId,
      emailLogId: req.params.id
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load email log'
    });
  }
});

/**
 * GET /api/admin/email-logs
 * Get email logs with pagination and filtering
 */
router.get('/email-logs', authenticateAdmin, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const {
      page = 1,
      limit = 50,
      status,
      email_type,
      email_to,
      date_from,
      date_to
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (email_type) {
      conditions.push(`email_type = $${paramIndex++}`);
      params.push(email_type);
    }

    if (email_to) {
      conditions.push(`email_to ILIKE $${paramIndex++}`);
      params.push(`%${email_to}%`);
    }

    if (date_from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM email_logs ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    params.push(parseInt(limit));
    params.push(offset);
    const logsQuery = `
      SELECT
        id,
        user_id,
        email_to,
        email_type,
        subject,
        status,
        error_message,
        context_id,
        context_type,
        created_at
      FROM email_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;

    const logsResult = await pool.query(logsQuery, params);

    res.json({
      success: true,
      data: {
        logs: logsResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error loading email logs', {
      error: error.message,
      adminId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load email logs'
    });
  }
});

// ============================================================================
// EMAIL TEMPLATE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/email-template
 * Load email template content for editing
 */
router.get('/email-template', authenticateAdmin, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const { path: templatePath } = req.query;

    if (!templatePath) {
      return res.status(400).json({
        success: false,
        message: 'Template path is required'
      });
    }

    // Validate path to prevent directory traversal
    if (templatePath.includes('..') || templatePath.startsWith('/') || templatePath.startsWith('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template path'
      });
    }

    // Construct full path
    const fullPath = path.join(__dirname, '..', 'templates', 'email', templatePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (err) {
      return res.status(404).json({
        success: false,
        message: 'Template file not found'
      });
    }

    // Read file content
    const content = await fs.readFile(fullPath, 'utf-8');

    logger.info('Email template loaded', {
      adminId: req.userId,
      templatePath
    });

    res.json({
      success: true,
      data: {
        path: templatePath,
        content: content
      }
    });

  } catch (error) {
    logger.error('Error loading email template', {
      error: error.message,
      adminId: req.userId,
      templatePath: req.query.path
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load email template'
    });
  }
});

/**
 * PUT /api/admin/email-template
 * Save email template content
 */
router.put('/email-template', authenticateAdmin, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const { path: templatePath, content } = req.body;

    // Validation
    if (!templatePath) {
      return res.status(400).json({
        success: false,
        message: 'Template path is required'
      });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Template content is required'
      });
    }

    // Validate path to prevent directory traversal
    if (templatePath.includes('..') || templatePath.startsWith('/') || templatePath.startsWith('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template path'
      });
    }

    // Construct full path
    const fullPath = path.join(__dirname, '..', 'templates', 'email', templatePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (err) {
      return res.status(404).json({
        success: false,
        message: 'Template file not found'
      });
    }

    // Create backup before saving
    const backupPath = fullPath + '.backup.' + Date.now();
    try {
      const originalContent = await fs.readFile(fullPath, 'utf-8');
      await fs.writeFile(backupPath, originalContent, 'utf-8');
      logger.info('Template backup created', {
        adminId: req.userId,
        templatePath,
        backupPath
      });
    } catch (backupError) {
      logger.warn('Failed to create backup', {
        error: backupError.message,
        templatePath
      });
    }

    // Save new content
    await fs.writeFile(fullPath, content, 'utf-8');

    logger.info('Email template saved', {
      adminId: req.userId,
      templatePath,
      contentLength: content.length
    });

    res.json({
      success: true,
      message: 'Email template saved successfully',
      data: {
        path: templatePath,
        savedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error saving email template', {
      error: error.message,
      adminId: req.userId,
      templatePath: req.body.path
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save email template'
    });
  }
});

module.exports = router;
