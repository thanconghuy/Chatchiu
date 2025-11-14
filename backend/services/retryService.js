const Click = require('../models/Click');
const logger = require('../utils/logger');
const accesstradeService = require('./accesstrade');
const trackingService = require('./trackingService');

/**
 * Retry Service
 * Automatically check for missed conversions and retry matching
 *
 * Purpose: Some conversions arrive late from AccessTrade or tracking parameters
 * get dropped during redirect chains. This service periodically checks for
 * unmatched clicks and tries to find their conversions.
 */
class RetryService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Retry matching for unmatched clicks
   * Fetches conversions from AccessTrade for the time period of unmatched clicks
   * and attempts to match them
   *
   * @param {Object} options - Retry options
   * @param {number} options.daysOld - Only retry clicks older than X days (default 1)
   * @param {number} options.limit - Maximum clicks to process (default 100)
   * @returns {Promise<Object>} Retry results
   */
  async retryUnmatchedClicks(options = {}) {
    const { daysOld = 1, limit = 100 } = options;

    if (this.isRunning) {
      logger.warn('Retry service is already running');
      return { status: 'skipped', reason: 'already_running' };
    }

    this.isRunning = true;

    try {
      logger.info('Starting retry service for unmatched clicks', { daysOld, limit });

      const results = {
        total: 0,
        matched: 0,
        stillUnmatched: 0,
        expired: 0,
        errors: 0,
        details: []
      };

      // Find unmatched clicks
      const unmatchedClicks = await Click.findUnmatchedClicks(daysOld, limit);
      results.total = unmatchedClicks.length;

      if (results.total === 0) {
        logger.info('No unmatched clicks found');
        this.isRunning = false;
        return results;
      }

      logger.info(`Found ${results.total} unmatched clicks to retry`);

      // Get date range for fetching conversions
      const oldestClick = unmatchedClicks[unmatchedClicks.length - 1];
      const newestClick = unmatchedClicks[0];

      const startDate = new Date(oldestClick.link_clicked_at);
      const endDate = new Date(newestClick.link_clicked_at);
      endDate.setDate(endDate.getDate() + 30); // Add 30 days for conversion window

      logger.info('Fetching conversions from AccessTrade', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      // Fetch conversions from AccessTrade for this date range
      let atConversions;
      try {
        const conversionData = await accesstradeService.getConversions(startDate, endDate);
        atConversions = conversionData && conversionData.data ? conversionData.data : [];
      } catch (error) {
        logger.error('Failed to fetch conversions from AccessTrade', {
          error: error.message
        });
        this.isRunning = false;
        return {
          ...results,
          status: 'error',
          reason: 'accesstrade_api_failed',
          error: error.message
        };
      }

      logger.info(`Fetched ${atConversions.length} conversions from AccessTrade`);

      // Try to match each unmatched click with conversions
      for (const click of unmatchedClicks) {
        try {
          // Check if click has expired
          if (new Date(click.link_expires_at) < new Date()) {
            results.expired++;
            await Click.updateLastChecked(click.id);
            continue;
          }

          // Build list of possible tracking parameters for this click
          const trackingParams = {
            utm_content: click.utm_content,
            sub2: click.sub2,
            aff_sid: click.aff_sid,
            sub1: click.sub1,
            user_id: click.user_id
          };

          logger.info('Attempting to match click', {
            clickId: click.id,
            tracking: trackingParams
          });

          // Try to find matching conversion in fetched data
          const matchingConversion = atConversions.find(conv => {
            // Try utm_content match
            if (trackingParams.utm_content &&
                (conv.utm_content === trackingParams.utm_content ||
                 conv.sub2 === trackingParams.utm_content)) {
              return true;
            }

            // Try sub2 match
            if (trackingParams.sub2 &&
                (conv.sub2 === trackingParams.sub2 ||
                 conv.utm_content === trackingParams.sub2)) {
              return true;
            }

            // Try aff_sid match
            if (trackingParams.aff_sid &&
                (conv.aff_sid === trackingParams.aff_sid ||
                 conv.utm_campaign === trackingParams.aff_sid)) {
              return true;
            }

            return false;
          });

          if (matchingConversion) {
            logger.info('Found matching conversion for click', {
              clickId: click.id,
              conversionId: matchingConversion.order_id || matchingConversion._id
            });

            // Process the conversion (this will create conversion record and link to click)
            const result = await trackingService.processConversion(matchingConversion);

            if (result.status === 'created' || result.status === 'updated') {
              results.matched++;
              results.details.push({
                clickId: click.id,
                status: 'matched',
                conversionId: result.conversionId
              });
            }
          } else {
            results.stillUnmatched++;
            logger.info('No matching conversion found for click', {
              clickId: click.id
            });
          }

          // Update last_checked_at
          await Click.updateLastChecked(click.id);

        } catch (error) {
          results.errors++;
          logger.error('Error processing unmatched click', {
            clickId: click.id,
            error: error.message
          });
          results.details.push({
            clickId: click.id,
            status: 'error',
            error: error.message
          });
        }
      }

      logger.success('Retry service completed', {
        total: results.total,
        matched: results.matched,
        stillUnmatched: results.stillUnmatched,
        expired: results.expired,
        errors: results.errors
      });

      this.isRunning = false;
      return results;

    } catch (error) {
      this.isRunning = false;
      logger.error('Retry service failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get expiring clicks report
   * Returns clicks that will expire soon and haven't been matched
   *
   * @param {number} daysUntilExpiry - Number of days until expiration (default 3)
   * @param {number} limit - Maximum clicks to return (default 100)
   * @returns {Promise<Array>} Array of expiring clicks
   */
  async getExpiringClicksReport(daysUntilExpiry = 3, limit = 100) {
    try {
      const expiringClicks = await Click.findExpiringSoon(daysUntilExpiry, limit);

      logger.info('Expiring clicks report generated', {
        count: expiringClicks.length,
        daysUntilExpiry
      });

      return expiringClicks.map(click => ({
        clickId: click.id,
        userId: click.user_id,
        merchantName: click.merchant_name,
        clickedAt: click.link_clicked_at,
        expiresAt: click.link_expires_at,
        daysRemaining: Math.ceil((new Date(click.link_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
      }));
    } catch (error) {
      logger.error('Failed to generate expiring clicks report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get retry service statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    try {
      const result = await Click.findUnmatchedClicks(1, 1000);
      const unmatched = result.length;

      const expiring = await Click.findExpiringSoon(7, 1000);

      return {
        unmatchedClicks: unmatched,
        expiringClicks: expiring.length,
        isRunning: this.isRunning
      };
    } catch (error) {
      logger.error('Failed to get retry service stats', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new RetryService();
