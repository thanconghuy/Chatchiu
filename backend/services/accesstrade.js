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
   * @returns {Promise<Array>}
   */
  async getConversions(startDate, endDate) {
    try {
      // Format dates to ISO string with Z timezone
      const since = startDate.toISOString();
      const until = endDate.toISOString();

      logger.info(`Fetching conversions from AccessTrade`, { since, until });

      const response = await this.axiosInstance.get('/order-list', {
        params: {
          since,
          until
        }
      });

      if (response.data && response.data.data) {
        const conversions = response.data.data;
        logger.success(`Fetched ${conversions.length} conversions from AccessTrade`);
        return conversions;
      }

      return [];
    } catch (error) {
      logger.error('Failed to fetch conversions from AccessTrade', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      // Handle rate limiting
      if (error.response?.status === 429) {
        logger.warn('AccessTrade API rate limit exceeded');
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
