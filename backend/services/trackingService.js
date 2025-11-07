const Conversion = require('../models/Conversion');
const Click = require('../models/Click');
const User = require('../models/User');
const SystemConversion = require('../models/SystemConversion');
const logger = require('../utils/logger');

/**
 * Tracking Service
 * Handles conversion tracking and processing
 */
class TrackingService {
  constructor() {
    this.commissionSplit = parseFloat(process.env.COMMISSION_SPLIT || '0.7');
  }

  /**
   * Process a single conversion from AccessTrade
   * @param {Object} accesstradeData - Raw conversion data from AccessTrade API
   * @returns {Promise<Object>}
   */
  async processConversion(accesstradeData) {
    try {
      // AccessTrade API uses different field names
      // Map to consistent format
      const orderId = accesstradeData.order_id || accesstradeData._id;
      const affSid = accesstradeData.aff_sid || accesstradeData.sub_id || accesstradeData.utm_campaign || null;
      const merchantId = accesstradeData.merchant_id || accesstradeData.merchant;

      logger.info('Processing conversion with data:', {
        orderId,
        affSid,
        merchantId,
        rawKeys: Object.keys(accesstradeData)
      });

      // Check if conversion already exists by order ID (this is the important check!)
      const existingConversion = await Conversion.findByAccessTradeId(orderId);

      if (existingConversion) {
        logger.info('Conversion already exists in database', {
          orderId,
          conversionId: existingConversion.id
        });
        return await this.handleExistingConversion(existingConversion, accesstradeData);
      } else {
        // New conversion - try to create with or without click match
        if (affSid) {
          // Try to match with click if we have aff_sid
          return await this.handleNewConversion(affSid, accesstradeData);
        } else {
          // No aff_sid - create conversion directly without click match
          logger.info('No aff_sid found - creating conversion without click match', {
            orderId
          });
          return await this.createConversionDirect(accesstradeData, null);
        }
      }
    } catch (error) {
      logger.error('Error processing conversion', {
        orderId: accesstradeData.order_id || accesstradeData._id,
        error: error.message,
        stack: error.stack
      });
      return { status: 'error', reason: error.message };
    }
  }

  /**
   * Handle existing conversion (check for status updates)
   * @param {Object} existingConversion
   * @param {Object} accesstradeData
   * @returns {Promise<Object>}
   */
  async handleExistingConversion(existingConversion, accesstradeData) {
    // NOTE: We do NOT auto-approve conversions anymore
    // Only admin can manually approve when money is received
    // This is because AccessTrade may approve orders but not pay commission yet

    const orderId = accesstradeData.order_id || accesstradeData._id;

    logger.info('Conversion already exists, no auto-update', {
      conversionId: existingConversion.id,
      orderId,
      currentStatus: existingConversion.status,
      apiOrderApproved: accesstradeData.order_approved,
      apiProductsCount: accesstradeData.products_count,
      apiOrderPending: accesstradeData.order_pending
    });

    return {
      status: 'skipped',
      reason: 'already_exists',
      conversionId: existingConversion.id
    };
  }

