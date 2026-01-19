require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  const client = await pool.connect();

  try {
    console.log('=== FIX: Auto Sync Config Time ===\n');

    // Check current data
    console.log('TRƯỚC KHI FIX:\n');
    const before = await client.query(`
      SELECT
        last_run_at,
        last_run_status,
        last_run_message
      FROM auto_sync_config
      ORDER BY id DESC
      LIMIT 1
    `);

    if (before.rows.length > 0) {
      console.log('last_run_at:', before.rows[0].last_run_at);
      console.log('Status:', before.rows[0].last_run_status);
    }

    // Get the most recent sync from auto_sync_history to sync them
    const historyResult = await client.query(`
      SELECT sync_started_at, sync_completed_at, sync_status
      FROM auto_sync_history
      WHERE sync_status = 'completed'
      ORDER BY sync_started_at DESC
      LIMIT 1
    `);

    if (historyResult.rows.length > 0) {
      const latestSync = historyResult.rows[0];
      console.log('\nLịch sử sync gần nhất:', latestSync.sync_started_at);

      // Update auto_sync_config to match
      await client.query(`
        UPDATE auto_sync_config
        SET
          last_run_at = $1,
          updated_at = NOW()
        WHERE id = (SELECT id FROM auto_sync_config ORDER BY id DESC LIMIT 1)
      `, [latestSync.sync_completed_at || latestSync.sync_started_at]);

      console.log('\n✅ Đã cập nhật last_run_at từ auto_sync_history');
    }

    // Verify
    console.log('\n\nSAU KHI FIX:\n');
    const after = await client.query(`
      SELECT
        c.last_run_at as config_time,
        h.sync_started_at as history_time
      FROM auto_sync_config c,
        (SELECT sync_started_at FROM auto_sync_history ORDER BY sync_started_at DESC LIMIT 1) h
      ORDER BY c.id DESC
      LIMIT 1
    `);

    if (after.rows.length > 0) {
      console.log('Config last_run_at:', after.rows[0].config_time);
      console.log('History sync_started_at:', after.rows[0].history_time);

      // Check if they're close
      const configTime = new Date(after.rows[0].config_time);
      const historyTime = new Date(after.rows[0].history_time);
      const diffSeconds = Math.abs(configTime - historyTime) / 1000;

      console.log('\nChênh lệch:', diffSeconds.toFixed(1), 'giây');

      if (diffSeconds < 60) {
        console.log('✅ Thời gian đã đồng nhất!');
      } else {
        console.log('⚠️  Vẫn còn chênh lệch lớn');
      }
    }

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
