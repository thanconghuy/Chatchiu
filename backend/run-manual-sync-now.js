require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { syncConversions } = require('./jobs/syncConversions');
const AutoSyncConfig = require('./models/AutoSyncConfig');
const AutoSyncHistory = require('./models/AutoSyncHistory');
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== CHẠY SYNC THỦ CÔNG ===\n');
    console.log('Ngày hiện tại:', new Date().toLocaleString('vi-VN'));
    console.log('');

    // Check current status
    console.log('📊 Trạng thái trước khi sync:');
    const before = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions) as at_conversions,
        (SELECT COUNT(*) FROM system_conversions) as system_conversions
    `);
    console.log(`  - Conversions (AT): ${before.rows[0].at_conversions}`);
    console.log(`  - System Conversions: ${before.rows[0].system_conversions}`);

    // Get config
    const config = await AutoSyncConfig.getConfig();
    console.log(`\n⚙️  Config: sync_days = ${config.sync_days}`);

    // Run sync with more days to catch all missing
    const syncDays = 30; // Sync 30 days to catch all missing conversions
    console.log(`\n🔄 Bắt đầu sync ${syncDays} ngày...\n`);

    await AutoSyncConfig.updateLastRun('running', 'Manual sync in progress...');

    const result = await syncConversions(syncDays);

    const message = `Đã import ${result.imported} conversions, ${result.duplicates} trùng lặp`;
    await AutoSyncConfig.updateLastRun('success', message);

    console.log('\n✅ Kết quả sync:');
    console.log(`  - Imported: ${result.imported}`);
    console.log(`  - Duplicates: ${result.duplicates}`);

    // Check after
    console.log('\n📊 Trạng thái sau khi sync:');
    const after = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions) as at_conversions,
        (SELECT COUNT(*) FROM system_conversions) as system_conversions
    `);
    console.log(`  - Conversions (AT): ${after.rows[0].at_conversions}`);
    console.log(`  - System Conversions: ${after.rows[0].system_conversions}`);

    await pool.end();
    console.log('\n✅ Sync hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);

    try {
      await AutoSyncConfig.updateLastRun('error', error.message);
    } catch (e) {
      // Ignore
    }

    process.exit(1);
  }
})();
