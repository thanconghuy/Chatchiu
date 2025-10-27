const axios = require('axios');
const Conversion = require('../models/Conversion');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Service to update pending orders from AccessTrade
 * Uses Order Details API with rate limiting (10 requests/minute)
 */
class PendingOrdersUpdateService {
  constructor() {
    this.API_TOKEN = process.env.ACCESSTRADE_API_TOKEN;
    this.API_URL = process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn/v1';
    this.RATE_LIMIT = 10; // 10 requests per minute
    this.RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
    this.requestTimes = [];
    this.commissionSplit = parseFloat(process.env.COMMISSION_SPLIT || '0.7');
  }

  /**
   * Wait if rate limit is reached
   */
  async checkRateLimit() {
    const now = Date.now();

    // Remove requests older than 1 minute
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.RATE_LIMIT_WINDOW
    );

    // If we've hit the limit, wait
    if (this.requestTimes.length >= this.RATE_LIMIT) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.RATE_LIMIT_WINDOW - (now - oldestRequest);

      if (waitTime > 0) {
        logger.info(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime + 100));
      }
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }

  /**
   * Get order details from AccessTrade
   * @param {string} orderId - AccessTrade order ID
   * @returns {Promise<Object>}
   */
  async getOrderDetails(orderId) {
    await this.checkRateLimit();

    try {
      const response = await axios.get(
        `${this.API_URL}/publisher/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Token ${this.API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`Order ${orderId} not found in AccessTrade`);
        return null;
      }

      logger.error('Error fetching order details', {
        orderId,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Map AccessTrade status to our status
   * @param {number} isConfirmed - AccessTrade is_confirmed field (0=pending, 1=approved, 2=rejected)
   * @returns {string}
   */
  mapAccessTradeStatus(isConfirmed) {
    if (isConfirmed === 1) return 'approved';
    if (isConfirmed === 2) return 'rejected';
    return 'pending';
  }

  /**
   * Update a single pending conversion
   * @param {Object} conversion - Conversion record from database
   * @returns {Promise<Object>}
   */
  async updatePendingConversion(conversion) {
    try {
      // Get latest order details from AccessTrade
      const orderDetails = await this.getOrderDetails(conversion.accesstrade_id);

      if (!orderDetails) {
        return {
          status: 'error',
          conversionId: conversion.id,
          orderId: conversion.accesstrade_id,
          reason: 'order_not_found_in_at'
        };
      }

      // Check if status changed
      const newStatus = this.mapAccessTradeStatus(orderDetails.is_confirmed);

      if (conversion.status === newStatus) {
        return {
          status: 'unchanged',
          conversionId: conversion.id,
          orderId: conversion.accesstrade_id,
          currentStatus: conversion.status
        };
      }

      // Status changed - update conversion and user balance
      logger.info(`Status changed: ${conversion.status} → ${newStatus}`, {
        conversionId: conversion.id,
        orderId: conversion.accesstrade_id
      });

      if (newStatus === 'approved') {
        return await this.approveConversion(conversion);
      } else if (newStatus === 'rejected') {
        return await this.rejectConversion(conversion);
      }

      return {
        status: 'unchanged',
        conversionId: conversion.id,
        orderId: conversion.accesstrade_id,
        currentStatus: conversion.status
      };

    } catch (error) {
      logger.error('Error updating pending conversion', {
        conversionId: conversion.id,
        error: error.message
      });

      return {
        status: 'error',
        conversionId: conversion.id,
        orderId: conversion.accesstrade_id,
        reason: error.message
      };
    }
  }

  /**
   * Approve a pending conversion
   * @param {Object} conversion
   * @returns {Promise<Object>}
   */
  async approveConversion(conversion) {
    const approvalTime = new Date();

    // Update conversion status in database
    await Conversion.updateStatus(conversion.id, 'approved', approvalTime);

    // Move user balance from pending to available
    if (conversion.user_id && conversion.cashback_amount > 0) {
      await User.updateBalance(
        conversion.user_id,
        'pending_to_available',
        conversion.cashback_amount
      );
    }

    logger.success('Approved conversion', {
      conversionId: conversion.id,
      orderId: conversion.accesstrade_id,
      userId: conversion.user_id,
      cashbackAmount: conversion.cashback_amount
    });

    return {
      status: 'updated',
      conversionId: conversion.id,
      orderId: conversion.accesstrade_id,
      oldStatus: 'pending',
      newStatus: 'approved',
      cashbackAmount: conversion.cashback_amount
    };
  }

  /**
   * Reject a pending conversion
   * @param {Object} conversion
   * @returns {Promise<Object>}
   */
  async rejectConversion(conversion) {
    const approvalTime = new Date();

    // Update conversion status in database
    await Conversion.updateStatus(conversion.id, 'rejected', approvalTime);

    // Remove from user's pending balance
    if (conversion.user_id && conversion.cashback_amount > 0) {
      await User.updateBalance(
        conversion.user_id,
        'reject_pending',
        conversion.cashback_amount
      );
    }

    logger.warn('Rejected conversion', {
      conversionId: conversion.id,
      orderId: conversion.accesstrade_id,
      userId: conversion.user_id,
      cashbackAmount: conversion.cashback_amount
    });

    return {
      status: 'updated',
      conversionId: conversion.id,
      orderId: conversion.accesstrade_id,
      oldStatus: 'pending',
      newStatus: 'rejected',
      cashbackAmount: conversion.cashback_amount
    };
  }

  /**
   * Update all pending conversions
   * @param {Object} options - Options for the update
   * @param {number} options.limit - Maximum number of conversions to update (default: 50)
   * @param {number} options.olderThanDays - Only update conversions older than N days (default: 1)
   * @returns {Promise<Object>}
   */
  async updateAllPendingConversions(options = {}) {
    const limit = options.limit || 50; // Default: update 50 conversions max
    const olderThanDays = options.olderThanDays || 1; // Default: only update orders older than 1 day

    logger.info('='.repeat(60));
    logger.info('Starting pending orders status update');
    logger.info('='.repeat(60));

    try {
      // Get all pending conversions from database
      const db = require('../config/database');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await db.query(
        `SELECT * FROM conversions
         WHERE status = 'pending'
         AND order_time < $1
         ORDER BY order_time ASC
         LIMIT $2`,
        [cutoffDate, limit]
      );

      const pendingConversions = result.rows;

      if (pendingConversions.length === 0) {
        logger.info('No pending conversions found to update');
        return {
          total: 0,
          updated: 0,
          unchanged: 0,
          errors: 0,
          results: []
        };
      }

      logger.info(`Found ${pendingConversions.length} pending conversions to check`);
      logger.info(`Rate limit: ${this.RATE_LIMIT} requests per minute`);

      const results = {
        total: pendingConversions.length,
        updated: 0,
        unchanged: 0,
        errors: 0,
        details: []
      };

      // Process each pending conversion
      for (const conversion of pendingConversions) {
        const updateResult = await this.updatePendingConversion(conversion);

        results.details.push(updateResult);

        if (updateResult.status === 'updated') {
          results.updated++;
          logger.success(`✓ Updated: ${updateResult.orderId} (${updateResult.oldStatus} → ${updateResult.newStatus})`);
        } else if (updateResult.status === 'unchanged') {
          results.unchanged++;
          logger.info(`○ Unchanged: ${updateResult.orderId}`);
        } else if (updateResult.status === 'error') {
          results.errors++;
          logger.error(`✗ Error: ${updateResult.orderId} - ${updateResult.reason}`);
        }

        // Small delay between requests (in addition to rate limiting)
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info('='.repeat(60));
      logger.success('Pending orders update completed', {
        total: results.total,
        updated: results.updated,
        unchanged: results.unchanged,
        errors: results.errors
      });
      logger.info('='.repeat(60));

      return results;

    } catch (error) {
      logger.error('Fatal error during pending orders update', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new PendingOrdersUpdateService();
