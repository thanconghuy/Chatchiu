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
   * @param {string} type - 'add_pending' | 'pending_to_available' | 'subtract'
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
}

module.exports = User;
