require('dotenv').config();
const autoSyncService = require('./backend/services/autoSyncService');
const AutoSyncConfig = require('./backend/models/AutoSyncConfig');

(async () => {
  try {
    console.log('='.repeat(60));
    console.log('Testing Auto-Sync Service');
    console.log('='.repeat(60));

    // Get current config
    const config = await AutoSyncConfig.getConfig();
    console.log('\n📋 Current Config:');
    console.log('  - Enabled:', config.enabled);
    console.log('  - Schedule:', config.cron_schedule);
    console.log('  - Sync Days:', config.sync_days);
    console.log('  - Last Run:', config.last_run_at);
    console.log('  - Last Status:', config.last_run_status);
    console.log('  - Last Message:', config.last_run_message);

    // Initialize auto-sync
    console.log('\n🔄 Initializing Auto-Sync Service...');
    await autoSyncService.initialize();

    // Get status
    const status = autoSyncService.getStatus();
    console.log('\n✅ Auto-Sync Status:');
    console.log('  - Has Scheduled Job:', status.hasScheduledJob);
    console.log('  - Is Running:', status.isRunning);

    if (status.hasScheduledJob) {
      console.log('\n✅ Auto-Sync is ENABLED and will run according to schedule:', config.cron_schedule);

      // Calculate next run time
      const cron = require('node-cron');
      console.log('\n⏰ Next scheduled runs (estimate):');
      console.log('  - Next at: 00:00 or 06:00 or 12:00 or 18:00 (every 6 hours)');
    } else {
      console.log('\n❌ Auto-Sync is DISABLED');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test completed. Press Ctrl+C to exit.');
    console.log('='.repeat(60));

    // Keep process alive to show cron is scheduled
    setInterval(() => {
      const now = new Date();
      console.log(`[${now.toISOString()}] Auto-sync service still running...`);
    }, 30000); // Log every 30 seconds

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
