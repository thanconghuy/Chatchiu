const { pool } = require('../config/database');
const crypto = require('crypto');

/**
 * Pending OAuth Link Model
 * Manages temporary OAuth linking requests for existing users
 */
class PendingOAuthLink {
  /**
   * Create a pending OAuth link request
   * @param {string} userId - Existing user ID
   * @param {string} provider - OAuth provider (google, facebook, etc.)
   * @param {string} providerId - Provider user ID
   * @param {Object} profileData - Profile data from provider
   * @returns {Promise<Object>} Pending link with token
   */
  static async create(userId, provider, providerId, profileData) {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const query = `
      INSERT INTO pending_oauth_links (
        user_id, provider, provider_id, profile_data, token, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      provider,
      providerId,
      JSON.stringify(profileData),
      token,
      expiresAt
    ]);

    return result.rows[0];
  }

  /**
   * Find pending link by token
   * @param {string} token
   * @returns {Promise<Object|null>}
   */
  static async findByToken(token) {
    const query = `
      SELECT * FROM pending_oauth_links
      WHERE token = $1 AND expires_at > NOW()
    `;

    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  }

  /**
   * Delete pending link (after confirmation or expiry)
   * @param {string} token
   */
  static async delete(token) {
    const query = 'DELETE FROM pending_oauth_links WHERE token = $1';
    await pool.query(query, [token]);
  }

  /**
   * Clean up expired links
   */
  static async cleanupExpired() {
    const query = 'DELETE FROM pending_oauth_links WHERE expires_at <= NOW()';
    const result = await pool.query(query);
    return result.rowCount;
  }
}

module.exports = PendingOAuthLink;
