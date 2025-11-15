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
             COUNT(CASE WHEN link_mode = 'button' THEN 1 END) as button_clicks,
             COUNT(CASE WHEN link_mode = 'link' THEN 1 END) as link_clicks
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

    // Get recent activity
    const recentActivityQuery = `
      (
        SELECT 'click' as type, clicked_at as timestamp, merchant_name, NULL as amount
        FROM clicks
        WHERE user_id = $1
        ORDER BY clicked_at DESC
        LIMIT 10
      )
      UNION ALL
      (
        SELECT 'conversion' as type, c.created_at as timestamp, c.merchant_name, c.cashback_amount as amount
        FROM conversions c
        JOIN clicks cl ON c.click_id = cl.id
        WHERE cl.user_id = $1
        ORDER BY c.created_at DESC
        LIMIT 10
      )
      ORDER BY timestamp DESC
      LIMIT 20
    `;
    const activityResult = await pool.query(recentActivityQuery, [userId]);

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
        createdAt: user.created_at,
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
        recentActivity: activityResult.rows.map(a => ({
          type: a.type,
          timestamp: a.timestamp,
          merchantName: a.merchant_name,
          amount: a.amount ? parseFloat(a.amount) : null
        }))
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
 * GET /api/admin/conversions
 * Get all system conversions (cashback conversions only - matched with users)
 */
router.get('/conversions', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    let query = `
      SELECT
        sc.*,
        u.username,
        u.email,
        u.full_name,
        m.logo_url as merchant_logo
      FROM system_conversions sc
      JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      WHERE 1=1
    `;

    const values = [];

    // Status filter
    if (status) {
      values.push(status);
      query += ` AND sc.status = $${values.length}`;
    }

    query += ` ORDER BY sc.order_time DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    res.json({
      success: true,
      conversions: result.rows.map(sc => ({
        id: sc.id,
        userId: sc.user_id,
        username: sc.username,
        email: sc.email,
        fullName: sc.full_name,
        merchantId: sc.merchant_id,
        merchantName: sc.merchant_name,
        merchantLogo: sc.merchant_logo,
        orderCode: sc.order_code,
        orderAmount: parseFloat(sc.order_amount || 0),
        commission: parseFloat(sc.commission || 0),
        cashbackAmount: parseFloat(sc.cashback_amount || 0),
        status: sc.status,
        orderTime: sc.order_time,
        approvalTime: sc.approval_time,
        matchedAt: sc.matched_at,
        atConversionId: sc.at_conversion_id,
        createdAt: sc.created_at
      }))
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

    const query = `
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

    const result = await pool.query(query, [id]);

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
    const { newStatus, newIsConfirmed } = req.body;

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
    const oldIsConfirmed = conversion.is_confirmed;
    let balanceUpdated = false;

    // Update status if changed
    if (newStatus && newStatus !== oldStatus) {
      const approvalTime = newStatus === 'approved' ? new Date() : null;

      // Update in system_conversions table
      await pool.query(
        'UPDATE system_conversions SET status = $1, approval_time = $2 WHERE id = $3',
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

    // Update is_confirmed if changed
    if (newIsConfirmed !== undefined && newIsConfirmed !== oldIsConfirmed) {
      const confirmedTime = newIsConfirmed ? new Date() : null;
      await pool.query(
        'UPDATE system_conversions SET is_confirmed = $1, confirmed_time = $2 WHERE id = $3',
        [newIsConfirmed, confirmedTime, id]
      );
      logger.info(`Updated order ${conversion.at_conversion_id} confirmation: ${oldIsConfirmed} → ${newIsConfirmed}`);
    }

    res.json({
      success: true,
      message: 'Conversion updated successfully',
      updated: {
        status: newStatus !== oldStatus,
        isConfirmed: newIsConfirmed !== oldIsConfirmed,
        balanceUpdated
      },
      changes: {
        status: newStatus !== oldStatus ? { old: oldStatus, new: newStatus } : null,
        isConfirmed: newIsConfirmed !== oldIsConfirmed ? { old: oldIsConfirmed, new: newIsConfirmed } : null
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
    values.push(limit, offset);

    const ordersResult = await pool.query(ordersQuery, values);

    // Get statistics for current filter
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(c.order_amount), 0) as total_order_amount,
        COALESCE(SUM(c.commission), 0) as total_commission,
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
        -- Commission breakdown by confirmed status
        COALESCE(SUM(CASE WHEN c.is_confirmed = 1 THEN c.commission ELSE 0 END), 0) as confirmed_commission,
        COALESCE(SUM(CASE WHEN c.is_confirmed = 0 THEN c.commission ELSE 0 END), 0) as not_confirmed_commission
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    `;
    const statsResult = await pool.query(statsQuery, values.slice(0, -2)); // Remove limit and offset
    const stats = statsResult.rows[0];

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
            amount: parseFloat(stats.approved_amount) || 0
          },
          pending: {
            count: parseInt(stats.pending_count) || 0,
            amount: parseFloat(stats.pending_amount) || 0
          },
          rejected: {
            count: parseInt(stats.rejected_count) || 0,
            amount: parseFloat(stats.rejected_amount) || 0
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
      config,
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
      config: updated
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
    const matchMethodQuery = `
      SELECT
        CASE
          WHEN co.utm_content IS NOT NULL AND c.utm_content = co.utm_content THEN 'utm_content'
          WHEN c.sub2 IS NOT NULL AND co.aff_sid = c.sub2 THEN 'sub2'
          WHEN co.aff_sid IS NOT NULL AND c.aff_sid = co.aff_sid THEN 'aff_sid'
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
          WHEN affiliate_url LIKE '%click.accesstrade.vn%' THEN 'api'
          ELSE 'diy'
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
    const settings = {
      AUTO_CRON_ENABLED: process.env.AUTO_CRON_ENABLED || 'false',
      RETRY_CRON_SCHEDULE: process.env.RETRY_CRON_SCHEDULE || '0 */6 * * *',
      USE_ACCESSTRADE_API: process.env.USE_ACCESSTRADE_API || 'false',
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

    // Note: This updates the runtime value, but .env file needs manual update
    process.env.AUTO_CRON_ENABLED = enabled ? 'true' : 'false';

    logger.info('Auto cron setting updated', {
      enabled,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
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
 * POST /api/admin/settings/api-mode
 * Toggle API mode
 */
router.post('/settings/api-mode', authenticateAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;

    // Update runtime value
    process.env.USE_ACCESSTRADE_API = enabled ? 'true' : 'false';

    logger.info('API mode setting updated', {
      enabled,
      adminId: req.userId
    });

    res.json({
      success: true,
      message: 'Cập nhật thành công. Vui lòng update file .env và restart server để áp dụng vĩnh viễn.'
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

module.exports = router;
