const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const User = require('../models/User');
const Conversion = require('../models/Conversion');
const Click = require('../models/Click');
const Merchant = require('../models/Merchant');
const { pool } = require('../config/database');
const { syncConversions } = require('../jobs/syncConversions');
const accessTradeService = require('../services/accesstrade');
const trackingService = require('../services/trackingService');
const logger = require('../utils/logger');

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_admin = false) as total_users,
        (SELECT COUNT(*) FROM conversions) as total_conversions,
        (SELECT COUNT(*) FROM conversions WHERE status = 'pending') as pending_conversions,
        (SELECT COUNT(*) FROM conversions WHERE status = 'approved') as approved_conversions,
        (SELECT COUNT(*) FROM conversions WHERE status = 'rejected') as rejected_conversions,
        (SELECT COALESCE(SUM(order_amount), 0) FROM conversions WHERE status = 'approved') as total_order_value,
        (SELECT COALESCE(SUM(commission), 0) FROM conversions WHERE status = 'approved') as total_commission,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM conversions WHERE status = 'approved') as total_cashback_paid,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM conversions WHERE status = 'pending') as pending_cashback,
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
 * GET /api/admin/conversions
 * Get all conversions with filters
 */
router.get('/conversions', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const userId = req.query.userId || null;

    let query = `
      SELECT
        c.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        cl.user_id,
        u.username,
        u.email,
        cl.aff_sid
      FROM conversions c
      JOIN clicks cl ON c.click_id = cl.id
      JOIN users u ON cl.user_id = u.id
      JOIN merchants m ON c.merchant_id = m.id
      WHERE 1=1
    `;

    const values = [];

    if (status) {
      values.push(status);
      query += ` AND c.status = $${values.length}`;
    }

    if (userId) {
      values.push(userId);
      query += ` AND cl.user_id = $${values.length}`;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    res.json({
      success: true,
      conversions: result.rows.map(c => ({
        id: c.id,
        userId: c.user_id,
        username: c.username,
        email: c.email,
        merchantName: c.merchant_name,
        merchantLogo: c.merchant_logo,
        orderCode: c.order_code,
        orderAmount: parseFloat(c.order_amount),
        commission: parseFloat(c.commission),
        cashbackAmount: parseFloat(c.cashback_amount),
        status: c.status,
        orderTime: c.order_time,
        approvalTime: c.approval_time,
        affSid: c.aff_sid,
        createdAt: c.created_at
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
      count: conversions.length
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
        const result = await trackingService.processConversion(conversion);

        switch (result.status) {
          case 'created':
            results.created++;
            results.details.push({
              status: 'created',
              orderId: conversion._id,
              conversionId: result.conversionId
            });
            break;
          case 'updated':
            results.updated++;
            results.details.push({
              status: 'updated',
              orderId: conversion._id,
              conversionId: result.conversionId,
              oldStatus: result.oldStatus,
              newStatus: result.newStatus
            });
            break;
          case 'skipped':
            results.skipped++;
            results.details.push({
              status: 'skipped',
              orderId: conversion._id,
              reason: result.reason
            });
            break;
          case 'error':
            results.errors++;
            results.details.push({
              status: 'error',
              orderId: conversion._id,
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
          orderId: conversion._id,
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

module.exports = router;
