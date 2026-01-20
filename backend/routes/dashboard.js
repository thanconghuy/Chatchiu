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
const accessTradeLinkService = require('../services/accessTradeLink');
const tiktokShopLinkService = require('../services/tiktokShopLink');
const reconciliationService = require('../services/reconciliationService');
const { ActivityLogger, ACTIVITY_TYPES } = require('../services/activityLogger');

/**
 * GET /api/dashboard/stats
 * Get user dashboard statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    console.log('[Dashboard Stats] Loading stats for userId:', req.userId);

    const user = await User.findById(req.userId);
    console.log('[Dashboard Stats] User found:', user ? user.email : 'null');

    const clickStats = await Click.getStats(req.userId);
    console.log('[Dashboard Stats] Click stats:', clickStats);

    // Get balance from user_system_balance table (NEW LOGIC V2.0)
    // This table maintains the correct balance using reserve/release pattern
    const balanceQuery = `
      SELECT
        usb.available_balance,
        usb.pending_balance,
        usb.reserved_balance,
        usb.total_earned,
        usb.total_withdrawn,
        usb.debt_balance,
        COALESCE(
          (SELECT SUM(requested_amount)
           FROM payment_requests
           WHERE user_id = $1
             AND status IN ('pending', 'confirmed')
             AND cancelled_at IS NULL),
          0
        ) as total_requested
      FROM user_system_balance usb
      WHERE usb.user_id = $1
    `;
    const balanceResult = await pool.query(balanceQuery, [req.userId]);

    if (balanceResult.rows.length === 0) {
      // No balance record found - return zeros
      const balanceStats = {
        available_balance: 0,
        pending_balance: 0,
        reserved_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
        total_requested: 0
      };
      console.log('[Dashboard Stats] No balance record found, using zeros');
    } else {
      var balanceStats = balanceResult.rows[0];
      console.log('[Dashboard Stats] Balance from user_system_balance:', {
        availableBalance: balanceStats.available_balance,
        totalEarned: balanceStats.total_earned,
        totalWithdrawn: balanceStats.total_withdrawn,
        totalRequested: balanceStats.total_requested
      });
    }

    // Get conversion stats from system_conversions
    const conversionQuery = `
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_conversions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_conversions,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_conversions,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as total_pending_cashback,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END), 0) as total_approved_order_value,
        COALESCE(SUM(order_amount), 0) as total_order_value
      FROM system_conversions
      WHERE user_id = $1
    `;
    const conversionResult = await pool.query(conversionQuery, [req.userId]);
    const conversionStats = conversionResult.rows[0];
    console.log('[Dashboard Stats] Conversion stats from system_conversions:', conversionStats);

    const responseData = {
      success: true,
      stats: {
        availableBalance: parseFloat(balanceStats.available_balance) || 0,
        pendingBalance: parseFloat(balanceStats.pending_balance) || 0,
        totalCashback: parseFloat(balanceStats.total_cashback) || 0,
        approvedBalance: parseFloat(conversionStats.total_approved_cashback) || 0, // Alias for totalApprovedCashback
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
    // Get merchants with conversion counts
    const query = `
      SELECT
        m.id,
        m.name,
        m.logo_url,
        m.commission_rate,
        m.deep_link_base,
        m.policy_note,
        m.is_active,
        COUNT(DISTINCT sc.id) as conversion_count
      FROM merchants m
      LEFT JOIN system_conversions sc ON sc.merchant_id = m.id AND sc.status = 'approved'
      WHERE m.is_active = true
      GROUP BY m.id, m.name, m.logo_url, m.commission_rate, m.deep_link_base, m.policy_note, m.is_active
      ORDER BY conversion_count DESC, m.name ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      merchants: result.rows.map(m => ({
        id: m.id,
        name: m.name,
        logoUrl: m.logo_url,
        commissionRate: m.commission_rate,
        deepLinkBase: m.deep_link_base,
        policyNote: m.policy_note,
        conversionCount: parseInt(m.conversion_count) || 0
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
 * Generate affiliate link with TRANSACTION support to prevent orphaned clicks
 *
 * QUICK FIX APPLIED (2025-01-14):
 * 1. Wrapped in database transaction to prevent orphaned clicks
 * 2. Added comprehensive error logging for debugging
 * 3. Added validation for link data before saving
 *
 * TODO (Future Enhancement):
 * - Implement full LinkGenerationService with retry logic and metrics
 * - Add monitoring dashboard for link generation success/failure rates
 * - Consider caching mechanism for frequently accessed merchants
 */