  /**
   * Handle new conversion
   * @param {string} affSid
   * @param {Object} accesstradeData
   * @returns {Promise<Object>}
   */
  async handleNewConversion(affSid, accesstradeData) {
    // Try to find matching click by utm_content (click_id) first
    let click = null;

    // Extract utm_content from accesstradeData if available
    const utmContent = accesstradeData.utm_content || accesstradeData.sub3;

    if (utmContent) {
      logger.info('Attempting to match by utm_content (click_id)', {
        utmContent,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      click = await Click.findByUtmContent(utmContent);
    }

    // Fallback to aff_sid if utm_content match failed
    if (!click) {
      logger.info('No match by utm_content, trying aff_sid', {
        affSid,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      click = await Click.findByAffSid(affSid);
    }

    if (!click) {
      logger.warn('No matching click found - creating conversion without click match', {
        affSid,
        utmContent,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      // Instead of skipping, create conversion directly without click
      return await this.createConversionDirect(accesstradeData, null);
    }

    logger.info('Found matching click', {
      matchedBy: utmContent ? 'utm_content' : 'aff_sid',
      clickId: click.id,
      userId: click.user_id
    });

    // Calculate cashback - AccessTrade uses pub_commission field
    const commissionAmount = parseFloat(accesstradeData.pub_commission || accesstradeData.commission || 0);
    const platformCut = commissionAmount * (1 - this.commissionSplit);
    const userCashback = commissionAmount * this.commissionSplit;

    logger.info('Calculated cashback', {
      commissionAmount,
      platformCut,
      userCashback,
      split: this.commissionSplit
    });

    // Map AccessTrade status to our status
    const status = this.mapAccessTradeStatus(accesstradeData);

    // Parse order time - AccessTrade uses sales_time and click_time
    const orderTime = new Date(accesstradeData.sales_time || accesstradeData.click_time || accesstradeData.order_time);
    const approvalTime = status === 'approved' ? new Date() : null;

    // Get order ID and merchant ID
    const orderId = accesstradeData.order_id || accesstradeData._id;
    const merchantId = click.merchant_id || accesstradeData.merchant_id || accesstradeData.merchant;

    // Extract UTM parameters from AccessTrade data
    const utmSource = accesstradeData.utm_source || null;
    const utmMedium = accesstradeData.utm_medium || null;
    const utmCampaign = accesstradeData.utm_campaign || affSid || null;
    const utmContentData = accesstradeData.utm_content || null;

    logger.info('Extracted UTM parameters', {
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent: utmContentData,
      orderId
    });

    // Extract AccessTrade status fields for status detection
    const orderApproved = parseInt(accesstradeData.order_approved) || 0;
    const productsCount = parseInt(accesstradeData.products_count) || 0;
    const orderPending = parseInt(accesstradeData.order_pending) || 0;
    const orderReject = parseInt(accesstradeData.order_reject) || 0;

    // Create conversion record
    const conversion = await Conversion.create({
      userId: click.user_id,
      clickId: click.id,
      accesstradeId: orderId,
      merchantId: merchantId,
      merchantName: accesstradeData.merchant || accesstradeData.merchant_name || null,
      orderCode: accesstradeData.order_code || orderId,
      orderAmount: parseFloat(accesstradeData.billing || 0),
      commission: commissionAmount,
      cashbackAmount: userCashback,
      status: status,
      affSid: affSid,
      utmSource: utmSource,
      utmMedium: utmMedium,
      utmCampaign: utmCampaign,
      utmContent: utmContentData,
      orderTime: orderTime,
      approvalTime: approvalTime,
      orderApproved: orderApproved,
      productsCount: productsCount,
      orderPending: orderPending,
      orderReject: orderReject
    });

    logger.success('Created conversion record', {
      conversionId: conversion.id,
      userId: click.user_id,
      cashbackAmount: userCashback,
      status
    });

    // Create system conversion (for fast lookup)
    try {
      await SystemConversion.createFromATConversion(conversion);
      logger.success('Created system conversion record', {
        conversionId: conversion.id
      });
    } catch (error) {
      logger.warn('Failed to create system conversion (non-fatal)', {
        conversionId: conversion.id,
        error: error.message
      });
    }

    // Update user balance
    if (status === 'approved') {
      // Add directly to available balance
      await User.updateBalance(click.user_id, 'add_pending', userCashback);
      await User.updateBalance(click.user_id, 'pending_to_available', userCashback);

      logger.success('Updated user balance (approved)', {
        userId: click.user_id,
        amount: userCashback
      });
    } else if (status === 'pending') {
      // Add to pending balance
      await User.updateBalance(click.user_id, 'add_pending', userCashback);

      logger.success('Updated user pending balance', {
        userId: click.user_id,
        amount: userCashback
      });
    }

    return {
      status: 'created',
      conversionId: conversion.id,
      userId: click.user_id,
      cashbackAmount: userCashback
    };
  }

  /**
   * Approve a conversion (move from pending to approved)
   * @param {string} conversionId
   * @returns {Promise<void>}
   */
  async approveConversion(conversionId) {
    const conversion = await Conversion.findById(conversionId);

    if (!conversion) {
      throw new Error('Conversion not found');
    }

    if (conversion.status !== 'pending') {
      throw new Error('Only pending conversions can be approved');
    }

    const approvalTime = new Date();

    // Update conversion status
    await Conversion.updateStatus(conversionId, 'approved', approvalTime);

    // Move user balance from pending to available
    await User.updateBalance(conversion.user_id, 'pending_to_available', conversion.cashback_amount);

    logger.success('Approved conversion', {
      conversionId,
      userId: conversion.user_id,
      cashbackAmount: conversion.cashback_amount
    });
  }

  /**
   * Map AccessTrade status to our status
   * Based on AccessTrade fields:
   * - order_reject = 1 → Rejected (đơn huỷ)
   * - is_confirmed = 1 → Approved (đã đối soát - có quyền cashback)
   * - Còn lại → Pending (bao gồm chờ duyệt và tạm duyệt)
   *
   * @param {Object} accesstradeData - Full AccessTrade data object
   * @returns {string}
   */
  mapAccessTradeStatus(accesstradeData) {
    // Check if order was rejected/cancelled
    if (parseInt(accesstradeData.order_reject) === 1) {
      return 'rejected';
    }

    // Check if order is confirmed (đã đối soát)
    // CHỈ KHI NÀY MỚI ĐƯỢC CASHBACK!
    if (parseInt(accesstradeData.is_confirmed) === 1) {
      return 'approved';
    }

    // Everything else is pending
    // This includes:
    // - Chờ duyệt (order_pending != 0)
    // - Tạm duyệt (order_approved != 0, order_pending = 0)
    return 'pending';
  }

  /**
   * Check if conversion meets temp approval criteria
   * Temp approved = AccessTrade approved the order but we haven't received payment yet
   * @param {Object} accesstradeData - Raw conversion data from AccessTrade API
   * @returns {boolean}
   */
  isTempApproved(accesstradeData) {
    // Temp approved conditions:
    // - order_approved > 0 (AccessTrade approved the order)
    // - products_count > 0 (has products in the order)
    // - order_pending = 0 (order is not pending on AccessTrade side)
    const orderApproved = parseInt(accesstradeData.order_approved) || 0;
    const productsCount = parseInt(accesstradeData.products_count) || 0;
    const orderPending = parseInt(accesstradeData.order_pending) || 0;

    return orderApproved > 0 && productsCount > 0 && orderPending === 0;
  }

  /**
   * Create conversion directly without requiring a click match
   * Useful for importing historical conversions
   * @param {Object} accesstradeData - Raw conversion data from AccessTrade API
   * @param {string} userId - User ID to assign the conversion to (optional)
   * @returns {Promise<Object>}
   */
  async createConversionDirect(accesstradeData, userId = null) {
    try {
      const orderId = accesstradeData.order_id || accesstradeData._id;

      logger.info('Creating conversion directly (without click match)', {
        orderId,
        userId
      });

      // Check if conversion already exists
      const existingConversion = await Conversion.findByAccessTradeId(orderId);
      if (existingConversion) {
        logger.info('Conversion already exists', { orderId, existingId: existingConversion.id });
        return { status: 'skipped', reason: 'already_exists', conversionId: existingConversion.id };
      }

      // Calculate cashback
      const commissionAmount = parseFloat(accesstradeData.pub_commission || accesstradeData.commission || 0);
      const platformCut = commissionAmount * (1 - this.commissionSplit);
      const userCashback = commissionAmount * this.commissionSplit;

      // Map status
      const status = this.mapAccessTradeStatus(accesstradeData);

      // Parse timestamps
      const orderTime = new Date(accesstradeData.sales_time || accesstradeData.click_time || accesstradeData.order_time);
      const approvalTime = status === 'approved' ? new Date() : null;

      // Get merchant ID
      const merchantId = accesstradeData.merchant_id || accesstradeData.merchant;

      // Extract UTM parameters
      const utmSource = accesstradeData.utm_source || null;
      const utmMedium = accesstradeData.utm_medium || null;
      const utmCampaign = accesstradeData.utm_campaign || accesstradeData.aff_sid || null;
      const utmContentData = accesstradeData.utm_content || null;

      // Extract AccessTrade status fields for status detection
      const orderApproved = parseInt(accesstradeData.order_approved) || 0;
      const productsCount = parseInt(accesstradeData.products_count) || 0;
      const orderPending = parseInt(accesstradeData.order_pending) || 0;
      const orderReject = parseInt(accesstradeData.order_reject) || 0;

      logger.info('Extracted UTM parameters for direct conversion', {
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent: utmContentData,
        orderId,
        orderApproved,
        productsCount,
        orderPending,
        orderReject
      });

      // Create conversion record (with null click_id since we don't have a match)
      const conversion = await Conversion.create({
        userId: userId, // May be null if not provided
        clickId: null, // No click match
        accesstradeId: orderId,
        merchantId: merchantId,
        merchantName: accesstradeData.merchant || accesstradeData.merchant_name || null,
        orderCode: accesstradeData.order_code || orderId,
        orderAmount: parseFloat(accesstradeData.billing || 0),
        commission: commissionAmount,
        cashbackAmount: userCashback,
        status: status,
        affSid: accesstradeData.aff_sid || accesstradeData.sub_id || null,
        utmSource: utmSource,
        utmMedium: utmMedium,
        utmCampaign: utmCampaign,
        utmContent: utmContentData,
        orderTime: orderTime,
        approvalTime: approvalTime,
        orderApproved: orderApproved,
        productsCount: productsCount,
        orderPending: orderPending,
        orderReject: orderReject
      });

      logger.success('Created conversion directly', {
        conversionId: conversion.id,
        cashbackAmount: userCashback,
        status,
        hasUserId: !!userId
      });

      // Update user balance if userId is provided
      if (userId) {
        if (status === 'approved') {
          await User.updateBalance(userId, 'add_pending', userCashback);
          await User.updateBalance(userId, 'pending_to_available', userCashback);
          logger.success('Updated user balance (approved)', { userId, amount: userCashback });
        } else if (status === 'pending') {
          await User.updateBalance(userId, 'add_pending', userCashback);
          logger.success('Updated user pending balance', { userId, amount: userCashback });
        }
      }

      return {
        status: 'created',
        conversionId: conversion.id,
        userId: userId,
        cashbackAmount: userCashback
      };
    } catch (error) {
      logger.error('Error creating conversion directly', {
        orderId: accesstradeData.order_id || accesstradeData._id,
        error: error.message,
        stack: error.stack
      });
      return { status: 'error', reason: error.message };
    }
  }

  /**
   * Match conversion with click using UTM parameters
   * This is useful for retroactively linking conversions to clicks
   * @param {string} conversionId - ID of the conversion to match
   * @returns {Promise<Object>}
   */
  async matchConversionWithClick(conversionId) {
    try {
      const conversion = await Conversion.findById(conversionId);

      if (!conversion) {
        return { status: 'error', reason: 'conversion_not_found' };
      }

      if (conversion.click_id) {
        return { status: 'skipped', reason: 'already_matched', clickId: conversion.click_id };
      }

      // Try to find matching click using UTM parameters
      let click = null;

      // First try: Match by utm_campaign (which should be unique per click)
      if (conversion.utm_campaign) {
        click = await Click.findByAffSid(conversion.utm_campaign);
        if (click) {
          logger.info('Matched click by utm_campaign', {
            conversionId: conversion.id,
            clickId: click.id,
            utmCampaign: conversion.utm_campaign
          });
        }
      }

      // Second try: Match by aff_sid if utm_campaign didn't work
      if (!click && conversion.aff_sid) {
        click = await Click.findByAffSid(conversion.aff_sid);
        if (click) {
          logger.info('Matched click by aff_sid', {
            conversionId: conversion.id,
            clickId: click.id,
            affSid: conversion.aff_sid
          });
        }
      }

      if (!click) {
        return {
          status: 'skipped',
          reason: 'no_matching_click',
          searchedBy: {
            utmCampaign: conversion.utm_campaign,
            affSid: conversion.aff_sid
          }
        };
      }

      // Update conversion with click_id and user_id
      const db = require('../config/database');
      await db.query(
        'UPDATE conversions SET click_id = $1, user_id = $2, updated_at = NOW() WHERE id = $3',
        [click.id, click.user_id, conversion.id]
      );

      logger.success('Successfully matched conversion with click', {
        conversionId: conversion.id,
        clickId: click.id,
        userId: click.user_id
      });

      // Create system conversion record (for fast lookup in Conversions Management)
      try {
        // Reload conversion to get updated click_id and user_id
        const updatedConversion = await Conversion.findById(conversion.id);
        await SystemConversion.createFromATConversion(updatedConversion);
        logger.success('Created system conversion record after matching', {
          conversionId: conversion.id
        });
      } catch (error) {
        logger.warn('Failed to create system conversion (non-fatal)', {
          conversionId: conversion.id,
          error: error.message
        });
      }

      // If conversion is approved or pending, update user balance
      if (conversion.status === 'approved' && conversion.cashback_amount > 0) {
        await User.updateBalance(click.user_id, 'add_pending', conversion.cashback_amount);
        await User.updateBalance(click.user_id, 'pending_to_available', conversion.cashback_amount);
        logger.info('Updated user balance for matched conversion', {
          userId: click.user_id,
          amount: conversion.cashback_amount
        });
      } else if (conversion.status === 'pending' && conversion.cashback_amount > 0) {
        await User.updateBalance(click.user_id, 'add_pending', conversion.cashback_amount);
        logger.info('Added to pending balance for matched conversion', {
          userId: click.user_id,
          amount: conversion.cashback_amount
        });
      }

      return {
        status: 'matched',
        conversionId: conversion.id,
        clickId: click.id,
        userId: click.user_id
      };
    } catch (error) {
      logger.error('Error matching conversion with click', {
        conversionId,
        error: error.message,
        stack: error.stack
      });
      return { status: 'error', reason: error.message };
    }
  }
}

module.exports = new TrackingService();
