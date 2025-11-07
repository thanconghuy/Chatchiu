const { pool } = require('../config/database');

/**
 * Click Model
 * Handles click tracking and history
 */

class Click {
  /**
   * Create a new click record
   * @param {Object} clickData
   * @returns {Object} Created click
   */
  static async create(clickData) {
    const {
      userId,
      merchantId,
      affSid,
      clickType,
      originalUrl,
      affiliateUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      sub4,
      ipAddress,
      userAgent
    } = clickData;

    const query = `
      INSERT INTO clicks (
        user_id, merchant_id, aff_sid, click_type,
        original_url, affiliate_url,
        utm_source, utm_medium, utm_campaign, utm_content, sub4,
        ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      userId,
      merchantId,
      affSid || null,
      clickType,
      originalUrl || null,
      affiliateUrl || null,
      utmSource || 'cashback',
      utmMedium || null,
      utmCampaign || 'lammmo',
      utmContent || null,
      sub4 || 'oneatweb',
      ipAddress || null,
      userAgent || null
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      // Handle unique constraint violation for aff_sid
      if (error.code === '23505' && error.constraint === 'clicks_aff_sid_key') {
        throw new Error('Affiliate SID already exists');
      }
      throw error;
    }
  }

  /**
   * Update click with link generation data
   * @param {string} clickId
   * @param {Object} linkData
   * @returns {Object} Updated click
   */
  static async updateLinkData(clickId, linkData) {
    const {
      affSid,
      originalUrl,
      affiliateUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      sub4
    } = linkData;

    const query = `
      UPDATE clicks
      SET
        aff_sid = $2,
        original_url = $3,
        affiliate_url = $4,
        utm_source = $5,
        utm_medium = $6,
        utm_campaign = $7,
        utm_content = $8,
        sub4 = $9
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      clickId,
      affSid,
      originalUrl || null,
      affiliateUrl,
      utmSource || 'cashback',
      utmMedium,
      utmCampaign || 'lammmo',
      utmContent,
      sub4 || 'oneatweb'
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find click by aff_sid
   * @param {string} affSid
   * @returns {Object|null} Click object or null
   */
  static async findByAffSid(affSid) {
    const query = `
      SELECT c.*, m.name as merchant_name
      FROM clicks c
      LEFT JOIN merchants m ON c.merchant_id = m.id
      WHERE c.aff_sid = $1
    `;

    const result = await pool.query(query, [affSid]);
    return result.rows[0] || null;
  }

  /**
   * Find click by utm_content (click_id)
   * @param {string} clickId
   * @returns {Object|null} Click object or null
   */
  static async findByUtmContent(clickId) {
    const query = `
      SELECT c.*, m.name as merchant_name
      FROM clicks c
      LEFT JOIN merchants m ON c.merchant_id = m.id
      WHERE c.utm_content = $1
    `;

    const result = await pool.query(query, [clickId]);
    return result.rows[0] || null;
  }

  /**
   * Get user's click history
   * @param {string} userId
   * @param {number} limit
   * @returns {Array} Array of clicks
   */
  static async getUserClicks(userId, limit = 50) {
    const query = `
      SELECT
        c.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        co.id as conversion_id,
        co.status as conversion_status,
        co.cashback_amount,
        co.order_approved,
        co.products_count,
        co.order_pending,
        co.order_reject
      FROM clicks c
      LEFT JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN conversions co ON c.id = co.click_id
      WHERE c.user_id = $1
      ORDER BY c.clicked_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Get clicks with conversions
   * @param {string} userId
   * @param {number} limit
   * @returns {Array} Clicks that resulted in conversions
   */
  static async getConvertedClicks(userId, limit = 50) {
    const query = `
      SELECT
        c.*,
        m.name as merchant_name,
        m.logo_url as merchant_logo,
        co.id as conversion_id,
        co.order_code,
        co.order_amount,
        co.cashback_amount,
        co.status as conversion_status,
        co.order_time
      FROM clicks c
      INNER JOIN conversions co ON c.id = co.click_id
      LEFT JOIN merchants m ON c.merchant_id = m.id
      WHERE c.user_id = $1
      ORDER BY co.order_time DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Get click statistics for a user
   * @param {string} userId
   * @returns {Object} Click statistics
   */
  static async getStats(userId) {
    const query = `
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT c.merchant_id) as unique_merchants,
        COUNT(CASE WHEN c.click_type = 'button' THEN 1 END) as button_clicks,
        COUNT(CASE WHEN c.click_type = 'link' THEN 1 END) as link_clicks,
        COUNT(DISTINCT co.id) as converted_clicks,
        COALESCE(SUM(co.cashback_amount), 0) as total_earnings
      FROM clicks c
      LEFT JOIN conversions co ON c.id = co.click_id AND co.status = 'approved'
      WHERE c.user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }
}

module.exports = Click;
