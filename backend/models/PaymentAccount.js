/**
 * PaymentAccount Model
 * Handles user payment account information for receiving cashback payouts
 * WITH ENCRYPTION SUPPORT
 */

const { pool } = require('../config/database');
const encryption = require('../utils/encryption');
const logger = require('../utils/logger');

class PaymentAccount {
  /**
   * Get all payment accounts for a user
   * @param {String} userId - User UUID
   * @returns {Promise<Array>} List of payment accounts
   */
  static async findByUserId(userId) {
    const query = `
      SELECT
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
      FROM payment_accounts
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get a specific payment account by ID
   * @param {Number} id - Payment account ID
   * @param {String} userId - User UUID (for security check)
   * @returns {Promise<Object|null>} Payment account or null
   */
  static async findById(id, userId) {
    const query = `
      SELECT
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
      FROM payment_accounts
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Get default payment account for a user
   * @param {String} userId - User UUID
   * @returns {Promise<Object|null>} Default payment account or null
   */
  static async getDefault(userId) {
    const query = `
      SELECT
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
      FROM payment_accounts
      WHERE user_id = $1 AND is_default = true
      LIMIT 1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Get payment account with DECRYPTED data (for creating payment requests)
   * @param {Number} id - Payment account ID
   * @param {String} userId - User UUID (for security check)
   * @returns {Promise<Object|null>} Payment account with decrypted data or null
   */
  static async getWithDecryption(id, userId) {
    const query = `
      SELECT
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        account_number_encrypted,
        account_holder_name_encrypted,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
      FROM payment_accounts
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      console.log('🔍 [PaymentAccount] No account found for:', { id, userId });
      return null;
    }

    const account = result.rows[0];

    console.log('🔍 [PaymentAccount] Raw account data:', {
      id: account.id,
      hasEncryptedNumber: !!account.account_number_encrypted,
      hasEncryptedName: !!account.account_holder_name_encrypted,
      maskedNumber: account.account_number,
      maskedName: account.account_holder_name
    });

    // Decrypt if encrypted version exists
    if (account.account_number_encrypted) {
      try {
        account.account_number_decrypted = encryption.decrypt(account.account_number_encrypted);
        account.account_holder_name_decrypted = encryption.decrypt(account.account_holder_name_encrypted);

        console.log('✅ [PaymentAccount] Decrypted successfully:', {
          accountId: id,
          decryptedNumber: account.account_number_decrypted,
          decryptedName: account.account_holder_name_decrypted
        });

        logger.info('[PaymentAccount] Decrypted data for payment request', {
          accountId: id,
          userId
        });
      } catch (error) {
        console.error('❌ [PaymentAccount] Decryption failed:', error);
        logger.error('[PaymentAccount] Decryption failed', {
          accountId: id,
          error: error.message
        });
        throw new Error('Unable to retrieve payment account information');
      }
    } else {
      console.log('⚠️ [PaymentAccount] No encrypted data found, returning masked data');
    }

    // Remove encrypted fields from response
    delete account.account_number_encrypted;
    delete account.account_holder_name_encrypted;

    return account;
  }

  /**
   * Create a new payment account (WITH ENCRYPTION)
   * @param {Object} data - Payment account data
   * @returns {Promise<Object>} Created payment account
   */
  static async create(data) {
    const {
      userId,
      accountType,
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      isDefault,
      notes
    } = data;

    // If this is set as default, unset other defaults first
    if (isDefault) {
      await this.unsetAllDefaults(userId);
    }

    // Encrypt sensitive fields
    const accountNumberEncrypted = encryption.encrypt(accountNumber);
    const accountNumberHash = encryption.hash(accountNumber);
    const accountHolderNameEncrypted = encryption.encrypt(accountHolderName);

    logger.info('[PaymentAccount] Creating with encrypted data', {
      userId,
      accountType,
      bankName
    });

    const query = `
      INSERT INTO payment_accounts (
        user_id,
        account_type,
        account_holder_name,
        account_number,
        account_number_encrypted,
        account_number_hash,
        account_holder_name_encrypted,
        encryption_version,
        bank_name,
        bank_branch,
        is_default,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
    `;

    const values = [
      userId,
      accountType,
      encryption.mask(accountHolderName),    // Store masked for display
      encryption.mask(accountNumber),         // Store masked for display
      accountNumberEncrypted,                 // Encrypted version
      accountNumberHash,                      // Hash for lookup
      accountHolderNameEncrypted,            // Encrypted version
      1,                                      // Encryption version
      bankName || null,
      bankBranch || null,
      isDefault || false,
      notes || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Update a payment account
   * @param {Number} id - Payment account ID
   * @param {String} userId - User UUID (for security check)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated payment account or null
   */
  static async update(id, userId, updates) {
    const {
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      notes
    } = updates;

    const query = `
      UPDATE payment_accounts
      SET
        account_holder_name = COALESCE($3, account_holder_name),
        account_number = COALESCE($4, account_number),
        bank_name = COALESCE($5, bank_name),
        bank_branch = COALESCE($6, bank_branch),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
    `;

    const values = [
      id,
      userId,
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      notes
    ];

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Set a payment account as default
   * @param {Number} id - Payment account ID
   * @param {String} userId - User UUID (for security check)
   * @returns {Promise<Object|null>} Updated payment account or null
   */
  static async setAsDefault(id, userId) {
    // First unset all defaults for this user
    await this.unsetAllDefaults(userId);

    // Then set this account as default
    const query = `
      UPDATE payment_accounts
      SET is_default = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING
        id,
        user_id,
        account_type,
        account_holder_name,
        account_number,
        bank_name,
        bank_branch,
        is_default,
        is_verified,
        notes,
        created_at,
        updated_at
    `;

    const result = await pool.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Unset all default payment accounts for a user
   * @param {String} userId - User UUID
   * @returns {Promise<void>}
   */
  static async unsetAllDefaults(userId) {
    const query = `
      UPDATE payment_accounts
      SET is_default = false
      WHERE user_id = $1 AND is_default = true
    `;

    await pool.query(query, [userId]);
  }

  /**
   * Delete a payment account
   * @param {Number} id - Payment account ID
   * @param {String} userId - User UUID (for security check)
   * @returns {Promise<Boolean>} True if deleted, false otherwise
   */
  static async delete(id, userId) {
    const query = `
      DELETE FROM payment_accounts
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await pool.query(query, [id, userId]);
    return result.rows.length > 0;
  }

  /**
   * Count payment accounts for a user
   * @param {String} userId - User UUID
   * @returns {Promise<Number>} Count of payment accounts
   */
  static async count(userId) {
    const query = `
      SELECT COUNT(*) as count
      FROM payment_accounts
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }
}

module.exports = PaymentAccount;
