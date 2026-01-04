const { pool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * System Settings Service
 *
 * Manages persistent system configuration stored in database
 * Fixes issue where settings reset on page reload
 */

class SystemSettings {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 30000; // 30 seconds cache
    this.lastCacheUpdate = 0;
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>}
   */
  async get(key, defaultValue = null) {
    try {
      // Check cache first
      if (this.isCacheValid() && this.cache.has(key)) {
        return this.cache.get(key);
      }

      const result = await pool.query(
        'SELECT setting_value, setting_type FROM system_settings WHERE setting_key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        // If not found and defaultValue provided, auto-save it
        if (defaultValue !== null && defaultValue !== undefined) {
          logger.info(`Auto-creating setting ${key} with default value`);
          await this.set(key, defaultValue, null); // Use null for system-generated defaults
        }
        return defaultValue;
      }

      const { setting_value, setting_type } = result.rows[0];
      const value = this.parseValue(setting_value, setting_type);

      // Update cache
      this.cache.set(key, value);

      return value;
    } catch (error) {
      logger.error(`Failed to get setting ${key}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @param {string} userId - User ID who updated (optional)
   * @returns {Promise<boolean>}
   */
  async set(key, value, userId = null) {
    try {
      const stringValue = this.stringifyValue(value);
      const type = this.detectType(value);

      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          setting_type = EXCLUDED.setting_type,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [key, stringValue, type, userId]);

      // Update cache
      this.cache.set(key, value);
      this.lastCacheUpdate = Date.now();

      logger.info(`Setting updated: ${key} = ${stringValue}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set setting ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get multiple settings at once
   * @param {string[]} keys
   * @returns {Promise<Object>}
   */
  async getMultiple(keys) {
    const result = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  /**
   * Get all settings
   * @returns {Promise<Object>}
   */
  async getAll() {
    try {
      const result = await pool.query('SELECT setting_key, setting_value, setting_type FROM system_settings');

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = this.parseValue(row.setting_value, row.setting_type);
      });

      return settings;
    } catch (error) {
      logger.error('Failed to get all settings:', error.message);
      return {};
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    return Date.now() - this.lastCacheUpdate < this.cacheExpiry;
  }

  /**
   * Parse value based on type
   */
  parseValue(value, type) {
    if (value === null || value === undefined) return null;

    switch (type) {
      case 'boolean':
        return value === 'true' || value === true;
      case 'number':
        return parseFloat(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Convert value to string for storage
   */
  stringifyValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Detect value type
   */
  detectType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  }
}

// Export singleton
module.exports = new SystemSettings();
