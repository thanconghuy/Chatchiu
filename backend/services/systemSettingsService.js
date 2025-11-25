const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * System Settings Service
 * Manages system-wide configurable settings
 */
class SystemSettingsService {
  /**
   * Get a single setting value by key
   * @param {string} key - Setting key
   * @returns {Promise<any>} Setting value (parsed according to type)
   */
  static async getSetting(key) {
    try {
      const query = 'SELECT setting_value, setting_type FROM system_settings WHERE setting_key = $1';
      const result = await pool.query(query, [key]);

      if (result.rows.length === 0) {
        logger.warn(`Setting not found: ${key}`);
        return null;
      }

      const { setting_value, setting_type } = result.rows[0];
      return this.parseValue(setting_value, setting_type);
    } catch (error) {
      logger.error('Failed to get setting', { key, error: error.message });
      throw error;
    }
  }

  /**
   * Get multiple settings by keys
   * @param {string[]} keys - Array of setting keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  static async getSettings(keys) {
    try {
      const query = 'SELECT setting_key, setting_value, setting_type FROM system_settings WHERE setting_key = ANY($1)';
      const result = await pool.query(query, [keys]);

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = this.parseValue(row.setting_value, row.setting_type);
      });

      return settings;
    } catch (error) {
      logger.error('Failed to get settings', { keys, error: error.message });
      throw error;
    }
  }

  /**
   * Get all settings by category
   * @param {string} category - Category name
   * @returns {Promise<Array>} Array of settings
   */
  static async getSettingsByCategory(category) {
    try {
      const query = `
        SELECT
          setting_key,
          setting_value,
          setting_type,
          description,
          category,
          is_editable,
          updated_at
        FROM system_settings
        WHERE category = $1
        ORDER BY setting_key
      `;
      const result = await pool.query(query, [category]);

      return result.rows.map(row => ({
        key: row.setting_key,
        value: this.parseValue(row.setting_value, row.setting_type),
        rawValue: row.setting_value,
        type: row.setting_type,
        description: row.description,
        category: row.category,
        isEditable: row.is_editable,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get settings by category', { category, error: error.message });
      throw error;
    }
  }

  /**
   * Get all settings grouped by category
   * @returns {Promise<Object>} Settings grouped by category
   */
  static async getAllSettings() {
    try {
      const query = `
        SELECT
          setting_key,
          setting_value,
          setting_type,
          description,
          category,
          is_editable,
          updated_at
        FROM system_settings
        ORDER BY category, setting_key
      `;
      const result = await pool.query(query);

      const grouped = {};
      result.rows.forEach(row => {
        if (!grouped[row.category]) {
          grouped[row.category] = [];
        }
        grouped[row.category].push({
          key: row.setting_key,
          value: this.parseValue(row.setting_value, row.setting_type),
          rawValue: row.setting_value,
          type: row.setting_type,
          description: row.description,
          isEditable: row.is_editable,
          updatedAt: row.updated_at
        });
      });

      return grouped;
    } catch (error) {
      logger.error('Failed to get all settings', { error: error.message });
      throw error;
    }
  }

  /**
   * Update a setting value
   * @param {string} key - Setting key
   * @param {any} value - New value
   * @param {string} userId - User ID who made the change
   * @param {string} reason - Optional reason for change
   * @returns {Promise<boolean>} Success status
   */
  static async updateSetting(key, value, userId, reason = null) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if setting exists and is editable
      const checkQuery = 'SELECT is_editable, setting_type FROM system_settings WHERE setting_key = $1';
      const checkResult = await client.query(checkQuery, [key]);

      if (checkResult.rows.length === 0) {
        throw new Error(`Setting '${key}' not found`);
      }

      if (!checkResult.rows[0].is_editable) {
        throw new Error(`Setting '${key}' is not editable`);
      }

      // Convert value to string
      const stringValue = String(value);

      // Update setting
      const updateQuery = `
        UPDATE system_settings
        SET setting_value = $1, updated_by = $2
        WHERE setting_key = $3
      `;
      await client.query(updateQuery, [stringValue, userId, key]);

      // Add reason to audit log if provided
      if (reason) {
        await client.query(
          'UPDATE system_settings_audit SET change_reason = $1 WHERE setting_key = $2 AND changed_at = (SELECT MAX(changed_at) FROM system_settings_audit WHERE setting_key = $2)',
          [reason, key]
        );
      }

      await client.query('COMMIT');

      logger.info('Setting updated', { key, value, userId, reason });
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update setting', { key, value, userId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get audit log for a setting
   * @param {string} key - Setting key
   * @param {number} limit - Number of records to return
   * @returns {Promise<Array>} Audit log entries
   */
  static async getAuditLog(key, limit = 50) {
    try {
      const query = `
        SELECT
          ssa.*,
          u.username,
          u.email
        FROM system_settings_audit ssa
        LEFT JOIN users u ON ssa.changed_by = u.id
        WHERE ssa.setting_key = $1
        ORDER BY ssa.changed_at DESC
        LIMIT $2
      `;
      const result = await pool.query(query, [key, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get audit log', { key, error: error.message });
      throw error;
    }
  }

  /**
   * Parse setting value according to its type
   * @param {string} value - Raw value from database
   * @param {string} type - Setting type
   * @returns {any} Parsed value
   */
  static parseValue(value, type) {
    if (value === null) return null;

    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'json':
        try {
          return JSON.parse(value);
        } catch (e) {
          logger.warn('Failed to parse JSON setting value', { value });
          return value;
        }
      default: // 'string'
        return value;
    }
  }

  /**
   * Get payment settings (commonly used)
   * @returns {Promise<Object>} Payment settings
   */
  static async getPaymentSettings() {
    return this.getSettings([
      'min_withdrawal_amount',
      'max_withdrawal_amount',
      'withdrawal_processing_days',
      'system_fee_percentage'
    ]);
  }
}

module.exports = SystemSettingsService;
