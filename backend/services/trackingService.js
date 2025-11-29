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
    // Map conversion status from AccessTrade 'status' field (NOT is_confirmed!)
    const newStatus = this.mapConversionStatus(accesstradeData.status);

    // Extract confirmation data
    const confirmationData = this.extractConfirmationData(accesstradeData);

    // PHASE 2 FIX: Check reconciliation constraints
    // Block updates if conversion is in finalized/paid reconciliation
    if (existingConversion.system_reconciliation_status) {
      const reconStatus = existingConversion.system_reconciliation_status;

      if (reconStatus === 'reconciled' || reconStatus === 'paid') {
        logger.warn('Cannot update status: conversion is in finalized reconciliation', {
          conversionId: existingConversion.id,
          currentStatus: existingConversion.status,
          newStatus: newStatus,
          reconciliationStatus: reconStatus
        });

        return {
          status: 'skipped',
          reason: 'in_finalized_reconciliation',
          conversionId: existingConversion.id,
          reconciliationStatus: reconStatus
        };
      }

      // Warn if in draft reconciliation
      if (reconStatus === 'draft' && existingConversion.status !== newStatus) {
        logger.warn('Updating status for conversion in draft reconciliation', {
          conversionId: existingConversion.id,
          currentStatus: existingConversion.status,
          newStatus: newStatus,
          reconciliationStatus: reconStatus
        });
      }
    }

    // Check if status changed from pending to approved
    if (existingConversion.status === 'pending' && newStatus === 'approved') {
      logger.info('Conversion status changed: pending → approved', {
        conversionId: existingConversion.id,
        orderId: accesstradeData._id
      });

      await this.approveConversion(existingConversion.id);

      // Sync to system_conversions (Conversion.updateStatus already does this, but double-check)
      try {
        await SystemConversion.updateStatusByATConversionId(
          existingConversion.id,
          'approved',
          new Date()
        );
        logger.info('Synced approved status to system_conversions', {
          conversionId: existingConversion.id
        });
      } catch (error) {
        logger.warn('Could not sync to system_conversions (non-fatal)', {
          conversionId: existingConversion.id,
          error: error.message
        });
      }

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

      // Remove from user's pending balance (only if user_id exists)
      if (existingConversion.user_id) {
        await User.updateBalance(existingConversion.user_id, 'reject_pending', existingConversion.cashback_amount);
      } else {
        logger.warn('Cannot update balance: user_id is null', {
          conversionId: existingConversion.id
        });
      }

      // Sync to system_conversions (Conversion.updateStatus already does this)
      try {
        await SystemConversion.updateStatusByATConversionId(
          existingConversion.id,
          'rejected',
          approvalTime
        );
        logger.info('Synced rejected status to system_conversions', {
          conversionId: existingConversion.id
        });
      } catch (error) {
        logger.warn('Could not sync to system_conversions (non-fatal)', {
          conversionId: existingConversion.id,
          error: error.message
        });
      }

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

    // Extract tracking parameters from accesstradeData
    const utmContent = accesstradeData.utm_content || null;
    const sub2 = accesstradeData.sub2 || null; // Backup click_id
    const sub3 = accesstradeData.sub3 || null; // Click type

    // Priority 1: Match by utm_content (click_id)
    if (utmContent) {
      logger.info('Attempting to match by utm_content (click_id)', {
        utmContent,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      click = await Click.findByUtmContent(utmContent);
    }

    // Priority 2: Match by sub2 (backup click_id) if utm_content failed
    if (!click && sub2) {
      logger.info('No match by utm_content, trying sub2 (backup click_id)', {
        sub2,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      click = await Click.findBySub2(sub2);
    }

    // Priority 3: Match by aff_sid if both utm_content and sub2 failed
    if (!click && affSid) {
      logger.info('No match by utm_content or sub2, trying aff_sid', {
        affSid,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      click = await Click.findByAffSid(affSid);
    }

    if (!click) {
      logger.warn('No matching click found - creating conversion without click match', {
        affSid,
        utmContent,
        sub2,
        sub3,
        orderId: accesstradeData.order_id || accesstradeData._id
      });
      // Instead of skipping, create conversion directly without click
      return await this.createConversionDirect(accesstradeData, null);
    }

    // Determine which method successfully matched the click
    let matchedBy = 'unknown';
    if (utmContent && click.utm_content === utmContent) {
      matchedBy = 'utm_content';
    } else if (sub2 && click.sub2 === sub2) {
      matchedBy = 'sub2';
    } else if (affSid && click.aff_sid === affSid) {
      matchedBy = 'aff_sid';
    }

    logger.info('Found matching click', {
      matchedBy,
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

    // Map conversion status from AccessTrade 'status' field OR order counters
    // Priority: order_approved > order_reject > order_pending
    let status = 'pending'; // default
    if (accesstradeData.order_approved && parseInt(accesstradeData.order_approved) > 0) {
      status = 'approved';
    } else if (accesstradeData.order_reject && parseInt(accesstradeData.order_reject) > 0) {
      status = 'rejected';
    } else if (accesstradeData.status !== null && accesstradeData.status !== undefined) {
      // Fallback to status field if counters are not available
      status = this.mapConversionStatus(accesstradeData.status);
    }

    // Extract confirmation data (is_confirmed, confirmed_time, order counters)
    const confirmationData = this.extractConfirmationData(accesstradeData);

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

    logger.info('Extracted conversion data', {
      status,
      isConfirmed: confirmationData.isConfirmed,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent: utmContentData,
      orderId
    });

    // Create conversion record with reconciliation fields
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
      // Reconciliation fields
      isConfirmed: confirmationData.isConfirmed,
      confirmedTime: confirmationData.confirmedTime,
      orderApproved: confirmationData.orderApproved,
      orderPending: confirmationData.orderPending,
      orderReject: confirmationData.orderReject
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
   * Map AccessTrade 'status' field to our conversion status
   * @param {string|number} atStatus - AccessTrade API 'status' field
   * @returns {string} 'pending' | 'approved' | 'rejected'
   */
  mapConversionStatus(atStatus) {
    // AccessTrade API 'status' field:
    // 0 = Pending/Hold
    // 1 = Approved
    // 2 = Rejected

    if (atStatus === null || atStatus === undefined) {
      return 'pending';
    }

    // Handle numeric status
    const numStatus = parseInt(atStatus);
    if (!isNaN(numStatus)) {
      if (numStatus === 1) return 'approved';
      if (numStatus === 2) return 'rejected';
      return 'pending';
    }

    // Handle string status (backward compatibility)
    const statusLower = String(atStatus).toLowerCase();
    if (statusLower === 'approved' || statusLower === 'success' || statusLower === '1') {
      return 'approved';
    }
    if (statusLower === 'rejected' || statusLower === 'cancelled' || statusLower === '2') {
      return 'rejected';
    }

    return 'pending';
  }

  /**
   * Extract reconciliation confirmation data from AccessTrade response
   * @param {Object} accesstradeData - Raw data from AccessTrade API
   * @returns {Object} {isConfirmed, confirmedTime, orderApproved, orderPending, orderReject}
   */
  extractConfirmationData(accesstradeData) {
    // AccessTrade API 'is_confirmed' field:
    // 0 = Chưa đối soát (not confirmed)
    // 1 = Đã đối soát (confirmed for payment)

    const isConfirmed = parseInt(accesstradeData.is_confirmed ?? 0);
    const confirmedTime = isConfirmed === 1 && accesstradeData.confirmed_time
      ? new Date(accesstradeData.confirmed_time)
      : null;

    // Order item counters
    const orderApproved = parseInt(accesstradeData.order_approved || 0);
    const orderPending = parseInt(accesstradeData.order_pending || 0);
    const orderReject = parseInt(accesstradeData.order_reject || 0);

    return {
      isConfirmed,
      confirmedTime,
      orderApproved,
      orderPending,
      orderReject
    };
  }

  /**
   * @deprecated Use mapConversionStatus() instead
   * Kept for backward compatibility
   */
  mapAccessTradeStatus(accesstradeStatus) {
    return this.mapConversionStatus(accesstradeStatus);
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

      // Map conversion status from AccessTrade 'status' field OR order counters
      // Priority: order_approved > order_reject > order_pending
      let status = 'pending'; // default
      if (accesstradeData.order_approved && parseInt(accesstradeData.order_approved) > 0) {
        status = 'approved';
      } else if (accesstradeData.order_reject && parseInt(accesstradeData.order_reject) > 0) {
        status = 'rejected';
      } else if (accesstradeData.status !== null && accesstradeData.status !== undefined) {
        // Fallback to status field if counters are not available
        status = this.mapConversionStatus(accesstradeData.status);
      }

      // Extract confirmation data
      const confirmationData = this.extractConfirmationData(accesstradeData);

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

      logger.info('Extracted data for direct conversion', {
        rawStatus: accesstradeData.status,
        rawIsConfirmed: accesstradeData.is_confirmed,
        rawOrderApproved: accesstradeData.order_approved,
        rawOrderPending: accesstradeData.order_pending,
        rawOrderReject: accesstradeData.order_reject,
        mappedStatus: status,
        isConfirmed: confirmationData.isConfirmed,
        confirmedTime: confirmationData.confirmedTime,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent: utmContentData,
        orderId
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
        // Reconciliation fields (from AccessTrade API)
        isConfirmed: confirmationData.isConfirmed,
        confirmedTime: confirmationData.confirmedTime,
        orderApproved: confirmationData.orderApproved,
        orderPending: confirmationData.orderPending,
        orderReject: confirmationData.orderReject
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

  /**
   * Sync conversion status from AccessTrade API
   * Updates existing conversions with latest status and confirmation data
   * @param {Date} startDate - Start date for sync range
   * @param {Date} endDate - End date for sync range
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} - Sync results
   */
  async syncConversionStatus(startDate, endDate, progressCallback = null) {
    try {
      logger.info('Starting conversion status sync', { startDate, endDate });

      const results = {
        total: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: [],
        processed: 0
      };

      // Fetch conversions from AccessTrade API
      const accesstradeService = require('./accesstrade');
      logger.info('Calling getConversions with dates:', { startDate, endDate });
      const atConversions = await accesstradeService.getConversions(startDate, endDate);

      logger.info('Received response from AccessTrade:', {
        hasData: !!atConversions,
        hasDataArray: !!(atConversions && atConversions.data),
        dataLength: atConversions && atConversions.data ? atConversions.data.length : 0,
        sampleFields: atConversions && atConversions.data && atConversions.data[0] ? Object.keys(atConversions.data[0]) : []
      });

      if (!atConversions || !atConversions.data || atConversions.data.length === 0) {
        logger.info('No conversions found in AccessTrade API for date range');
        return results;
      }

      results.total = atConversions.data.length;
      logger.info(`Found ${results.total} conversions from AccessTrade API`);

      // Process in batches of 30 for optimal performance
      const BATCH_SIZE = 30;
      const conversions = atConversions.data;

      for (let i = 0; i < conversions.length; i += BATCH_SIZE) {
        const batch = conversions.slice(i, i + BATCH_SIZE);

        // Process batch
        for (const atData of batch) {
        try {
          const orderId = atData.order_id || atData._id;

          // Find existing conversion in database
          const existingConversion = await Conversion.findByAccessTradeId(orderId);

          if (!existingConversion) {
            results.skipped++;
            results.details.push({
              order_id: orderId,
              status: 'skipped',
              reason: 'not_found_in_db'
            });
            continue;
          }

          // Map status from order counters (priority) or status field (fallback)
          let newStatus = 'pending';
          if (atData.order_approved && parseInt(atData.order_approved) > 0) {
            newStatus = 'approved';
          } else if (atData.order_reject && parseInt(atData.order_reject) > 0) {
            newStatus = 'rejected';
          } else if (atData.status !== null && atData.status !== undefined) {
            newStatus = this.mapConversionStatus(atData.status);
          }

          // Extract confirmation data
          const confirmationData = this.extractConfirmationData(atData);

          // Debug log to check values
          logger.info('Comparing conversion data for sync', {
            orderId,
            existing: {
              status: existingConversion.status,
              is_confirmed: existingConversion.is_confirmed,
              confirmed_time: existingConversion.confirmed_time
            },
            new: {
              status: newStatus,
              is_confirmed: confirmationData.isConfirmed,
              confirmed_time: confirmationData.confirmedTime
            },
            atRaw: {
              is_confirmed: atData.is_confirmed,
              order_approved: atData.order_approved,
              order_reject: atData.order_reject
            }
          });

          // Check what needs to be updated
          const updates = {};
          let hasChanges = false;

          if (existingConversion.status !== newStatus) {
            updates.status = newStatus;
            hasChanges = true;
          }

          if (existingConversion.is_confirmed !== confirmationData.isConfirmed) {
            updates.is_confirmed = confirmationData.isConfirmed;
            hasChanges = true;
          }

          if (confirmationData.confirmedTime &&
              existingConversion.confirmed_time !== confirmationData.confirmedTime) {
            updates.confirmed_time = confirmationData.confirmedTime;
            hasChanges = true;
          }

          // Update order counter fields if they exist in AT data
          if (atData.order_approved !== undefined &&
              existingConversion.order_approved !== parseInt(atData.order_approved)) {
            updates.order_approved = parseInt(atData.order_approved);
            hasChanges = true;
          }

          if (atData.order_pending !== undefined &&
              existingConversion.order_pending !== parseInt(atData.order_pending)) {
            updates.order_pending = parseInt(atData.order_pending);
            hasChanges = true;
          }

          if (atData.order_reject !== undefined &&
              existingConversion.order_reject !== parseInt(atData.order_reject)) {
            updates.order_reject = parseInt(atData.order_reject);
            hasChanges = true;
          }

          if (!hasChanges) {
            results.skipped++;
            results.details.push({
              order_id: orderId,
              status: 'skipped',
              reason: 'no_changes'
            });
            continue;
          }

          // PHASE 2 FIX: Check reconciliation constraints before updating
          // Block updates if conversion is in finalized/paid reconciliation
          if (updates.status && existingConversion.system_reconciliation_status) {
            const reconStatus = existingConversion.system_reconciliation_status;

            // Block if in finalized or paid reconciliation
            if (reconStatus === 'reconciled' || reconStatus === 'paid') {
              logger.warn('Cannot update status: conversion is in finalized reconciliation', {
                orderId,
                currentStatus: existingConversion.status,
                newStatus: updates.status,
                reconciliationStatus: reconStatus
              });

              results.skipped++;
              results.details.push({
                order_id: orderId,
                status: 'skipped',
                reason: 'in_finalized_reconciliation',
                reconciliation_status: reconStatus
              });
              continue;
            }

            // Warn if in draft reconciliation
            if (reconStatus === 'draft') {
              logger.warn('Updating status for conversion in draft reconciliation', {
                orderId,
                currentStatus: existingConversion.status,
                newStatus: updates.status,
                reconciliationStatus: reconStatus
              });
            }
          }

          // Update conversion in database
          const db = require('../config/database');
          const updateFields = [];
          const updateValues = [];
          let paramCount = 0;

          for (const [field, value] of Object.entries(updates)) {
            paramCount++;
            updateFields.push(`${field} = $${paramCount}`);
            updateValues.push(value);
          }

          paramCount++;
          updateFields.push(`updated_at = NOW()`);
          updateValues.push(existingConversion.id);

          const updateQuery = `
            UPDATE conversions
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
          `;

          const updateResult = await db.query(updateQuery, updateValues);
          const updatedConversion = updateResult.rows[0];

          // CRITICAL FIX: Update user balance if status changed
          if (updates.status && existingConversion.user_id) {
            const oldStatus = existingConversion.status;
            const newStatusValue = updates.status;

            // pending → approved: Move pending to available
            if (oldStatus === 'pending' && newStatusValue === 'approved') {
              await User.updateBalance(
                existingConversion.user_id,
                'pending_to_available',
                existingConversion.cashback_amount
              );
              logger.info('Updated user balance: pending → approved', {
                userId: existingConversion.user_id,
                amount: existingConversion.cashback_amount
              });
            }

            // pending → rejected: Remove from pending
            if (oldStatus === 'pending' && newStatusValue === 'rejected') {
              await User.updateBalance(
                existingConversion.user_id,
                'reject_pending',
                existingConversion.cashback_amount
              );
              logger.info('Updated user balance: pending → rejected', {
                userId: existingConversion.user_id,
                amount: existingConversion.cashback_amount
              });
            }

            // Edge case: approved → pending (reversal) - very rare
            if (oldStatus === 'approved' && newStatusValue === 'pending') {
              logger.warn('Status reversal detected: approved → pending', {
                conversionId: existingConversion.id,
                userId: existingConversion.user_id
              });
              // Move available back to pending
              await User.updateBalance(
                existingConversion.user_id,
                'available_to_pending',
                existingConversion.cashback_amount
              );
            }
          }

          // CRITICAL FIX: Sync to system_conversions
          if (updates.status || updates.approval_time) {
            try {
              await SystemConversion.updateStatusByATConversionId(
                existingConversion.id,
                updates.status || existingConversion.status,
                updates.approval_time || existingConversion.approval_time
              );
              logger.info('Synced status to system_conversions', {
                orderId,
                status: updates.status
              });
            } catch (error) {
              logger.warn('Could not sync to system_conversions (non-fatal)', {
                orderId,
                error: error.message
              });
            }
          }

          results.updated++;
          results.details.push({
            order_id: orderId,
            status: 'updated',
            changes: updates,
            old_values: {
              status: existingConversion.status,
              is_confirmed: existingConversion.is_confirmed,
              confirmed_time: existingConversion.confirmed_time
            }
          });

          logger.info('Synced conversion status', {
            orderId,
            changes: updates
          });

        } catch (error) {
          results.errors++;
          results.details.push({
            order_id: atData.order_id || atData._id,
            status: 'error',
            error: error.message
          });
          logger.error('Error syncing conversion', {
            orderId: atData.order_id || atData._id,
            error: error.message
          });
        }

        // Increment processed count
        results.processed++;
      }

        // Report progress after each batch
        if (progressCallback) {
          progressCallback({
            total: results.total,
            processed: results.processed,
            updated: results.updated,
            skipped: results.skipped,
            errors: results.errors,
            percentage: Math.round((results.processed / results.total) * 100)
          });
        }

        // Small delay between batches to prevent overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.success('Conversion status sync completed', {
        total: results.total,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors
      });

      return results;

    } catch (error) {
      logger.error('Failed to sync conversion status', {
        startDate,
        endDate,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new TrackingService();
