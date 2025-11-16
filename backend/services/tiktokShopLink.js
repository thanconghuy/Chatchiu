const axios = require('axios');
const logger = require('../utils/logger');
const { buildUtmParams, generateAffSid } = require('./linkGenerator');

/**
 * TikTok Shop Link Service
 * Official API V2 integration for TikTok Shop tracking links
 *
 * Documentation: https://api.accesstrade.vn/v2/tiktokshop_product_feeds/create_link
 *
 * Key differences from Generic V1 API:
 * - Endpoint: /v2/tiktokshop_product_feeds/create_link (not /v1/product_link/create)
 * - Input: product_url (string) instead of urls (array)
 * - No campaign_id required (auto-detected)
 * - Response includes product metadata (name, price, image, commission)
 * - Validates if product is in TikTok Affiliate program
 * - Returns short URL for sharing
 */
class TikTokShopLinkService {
  constructor() {
    this.apiUrl = process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn';
    this.accessToken = null;
    this.lastTokenCheck = 0;
    this.tokenCheckInterval = 60000; // Check every 60 seconds

    // Initialize token
    this.loadToken();
  }

  /**
   * Load token from environment (updated by admin settings)
   */
  async loadToken() {
    this.accessToken = process.env.ACCESSTRADE_ACCESS_TOKEN || process.env.ACCESSTRADE_API_TOKEN;
    this.lastTokenCheck = Date.now();

    if (this.accessToken) {
      logger.info('TikTok Shop API: Token loaded from environment');
    } else {
      logger.warn('TikTok Shop API: Token not configured - API mode disabled');
    }
  }

  /**
   * Get current token (reload if needed)
   */
  async getToken() {
    // Reload token if cache expired
    if (Date.now() - this.lastTokenCheck > this.tokenCheckInterval) {
      await this.loadToken();
    }
    return this.accessToken;
  }

