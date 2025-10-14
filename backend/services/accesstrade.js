const axios = require('axios');
const logger = require('../utils/logger');

/**
 * AccessTrade API Service
 * Handles communication with AccessTrade API
 */
class AccessTradeService {
  constructor() {
    this.accessToken = process.env.ACCESSTRADE_ACCESS_TOKEN;
    this.baseURL = 'https://api.accesstrade.vn/v1';

    if (!this.accessToken) {
      logger.warn('ACCESSTRADE_ACCESS_TOKEN not configured in environment');
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds
    });
  }

  /**
   * Get conversions from AccessTrade API
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {Object} options - Additional query parameters
   * @returns {Promise<Array>}
   */
  async getConversions(startDate, endDate, options = {}) {
    try {
      // Format dates to ISO string with Z timezone
      const since = startDate.toISOString();
      const until = endDate.toISOString();

      const params = {
        since,
        until,
        limit: options.limit || 300, // Tối đa 300
        page: options.page || 1,
        ...options.status && { status: options.status }, // 0: Pending, 1: Approved, 2: Rejected
        ...options.merchant && { merchant: options.merchant },
        ...options.utm_source && { utm_source: options.utm_source },
        ...options.utm_campaign && { utm_campaign: options.utm_campaign },
        ...options.utm_medium && { utm_medium: options.utm_medium },
        ...options.utm_content && { utm_content: options.utm_content }
      };

      logger.info(`Fetching conversions from AccessTrade`, params);

      const response = await this.axiosInstance.get('/order-list', {
        params
      });

      if (response.data && response.data.data) {
        const conversions = response.data.data;
        const total = response.data.total || conversions.length;
        const currentPage = response.data.page || 1;
        const totalPages = response.data.total_page || 1;

        logger.success(`Fetched ${conversions.length} conversions from AccessTrade (Page ${currentPage}/${totalPages}, Total: ${total})`);

        return {
          data: conversions,
          pagination: {
            total,
            page: currentPage,
            total_page: totalPages,
            limit: params.limit
          }
        };
      }

      return {
        data: [],
        pagination: {
          total: 0,
          page: 1,
          total_page: 0,
          limit: params.limit
        }
      };
    } catch (error) {
      logger.error('Failed to fetch conversions from AccessTrade', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      // Handle rate limiting
      if (error.response?.status === 429) {
        logger.warn('AccessTrade API rate limit exceeded - waiting 60 seconds');
        throw new Error('Rate limit exceeded');
      }

      throw error;
    }
  }

  /**
   * Get single conversion details
   * @param {string} conversionId
   * @returns {Promise<Object>}
   */
  async getConversionDetails(conversionId) {
    try {
      const response = await this.axiosInstance.get(`/conversions/${conversionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch conversion details', {
        conversionId,
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      // Try to fetch conversions from last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      await this.getConversions(startDate, endDate);
      logger.success('AccessTrade API connection test successful');
      return true;
    } catch (error) {
      logger.error('AccessTrade API connection test failed', {
        message: error.message
      });
      return false;
    }
  }
}

module.exports = new AccessTradeService();