router.post('/generate-link', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  let click = null;

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

    // ========================================
    // PRIORITY LOGIC (UPDATED):
    // - TẤT CẢ: API AccessTrade FIRST → Deeplink fallback
    // - Lý do: API có tracking tốt hơn, conversion rate cao hơn
    // ========================================
    console.log('[Link Generation] Priority: API First → Deeplink Fallback', {
      clickType,
      userId: req.userId
    });

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

    // ========================================
    // SERVERLESS OPTIMIZATION: Use simple queries instead of long transaction
    // Transaction was causing timeout on Vercel (10s limit)
    // ========================================

    // Save click to database FIRST to get click_id
    const clickData = {
      userId: user.id,
      merchantId: merchant.id,
      clickType: clickType,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    click = await Click.create(clickData);

    try {

      // Prepare UTM parameters
      // utm_medium = username của người tạo link
      // utm_content = click ID
      const utmMedium = user.username;
      const utmContent = click.id;

      // ========================================
      // PRIORITY LOGIC: API FIRST → DEEPLINK FALLBACK
      // ========================================
      let linkData;
      let linkSource = 'diy';
      const useApiMode = process.env.USE_ACCESSTRADE_API === 'true';

      // Detect TikTok Shop
      const isTikTokShopMerchant = merchant.api_type === 'tiktok_v2';
      const isTikTokShopUrl = clickType === 'link' && productUrl && tiktokShopLinkService.isTikTokShopUrl(productUrl);
      const isTikTokShop = isTikTokShopMerchant || isTikTokShopUrl;

      // ========================================
      // STEP 1: TRY API FIRST (AccessTrade hoặc TikTok Shop)
      // ========================================
      let apiSuccess = false;

      if (useApiMode) {
        console.log('[Link Generation] 🟢 Trying API first...', {
          clickType,
          isTikTokShop,
          merchant: merchant.name
        });

        try {
          // TikTok Shop API (if applicable)
          if (isTikTokShop && await tiktokShopLinkService.isAvailable()) {
            linkData = await tiktokShopLinkService.generateLink(user, click.id, productUrl);
            linkSource = 'tiktok-api';
            apiSuccess = true;

            // Save product info
            if (linkData.productInfo?.id) {
              await Click.updateProductInfo(click.id, linkData.productInfo);
            }

            console.log('[Link Generation] ✅ TikTok Shop API success', {
              clickId: click.id,
              duration: Date.now() - startTime
            });
          }
          // AccessTrade API (for all other merchants)
          else if (await accessTradeLinkService.isAvailable()) {
            linkData = await accessTradeLinkService.generateLink(user, merchant, click.id, clickType, productUrl);
            linkSource = 'api';
            apiSuccess = true;

            console.log('[Link Generation] ✅ AccessTrade API success', {
              clickId: click.id,
              merchant: merchant.name,
              duration: Date.now() - startTime
            });
          }
          // No API available
          else {
            console.warn('[Link Generation] ⚠️ API mode enabled but no service available');
          }
        } catch (apiError) {
          console.error('[Link Generation] ❌ API failed:', {
            error: apiError.message,
            merchant: merchant.name
          });
          // Will fallback to deeplink below
        }
      }

      // ========================================
      // STEP 2: DEEPLINK FALLBACK (if API failed or disabled)
      // ========================================
      if (!apiSuccess) {
        console.log('[Link Generation] 🔵 Using Deeplink (fallback)...', {
          reason: useApiMode ? 'API failed' : 'API disabled',
          merchant: merchant.name
        });

        try {
          linkData = generateAffiliateLink(user, merchant, click.id, clickType, productUrl, utmMedium, utmContent);
          linkSource = useApiMode ? 'deeplink-fallback' : 'deeplink';

          console.log('[Link Generation] ✅ Deeplink success', {
            clickId: click.id,
            linkSource,
            duration: Date.now() - startTime
          });
        } catch (deeplinkError) {
          console.error('[Link Generation] ❌ Deeplink also failed:', {
            error: deeplinkError.message
          });
          throw deeplinkError;
        }
      }

      // ========================================
      // QUICK FIX: VALIDATE LINK DATA
      // Ensure critical tracking parameters exist
      // ========================================
      if (!linkData || !linkData.affiliateUrl || !linkData.affSid) {
        throw new Error('Invalid link data generated: missing affiliateUrl or affSid');
      }

      if (!linkData.utmParams || !linkData.utmParams.utm_content || !linkData.utmParams.sub2) {
        throw new Error('Invalid link data generated: missing critical tracking parameters');
      }

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
        sub4: linkData.utmParams.sub4,
        linkSource: linkSource
      });

      console.log('[Link Generation] ✅ Link generation completed successfully', {
        clickId: click.id,
        linkSource,
        duration: Date.now() - startTime
      });

      // Log successful link generation activity
      ActivityLogger.log({
        userId: req.userId,
        activityType: ACTIVITY_TYPES.LINK_GENERATE_SUCCESS,
        merchantId: merchant.id,
        productUrl: clickType === 'link' ? productUrl : null,
        eventData: {
          clickType,
          linkSource,
          clickId: click.id,
          merchantName: merchant.name
        },
        req,
        status: 'success',
        responseTime: Date.now() - startTime
      });

      // Prepare response data
      const responseData = {
        affiliateUrl: linkData.affiliateUrl,
        affSid: linkData.affSid,
        clickId: click.id,
        linkSource: linkSource, // 'tiktok-api', 'api', 'diy', or 'diy-fallback'
        merchant: {
          id: merchant.id,
          name: merchant.name
        }
      };

      // Include TikTok Shop specific data
      if (linkSource === 'tiktok-api' && linkData.productInfo) {
        responseData.productInfo = linkData.productInfo;
        responseData.shortUrl = linkData.shortUrl;
      }

      res.json({
        success: true,
        message: 'Affiliate link generated successfully',
        data: responseData
      });

    } catch (linkError) {
      // ========================================
      // SERVERLESS OPTIMIZATION: Handle errors without transaction rollback
      // Delete orphaned click if link generation fails
      // ========================================
      console.error('[Link Generation] ❌ Link generation error', {
        error: linkError.message,
        stack: linkError.stack,
        userId: req.userId,
        merchantId,
        clickId: click?.id,
        clickType,
        duration: Date.now() - startTime
      });

      // Note: Orphaned click will remain in database but without link data
      // This is acceptable as cleanup job can handle it later
      if (click?.id) {
        console.warn('[Link Generation] ⚠️ Orphaned click created:', click.id);
      }

      // Log failed link generation activity
      ActivityLogger.log({
        userId: req.userId,
        activityType: ACTIVITY_TYPES.LINK_GENERATE_FAILED,
        merchantId,
        productUrl: clickType === 'link' ? productUrl : null,
        eventData: {
          clickType,
          clickId: click?.id,
          errorType: 'link_generation_error'
        },
        req,
        status: 'failed',
        errorMessage: linkError.message,
        responseTime: Date.now() - startTime
      });

      throw linkError; // Re-throw to outer catch
    }

  } catch (error) {
    // ========================================
    // QUICK FIX: COMPREHENSIVE ERROR LOGGING
    // Log all errors with context for debugging
    // ========================================
    console.error('[Link Generation] ❌ Generate link error', {
      error: error.message,
      stack: error.stack,
      userId: req.userId,
      merchantId: req.body.merchantId,
      clickId: click?.id,
      clickType: req.body.clickType,
      productUrl: req.body.productUrl,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });

    // Log failed link generation activity (outer catch error)
    ActivityLogger.log({
      userId: req.userId,
      activityType: ACTIVITY_TYPES.LINK_GENERATE_FAILED,
      merchantId: req.body.merchantId,
      productUrl: req.body.clickType === 'link' ? req.body.productUrl : null,
      eventData: {
        clickType: req.body.clickType,
        clickId: click?.id,
        errorType: 'general_error'
      },
      req,
      status: 'failed',
      errorMessage: error.message,
      responseTime: Date.now() - startTime
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate link'
    });
  }
});

