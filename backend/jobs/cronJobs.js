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
   */
  initialize() {
    if (this.isInitialized) {
      logger.warn('Cron jobs already initialized');
      return;
    }

    const autoCronEnabled = process.env.AUTO_CRON_ENABLED === 'true';

    if (!autoCronEnabled) {
      logger.info('Auto cron jobs DISABLED (set AUTO_CRON_ENABLED=true to enable)');
      return;
    }

    logger.info('Initializing cron jobs...');

    // Job 1: Retry unmatched clicks (every 6 hours)
    this.scheduleRetryUnmatched();

    // Job 2: Cleanup expired clicks (daily at 3 AM)
    this.scheduleCleanupExpired();

    // Job 3: Alert expiring clicks (daily at 9 AM)
    this.scheduleExpiringAlert();

    this.isInitialized = true;
    logger.success(`Initialized ${this.jobs.length} cron jobs`);
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

    this.jobs.push({
      name: 'retry-unmatched',
      schedule,
      job
    });

    logger.info(`✅ Scheduled: Retry unmatched clicks (${schedule})`);
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

    this.jobs.push({
      name: 'cleanup-expired',
      schedule,
      job
    });

    logger.info(`✅ Scheduled: Cleanup expired clicks (${schedule})`);
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

    this.jobs.push({
      name: 'expiring-alert',
      schedule,
      job
    });

    logger.info(`✅ Scheduled: Expiring clicks alert (${schedule})`);
  }

  /**
   * Stop all cron jobs
   */
  stopAll() {
    logger.info('Stopping all cron jobs...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`Stopped: ${name}`);
    });

    this.isInitialized = false;
    this.jobs = [];
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

      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

module.exports = new CronJobsService();
