const axios = require('axios');
const logger = require('../utils/logger');
const { generateAffSid, buildUtmParams } = require('./linkGenerator');

/**
 * AccessTrade Link Service
 * Official API integration for generating tracking links
 *
 * Documentation: https://developers.accesstrade.vn/api-publisher-vietnamese/tao-tracking-link
 *
 * Benefits over DIY approach:
 * - Official cookie setting by AccessTrade
 * - Better tracking attribution
 * - Automatic parameter handling
 * - Higher conversion rate
 */
class AccessTradeLinkService {
  constructor() {
    this.apiUrl = process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn/v1';
    this.accessToken = process.env.ACCESSTRADE_ACCESS_TOKEN;

    if (!this.accessToken) {
      logger.warn('AccessTrade API token not configured - API mode disabled');
    }
  }

  /**
   * Generate tracking link using AccessTrade official API
   *
   * @param {Object} user - User object { id, username }
   * @param {Object} merchant - Merchant object { campaign_id, deep_link_base }
   * @param {string} clickId - Click UUID from database
   * @param {string} clickType - 'button' or 'link'
   * @param {string|null} productUrl - Product URL (for 'link' type)
   * @returns {Promise<Object>} { affiliateUrl, affSid, utmParams, originalUrl, clickId, source: 'api' }
   */
  async generateLink(user, merchant, clickId, clickType, productUrl = null) {
    try {
      if (!this.accessToken) {
        throw new Error('AccessTrade API token not configured');
      }

      // Validate inputs
      this.validateInputs(user, merchant, clickId, clickType, productUrl);

      // Generate tracking IDs
      const affSid = generateAffSid(user.id);

      // Build UTM parameters with sub parameters
      const extraParams = {
        userId: user.id,
        clickId: clickId,
        clickType: clickType
      };
      const utmParams = buildUtmParams(user.username, clickId, extraParams);

      // Determine destination URL
      const destinationUrl = clickType === 'button'
        ? (merchant.deep_link_base || `https://${merchant.id}.vn`)
        : productUrl;

      // Build API request
      const requestData = {
        url: destinationUrl,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content,
        utm_term: affSid, // Use utm_term for aff_sid (AccessTrade convention)
        // Sub parameters for backup tracking
        sub1: utmParams.sub1,
        sub2: utmParams.sub2,
        sub3: utmParams.sub3,
        sub4: utmParams.sub4
      };

      logger.info('Calling AccessTrade API to generate link', {
        merchant: merchant.name || merchant.id,
        clickType,
        destinationUrl: destinationUrl.substring(0, 50) + '...'
      });

      // Call AccessTrade API
      const response = await axios.post(
        `${this.apiUrl}/links/create`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      if (!response.data || !response.data.data || !response.data.data.tracking_link) {
        throw new Error('Invalid response from AccessTrade API');
      }

      const affiliateUrl = response.data.data.tracking_link;

      logger.success('AccessTrade API link generated successfully', {
        merchant: merchant.name || merchant.id,
        linkLength: affiliateUrl.length
      });

      return {
        affiliateUrl,
        affSid,
        utmParams,
        originalUrl: destinationUrl,
        clickId,
        source: 'api' // Important: Mark this as API-generated
      };

    } catch (error) {
      logger.error('AccessTrade API link generation failed', {
        error: error.message,
        merchant: merchant?.name || merchant?.id,
        statusCode: error.response?.status,
        responseData: error.response?.data
      });

      // Rethrow for caller to handle fallback
      throw new Error(`AccessTrade API failed: ${error.message}`);
    }
  }

  /**
   * Validate inputs
   * @throws {Error} If validation fails
   */
  validateInputs(user, merchant, clickId, clickType, productUrl) {
    if (!user?.id || !user?.username) {
      throw new Error('Invalid user object - missing id or username');
    }

    if (!merchant?.campaign_id) {
      throw new Error('Invalid merchant - missing campaign_id');
    }

    if (!clickId) {
      throw new Error('Click ID is required');
    }

    if (!['button', 'link'].includes(clickType)) {
      throw new Error(`Invalid click type: ${clickType}. Must be 'button' or 'link'`);
    }

    if (clickType === 'link' && !productUrl) {
      throw new Error('Product URL required for click type "link"');
    }
  }

  /**
   * Check if API mode is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!this.accessToken;
  }

  /**
   * Test API connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      if (!this.accessToken) {
        return {
          success: false,
          message: 'API token not configured'
        };
      }

      // Try a simple API call
      const response = await axios.get(
        `${this.apiUrl}/merchants`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 5000
        }
      );

      return {
        success: true,
        message: 'API connection successful',
        merchantsCount: response.data?.data?.length || 0
      };

    } catch (error) {
      return {
        success: false,
        message: `API connection failed: ${error.message}`,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new AccessTradeLinkService();