  /**
   * Detect if URL is TikTok Shop
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  isTikTokShopUrl(url) {
    if (!url) return false;

    const tikTokPatterns = [
      'tiktok.com',
      'vt.tiktok.com',
      'shop.tiktok.com',
      'www.tiktok.com'
    ];

    return tikTokPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  /**
   * Generate TikTok Shop tracking link using AccessTrade V2 API
   *
   * @param {Object} user - User object { id, username }
   * @param {string} clickId - Click UUID from database
   * @param {string} productUrl - TikTok Shop product URL
   * @param {Object} utmParams - UTM parameters object
   * @returns {Promise<Object>} {
   *   affiliateUrl: string,
   *   shortUrl: string,
   *   affSid: string,
   *   utmParams: object,
   *   originalUrl: string,
   *   clickId: string,
   *   source: 'tiktok-api',
   *   productInfo: {
   *     id: string,
   *     name: string,
   *     price: { amount: string, currency: string },
   *     image: string,
   *     commission: { amount: string, currency: string, rate: number }
   *   }
   * }
   */
  async generateLink(user, clickId, productUrl, utmParams = null) {
    try {
      // Get latest token
      const token = await this.getToken();
      if (!token) {
        throw new Error('TikTok Shop API: AccessTrade API token not configured');
      }

      // Validate inputs
      this.validateInputs(user, clickId, productUrl);

      // Validate TikTok URL
      if (!this.isTikTokShopUrl(productUrl)) {
        throw new Error('Invalid TikTok Shop URL. URL must contain tiktok.com domain');
      }

      // Generate tracking IDs if not provided
      const affSid = generateAffSid(user.id);

      // Build UTM parameters if not provided
      if (!utmParams) {
        const extraParams = {
          userId: user.id,
          clickId: clickId,
          clickType: 'link'
        };
        utmParams = buildUtmParams(user.username, clickId, extraParams);
      }

      // Build API request for TikTok Shop V2
      // https://api.accesstrade.vn/v2/tiktokshop_product_feeds/create_link
      const requestData = {
        product_url: productUrl,  // String (not array like V1)
        // Optional: product_id can be provided if known
        // UTM parameters
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content,
        // Sub parameters for backup tracking
        sub1: utmParams.sub1,
        sub2: utmParams.sub2,
        sub3: utmParams.sub3,
        sub4: utmParams.sub4
      };

      logger.info('TikTok Shop API: Generating link', {
        user: user.username,
        clickId,
        productUrl: productUrl.substring(0, 50) + '...'
      });

      // Call TikTok Shop V2 API
      // Endpoint: POST /v2/tiktokshop_product_feeds/create_link
      const response = await axios.post(
        `${this.apiUrl}/v2/tiktokshop_product_feeds/create_link`,
        requestData,
        {
          headers: {
            'Authorization': `Token ${token}`,  // AccessTrade uses "Token" not "Bearer"
            'Content-Type': 'application/json',
            'accept': 'application/json, text/plain, */*'
          },
          timeout: 15000 // 15 second timeout
        }
      );

      logger.info('TikTok Shop API: Response received', {
        status: response.status,
        hasData: !!response.data,
        success: response.data?.status
      });

      // V2 Response format: { status: true, data: { aff_url, aff_short_url, product_* }, message: "..." }
      if (!response.data || response.data.status !== true || !response.data.data) {
        const errorMessage = response.data?.message || 'Invalid response from TikTok Shop API';
        logger.error('TikTok Shop API: Invalid response', {
          message: errorMessage,
          responseData: response.data
        });
        throw new Error(errorMessage);
      }

      const data = response.data.data;

      // Validate required fields
      if (!data.aff_url) {
        throw new Error('TikTok Shop API: Missing aff_url in response');
      }

      const affiliateUrl = data.aff_url;
      const shortUrl = data.aff_short_url || affiliateUrl;

      // Extract product information
      const productInfo = {
        id: data.product_id || null,
        name: data.product_name || null,
        price: data.product_price || null,
        image: data.product_image || null,
        commission: data.product_commission || null
      };

      logger.success('TikTok Shop API: Link generated successfully', {
        user: user.username,
        clickId,
        hasProductInfo: !!(productInfo.name && productInfo.commission),
        commission: productInfo.commission?.amount || 'N/A'
      });

      return {
        affiliateUrl,
        shortUrl,
        affSid,
        utmParams,
        originalUrl: productUrl,
        clickId,
        source: 'tiktok-api',
        productInfo
      };

    } catch (error) {
      // Handle specific error cases
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        logger.error('TikTok Shop API: Request failed', {
          status,
          message: errorData?.message || error.message,
          productUrl: productUrl.substring(0, 50) + '...'
        });

        // Product not in campaign
        if (status === 400 || (errorData && errorData.message && errorData.message.includes('not part of the campaign'))) {
          throw new Error('Product is not part of TikTok Shop affiliate program. Please verify the product URL.');
        }

        // Authentication failed
        if (status === 401 || status === 403) {
          throw new Error('TikTok Shop API: Invalid or expired access token. Please check ACCESSTRADE_ACCESS_TOKEN configuration.');
        }

        throw new Error(`TikTok Shop API failed: ${errorData?.message || error.message}`);
      }

      logger.error('TikTok Shop API: Link generation failed', {
        error: error.message,
        productUrl: productUrl.substring(0, 50) + '...'
      });

      // Rethrow for caller to handle fallback
      throw new Error(`TikTok Shop API failed: ${error.message}`);
    }
  }

  /**
   * Validate inputs
   * @throws {Error} If validation fails
   */
  validateInputs(user, clickId, productUrl) {
    if (!user?.id || !user?.username) {
      throw new Error('Invalid user object - missing id or username');
    }

    if (!clickId) {
      throw new Error('Click ID is required');
    }

    if (!productUrl || typeof productUrl !== 'string') {
      throw new Error('Product URL is required and must be a string');
    }
  }

  /**
   * Check if API mode is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Test API connection with a sample TikTok Shop product
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      // Get latest token
      await this.loadToken();
      const token = this.accessToken;

      if (!token) {
        return {
          success: false,
          message: 'TikTok Shop API: Token not configured'
        };
      }

      // Test with a sample TikTok Shop product URL
      // This will validate authentication without creating a real link
      const testUrl = 'https://vt.tiktok.com/test';

      const response = await axios.post(
        `${this.apiUrl}/v2/tiktokshop_product_feeds/create_link`,
        {
          product_url: testUrl,
          utm_source: 'test',
          utm_medium: 'test',
          utm_campaign: 'test',
          utm_content: 'test'
        },
        {
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000,
          validateStatus: (status) => status < 500 // Accept 4xx errors for testing
        }
      );

      // Even if the test URL fails (expected), we can check if auth is OK
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: 'TikTok Shop API: Authentication failed - invalid token'
        };
      }

      return {
        success: true,
        message: 'TikTok Shop API: Connection successful',
        note: 'API is accessible and token is valid'
      };

    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        return {
          success: false,
          message: 'TikTok Shop API: Authentication failed - invalid token'
        };
      }

      return {
        success: false,
        message: `TikTok Shop API: Connection test failed - ${error.message}`,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new TikTokShopLinkService();