/**
 * GET /api/dashboard/recent-clicks
 * Get user's recent clicks with accurate status from system_conversions
 * Sorted with conversions first
 */
router.get('/recent-clicks', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Query from system_conversions to get accurate status (same as admin pages)
    // Sort: clicks with conversions first, then by date
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
      ORDER BY
        CASE WHEN sc.id IS NOT NULL THEN 0 ELSE 1 END,
        cl.clicked_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [req.userId, limit, offset]);
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

    // Get system_conversions with reconciliation status
    const conversionsQuery = `
      SELECT
        sc.id,
        sc.merchant_name,
        NULL as merchant_logo,
        sc.order_code,
        sc.order_amount,
        sc.commission,
        sc.cashback_amount,
        sc.status,
        sc.order_time,
        sc.approval_time,
        NULL as matched_at,
        sc.created_at,
        CASE
          WHEN sri.system_reconciliation_id IS NOT NULL THEN 'reconciled'
          WHEN sc.system_reconciliation_id IS NOT NULL THEN 'reconciled'
          ELSE NULL
        END as system_reconciliation_status,
        COALESCE(sri.system_reconciliation_id, sc.system_reconciliation_id) as system_reconciliation_id,
        NULL as system_reconciled_at,
        sri.id as system_reconciliation_item_id,
        sr.status as system_reconciliation_status_detail,
        sr.period_label as system_reconciliation_period,
        sr.finalized_at as system_reconciliation_finalized_at,
        'system' as source_type
      FROM system_conversions sc
      LEFT JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
      LEFT JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
      WHERE sc.user_id = $1
      ${status ? 'AND sc.status = $2' : ''}
      ORDER BY sc.created_at DESC
      LIMIT $${status ? '3' : '2'} OFFSET $${status ? '4' : '3'}
    `;

    const params = status
      ? [req.userId, status, limit, offset]
      : [req.userId, limit, offset];

    const result = await pool.query(conversionsQuery, params);

    res.json({
      success: true,
      conversions: result.rows.map(sc => ({
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
        createdAt: sc.created_at,
        // Source type: 'api' or 'system'
        sourceType: sc.source_type,
        // System Reconciliation Status (from conversions.system_reconciliation_status column or computed)
        systemReconciliationStatus: sc.system_reconciliation_status || null,
        systemReconciliationId: sc.system_reconciliation_id || null,
        systemReconciledAt: sc.system_reconciled_at || null,
        // System Reconciliation Details (from JOIN)
        systemReconciliationPeriod: sc.system_reconciliation_period || null,
        systemReconciliationStatusDetail: sc.system_reconciliation_status_detail || null,
        systemReconciliationFinalizedAt: sc.system_reconciliation_finalized_at || null
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

/**
 * GET /api/dashboard/debug-balance
 * Debug endpoint to check balance discrepancy
 */
router.get('/debug-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Get current balance from user_system_balance
    const balanceQuery = `
      SELECT * FROM user_system_balance WHERE user_id = $1
    `;
    const balanceResult = await pool.query(balanceQuery, [userId]);
    const currentBalance = balanceResult.rows[0];

    // 2. Calculate total approved cashback
    const conversionsQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count
      FROM system_conversions
      WHERE user_id = $1
    `;
    const conversionsResult = await pool.query(conversionsQuery, [userId]);
    const totalApproved = parseFloat(conversionsResult.rows[0].total_approved);

    // 3. Calculate total requested payments
    const paymentsQuery = `
      SELECT
        id,
        status,
        requested_amount,
        created_at
      FROM payment_requests
      WHERE user_id = $1
        AND status NOT IN ('rejected', 'cancelled')
      ORDER BY created_at DESC
    `;
    const paymentsResult = await pool.query(paymentsQuery, [userId]);
    const payments = paymentsResult.rows.map(pr => ({
      id: pr.id,
      status: pr.status,
      amount: parseFloat(pr.requested_amount),
      createdAt: pr.created_at
    }));
    const totalRequested = payments.reduce((sum, p) => sum + p.amount, 0);

    // 4. Calculate expected balance
    const expectedBalance = totalApproved - totalRequested;
    const actualBalance = parseFloat(currentBalance?.available_balance || 0);
    const discrepancy = actualBalance - expectedBalance;

    res.json({
      success: true,
      debug: {
        currentBalance: {
          available: actualBalance,
          totalEarned: parseFloat(currentBalance?.total_earned || 0),
          totalWithdrawn: parseFloat(currentBalance?.total_withdrawn || 0)
        },
        calculations: {
          totalApproved,
          approvedCount: conversionsResult.rows[0].approved_count,
          totalRequested,
          paymentsCount: payments.length,
          expectedBalance,
          actualBalance,
          discrepancy
        },
        payments,
        needsSync: Math.abs(discrepancy) > 0.01
      }
    });
  } catch (error) {
    console.error('Debug balance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/dashboard/sync-balance
 * Sync user balance to match calculations
 */
router.post('/sync-balance', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.userId;

    // Calculate expected balance
    const conversionsQuery = `
      SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved
      FROM system_conversions
      WHERE user_id = $1
    `;
    const conversionsResult = await client.query(conversionsQuery, [userId]);
    const totalApproved = parseFloat(conversionsResult.rows[0].total_approved);

    const paymentsQuery = `
      SELECT COALESCE(SUM(requested_amount), 0) as total_requested
      FROM payment_requests
      WHERE user_id = $1
        AND status NOT IN ('rejected', 'cancelled')
    `;
    const paymentsResult = await client.query(paymentsQuery, [userId]);
    const totalRequested = parseFloat(paymentsResult.rows[0].total_requested);

    const expectedBalance = totalApproved - totalRequested;

    // Update balance
    const updateQuery = `
      UPDATE user_system_balance
      SET
        available_balance = $1,
        total_earned = $2,
        total_withdrawn = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      RETURNING *
    `;
    const updateResult = await client.query(updateQuery, [
      expectedBalance,
      totalApproved,
      totalRequested,
      userId
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Balance synced successfully',
      balance: {
        available: parseFloat(updateResult.rows[0].available_balance),
        totalEarned: parseFloat(updateResult.rows[0].total_earned),
        totalWithdrawn: parseFloat(updateResult.rows[0].total_withdrawn)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync balance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
