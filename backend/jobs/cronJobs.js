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
   * Loads configuration from database cron_jobs table
   * @param {boolean} forceReload - Force reload even if already initialized
   */
  async initialize(forceReload = false) {
    // Load cron jobs configuration from database
    let enabledJobs = [];

    try {
      const { pool } = require('../config/database');

      // Get all enabled jobs from database
      const result = await pool.query(`
        SELECT job_key, job_name, cron_schedule, is_enabled, timezone
        FROM cron_jobs
        WHERE is_enabled = true
        ORDER BY job_key
      `);

      enabledJobs = result.rows;
      logger.info(`Loaded ${enabledJobs.length} enabled cron jobs from database`);

    } catch (error) {
      logger.warn('Failed to load cron jobs from database, will retry later', {
        error: error.message
      });
      // Don't initialize if database query fails - wait for retry
      this.isInitialized = false;
      return;
    }

    // If no jobs enabled, stop all and mark as not initialized
    if (enabledJobs.length === 0) {
      logger.info('No cron jobs enabled in database');
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

    logger.info('Initializing cron jobs from database...');

    // Stop all existing jobs first (in case of reinit)
    this.stopAll();

    // Schedule each enabled job from database
    for (const jobConfig of enabledJobs) {
      const { job_key, job_name, cron_schedule, timezone } = jobConfig;

      try {
        switch (job_key) {
          case 'retry-unmatched':
            this.scheduleRetryUnmatched(cron_schedule, timezone);
            break;
          case 'cleanup-expired':
            this.scheduleCleanupExpired(cron_schedule, timezone);
            break;
          case 'expiring-alert':
            this.scheduleExpiringAlert(cron_schedule, timezone);
            break;
          case 'activity-logs-cleanup':
            this.scheduleActivityLogsCleanup(cron_schedule, timezone);
            break;
          case 'cashback-reminders':
            await this.scheduleCashbackReminders(cron_schedule, timezone);
            break;
          case 'notification-logs-cleanup':
            this.scheduleNotificationLogsCleanup(cron_schedule, timezone);
            break;
          default:
            logger.warn(`Unknown cron job key: ${job_key}`);
        }
      } catch (error) {
        logger.error(`Failed to schedule job ${job_key}:`, error.message);
      }
    }

    this.isInitialized = true;
    logger.success(`✅ Initialized ${this.jobs.length} cron jobs from database`);
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
   * Schedule: Configurable from database (default: Every 6 hours)
   * Purpose: Automatically recover lost conversions
   */
  scheduleRetryUnmatched(schedule = '0 */6 * * *', timezone = 'Asia/Ho_Chi_Minh') {
    const job = cron.schedule(schedule, async () => {
      const jobKey = 'retry-unmatched';
      const startTime = Date.now();

      logger.info('🔄 Cron: Retry unmatched clicks started');

      // Mark job as started in database
      await this.recordJobStart(jobKey);

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

        // Record success
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'success', duration, results);

      } catch (error) {
        logger.error('🔄 Cron: Retry unmatched clicks failed', {
          error: error.message,
          stack: error.stack
        });

        // Record failure
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone
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
  scheduleCleanupExpired(schedule = '0 3 * * *', timezone = 'Asia/Ho_Chi_Minh') {

    const job = cron.schedule(schedule, async () => {
      const jobKey = 'cleanup-expired';
      const startTime = Date.now();

      logger.info('🗑️  Cron: Cleanup expired clicks started');

      // Mark job as started in database
      await this.recordJobStart(jobKey);

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

        // Record success
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'success', duration, { expiredCount });

      } catch (error) {
        logger.error('🗑️  Cron: Cleanup expired clicks failed', {
          error: error.message
        });

        // Record failure
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone
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
  scheduleExpiringAlert(schedule = '0 9 * * *', timezone = 'Asia/Ho_Chi_Minh') {

    const job = cron.schedule(schedule, async () => {
      const jobKey = 'expiring-alert';
      const startTime = Date.now();

      logger.info('⏰ Cron: Expiring clicks alert started');

      // Mark job as started in database
      await this.recordJobStart(jobKey);

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

        // Record success
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'success', duration, {
          expiringCount: expiringClicks.length
        });

      } catch (error) {
        logger.error('⏰ Cron: Expiring clicks alert failed', {
          error: error.message
        });

        // Record failure
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone
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
  scheduleActivityLogsCleanup(schedule = '0 2 * * *', timezone = 'Asia/Ho_Chi_Minh') {

    const job = cron.schedule(schedule, async () => {
      const jobKey = 'activity-logs-cleanup';
      const startTime = Date.now();

      logger.info('🗑️  Cron: Activity logs cleanup started');

      // Mark job as started in database
      await this.recordJobStart(jobKey);

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

        // Record success
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'success', duration, { deletedCount });

      } catch (error) {
        logger.error('🗑️  Cron: Activity logs cleanup failed', {
          error: error.message
        });

        // Record failure
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone
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
   * Schedule: Configurable from database (default: daily at 10:00 AM)
   * Purpose: Send periodic reminders to users with available cashback
   */
  async scheduleCashbackReminders(schedule = '0 10 * * *', timezone = 'Asia/Ho_Chi_Minh') {
    try {
      const SystemSettings = require('../services/systemSettings');

      // Check if reminders are enabled via additional setting
      const enabled = await SystemSettings.get('cashback_reminder_enabled', true);

      if (!enabled || enabled === 'false') {
        logger.info('📧 Cashback reminders DISABLED via system settings');
        return;
      }

      const job = cron.schedule(schedule, async () => {
        const jobKey = 'cashback-reminders';
        const startTime = Date.now();

        logger.info('📧 Cron: Cashback reminder emails started');

        // Mark job as started in database
        await this.recordJobStart(jobKey);

        try {
          // Check if still enabled before running
          const stillEnabled = await SystemSettings.get('cashback_reminder_enabled', true);

          if (!stillEnabled || stillEnabled === 'false') {
            logger.info('📧 Cashback reminders disabled, skipping this run');

            // Record as success with skipped status
            const duration = Date.now() - startTime;
            await this.recordJobComplete(jobKey, 'success', duration, {
              skipped: true,
              reason: 'disabled_in_settings'
            });
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

          // Record success
          const duration = Date.now() - startTime;
          await this.recordJobComplete(jobKey, 'success', duration, results);

        } catch (error) {
          logger.error('📧 Cron: Cashback reminder emails failed', {
            error: error.message,
            stack: error.stack
          });

          // Record failure
          const duration = Date.now() - startTime;
          await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
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

      logger.info(`✅ Scheduled & Started: Cashback reminder emails (${schedule})`);

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
  scheduleNotificationLogsCleanup(schedule = '0 4 * * *', timezone = 'Asia/Ho_Chi_Minh') {

    const job = cron.schedule(schedule, async () => {
      const jobKey = 'notification-logs-cleanup';
      const startTime = Date.now();

      logger.info('🗑️  Cron: Notification logs cleanup started');

      // Mark job as started in database
      await this.recordJobStart(jobKey);

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

        // Record success
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'success', duration, { deletedCount });

      } catch (error) {
        logger.error('🗑️  Cron: Notification logs cleanup failed', {
          error: error.message,
          stack: error.stack
        });

        // Record failure
        const duration = Date.now() - startTime;
        await this.recordJobComplete(jobKey, 'failed', duration, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone
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
   * Record job start in database
   * @param {string} jobKey - Job key to record
   */
  async recordJobStart(jobKey) {
    try {
      const { pool } = require('../config/database');
      await pool.query('SELECT cron_job_started($1)', [jobKey]);
    } catch (error) {
      logger.error(`Failed to record job start for ${jobKey}:`, error.message);
    }
  }

  /**
   * Record job completion in database
   * @param {string} jobKey - Job key to record
   * @param {string} status - 'success' or 'failed'
   * @param {number} durationMs - Duration in milliseconds
   * @param {object} result - Result object to store as JSON
   */
  async recordJobComplete(jobKey, status, durationMs, result = null) {
    try {
      const { pool } = require('../config/database');
      await pool.query(
        'SELECT cron_job_completed($1, $2, $3, $4)',
        [jobKey, status, durationMs, result ? JSON.stringify(result) : null]
      );
    } catch (error) {
      logger.error(`Failed to record job completion for ${jobKey}:`, error.message);
    }
  }

  /**
   * Get status of all jobs
   */
  async getStatus() {
    try {
      const { pool } = require('../config/database');

      // Get all jobs from database with their current status
      const result = await pool.query(`
        SELECT
          job_key,
          job_name,
          cron_schedule,
          is_enabled,
          is_running,
          last_run_at,
          last_run_status,
          last_run_duration_ms,
          next_run_at,
          total_runs,
          success_runs,
          failed_runs
        FROM cron_jobs
        ORDER BY job_key
      `);

      return {
        isInitialized: this.isInitialized,
        jobsCount: this.jobs.length,
        enabledJobsCount: result.rows.filter(j => j.is_enabled).length,
        jobs: result.rows.map(job => ({
          key: job.job_key,
          name: job.job_name,
          schedule: job.cron_schedule,
          isEnabled: job.is_enabled,
          isRunning: job.is_running,
          lastRunAt: job.last_run_at,
          lastRunStatus: job.last_run_status,
          lastRunDuration: job.last_run_duration_ms,
          nextRunAt: job.next_run_at,
          totalRuns: job.total_runs,
          successRuns: job.success_runs,
          failedRuns: job.failed_runs,
          successRate: job.total_runs > 0
            ? ((job.success_runs / job.total_runs) * 100).toFixed(1) + '%'
            : 'N/A'
        }))
      };
    } catch (error) {
      logger.error('Failed to get cron jobs status:', error.message);
      return {
        isInitialized: this.isInitialized,
        jobsCount: this.jobs.length,
        enabledJobsCount: this.jobs.length,
        jobs: this.jobs.map(({ name, schedule }) => ({
          name,
          schedule,
          status: 'running'
        })),
        error: error.message
      };
    }
  }

  /**
   * Manually trigger a specific job
   * @param {string} jobName - Name of job to trigger
   */
  async triggerJob(jobName) {
    const startTime = Date.now();
    logger.info(`Manually triggering job: ${jobName}`);

    // Record job start
    await this.recordJobStart(jobName);

    try {
      let result;

      switch (jobName) {
        case 'retry-unmatched':
          result = await retryService.retryUnmatchedClicks({ daysOld: 1, limit: 200 });
          break;

        case 'cleanup-expired':
          const { pool } = require('../config/database');
          const cleanupResult = await pool.query(`
            UPDATE clicks c
            SET last_checked_at = NOW()
            WHERE c.link_expires_at < NOW()
              AND NOT EXISTS (SELECT 1 FROM conversions co WHERE co.click_id = c.id)
            RETURNING id
          `);
          result = { expiredCount: cleanupResult.rows.length };
          break;

        case 'expiring-alert':
          const expiringClicks = await retryService.getExpiringClicksReport(3, 100);
          result = { expiringCount: expiringClicks.length, clicks: expiringClicks };
          break;

        case 'cleanup-activity-logs':
          const { pool: activityPool } = require('../config/database');
          const activityCleanupResult = await activityPool.query(`
            DELETE FROM user_activity_logs
            WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
          `);
          result = { deletedCount: activityCleanupResult.rowCount };
          break;

        case 'cashback-reminders':
          const CashbackNotificationService = require('../services/notifications/CashbackNotificationService');
          result = await CashbackNotificationService.sendPeriodicReminders();
          break;

        case 'notification-logs-cleanup':
          const { pool: notifPool } = require('../config/database');
          const notifCleanupResult = await notifPool.query(`
            DELETE FROM cashback_notifications
            WHERE email_sent_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
          `);
          result = { deletedCount: notifCleanupResult.rowCount };
          break;

        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      // Record success
      const duration = Date.now() - startTime;
      await this.recordJobComplete(jobName, 'success', duration, result);

      return result;

    } catch (error) {
      // Record failure
      const duration = Date.now() - startTime;
      await this.recordJobComplete(jobName, 'failed', duration, { error: error.message });

      throw error;
    }
  }
}

module.exports = new CronJobsService();
