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
   * Get order details from AccessTrade using order-products API
   * @param {string} orderId - AccessTrade order ID
   * @param {string} merchantSlug - Merchant slug (e.g., 'lazadacps', 'shopee', 'tiki')
   * @returns {Promise<Object>}
   */
  async getOrderDetails(orderId, merchantSlug = null) {
    await this.checkRateLimit();

    if (!this.API_TOKEN) {
      throw new Error('AccessTrade API token not configured. Please set ACCESSTRADE_API_TOKEN in Vercel environment variables (Dashboard → Settings → Environment Variables).');
    }

    try {
      // Build API URL
      let apiUrl = `${this.API_URL}/order-products?order_id=${encodeURIComponent(orderId)}`;

      // Add merchant parameter if provided
      if (merchantSlug) {
        apiUrl += `&merchant=${encodeURIComponent(merchantSlug)}`;
      }

      logger.info(`Fetching order details from AT API: ${apiUrl}`);

      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Token ${this.API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      // API returns { current_page, data: [...], total }
      // Each product has billing/commission/quantity objects with approved/pending/reject values
      if (response.data && response.data.data && response.data.data.length > 0) {
        const products = response.data.data;
        const firstProduct = products[0];

        // Aggregate billing, commission, quantity from all products
        const aggregated = products.reduce((acc, product) => {
          return {
            billing_approved: acc.billing_approved + (parseFloat(product.billing?.approved) || 0),
            billing_pending: acc.billing_pending + (parseFloat(product.billing?.pending) || 0),
            billing_reject: acc.billing_reject + (parseFloat(product.billing?.reject) || 0),
            commission_approved: acc.commission_approved + (parseFloat(product.commission?.approved) || 0),
            commission_pending: acc.commission_pending + (parseFloat(product.commission?.pending) || 0),
            commission_reject: acc.commission_reject + (parseFloat(product.commission?.reject) || 0),
            quantity_approved: acc.quantity_approved + (parseInt(product.quantity?.approved) || 0),
            quantity_pending: acc.quantity_pending + (parseInt(product.quantity?.pending) || 0),
            quantity_reject: acc.quantity_reject + (parseInt(product.quantity?.reject) || 0)
          };
        }, {
          billing_approved: 0,
          billing_pending: 0,
          billing_reject: 0,
          commission_approved: 0,
          commission_pending: 0,
          commission_reject: 0,
          quantity_approved: 0,
          quantity_pending: 0,
          quantity_reject: 0
        });

        // Calculate total billing and commission
        const totalBilling = aggregated.billing_approved + aggregated.billing_pending + aggregated.billing_reject;
        const totalCommission = aggregated.commission_approved + aggregated.commission_pending + aggregated.commission_reject;

        // Determine is_confirmed based on order status
        // 0 = pending (has pending items)
        // 1 = approved (has approved items, no pending)
        // 2 = rejected (only rejected items)
        let is_confirmed = 0; // default: pending
        if (aggregated.quantity_approved > 0 && aggregated.quantity_pending === 0 && aggregated.quantity_reject === 0) {
          is_confirmed = 1; // all approved
        } else if (aggregated.quantity_approved === 0 && aggregated.quantity_pending === 0 && aggregated.quantity_reject > 0) {
          is_confirmed = 2; // all rejected
        } else if (aggregated.quantity_pending > 0) {
          is_confirmed = 0; // has pending
        }

        // Aggregate order information
        const orderInfo = {
          _id: orderId,
          order_id: orderId,
          merchant: firstProduct.merchant,
          billing: totalBilling,
          pub_commission: totalCommission,
          is_confirmed: is_confirmed,
          click_time: firstProduct.click_time,
          sales_time: firstProduct.sales_time,
          confirmed_time: firstProduct.confirmed_time,
          // Breakdown by status
          order_approved: aggregated.quantity_approved,
          order_pending: aggregated.quantity_pending,
          order_reject: aggregated.quantity_reject,
          billing_approved: aggregated.billing_approved,
          billing_pending: aggregated.billing_pending,
          billing_reject: aggregated.billing_reject,
          commission_approved: aggregated.commission_approved,
          commission_pending: aggregated.commission_pending,
          commission_reject: aggregated.commission_reject,
          // Include all products for reference
          products: products,
          total_products: response.data.total
        };

        logger.info(`Order ${orderId} aggregated: billing=${totalBilling}, commission=${totalCommission}, status=${is_confirmed} (0=pending, 1=approved, 2=rejected)`);

        return orderInfo;
      }

      logger.warn(`Order ${orderId} not found or has no products`);
      return null;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`Order ${orderId} not found in AccessTrade`);
        return null;
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.error('AccessTrade authentication failed', {
          orderId,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });
        throw new Error('Invalid AccessTrade API token. Please check ACCESSTRADE_API_TOKEN configuration.');
      }

      logger.error('Error fetching order details', {
        orderId,
        merchantSlug,
        error: error.message,
        status: error.response?.status,
        response: error.response?.data
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

    // Validate API token first
    if (!this.API_TOKEN) {
      throw new Error('AccessTrade API token not configured. Please set ACCESSTRADE_API_TOKEN in Vercel environment variables (Dashboard → Settings → Environment Variables).');
    }

    logger.info('='.repeat(60));
    logger.info('Starting pending orders status update');
    logger.info('='.repeat(60));
    logger.info('Configuration:', {
      apiToken: this.API_TOKEN ? `${this.API_TOKEN.substring(0, 10)}...` : 'NOT SET',
      apiUrl: this.API_URL,
      limit,
      olderThanDays
    });

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
