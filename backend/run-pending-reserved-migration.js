/**
 * Add pending_reserved Column Migration
 * Run: node run-pending-reserved-migration.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('==========================================');
  console.log('Add pending_reserved Column Migration');
  console.log('==========================================\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add_pending_reserved_column.sql');
    console.log('📄 Reading:', migrationPath);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('✓ File loaded\n');

    // Execute migration
    console.log('🚀 Executing migration...');
    await pool.query(sql);
    console.log('✓ Migration executed!\n');

    // Verify column exists
    console.log('🔍 Verifying column...\n');
    const result = await pool.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_system_balance'
        AND column_name = 'pending_reserved'
    `);

    if (result.rows.length > 0) {
      console.log('📋 Column details:');
      console.log('==========================================');
      console.log('Column name:', result.rows[0].column_name);
      console.log('Data type:', result.rows[0].data_type);
      console.log('Default value:', result.rows[0].column_default);
      console.log('Nullable:', result.rows[0].is_nullable);
      console.log('==========================================\n');
    }

    // Check current data
    console.log('📊 Checking current data...');
    const dataCheck = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(pending_reserved) as total_pending,
        AVG(pending_reserved) as avg_pending,
        MAX(pending_reserved) as max_pending
      FROM user_system_balance
    `);

    console.log('Current data:');
    console.log('  Total users:', dataCheck.rows[0].total_users);
    console.log('  Total pending:', parseFloat(dataCheck.rows[0].total_pending || 0).toLocaleString('vi-VN') + ' VND');
    console.log('  Avg pending:', parseFloat(dataCheck.rows[0].avg_pending || 0).toLocaleString('vi-VN') + ' VND');
    console.log('  Max pending:', parseFloat(dataCheck.rows[0].max_pending || 0).toLocaleString('vi-VN') + ' VND\n');

    console.log('==========================================');
    console.log('✅ SUCCESS!');
    console.log('==========================================\n');

    console.log('Next steps:');
    console.log('1. Backend server sẽ tự động restart (đang chạy nodemon)');
    console.log('2. Refresh trang payment-stats để xem kết quả\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();
