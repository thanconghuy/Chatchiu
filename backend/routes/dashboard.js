const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
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

    // Generate affiliate link with click_id
    const linkData = generateAffiliateLink(user, merchant, click.id, clickType, productUrl);

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

    const conversions = await SystemConversion.getUserConversions(req.userId, status, limit, offset);

    res.json({
      success: true,
      conversions: conversions.map(sc => ({
        id: sc.id,
        merchantName: sc.merchant_name,
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
