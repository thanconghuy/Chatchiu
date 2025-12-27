const cron = require('node-cron');
const logger = require('../utils/logger');
const retryService = require('../services/retryService');

/**
 * Cron Jobs Service
 * Manages all scheduled tasks for the cashback system
 *
 * Cron syntax:
 * ┌────────────── second (optional, 0-59)
 * │ ┌──────────── minute (0-59)
 * │ │ ┌────────── hour (0-23)
 * │ │ │ ┌──────── day of month (1-31)
 * │ │ │ │ ┌────── month (1-12)
 * │ │ │ │ │ ┌──── day of week (0-7, 0/7 = Sunday)
 * │ │ │ │ │ │
 * * * * * * *
 */

class CronJobsService {
  constructor() {
    this.jobs = [];
    this.isInitialized = false;
  }

  /**
   * Initialize all cron jobs
   * Called on server startup if AUTO_CRON_ENABLED=true
   * @param {boolean} forceReload - Force reload even if already initialized
   */
  async initialize(forceReload = false) {
    // Production: Always use database setting (default: true)
    // Local: Use .env variable for development control
    const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV;
    let autoCronEnabled = true; // Default: enabled

    try {
      const SystemSettings = require('../services/systemSettings');
      const dbSetting = await SystemSettings.get('auto_cron_enabled', true);

      if (isProduction) {
        // Production: Database is source of truth
        autoCronEnabled = dbSetting === true || dbSetting === 'true';
        logger.info(`[Production] Cron setting from database: ${autoCronEnabled}`);
      } else {
        // Local development: .env can override database for dev convenience
        if (process.env.AUTO_CRON_ENABLED !== undefined) {
          autoCronEnabled = process.env.AUTO_CRON_ENABLED === 'true';
          logger.info(`[Local Dev] Cron setting from .env: ${autoCronEnabled}`);
        } else {
          autoCronEnabled = dbSetting === true || dbSetting === 'true';
          logger.info(`[Local Dev] Cron setting from database: ${autoCronEnabled}`);
        }
      }

      // Update env variable to match final decision
      process.env.AUTO_CRON_ENABLED = autoCronEnabled ? 'true' : 'false';

    } catch (error) {
      logger.warn('Failed to load cron setting from database, using default (enabled)', {
        error: error.message
      });
      // Default to enabled if database query fails
      autoCronEnabled = true;
      process.env.AUTO_CRON_ENABLED = 'true';
    }

    // If not enabled, stop all jobs and mark as NOT initialized
    if (!autoCronEnabled) {
      logger.info('Auto cron jobs DISABLED');
      this.stopAll();
      this.isInitialized = false;
      return;
    }

    // If already initialized with running jobs, check if reload is needed
    if (this.isInitialized && this.jobs.length > 0 && !forceReload) {
      // Verify jobs are actually running
      const allJobsRunning = this.jobs.every(({ job }) => {
        // node-cron doesn't expose running state directly,
        // but if job exists in array, it should be running
        return job !== null;
      });

      if (allJobsRunning) {
        logger.info(`Cron jobs already running (${this.jobs.length} jobs active)`);
        return;
      } else {
        logger.warn('Some cron jobs not running, forcing reload...');
        forceReload = true;
      }
    }

    // Force reload: Reset initialization state to allow recreation
    if (forceReload) {
      logger.info('Force reload: Resetting cron jobs state...');
      this.isInitialized = false;
    }

    logger.info('Initializing cron jobs...');

    // Stop all existing jobs first (in case of reinit)
    this.stopAll();

    // Job 1: Retry unmatched clicks (every 6 hours)
    this.scheduleRetryUnmatched();

    // Job 2: Cleanup expired clicks (daily at 3 AM)
    this.scheduleCleanupExpired();

    // Job 3: Alert expiring clicks (daily at 9 AM)
    this.scheduleExpiringAlert();

    // Job 4: Cleanup old activity logs (daily at 2 AM)
    this.scheduleActivityLogsCleanup();

    // Job 5: Cashback reminder emails (configurable time, default: daily at 10 AM)
    await this.scheduleCashbackReminders();

    // Job 6: Cleanup old notification logs (daily at 4 AM)
    this.scheduleNotificationLogsCleanup();

    this.isInitialized = true;
    logger.success(`✅ Initialized ${this.jobs.length} cron jobs (auto-start enabled)`);
  }

  /**
   * Reload cron jobs from database setting
   * Useful when user changes setting without restarting server
   */
  async reload() {
    logger.info('Reloading cron jobs from database...');
    await this.initialize(true);
    return this.getStatus();
  }

