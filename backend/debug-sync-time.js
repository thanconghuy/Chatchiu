require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== DEBUG SYNC TIME ===\n');

    console.log('Current server time:');
    console.log('  JS Date:', new Date().toISOString());
    console.log('  JS Vietnam:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    console.log('');

    // Check what NOW() returns in PostgreSQL
    const nowResult = await pool.query(`SELECT NOW() as db_now, CURRENT_TIMESTAMP as db_current`);
    console.log('PostgreSQL time:');
    console.log('  NOW():', nowResult.rows[0].db_now);
    console.log('  CURRENT_TIMESTAMP:', nowResult.rows[0].db_current);
    console.log('');

    // Check auto_sync_config
    const config = await pool.query(`
      SELECT last_run_at
      FROM auto_sync_config
      ORDER BY id DESC
      LIMIT 1
    `);

    if (config.rows.length > 0) {
      const lastRunAt = config.rows[0].last_run_at;
      console.log('auto_sync_config.last_run_at:');
      console.log('  Raw from DB:', lastRunAt);
      console.log('  typeof:', typeof lastRunAt);

      if (lastRunAt) {
        const jsDate = new Date(lastRunAt);
        console.log('  JS Date object:', jsDate.toISOString());
        console.log('  toLocaleString vi-VN:', jsDate.toLocaleString('vi-VN'));
        console.log('  toLocaleString vi-VN (Asia/Ho_Chi_Minh):', jsDate.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
      }
    }
    console.log('');

    // Check auto_sync_history
    const history = await pool.query(`
      SELECT sync_started_at
      FROM auto_sync_history
      ORDER BY sync_started_at DESC
      LIMIT 1
    `);

    if (history.rows.length > 0) {
      const syncStartedAt = history.rows[0].sync_started_at;
      console.log('auto_sync_history.sync_started_at:');
      console.log('  Raw from DB:', syncStartedAt);
      console.log('  typeof:', typeof syncStartedAt);

      if (syncStartedAt) {
        const jsDate = new Date(syncStartedAt);
        console.log('  JS Date object:', jsDate.toISOString());
        console.log('  toLocaleString vi-VN:', jsDate.toLocaleString('vi-VN'));
        console.log('  toLocaleString vi-VN (Asia/Ho_Chi_Minh):', jsDate.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
      }
    }

    await pool.end();
    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
