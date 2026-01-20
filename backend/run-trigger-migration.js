/**
 * Run trigger migration
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('========================================');
    console.log('TẠO TRIGGER TỰ ĐỘNG SYNC BALANCE');
    console.log('========================================\n');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'create_balance_sync_trigger.sql'),
      'utf8'
    );

    await pool.query(sql);

    console.log('\n========================================');
    console.log('✅ TRIGGER ĐÃ ĐƯỢC TẠO THÀNH CÔNG!');
    console.log('========================================\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

runMigration();
