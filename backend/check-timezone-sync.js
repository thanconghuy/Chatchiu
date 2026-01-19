require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA TIMEZONE CHO AUTO SYNC ===\n');

    // Check auto_sync_config
    console.log('1. AUTO_SYNC_CONFIG (Thống kê Sync):\n');
    const config = await pool.query(`
      SELECT
        last_run_at,
        last_run_at AT TIME ZONE 'UTC' as utc_time,
        last_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh' as vietnam_time,
        last_run_status,
        last_run_message
      FROM auto_sync_config
      ORDER BY id DESC
      LIMIT 1
    `);

    if (config.rows.length > 0) {
      const row = config.rows[0];
      console.log('Raw last_run_at:', row.last_run_at);
      console.log('UTC time:', row.utc_time);
      console.log('Vietnam time:', row.vietnam_time);
      console.log('Status:', row.last_run_status);
      console.log('Message:', row.last_run_message);
    }

    // Check auto_sync_history
    console.log('\n\n2. AUTO_SYNC_HISTORY (Lịch sử Sync):\n');
    const history = await pool.query(`
      SELECT
        id,
        sync_type,
        sync_started_at,
        sync_started_at AT TIME ZONE 'UTC' as utc_time,
        sync_started_at AT TIME ZONE 'Asia/Ho_Chi_Minh' as vietnam_time,
        sync_status,
        total_fetched,
        total_created
      FROM auto_sync_history
      ORDER BY sync_started_at DESC
      LIMIT 3
    `);

    history.rows.forEach((row, i) => {
      console.log(`${i+1}. Session ${row.id}:`);
      console.log('   Raw sync_started_at:', row.sync_started_at);
      console.log('   UTC time:', row.utc_time);
      console.log('   Vietnam time:', row.vietnam_time);
      console.log('   Type:', row.sync_type);
      console.log('   Status:', row.sync_status);
      console.log('   Created:', row.total_created);
      console.log('');
    });

    // Check DB timezone setting
    console.log('\n3. DATABASE TIMEZONE SETTING:\n');
    const tzResult = await pool.query(`SHOW timezone`);
    console.log('PostgreSQL timezone:', tzResult.rows[0].timezone);

    const nowResult = await pool.query(`SELECT NOW(), NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'`);
    console.log('NOW():', nowResult.rows[0].now);
    console.log('NOW() UTC:', nowResult.rows[0].timezone);
    console.log('NOW() Vietnam:', nowResult.rows[0]['?column?'] || nowResult.rows[0].timezone_1);

    // Check data types
    console.log('\n\n4. COLUMN DATA TYPES:\n');
    const columns = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('auto_sync_config', 'auto_sync_history')
        AND column_name IN ('last_run_at', 'sync_started_at', 'sync_completed_at', 'created_at')
      ORDER BY table_name, column_name
    `);

    columns.rows.forEach(row => {
      console.log(`${row.table_name}.${row.column_name}: ${row.data_type}`);
    });

    await pool.end();
    console.log('\n✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
