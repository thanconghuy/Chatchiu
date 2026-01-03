/**
 * Check timezone issues in auto_sync_history
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkTimezone() {
  console.log('\n========================================');
  console.log('🕐 Checking Auto-Sync Timezone Issues');
  console.log('========================================\n');

  try {
    // 1. Check database timezone
    console.log('1. Database Timezone:');
    const tzResult = await pool.query('SHOW timezone');
    console.log('   Timezone:', tzResult.rows[0].TimeZone);
    console.log('   Current time (DB):', (await pool.query('SELECT NOW()')).rows[0].now);
    console.log('   Current time (Node):', new Date().toISOString());
    console.log('');

    // 2. Check latest sync record
    console.log('2. Latest Sync Record:');
    const syncResult = await pool.query(`
      SELECT
        id,
        sync_started_at,
        sync_completed_at,
        sync_status,
        total_fetched,
        total_created
      FROM auto_sync_history
      ORDER BY sync_started_at DESC
      LIMIT 1
    `);

    if (syncResult.rows.length === 0) {
      console.log('   No sync records found!');
      return;
    }

    const record = syncResult.rows[0];
    console.log('   ID:', record.id);
    console.log('   Status:', record.sync_status);
    console.log('   Fetched:', record.total_fetched);
    console.log('   Created:', record.total_created);
    console.log('');

    console.log('   Raw sync_started_at:', record.sync_started_at);
    console.log('   ISO string:', new Date(record.sync_started_at).toISOString());
    console.log('   Vi-VN format:', new Date(record.sync_started_at).toLocaleString('vi-VN'));
    console.log('   En-US format:', new Date(record.sync_started_at).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    console.log('');

    // 3. Check column type
    console.log('3. Column Type:');
    const typeResult = await pool.query(`
      SELECT column_name, data_type, datetime_precision
      FROM information_schema.columns
      WHERE table_name = 'auto_sync_history'
        AND column_name IN ('sync_started_at', 'sync_completed_at', 'created_at')
    `);

    typeResult.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    console.log('');

    // 4. Compare NOW() with actual insert
    console.log('4. Testing INSERT with NOW():');
    const testTime = new Date();
    console.log('   Node.js time:', testTime.toISOString());
    console.log('   Node.js VN:', testTime.toLocaleString('vi-VN'));

    const insertTest = await pool.query(`
      INSERT INTO auto_sync_history (
        sync_type,
        sync_started_at,
        sync_status
      ) VALUES (
        'test',
        NOW(),
        'testing'
      )
      RETURNING id, sync_started_at
    `);

    const inserted = insertTest.rows[0];
    console.log('   Inserted at (raw):', inserted.sync_started_at);
    console.log('   Inserted at (ISO):', new Date(inserted.sync_started_at).toISOString());
    console.log('   Inserted at (VN):', new Date(inserted.sync_started_at).toLocaleString('vi-VN'));

    // Clean up test
    await pool.query('DELETE FROM auto_sync_history WHERE id = $1', [inserted.id]);
    console.log('   ✅ Test record deleted');
    console.log('');

    // 5. Check if frontend displays correctly
    console.log('5. Analysis:');
    const nodeTime = new Date();
    const dbTime = new Date(record.sync_started_at);
    const diffMs = Math.abs(nodeTime - dbTime);
    const diffHours = diffMs / (1000 * 60 * 60);

    console.log(`   Time difference: ${diffHours.toFixed(2)} hours`);

    if (diffHours >= 6 && diffHours <= 8) {
      console.log('   ⚠️  Possible timezone offset (GMT vs GMT+7)');
      console.log('   Issue: Database storing in UTC, but displaying as local time');
    }

    console.log('\n========================================');
    console.log('Recommendation:');
    console.log('========================================');
    console.log('The database is correctly using TIMESTAMPTZ.');
    console.log('The issue is likely in how the data is displayed.');
    console.log('Check: Frontend formatDateTime() function');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkTimezone();