  /**
   * Job 1: Retry unmatched clicks
   * Schedule: Every 6 hours
   * Purpose: Automatically recover lost conversions
   */
  scheduleRetryUnmatched() {
    const schedule = process.env.RETRY_CRON_SCHEDULE || '0 */6 * * *'; // Default: every 6 hours

    const job = cron.schedule(schedule, async () => {
      logger.info('🔄 Cron: Retry unmatched clicks started');

      try {
        const results = await retryService.retryUnmatchedClicks({
          daysOld: 1,  // Retry clicks older than 1 day
          limit: 200   // Max 200 clicks per run
        });

        logger.success('🔄 Cron: Retry unmatched clicks completed', {
          total: results.total,
          matched: results.matched,
          stillUnmatched: results.stillUnmatched
        });

        // Alert if many clicks still unmatched
        if (results.stillUnmatched > 50) {
          logger.warn('⚠️  High number of unmatched clicks', {
            count: results.stillUnmatched
          });
        }

      } catch (error) {
        logger.error('🔄 Cron: Retry unmatched clicks failed', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Ensure job is started
    job.start();

    this.jobs.push({
      name: 'retry-unmatched',
      schedule,
      job
    });

    logger.info(`✅ Scheduled & Started: Retry unmatched clicks (${schedule})`);
  }

  /**
   * Job 2: Cleanup expired clicks
   * Schedule: Daily at 3 AM
   * Purpose: Mark clicks as expired after 30 days
   */
  scheduleCleanupExpired() {
    const schedule = '0 3 * * *'; // Daily at 3 AM

    const job = cron.schedule(schedule, async () => {
      logger.info('🗑️  Cron: Cleanup expired clicks started');

      try {
        const { pool } = require('../config/database');

        // Mark clicks as expired if link_expires_at < NOW and no conversion
        const result = await pool.query(`
          UPDATE clicks c
          SET last_checked_at = NOW()
          WHERE c.link_expires_at < NOW()
            AND NOT EXISTS (
              SELECT 1 FROM conversions co WHERE co.click_id = c.id
            )
            AND c.last_checked_at IS NOT NULL
          RETURNING id
        `);

        const expiredCount = result.rows.length;

        logger.success('🗑️  Cron: Cleanup expired clicks completed', {
          expiredCount
        });

      } catch (error) {
        logger.error('🗑️  Cron: Cleanup expired clicks failed', {
          error: error.message
        });
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Ensure job is started
    job.start();

    this.jobs.push({
      name: 'cleanup-expired',
      schedule,
      job
    });

    logger.info(`✅ Scheduled & Started: Cleanup expired clicks (${schedule})`);
  }

  /**
   * Job 3: Alert expiring clicks
   * Schedule: Daily at 9 AM
   * Purpose: Log warning for clicks expiring soon
   */
  scheduleExpiringAlert() {
    const schedule = '0 9 * * *'; // Daily at 9 AM

    const job = cron.schedule(schedule, async () => {
      logger.info('⏰ Cron: Expiring clicks alert started');

      try {
        const expiringClicks = await retryService.getExpiringClicksReport(
          3,  // Within 3 days
          100
        );

        if (expiringClicks.length > 0) {
          logger.warn('⏰ Clicks expiring soon', {
            count: expiringClicks.length,
            clicks: expiringClicks.slice(0, 5) // Log first 5
          });
        } else {
          logger.info('⏰ No clicks expiring soon');
        }

      } catch (error) {
        logger.error('⏰ Cron: Expiring clicks alert failed', {
          error: error.message
        });
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Ensure job is started
    job.start();

    this.jobs.push({
      name: 'expiring-alert',
      schedule,
      job
    });

    logger.info(`✅ Scheduled & Started: Expiring clicks alert (${schedule})`);
  }

  /**
   * Job 4: Cleanup old activity logs
   * Schedule: Daily at 2 AM
   * Purpose: Delete activity logs older than 90 days
   */
  scheduleActivityLogsCleanup() {
    const schedule = '0 2 * * *'; // Daily at 2 AM

    const job = cron.schedule(schedule, async () => {
      logger.info('🗑️  Cron: Activity logs cleanup started');

      try {
        const { pool } = require('../config/database');

        // Delete logs older than 90 days
        const result = await pool.query(`
          DELETE FROM user_activity_logs
          WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        `);

        const deletedCount = result.rowCount;

        logger.success('🗑️  Cron: Activity logs cleanup completed', {
          deletedCount
        });

        // Warn if large number of logs deleted
        if (deletedCount > 10000) {
          logger.warn('⚠️  Large number of activity logs deleted', {
            count: deletedCount
          });
        }

      } catch (error) {
        logger.error('🗑️  Cron: Activity logs cleanup failed', {
          error: error.message
        });
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Ensure job is started
    job.start();

    this.jobs.push({
      name: 'cleanup-activity-logs',
      schedule,
      job
    });

    logger.info(`✅ Scheduled & Started: Activity logs cleanup (${schedule})`);
  }

  /**
   * Job 5: Cashback reminder emails
   * Schedule: Configurable via system_settings (default: daily at 10:00 AM)
   * Purpose: Send periodic reminders to users with available cashback
   */
  async scheduleCashbackReminders() {
    try {
      const SystemSettings = require('../services/systemSettings');

      // Check if reminders are enabled
      const enabled = await SystemSettings.get('cashback_reminder_enabled', true);

      if (!enabled || enabled === 'false') {
        logger.info('📧 Cashback reminders DISABLED via system settings');
        return;
      }

      // Get configured time (format: HH:MM)
      const reminderTime = await SystemSettings.get('cashback_reminder_time', '10:00');
      const [hour, minute] = reminderTime.split(':');

      // Build cron schedule: "minute hour * * *" (daily at specified time)
      const schedule = `${minute} ${hour} * * *`;

      const job = cron.schedule(schedule, async () => {
        logger.info('📧 Cron: Cashback reminder emails started');

        try {
          // Check if still enabled before running
          const stillEnabled = await SystemSettings.get('cashback_reminder_enabled', true);

          if (!stillEnabled || stillEnabled === 'false') {
            logger.info('📧 Cashback reminders disabled, skipping this run');
            return;
          }

          const CashbackNotificationService = require('../services/notifications/CashbackNotificationService');
          const results = await CashbackNotificationService.sendPeriodicReminders();

          logger.success('📧 Cron: Cashback reminder emails completed', {
            total: results.total,
            sent: results.sent,
            skipped: results.skipped,
            failed: results.failed
          });

          // Alert if high failure rate
          if (results.failed > 0 && results.failed / results.total > 0.2) {
            logger.warn('⚠️  High failure rate for cashback reminders', {
              failureRate: `${((results.failed / results.total) * 100).toFixed(1)}%`,
              failed: results.failed,
              total: results.total
            });
          }

        } catch (error) {
          logger.error('📧 Cron: Cashback reminder emails failed', {
            error: error.message,
            stack: error.stack
          });
        }
      }, {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh"
      });

      // Ensure job is started
      job.start();

      this.jobs.push({
        name: 'cashback-reminders',
        schedule,
        job
      });

      logger.info(`✅ Scheduled & Started: Cashback reminder emails (${schedule} = ${reminderTime} daily)`);

    } catch (error) {
      logger.error('Failed to schedule cashback reminders', {
        error: error.message
      });
    }
  }

  /**
   * Job 6: Cleanup old notification logs
   * Schedule: Daily at 4 AM
   * Purpose: Delete notification logs older than 90 days
   */
  scheduleNotificationLogsCleanup() {
    const schedule = '0 4 * * *'; // Daily at 4 AM

    const job = cron.schedule(schedule, async () => {
      logger.info('🗑️  Cron: Notification logs cleanup started');

      try {
        const { pool } = require('../config/database');

        // Delete logs older than 90 days
        const result = await pool.query(`
          DELETE FROM cashback_notifications
          WHERE email_sent_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        `);

        const deletedCount = result.rowCount;

        logger.success('🗑️  Cron: Notification logs cleanup completed', {
          deletedCount
        });

        // Warn if large number of logs deleted
        if (deletedCount > 5000) {
          logger.warn('⚠️  Large number of notification logs deleted', {
            count: deletedCount
          });
        }

      } catch (error) {
        logger.error('🗑️  Cron: Notification logs cleanup failed', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Ensure job is started
    job.start();

    this.jobs.push({
      name: 'notification-logs-cleanup',
      schedule,
      job
    });

    logger.info(`✅ Scheduled & Started: Notification logs cleanup (${schedule})`);
  }

  /**
   * Stop all cron jobs
   */
  stopAll() {
    if (this.jobs.length === 0) {
      logger.info('No cron jobs to stop');
      return;
    }

    logger.info('Stopping all cron jobs...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`Stopped: ${name}`);
    });

    this.jobs = [];
    // Note: isInitialized flag is managed by initialize() method
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      autoCronEnabled: process.env.AUTO_CRON_ENABLED === 'true',
      jobsCount: this.jobs.length,
      jobs: this.jobs.map(({ name, schedule }) => ({
        name,
        schedule,
        status: 'running'
      }))
    };
  }

  /**
   * Manually trigger a specific job
   * @param {string} jobName - Name of job to trigger
   */
  async triggerJob(jobName) {
    logger.info(`Manually triggering job: ${jobName}`);

    switch (jobName) {
      case 'retry-unmatched':
        return await retryService.retryUnmatchedClicks({ daysOld: 1, limit: 200 });

      case 'cleanup-expired':
        const { pool } = require('../config/database');
        const result = await pool.query(`
          UPDATE clicks c
          SET last_checked_at = NOW()
          WHERE c.link_expires_at < NOW()
            AND NOT EXISTS (SELECT 1 FROM conversions co WHERE co.click_id = c.id)
          RETURNING id
        `);
        return { expiredCount: result.rows.length };

      case 'expiring-alert':
        return await retryService.getExpiringClicksReport(3, 100);

      case 'cleanup-activity-logs':
        const { pool: activityPool } = require('../config/database');
        const cleanupResult = await activityPool.query(`
          DELETE FROM user_activity_logs
          WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        `);
        return { deletedCount: cleanupResult.rowCount };

      case 'cashback-reminders':
        const CashbackNotificationService = require('../services/notifications/CashbackNotificationService');
        return await CashbackNotificationService.sendPeriodicReminders();

      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

module.exports = new CronJobsService();
