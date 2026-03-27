const cron = require('node-cron');
const AutoSyncConfig = require('../models/AutoSyncConfig');
const { syncConversions } = require('../jobs/syncConversions');
const logger = require('../utils/logger');

class AutoSyncService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.watchdogTimer = null;
  }

  /**
   * Initialize auto-sync service with retry for DB cold start (Neon)
   */
  async initialize() {
    // Retry up to 5 times with 3s delay to handle Neon DB cold start
    const maxRetries = 5;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const config = await AutoSyncConfig.getConfig();

        if (config.enabled) {
          await this.start(config.cron_schedule, config.sync_days);
          logger.info('Auto-sync initialized and started', {
            schedule: config.cron_schedule,
            syncDays: config.sync_days
          });
          this._startWatchdog();
        } else {
          logger.info('Auto-sync is disabled');
        }
        return; // success, exit retry loop
      } catch (error) {
        if (attempt < maxRetries) {
          logger.warn(`Auto-sync init attempt ${attempt} failed, retrying in ${retryDelay/1000}s...`, { error: error.message });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.error('Failed to initialize auto-sync after all retries', { error: error.message });
        }
      }
    }
  }

  /**
   * Watchdog: check every 10 minutes if cron is still running, restart if not
   */
  _startWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    this.watchdogTimer = setInterval(async () => {
      if (this.cronJob !== null) return; // cron is running, nothing to do

      logger.warn('Auto-sync watchdog: cron job not running, attempting restart...');
      try {
        const config = await AutoSyncConfig.getConfig();
        if (config.enabled) {
          await this.start(config.cron_schedule, config.sync_days);
          logger.info('Auto-sync watchdog: cron job restarted successfully');
        }
      } catch (error) {
        logger.error('Auto-sync watchdog: failed to restart cron job', { error: error.message });
      }
    }, 10 * 60 * 1000); // every 10 minutes
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

        // Format message with both imported and duplicates count
        const message = `Đã import ${result.imported} conversions, ${result.duplicates} trùng lặp`;
        await AutoSyncConfig.updateLastRun('success', message);

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

    // node-cron v4 requires explicit .start() call
    this.cronJob.start();

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
        this._startWatchdog();
        logger.info('Auto-sync config updated and restarted', updated);
      } else {
        this.stop();
        if (this.watchdogTimer) {
          clearInterval(this.watchdogTimer);
          this.watchdogTimer = null;
        }
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
      hasScheduledJob: this.cronJob !== null,
      watchdogActive: this.watchdogTimer !== null
    };
  }

  /**
   * Trigger manual sync (test run)
   */
  async triggerManualSync(syncDays = 2, syncType = 'manual') {
    if (this.isRunning) {
      throw new Error('Sync already running');
    }

    try {
      this.isRunning = true;
      await AutoSyncConfig.updateLastRun('running', 'Manual test sync in progress...');

      logger.info('Manual sync triggered', { syncDays, syncType });

      const result = await syncConversions(syncDays, syncType);

      // Save last run info with full details
      const message = `Đã import ${result.imported} conversions, ${result.duplicates} trùng lặp`;
      await AutoSyncConfig.updateLastRun('success', message);

      logger.info('Manual sync completed', {
        imported: result.imported,
        duplicates: result.duplicates
      });

      return result;
    } catch (error) {
      // Save error status
      await AutoSyncConfig.updateLastRun('error', `Manual test failed: ${error.message}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}

// Singleton instance
const autoSyncService = new AutoSyncService();

module.exports = autoSyncService;
