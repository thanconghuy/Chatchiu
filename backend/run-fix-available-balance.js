/**
 * Fix available_balance Column Migration
 * Run: node run-fix-available-balance.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('==========================================');
  console.log('Fix available_balance Column Migration');
  console.log('==========================================\n');

  try {
    // Show current problem
    console.log('📋 Trước khi fix - User a73b55e7-a176-4299-b4aa-387c5ee4488c:');
    const beforeResult = await pool.query(`
      SELECT
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance as stored_value,
        (total_earned - total_withdrawn - pending_reserved) as calculated_value
      FROM user_system_balance
      WHERE user_id = 'a73b55e7-a176-4299-b4aa-387c5ee4488c'
    `);

    if (beforeResult.rows.length > 0) {
      const data = beforeResult.rows[0];
      console.log('  Stored available_balance:', parseFloat(data.stored_value).toLocaleString('vi-VN'), 'VND');
      console.log('  Calculated available_balance:', parseFloat(data.calculated_value).toLocaleString('vi-VN'), 'VND');
      console.log('  Chênh lệch:', parseFloat(data.stored_value - data.calculated_value).toLocaleString('vi-VN'), 'VND');
      console.log('');
    }

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'fix_available_balance_computed.sql');
    console.log('📄 Reading:', migrationPath);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('✓ File loaded\n');

    // Execute migration
    console.log('🚀 Executing migration...\n');
    await pool.query(sql);
    console.log('\n✓ Migration executed!\n');

    // Verify after migration
    console.log('📋 Sau khi fix - User a73b55e7-a176-4299-b4aa-387c5ee4488c:');
    const afterResult = await pool.query(`
      SELECT
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance
      FROM user_system_balance
      WHERE user_id = 'a73b55e7-a176-4299-b4aa-387c5ee4488c'
    `);

    if (afterResult.rows.length > 0) {
      const data = afterResult.rows[0];
      console.log('  total_earned:', parseFloat(data.total_earned).toLocaleString('vi-VN'), 'VND');
      console.log('  total_withdrawn:', parseFloat(data.total_withdrawn).toLocaleString('vi-VN'), 'VND');
      console.log('  pending_reserved:', parseFloat(data.pending_reserved).toLocaleString('vi-VN'), 'VND');
      console.log('  available_balance (auto-calculated):', parseFloat(data.available_balance).toLocaleString('vi-VN'), 'VND');
      console.log('');

      const expected = data.total_earned - data.total_withdrawn - data.pending_reserved;
      if (Math.abs(data.available_balance - expected) < 0.01) {
        console.log('  ✅ available_balance hiện tại đã ĐÚNG!');
      } else {
        console.log('  ⚠️  available_balance vẫn chưa đúng');
      }
    }

    // Check all users with negative balance
    console.log('\n📊 Tất cả users có số dư âm:\n');
    const negativeResult = await pool.query(`
      SELECT
        user_id,
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance
      FROM user_system_balance
      WHERE available_balance < 0
      ORDER BY available_balance ASC
    `);

    if (negativeResult.rows.length > 0) {
      console.log(`  Tìm thấy ${negativeResult.rows.length} users có số dư âm:\n`);
      negativeResult.rows.forEach((user, index) => {
        console.log(`  ${index + 1}. User ID: ${user.user_id}`);
        console.log(`     Earned: ${parseFloat(user.total_earned).toLocaleString('vi-VN')} VND`);
        console.log(`     Withdrawn: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')} VND`);
        console.log(`     Pending: ${parseFloat(user.pending_reserved).toLocaleString('vi-VN')} VND`);
        console.log(`     Available: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} VND`);
        console.log('');
      });
    } else {
      console.log('  ✅ Không có user nào có số dư âm\n');
    }

    console.log('==========================================');
    console.log('✅ SUCCESS!');
    console.log('==========================================\n');

    console.log('⚠️  LƯU Ý:');
    console.log('1. User có số dư âm sẽ KHÔNG thể tạo payment request mới');
    console.log('2. Cần điều tra và xử lý các trường hợp số dư âm');
    console.log('3. Backend server sẽ tự động restart (đang chạy nodemon)\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();
