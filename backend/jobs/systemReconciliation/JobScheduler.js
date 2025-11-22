/**
 * Job Scheduler for System Reconciliation
 *
 * Manages scheduled jobs for automatic reconciliation
 */

const cron = require('node-cron');
const DailyCollectionJob = require('./DailyCollectionJob');
const MonthlyReconciliationJob = require('./MonthlyReconciliationJob');
const APISyncJob = require('./APISyncJob');

class JobScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Job scheduler already running');
      return;
    }

    console.log('🚀 Starting System Reconciliation Job Scheduler...\n');

    // 1. Daily Collection Job - Runs every day at 00:30
    // Collects approved orders and updates pending balance
    const dailyJob = cron.schedule('30 0 * * *', async () => {
      console.log('\n⏰ [Daily Collection Job] Starting...');
      try {
        await DailyCollectionJob.run();
        console.log('✅ [Daily Collection Job] Completed\n');
      } catch (error) {
        console.error('❌ [Daily Collection Job] Failed:', error.message);
      }
    }, {
      timezone: 'Asia/Ho_Chi_Minh'
    });

    this.jobs.push({ name: 'DailyCollectionJob', schedule: dailyJob });
    console.log('✓ Daily Collection Job scheduled (00:30 daily)');

    // 2. Monthly Reconciliation Job - Runs on 15th of each month at 02:00
    // Creates reconciliation period for previous month
    const monthlyJob = cron.schedule('0 2 15 * *', async () => {
      console.log('\n⏰ [Monthly Reconciliation Job] Starting...');
      try {
        await MonthlyReconciliationJob.run();
        console.log('✅ [Monthly Reconciliation Job] Completed\n');
      } catch (error) {
        console.error('❌ [Monthly Reconciliation Job] Failed:', error.message);
      }
    }, {
      timezone: 'Asia/Ho_Chi_Minh'
    });

    this.jobs.push({ name: 'MonthlyReconciliationJob', schedule: monthlyJob });
    console.log('✓ Monthly Reconciliation Job scheduled (02:00 on 15th)');

    // 3. API Sync Job - Runs every 6 hours
    // Syncs with AccessTrade API reconciliation
    const apiSyncJob = cron.schedule('0 */6 * * *', async () => {
      console.log('\n⏰ [API Sync Job] Starting...');
      try {
        await APISyncJob.run();
        console.log('✅ [API Sync Job] Completed\n');
      } catch (error) {
        console.error('❌ [API Sync Job] Failed:', error.message);
      }
    }, {
      timezone: 'Asia/Ho_Chi_Minh'
    });

    this.jobs.push({ name: 'APISyncJob', schedule: apiSyncJob });
    console.log('✓ API Sync Job scheduled (every 6 hours)');

    this.isRunning = true;
    console.log('\n✅ All System Reconciliation jobs started successfully\n');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Job scheduler not running');
      return;
    }

    console.log('\n🛑 Stopping System Reconciliation Job Scheduler...');

    this.jobs.forEach(({ name, schedule }) => {
      schedule.stop();
      console.log(`✓ ${name} stopped`);
    });

    this.jobs = [];
    this.isRunning = false;

    console.log('✅ All jobs stopped\n');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: this.jobs.map(({ name }) => ({ name, status: 'scheduled' }))
    };
  }

  /**
   * Run a specific job manually (for testing)
   */
  async runManually(jobName) {
    console.log(`\n🔧 Running ${jobName} manually...`);

    try {
      switch (jobName) {
        case 'DailyCollectionJob':
          await DailyCollectionJob.run();
          break;
        case 'MonthlyReconciliationJob':
          await MonthlyReconciliationJob.run();
          break;
        case 'APISyncJob':
          await APISyncJob.run();
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      console.log(`✅ ${jobName} completed successfully\n`);
    } catch (error) {
      console.error(`❌ ${jobName} failed:`, error.message);
      throw error;
    }
  }
}

// Singleton instance
const scheduler = new JobScheduler();

module.exports = scheduler;
