const Conversion = require('../models/Conversion');
const Click = require('../models/Click');
const User = require('../models/User');
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
      const affSid = accesstradeData.aff_sid || accesstradeData.sub_id || accesstradeData.utm_campaign;
      const merchantId = accesstradeData.merchant_id || accesstradeData.merchant;

      logger.info('Processing conversion with data:', {
        orderId,
        affSid,
        merchantId,
        rawKeys: Object.keys(accesstradeData)
      });

      if (!affSid) {
        logger.warn('Conversion missing aff_sid/sub_id', {
          orderId,
          availableFields: Object.keys(accesstradeData)
        });
        return { status: 'skipped', reason: 'missing_aff_sid' };
      }

      logger.info(`Processing conversion for aff_sid: ${affSid}`, {
        orderId,
        merchantId
      });

      // Check if conversion already exists
      const existingConversion = await Conversion.findByAccessTradeId(orderId);

      if (existingConversion) {
        return await this.handleExistingConversion(existingConversion, accesstradeData);
      } else {
        return await this.handleNewConversion(affSid, accesstradeData);
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
    const newStatus = this.mapAccessTradeStatus(accesstradeData.status);

    // Check if status changed from pending to approved
    if (existingConversion.status === 'pending' && newStatus === 'approved') {
      logger.info('Conversion status changed: pending → approved', {
        conversionId: existingConversion.id,
        orderId: accesstradeData._id
      });

      await this.approveConversion(existingConversion.id);

      return {
        status: 'updated',
        conversionId: existingConversion.id,
        oldStatus: 'pending',
        newStatus: 'approved'
      };
    }

    // Check if status changed from pending to rejected
    if (existingConversion.status === 'pending' && newStatus === 'rejected') {
      logger.info('Conversion status changed: pending → rejected', {
        conversionId: existingConversion.id,
        orderId: accesstradeData._id
      });

      const approvalTime = new Date();
      await Conversion.updateStatus(existingConversion.id, 'rejected', approvalTime);

      // Remove from user's pending balance
      await User.updateBalance(existingConversion.user_id, 'reject_pending', existingConversion.cashback_amount);

      return {
        status: 'updated',
        conversionId: existingConversion.id,
        oldStatus: 'pending',
        newStatus: 'rejected'
      };
    }

    logger.info('Conversion already exists, no status change', {
      conversionId: existingConversion.id,
      status: existingConversion.status
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
        orderId: accesstradeData._id
      });
      click = await Click.findByUtmContent(utmContent);
    }

    // Fallback to aff_sid if utm_content match failed
    if (!click) {
      logger.info('No match by utm_content, trying aff_sid', {
        affSid,
        orderId: accesstradeData._id
      });
      click = await Click.findByAffSid(affSid);
    }

    if (!click) {
      logger.warn('No matching click found', {
        affSid,
        utmContent,
        orderId: accesstradeData._id
      });
      return { status: 'skipped', reason: 'no_matching_click' };
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

    // Map AccessTrade status to our status (is_confirmed: 0=pending, 1=approved, 2=rejected)
    const status = this.mapAccessTradeStatus(accesstradeData.is_confirmed || accesstradeData.status);

    // Parse order time - AccessTrade uses sales_time and click_time
    const orderTime = new Date(accesstradeData.sales_time || accesstradeData.click_time || accesstradeData.order_time);
    const approvalTime = status === 'approved' ? new Date() : null;

    // Get order ID and merchant ID
    const orderId = accesstradeData.order_id || accesstradeData._id;
    const merchantId = click.merchant_id || accesstradeData.merchant_id || accesstradeData.merchant;

    // Create conversion record
    const conversion = await Conversion.create({
      clickId: click.id,
      accesstradeId: orderId,
      merchantId: merchantId,
      orderCode: accesstradeData.order_code || orderId,
      orderAmount: parseFloat(accesstradeData.billing || 0),
      commission: commissionAmount,
      cashbackAmount: userCashback,
      status: status,
      orderTime: orderTime,
      approvalTime: approvalTime
    });

    logger.success('Created conversion record', {
      conversionId: conversion.id,
      userId: click.user_id,
      cashbackAmount: userCashback,
      status
    });

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
   * @param {string|number} accesstradeStatus
   * @returns {string}
   */
  mapAccessTradeStatus(accesstradeStatus) {
    // AccessTrade API uses numeric status (is_confirmed):
    // 0 = Pending
    // 1 = Approved
    // 2 = Rejected

    // Also handle string statuses for backward compatibility

    if (accesstradeStatus === null || accesstradeStatus === undefined) {
      return 'pending';
    }

    // Handle numeric status
    const numStatus = parseInt(accesstradeStatus);
    if (!isNaN(numStatus)) {
      if (numStatus === 1) return 'approved';
      if (numStatus === 2) return 'rejected';
      return 'pending';
    }

    // Handle string status
    const statusLower = String(accesstradeStatus).toLowerCase();

    if (statusLower === 'approved' || statusLower === 'success' || statusLower === '1') {
      return 'approved';
    }

    if (statusLower === 'rejected' || statusLower === 'cancelled' || statusLower === '2') {
      return 'rejected';
    }

    return 'pending';
  }
}

module.exports = new TrackingService();
