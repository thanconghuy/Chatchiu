const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const User = require('../models/User');
const Click = require('../models/Click');
const Merchant = require('../models/Merchant');
const Conversion = require('../models/Conversion');
const SystemConversion = require('../models/SystemConversion');
const { generateAffiliateLink } = require('../services/linkGenerator');

/**
 * GET /api/dashboard/stats
 * Get user dashboard statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const stats = await User.getStats(req.userId);
    const clickStats = await Click.getStats(req.userId);
    const conversionStats = await Conversion.getUserStats(req.userId);

    res.json({
      success: true,
      stats: {
        availableBalance: parseFloat(user.available_balance),
        pendingBalance: parseFloat(user.pending_balance),
        totalCashback: parseFloat(user.total_cashback),
        totalConversions: parseInt(conversionStats.total_conversions),
        approvedConversions: parseInt(conversionStats.approved_conversions),
        pendingConversions: parseInt(conversionStats.pending_conversions),
        rejectedConversions: parseInt(conversionStats.rejected_conversions),
        totalApprovedCashback: parseFloat(conversionStats.total_approved_cashback),
        totalPendingCashback: parseFloat(conversionStats.total_pending_cashback),
        totalApprovedOrderValue: parseFloat(conversionStats.total_approved_order_value),
        totalOrderValue: parseFloat(conversionStats.total_order_value),
        totalClicks: parseInt(clickStats.total_clicks),
        convertedClicks: parseInt(clickStats.converted_clicks)
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
});

/**
 * GET /api/merchants
 * Get all active merchants
 */
router.get('/merchants', async (req, res) => {
  try {
    const merchants = await Merchant.getAll(true);

    res.json({
      success: true,
      merchants: merchants.map(m => ({
        id: m.id,
        name: m.name,
        logoUrl: m.logo_url,
        commissionRate: m.commission_rate,
        deepLinkBase: m.deep_link_base,
        policyNote: m.policy_note
      }))
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
 * GET /api/dashboard/community-stats
 * Get community statistics for homepage (public, no auth required)
 * Returns total users count and total order value
 */
router.get('/community-stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_admin = false) as total_users,
        (SELECT COALESCE(SUM(order_amount), 0) FROM system_conversions) as total_order_value
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      success: true,
      totalUsers: parseInt(stats.total_users),
      totalOrderValue: parseFloat(stats.total_order_value)
    });
  } catch (error) {
    console.error('Get community stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get community stats'
    });
  }
});

/**
 * GET /api/dashboard/public-activity
 * Get recent activity for homepage (public, no auth required)
 * Returns anonymized recent orders for social proof
 */
