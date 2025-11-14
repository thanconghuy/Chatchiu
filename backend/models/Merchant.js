const { pool } = require('../config/database');

/**
 * Merchant Model
 * Handles merchant information
 */

class Merchant {
  /**
   * Create new merchant
   * @param {Object} merchantData
   * @returns {Object} Created merchant
   */
  static async create(merchantData) {
    const {
      id,
      name,
      logo_url = null,
      campaign_id = null,
      commission_rate = null,
      policy_note = null,
      is_active = true,
      deep_link_base = null
    } = merchantData;

    if (!id || !name) {
      throw new Error('ID and name are required');
    }

    const query = `
      INSERT INTO merchants (
        id, name, logo_url, campaign_id, commission_rate,
        policy_note, is_active, deep_link_base
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      id, name, logo_url, campaign_id,
      commission_rate, policy_note, is_active, deep_link_base
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find merchant by ID
   * @param {string} merchantId
   * @returns {Object|null} Merchant object or null
   */
  static async findById(merchantId) {
    const query = `
      SELECT *
      FROM merchants
      WHERE id = $1
    `;

    const result = await pool.query(query, [merchantId]);
    return result.rows[0] || null;
  }

  /**
   * Get all merchants
   * @param {boolean} activeOnly - Return only active merchants
   * @returns {Array} Array of merchants
   */
  static async getAll(activeOnly = true) {
    const query = activeOnly
      ? `SELECT * FROM merchants WHERE is_active = true ORDER BY name`
      : `SELECT * FROM merchants ORDER BY name`;

    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Check if a URL belongs to a merchant's domain
   * @param {string} merchantId
   * @param {string} url
   * @returns {boolean} True if URL matches merchant domain
   */
  static async validateUrl(merchantId, url) {
    const merchant = await this.findById(merchantId);
    if (!merchant || !merchant.deep_link_base) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const merchantUrlObj = new URL(merchant.deep_link_base);

      // Extract domain without subdomain for flexible matching
      const getDomain = (hostname) => {
        const parts = hostname.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
      };

      const urlDomain = getDomain(urlObj.hostname);
      const merchantDomain = getDomain(merchantUrlObj.hostname);

      // Check if domains match
      if (urlDomain === merchantDomain) {
        return true;
      }

      // Special handling for short link domains
      // Map of short domains to their full domains
      const shortLinkMap = {
        'shp.ee': 'shopee.vn',      // Shopee short links: vn.shp.ee, th.shp.ee, etc.
        'lzd.co': 'lazada.vn',       // Lazada short links
        'tk.vn': 'tiki.vn',          // Tiki short links (if any)
        's.shopee.vn': 'shopee.vn'   // Another Shopee short link format
      };

      // Check if input URL is a short link that maps to merchant domain
      for (const [shortDomain, fullDomain] of Object.entries(shortLinkMap)) {
        if (urlDomain === shortDomain || urlObj.hostname.endsWith(shortDomain)) {
          if (merchantDomain === fullDomain) {
            return true;
          }
        }
      }

      // Check reverse: if merchant domain has a short link and URL uses it
      const merchantShortDomains = Object.entries(shortLinkMap)
        .filter(([_, fullDomain]) => fullDomain === merchantDomain)
        .map(([shortDomain, _]) => shortDomain);

      for (const shortDomain of merchantShortDomains) {
        if (urlDomain === shortDomain || urlObj.hostname.endsWith(shortDomain)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update merchant
   * @param {string} merchantId
   * @param {Object} updates
   * @returns {Object} Updated merchant
   */
  static async update(merchantId, updates) {
    const allowedFields = ['name', 'logo_url', 'campaign_id', 'commission_rate', 'policy_note', 'is_active', 'deep_link_base'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(merchantId);

    const query = `
      UPDATE merchants
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete merchant
   * @param {string} merchantId
   * @returns {boolean} True if deleted
   */
  static async delete(merchantId) {
    const query = `
      DELETE FROM merchants
      WHERE id = $1
      RETURNING id
    `;

    const result = await pool.query(query, [merchantId]);
    return result.rows.length > 0;
  }

  /**
   * Get merchant statistics
   * @param {string} merchantId
   * @returns {Object} Merchant statistics
   */
  static async getStats(merchantId) {
    const query = `
      SELECT
        m.id,
        m.name,
        COUNT(DISTINCT c.id) as total_clicks,
        COUNT(DISTINCT co.id) as total_conversions,
        COUNT(DISTINCT CASE WHEN co.status = 'approved' THEN co.id END) as approved_conversions,
        COALESCE(SUM(CASE WHEN co.status = 'approved' THEN co.order_value ELSE 0 END), 0) as total_order_value,
        COALESCE(SUM(CASE WHEN co.status = 'approved' THEN co.user_cashback ELSE 0 END), 0) as total_cashback_paid
      FROM merchants m
      LEFT JOIN clicks c ON m.id = c.merchant_id
      LEFT JOIN conversions co ON c.aff_sid = co.aff_sid
      WHERE m.id = $1
      GROUP BY m.id, m.name
    `;

    const result = await pool.query(query, [merchantId]);
    return result.rows[0];
  }
}

module.exports = Merchant;
