const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Click = require('../models/Click');
const Merchant = require('../models/Merchant');
const Conversion = require('../models/Conversion');
const SystemConversion = require('../models/SystemConversion');
const { generateAffiliateLink } = require('../services/linkGenerator');
const reconciliationService = require('../services/reconciliationService');

/**
 * GET /api/dashboard/stats
 * Get user dashboard statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    console.log('[Dashboard Stats] Loading stats for userId:', req.userId);

    const user = await User.findById(req.userId);
    console.log('[Dashboard Stats] User found:', user ? user.email : 'null');

    const stats = await User.getStats(req.userId);
    console.log('[Dashboard Stats] User stats:', stats);

    const clickStats = await Click.getStats(req.userId);
    console.log('[Dashboard Stats] Click stats:', clickStats);

    const conversionStats = await Conversion.getUserStats(req.userId);
    console.log('[Dashboard Stats] Conversion stats:', conversionStats);

    const responseData = {
      success: true,
      stats: {
        availableBalance: parseFloat(user.available_balance) || 0,
        pendingBalance: parseFloat(user.pending_balance) || 0,
        totalCashback: parseFloat(user.total_cashback) || 0,
        totalConversions: parseInt(conversionStats.total_conversions) || 0,
        approvedConversions: parseInt(conversionStats.approved_conversions) || 0,
        pendingConversions: parseInt(conversionStats.pending_conversions) || 0,
        rejectedConversions: parseInt(conversionStats.rejected_conversions) || 0,
        totalApprovedCashback: parseFloat(conversionStats.total_approved_cashback) || 0,
        totalPendingCashback: parseFloat(conversionStats.total_pending_cashback) || 0,
        totalApprovedOrderValue: parseFloat(conversionStats.total_approved_order_value) || 0,
        totalOrderValue: parseFloat(conversionStats.total_order_value) || 0,
        totalClicks: parseInt(clickStats.total_clicks) || 0,
        convertedClicks: parseInt(clickStats.converted_clicks) || 0
      }
    };

    console.log('[Dashboard Stats] Sending response:', responseData);
    res.json(responseData);
  } catch (error) {
    console.error('[Dashboard Stats] Error:', error);
    console.error('[Dashboard Stats] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
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
        deepLinkBase: m.deep_link_base
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
      sub1: linkData.utmParams.sub1,
      sub2: linkData.utmParams.sub2,
      sub3: linkData.utmParams.sub3,
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
 * Get user's recent clicks
 */
router.get('/recent-clicks', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const clicks = await Click.getUserClicks(req.userId, limit);

    res.json({
      success: true,
      clicks: clicks.map(c => ({
        id: c.id,
        merchantName: c.merchant_name,
        merchantLogo: c.merchant_logo,
        clickType: c.click_type,
        clickedAt: c.clicked_at,
        affiliateUrl: c.affiliate_url,
        hasConversion: !!c.conversion_id,
        conversionStatus: c.conversion_status,
        cashback: c.user_cashback ? parseFloat(c.user_cashback) : 0
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

/**
 * GET /api/dashboard/reconciliations
 * Get user's reconciliation periods (confirmed only)
 */
router.get('/reconciliations', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const reconciliations = await reconciliationService.getUserReconciliations(req.userId, {
      limit,
      offset
    });

    res.json({
      success: true,
      reconciliations: reconciliations.map(r => ({
        id: r.id,
        periodLabel: r.period_label,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        totalOrders: parseInt(r.total_orders),
        totalOrderAmount: parseFloat(r.total_order_amount),
        totalCashback: parseFloat(r.total_cashback),
        status: r.status,
        confirmedAt: r.confirmed_at,
        paidAt: r.paid_at,
        itemCount: parseInt(r.item_count)
      }))
    });
  } catch (error) {
    console.error('Get user reconciliations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reconciliations'
    });
  }
});

/**
 * GET /api/dashboard/reconciliation/:id/items
 * Get user's orders in a specific reconciliation period
 */
router.get('/reconciliation/:id/items', authenticateToken, async (req, res) => {
  try {
    const items = await reconciliationService.getUserReconciliationItems(
      req.params.id,
      req.userId
    );

    res.json({
      success: true,
      items: items.map(item => ({
        id: item.id,
        orderCode: item.order_code,
        merchantName: item.merchant_name,
        orderAmount: parseFloat(item.order_amount),
        commission: parseFloat(item.commission),
        cashbackAmount: parseFloat(item.cashback_amount),
        orderTime: item.order_time,
        confirmedTime: item.confirmed_time
      }))
    });
  } catch (error) {
    console.error('Get user reconciliation items error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get reconciliation items'
    });
  }
});

module.exports = router;