router.get('/public-activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const pool = require('../config/database');

    // Get recent approved conversions (anonymized)
    const query = `
      SELECT
        c.order_code,
        c.order_amount,
        c.commission,
        c.order_time
      FROM conversions c
      WHERE c.status = 'approved'
        AND c.order_amount > 0
        AND c.commission > 0
      ORDER BY c.order_time DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);

    res.json({
      success: true,
      orders: result.rows
    });
  } catch (error) {
    console.error('Get public activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity'
    });
  }
});

/**
 * POST /api/generate-link
 * Generate affiliate link
 */
router.post('/generate-link', authenticateToken, async (req, res) => {
  try {
    const { merchantId, clickType, productUrl } = req.body;

    // Validate inputs
    if (!merchantId || !clickType) {
      return res.status(400).json({
        success: false,
        message: 'Merchant ID and click type are required'
      });
    }

    if (!['button', 'link'].includes(clickType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid click type. Must be "button" or "link"'
      });
    }

    if (clickType === 'link' && !productUrl) {
      return res.status(400).json({
        success: false,
        message: 'Product URL is required for link type'
      });
    }

    // Get user and merchant
    const user = await User.findById(req.userId);
    const merchant = await Merchant.findById(merchantId);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    if (!merchant.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Merchant is not active'
      });
    }

    // Validate product URL if provided
    if (clickType === 'link' && productUrl) {
      const isValid = await Merchant.validateUrl(merchantId, productUrl);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: `Product URL must be from ${merchant.name} website`
        });
      }
    }

    // Save click to database FIRST to get click_id
    const clickData = {
      userId: user.id,
      merchantId: merchant.id,
      clickType: clickType,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    const click = await Click.create(clickData);

    // Prepare UTM parameters
    // utm_medium = username của người tạo link
    // utm_content = click ID
    const utmMedium = user.username;
    const utmContent = click.id;

    // Generate affiliate link with click_id, utm_medium, and utm_content
    const linkData = generateAffiliateLink(user, merchant, click.id, clickType, productUrl, utmMedium, utmContent);

    // Update click with generated link data
    await Click.updateLinkData(click.id, {
      affSid: linkData.affSid,
      originalUrl: linkData.originalUrl,
      affiliateUrl: linkData.affiliateUrl,
      utmSource: linkData.utmParams.utm_source,
      utmMedium: linkData.utmParams.utm_medium,
      utmCampaign: linkData.utmParams.utm_campaign,
      utmContent: linkData.utmParams.utm_content,
      sub4: linkData.utmParams.sub4
    });

    res.json({
      success: true,
      message: 'Affiliate link generated successfully',
      data: {
        affiliateUrl: linkData.affiliateUrl,
        affSid: linkData.affSid,
        clickId: click.id,
        merchant: {
          id: merchant.id,
          name: merchant.name
        }
      }
    });
  } catch (error) {
    console.error('Generate link error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate link'
    });
  }
});

/**
 * GET /api/dashboard/recent-clicks
 * Get user's recent clicks with accurate status from system_conversions
 */
router.get('/recent-clicks', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Query from system_conversions to get accurate status (same as admin pages)
    const query = `
      SELECT
        cl.id,
        cl.click_type,
        cl.clicked_at,
        cl.affiliate_url,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        sc.id as system_conversion_id,
        sc.status as conversion_status,
        sc.cashback_amount,
        c.order_approved,
        c.products_count,
        c.order_pending,
        c.order_reject
      FROM clicks cl
      LEFT JOIN merchants m ON cl.merchant_id = m.id
      LEFT JOIN system_conversions sc ON cl.id = sc.click_id
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE cl.user_id = $1
      ORDER BY cl.clicked_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [req.userId, limit]);
    const clicks = result.rows;

    res.json({
      success: true,
      clicks: clicks.map(c => ({
        id: c.id,
        merchantName: c.merchant_name,
        merchantLogo: c.merchant_logo,
        clickType: c.click_type,
        clickedAt: c.clicked_at,
        affiliateUrl: c.affiliate_url,
        hasConversion: !!c.system_conversion_id,
        conversionStatus: c.conversion_status,
        cashback: c.cashback_amount ? parseFloat(c.cashback_amount) : 0,
        orderApproved: parseInt(c.order_approved) || 0,
        productsCount: parseInt(c.products_count) || 0,
        orderPending: parseInt(c.order_pending) || 0,
        orderReject: parseInt(c.order_reject) || 0
      }))
    });
  } catch (error) {
    console.error('Get recent clicks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent clicks'
    });
  }
});

/**
 * GET /api/dashboard/conversions
 * Get user's system conversions (matched conversions only) with optional status filter
 */
router.get('/conversions', authenticateToken, async (req, res) => {
  try {
    const status = req.query.status || null; // 'pending', 'approved', 'rejected', or null for all
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Validate status if provided
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be pending, approved, or rejected'
      });
    }

    const conversions = await SystemConversion.getUserConversions(req.userId, {
      status,
      limit,
      offset
    });

    res.json({
      success: true,
      conversions: conversions.map(sc => ({
        id: sc.id,
        merchantName: sc.merchant_name,
        merchantLogo: sc.merchant_logo,
        orderCode: sc.order_code,
        orderAmount: parseFloat(sc.order_amount),
        commission: parseFloat(sc.commission),
        cashbackAmount: parseFloat(sc.cashback_amount),
        status: sc.status,
        orderTime: sc.order_time,
        approvalTime: sc.approval_time,
        matchedAt: sc.matched_at,
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
 * GET /api/dashboard/conversion/:id
 * Get single conversion details
 */
router.get('/conversion/:id', authenticateToken, async (req, res) => {
  try {
    const conversion = await Conversion.findById(req.params.id);

    if (!conversion) {
      return res.status(404).json({
        success: false,
        message: 'Conversion not found'
      });
    }

    // Check if conversion belongs to user
    if (conversion.user_id !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      conversion: {
        id: conversion.id,
        merchantName: conversion.merchant_name,
        merchantLogo: conversion.merchant_logo,
        orderCode: conversion.order_code,
        orderAmount: parseFloat(conversion.order_amount),
        commission: parseFloat(conversion.commission),
        cashbackAmount: parseFloat(conversion.cashback_amount),
        status: conversion.status,
        orderTime: conversion.order_time,
        approvalTime: conversion.approval_time,
        clickType: conversion.click_type,
        productUrl: conversion.product_url,
        affSid: conversion.aff_sid,
        createdAt: conversion.created_at,
        updatedAt: conversion.updated_at
      }
    });
  } catch (error) {
    console.error('Get conversion details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversion details'
    });
  }
});

module.exports = router;
