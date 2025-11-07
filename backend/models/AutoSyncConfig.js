const { pool } = require('../config/database');

class AutoSyncConfig {
  /**
   * Get auto-sync configuration
   * @returns {Promise<Object>}
   */
  static async getConfig() {
    const query = `
      SELECT * FROM auto_sync_config
      ORDER BY id DESC
      LIMIT 1
    `;

    const result = await pool.query(query);

    // If no config exists, create default
    if (result.rows.length === 0) {
      return await this.createDefault();
    }

    return result.rows[0];
  }

  /**
   * Create default configuration
   * @returns {Promise<Object>}
   */
  static async createDefault() {
    const query = `
      INSERT INTO auto_sync_config (enabled, cron_schedule, sync_days)
      VALUES (FALSE, '0 8 * * *', 2)
      RETURNING *
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Update auto-sync configuration
   * @param {Object} config - Configuration to update
   * @returns {Promise<Object>}
   */
  static async updateConfig(config) {
    const { enabled, cron_schedule, sync_days } = config;

    const query = `
      UPDATE auto_sync_config
      SET
        enabled = COALESCE($1, enabled),
        cron_schedule = COALESCE($2, cron_schedule),
        sync_days = COALESCE($3, sync_days),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM auto_sync_config ORDER BY id DESC LIMIT 1)
      RETURNING *
    `;

    const result = await pool.query(query, [enabled, cron_schedule, sync_days]);
    return result.rows[0];
  }

  /**
   * Update last run status
   * @param {string} status - 'success', 'error', 'running'
   * @param {string} message - Status message
   * @returns {Promise<Object>}
   */
  static async updateLastRun(status, message = null) {
    const query = `
      UPDATE auto_sync_config
      SET
        last_run_at = CURRENT_TIMESTAMP,
        last_run_status = $1,
        last_run_message = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM auto_sync_config ORDER BY id DESC LIMIT 1)
      RETURNING *
    `;

    const result = await pool.query(query, [status, message]);
    return result.rows[0];
  }

  /**
   * Check if auto-sync is enabled
   * @returns {Promise<boolean>}
   */
  static async isEnabled() {
    const config = await this.getConfig();
    return config.enabled === true;
  }
}

module.exports = AutoSyncConfig;
