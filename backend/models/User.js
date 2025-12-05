const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * User Model
 * Handles user authentication and balance management
 */

const SALT_ROUNDS = 10;

class User {
  /**
   * Create a new user
   * @param {string} email
   * @param {string} password - Plain text password (will be hashed)
   * @param {string} fullName
   * @param {string} phone
   * @param {string} username - Unique username for UTM tracking
   * @returns {Object} Created user (without password)
   */
  static async create(email, password, fullName, phone, username) {
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const query = `
      INSERT INTO users (email, password_hash, full_name, phone, username)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, created_at
    `;

    try {
      const result = await pool.query(query, [
        email.toLowerCase().trim(),
        passwordHash,
        fullName.trim(),
        phone?.trim(),
        username.toLowerCase().trim()
      ]);

      return result.rows[0];
    } catch (error) {
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.constraint === 'users_email_key') {
          throw new Error('Email already exists');
        }
        if (error.constraint === 'users_username_key') {
          throw new Error('Username already taken');
        }
      }
      throw error;
    }
  }

  /**
   * Find user by email
   * @param {string} email
   * @param {boolean} includePassword - Include password_hash in result
   * @returns {Object|null} User object or null
   */
  static async findByEmail(email, includePassword = false) {
    const fields = includePassword
      ? 'id, email, password_hash, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at'
      : 'id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at';

    const query = `SELECT ${fields} FROM users WHERE email = $1`;

    const result = await pool.query(query, [email.toLowerCase().trim()]);
    return result.rows[0] || null;
  }

  /**
   * Find user by email or username
   * @param {string} identifier - Email or username
   * @param {boolean} includePassword - Include password_hash in result
   * @returns {Object|null} User object or null
   */
  static async findByEmailOrUsername(identifier, includePassword = false) {
    const fields = includePassword
      ? 'id, email, password_hash, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at'
      : 'id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at';

    const query = `SELECT ${fields} FROM users WHERE email = $1 OR username = $1`;

    const result = await pool.query(query, [identifier.toLowerCase().trim()]);
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   * @param {string} userId - UUID
   * @returns {Object|null} User object or null
   */
  static async findById(userId) {
    const query = `
      SELECT id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at
      FROM users
      WHERE id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Find user by username
   * @param {string} username
   * @returns {Object|null} User object or null
   */
  static async findByUsername(username) {
    const query = `
      SELECT id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, created_at
      FROM users
      WHERE username = $1
    `;

    const result = await pool.query(query, [username.toLowerCase().trim()]);
    return result.rows[0] || null;
  }

  /**
   * Verify password against hash
   * @param {string} plainPassword
   * @param {string} hashedPassword
   * @returns {boolean} True if password matches
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Update user balance
   * @param {string} userId - UUID
   * @param {string} type - 'add_pending' | 'pending_to_available' | 'available_to_pending' | 'subtract' | 'reject_pending'
   * @param {number} amount - Amount to update
   * @returns {Object} Updated user
   */
  static async updateBalance(userId, type, amount) {
    let query;

    switch (type) {
      case 'add_pending':
        // Add to pending balance (new conversion)
        query = `
          UPDATE users
          SET
            pending_balance = pending_balance + $1,
            total_cashback = total_cashback + $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id, available_balance, pending_balance, total_cashback
        `;
        break;

      case 'pending_to_available':
        // Move from pending to available (conversion approved)
        query = `
          UPDATE users
          SET
            available_balance = available_balance + $1,
            pending_balance = pending_balance - $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND pending_balance >= $1
          RETURNING id, available_balance, pending_balance, total_cashback
        `;
        break;

      case 'available_to_pending':
        // Move from available back to pending (status reversal: approved → pending)
        query = `
          UPDATE users
          SET
            available_balance = available_balance - $1,
            pending_balance = pending_balance + $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND available_balance >= $1
          RETURNING id, available_balance, pending_balance, total_cashback
        `;
        break;

      case 'subtract':
        // Subtract from available (withdrawal)
        query = `
          UPDATE users
          SET
            available_balance = available_balance - $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND available_balance >= $1
          RETURNING id, available_balance, pending_balance, total_cashback
        `;
        break;

      case 'reject_pending':
        // Remove from pending and total (conversion rejected)
        query = `
          UPDATE users
          SET
            pending_balance = pending_balance - $1,
            total_cashback = total_cashback - $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND pending_balance >= $1
          RETURNING id, available_balance, pending_balance, total_cashback
        `;
        break;

      default:
        throw new Error(`Invalid balance update type: ${type}`);
    }

    const result = await pool.query(query, [amount, userId]);

    if (result.rows.length === 0) {
      throw new Error('Insufficient balance or user not found');
    }

    return result.rows[0];
  }

  /**
   * Get user stats
   * @param {string} userId
   * @returns {Object} User statistics
   */
  static async getStats(userId) {
    const query = `
      SELECT
        u.available_balance,
        u.pending_balance,
        u.total_cashback,
        COUNT(DISTINCT c.id) as total_clicks,
        COUNT(DISTINCT co.id) as total_conversions,
        COUNT(DISTINCT CASE WHEN co.status = 'approved' THEN co.id END) as approved_conversions,
        COUNT(DISTINCT CASE WHEN co.status = 'pending' THEN co.id END) as pending_conversions
      FROM users u
      LEFT JOIN clicks c ON u.id = c.user_id
      LEFT JOIN conversions co ON u.id = co.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.available_balance, u.pending_balance, u.total_cashback
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Create a new user via Google OAuth
   * @param {Object} userData - User data from Google
   * @returns {Object} Created user
   */
  static async createGoogleUser({ email, fullName, username, googleId, profilePicture }) {
    const query = `
      INSERT INTO users (email, full_name, username, google_id, profile_picture, email_verified, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, google_id, profile_picture, created_at
    `;

    try {
      const result = await pool.query(query, [
        email.toLowerCase().trim(),
        fullName.trim(),
        username.toLowerCase().trim(),
        googleId,
        profilePicture,
        true, // email_verified = true for Google OAuth
        null  // password_hash = null for OAuth users (now nullable after migration)
      ]);

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        if (error.constraint === 'users_email_key') {
          throw new Error('Email already exists');
        }
        if (error.constraint === 'users_username_key') {
          throw new Error('Username already taken');
        }
      }
      throw error;
    }
  }

  /**
   * Update user's Google ID and profile picture
   * @param {string} userId
   * @param {string} googleId
   * @param {string|null} profilePicture
   */
  static async updateGoogleId(userId, googleId, profilePicture = null) {
    const query = `
      UPDATE users
      SET google_id = $1,
          profile_picture = COALESCE($2, profile_picture),
          email_verified = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    await pool.query(query, [googleId, profilePicture, userId]);
  }

  /**
   * Create password reset token
   * @param {string} email
   * @returns {string} Reset token
   */
  static async createResetToken(email) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate cryptographically secure reset token (valid for 1 hour)
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    const query = `
      UPDATE users
      SET reset_token = $1, reset_token_expiry = $2, updated_at = CURRENT_TIMESTAMP
      WHERE email = $3
      RETURNING id, email
    `;

    const result = await pool.query(query, [resetToken, resetTokenExpiry, email.toLowerCase().trim()]);
    return resetToken;
  }

  /**
   * Reset password using token
   * @param {string} token
   * @param {string} newPassword
   */
  static async resetPassword(token, newPassword) {
    // Find user by valid token
    const query = `
      SELECT id, email FROM users
      WHERE reset_token = $1 AND reset_token_expiry > NOW()
    `;

    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const user = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear reset token
    const updateQuery = `
      UPDATE users
      SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(updateQuery, [passwordHash, user.id]);
    return user;
  }
}

module.exports = User;
