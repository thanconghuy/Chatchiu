/**
 * Start System Reconciliation Jobs
 *
 * This file should be called from server.js to start scheduled jobs
 *
 * Usage in server.js:
 *   const startSystemReconciliationJobs = require('./startSystemReconciliationJobs');
 *   startSystemReconciliationJobs();
 */

const { JobScheduler } = require('./jobs/systemReconciliation');

function startSystemReconciliationJobs() {
  console.log('\n📦 System Reconciliation Module');
  console.log('='.repeat(50));

  try {
    // Start job scheduler
    JobScheduler.start();

    // Log scheduler status
    const status = JobScheduler.getStatus();
    console.log('\n✅ System Reconciliation jobs ready');
    console.log(`   Active jobs: ${status.jobs.length}`);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping System Reconciliation jobs...');
      JobScheduler.stop();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Stopping System Reconciliation jobs...');
      JobScheduler.stop();
    });

  } catch (error) {
    console.error('❌ Failed to start System Reconciliation jobs:', error.message);
    // Don't crash the server - log error and continue
  }
}

module.exports = startSystemReconciliationJobs;
