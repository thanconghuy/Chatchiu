const cron = require('node-cron');
const AutoSyncConfig = require('../models/AutoSyncConfig');
const { syncConversions } = require('../jobs/syncConversions');
const logger = require('../utils/logger');

class AutoSyncService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Initialize auto-sync service
   */
  async initialize() {
    try {
      const config = await AutoSyncConfig.getConfig();

      if (config.enabled) {
        await this.start(config.cron_schedule, config.sync_days);
        logger.info('Auto-sync initialized and started', {
          schedule: config.cron_schedule,
          syncDays: config.sync_days
        });
      } else {
        logger.info('Auto-sync is disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize auto-sync', { error: error.message });
    }
  }

  /**
   * Start cron job
   * @param {string} schedule - Cron schedule (e.g., '0 8 * * *')
   * @param {number} syncDays - Number of days to sync
   */
  async start(schedule, syncDays) {
    // Stop existing job if any
    this.stop();

    // Validate cron schedule
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    this.cronJob = cron.schedule(schedule, async () => {
      if (this.isRunning) {
        logger.warn('Auto-sync already running, skipping this run');
        return;
      }

      try {
        this.isRunning = true;
        await AutoSyncConfig.updateLastRun('running', 'Sync in progress...');

        logger.info('Auto-sync started', { syncDays });

        // Run sync with specified days
        const result = await syncConversions(syncDays);

        await AutoSyncConfig.updateLastRun('success', `Synced ${result.imported} conversions successfully`);

        logger.info('Auto-sync completed successfully', {
          imported: result.imported,
          duplicates: result.duplicates
        });

      } catch (error) {
        logger.error('Auto-sync failed', { error: error.message });
        await AutoSyncConfig.updateLastRun('error', error.message);
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Cron job scheduled', { schedule, syncDays });
  }

  /**
   * Stop cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Auto-sync stopped');
    }
  }

  /**
   * Update configuration and restart if needed
   * @param {Object} config - New configuration
   */
  async updateConfig(config) {
    try {
      const updated = await AutoSyncConfig.updateConfig(config);

      if (updated.enabled) {
        await this.start(updated.cron_schedule, updated.sync_days);
        logger.info('Auto-sync config updated and restarted', updated);
      } else {
        this.stop();
        logger.info('Auto-sync disabled');
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update auto-sync config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasScheduledJob: this.cronJob !== null
    };
  }

  /**
   * Trigger manual sync (test run)
   */
  async triggerManualSync(syncDays = 2) {
    if (this.isRunning) {
      throw new Error('Sync already running');
    }

    try {
      this.isRunning = true;
      logger.info('Manual sync triggered', { syncDays });

      const result = await syncConversions(syncDays);

      logger.info('Manual sync completed', {
        imported: result.imported,
        duplicates: result.duplicates
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }
}

// Singleton instance
const autoSyncService = new AutoSyncService();

module.exports = autoSyncService;
