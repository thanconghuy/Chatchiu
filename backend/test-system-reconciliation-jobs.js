/**
 * Test Script for System Reconciliation Jobs
 *
 * Usage:
 *   node test-system-reconciliation-jobs.js [job-name]
 *
 * Examples:
 *   node test-system-reconciliation-jobs.js daily
 *   node test-system-reconciliation-jobs.js monthly
 *   node test-system-reconciliation-jobs.js sync
 */

const { JobScheduler, DailyCollectionJob, MonthlyReconciliationJob, APISyncJob } = require('./jobs/systemReconciliation');

async function testJob(jobName) {
  console.log('='.repeat(60));
  console.log(`🧪 Testing System Reconciliation Jobs`);
  console.log('='.repeat(60));
  console.log();

  try {
    switch (jobName) {
      case 'daily':
        console.log('📅 Running Daily Collection Job...\n');
        const dailyResult = await DailyCollectionJob.run();
        console.log('\n✅ Daily Collection Job Result:', dailyResult);
        break;

      case 'monthly':
        console.log('📆 Running Monthly Reconciliation Job...\n');
        const monthlyResult = await MonthlyReconciliationJob.run();
        console.log('\n✅ Monthly Reconciliation Job Result:', monthlyResult);
        break;

      case 'sync':
        console.log('🔄 Running API Sync Job...\n');
        const syncResult = await APISyncJob.run();
        console.log('\n✅ API Sync Job Result:', syncResult);
        break;

      case 'stats':
        console.log('📊 Getting API Sync Statistics...\n');
        const stats = await APISyncJob.getStats();
        console.log('Statistics:', stats);
        break;

      case 'all':
        console.log('🔄 Running all jobs sequentially...\n');

        console.log('1️⃣  Daily Collection Job');
        console.log('-'.repeat(40));
        await DailyCollectionJob.run();
        console.log();

        console.log('2️⃣  Monthly Reconciliation Job');
        console.log('-'.repeat(40));
        try {
          await MonthlyReconciliationJob.run();
        } catch (e) {
          console.log('⚠️  Monthly job skipped:', e.message);
        }
        console.log();

        console.log('3️⃣  API Sync Job');
        console.log('-'.repeat(40));
        await APISyncJob.run();
        console.log();

        break;

      case 'scheduler':
        console.log('⏰ Testing Job Scheduler...\n');
        const status = JobScheduler.getStatus();
        console.log('Current Status:', status);

        if (!status.isRunning) {
          console.log('\n🚀 Starting scheduler...');
          JobScheduler.start();

          // Run for 10 seconds then stop
          console.log('\n⏳ Scheduler running for 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));

          console.log('\n🛑 Stopping scheduler...');
          JobScheduler.stop();
        }
        break;

      default:
        console.log('❌ Unknown job name:', jobName);
        console.log('\nAvailable jobs:');
        console.log('  - daily      : Daily Collection Job');
        console.log('  - monthly    : Monthly Reconciliation Job');
        console.log('  - sync       : API Sync Job');
        console.log('  - stats      : Get sync statistics');
        console.log('  - all        : Run all jobs');
        console.log('  - scheduler  : Test job scheduler');
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Get job name from command line
const jobName = process.argv[2] || 'all';

// Run test
testJob(jobName);
