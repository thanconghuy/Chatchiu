/**
 * Check transaction details
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function checkDetails() {
  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    const result = await pool.query(`
      SELECT *
      FROM user_balance_transactions
      WHERE user_id = $1
      ORDER BY created_at ASC
    `, [userId]);

    console.log('📋 Chi tiết các giao dịch:\n');

    result.rows.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.transaction_type}`);
      console.log(`   Amount: ${parseFloat(tx.amount).toLocaleString('vi-VN')} VND`);
      console.log(`   Time: ${tx.created_at}`);
      console.log(`   Description: ${tx.description || 'N/A'}`);
      console.log(`   Transaction ID: ${tx.id}`);
      console.log(`   All fields:`, JSON.stringify(tx, null, 2));
      console.log('');
    });

    // Kiểm tra trùng lặp
    console.log('🔍 Kiểm tra giao dịch trùng lặp:\n');

    const duplicateCheck = await pool.query(`
      SELECT
        transaction_type,
        amount,
        DATE_TRUNC('minute', created_at) as time_minute,
        COUNT(*) as count,
        STRING_AGG(id::text, ', ') as transaction_ids
      FROM user_balance_transactions
      WHERE user_id = $1
      GROUP BY transaction_type, amount, DATE_TRUNC('minute', created_at)
      HAVING COUNT(*) > 1
    `, [userId]);

    if (duplicateCheck.rows.length > 0) {
      console.log('⚠️  Tìm thấy giao dịch trùng lặp:\n');
      duplicateCheck.rows.forEach(dup => {
        console.log(`  ${dup.transaction_type}: ${parseFloat(dup.amount).toLocaleString('vi-VN')} VND`);
        console.log(`  Thời gian: ${dup.time_minute}`);
        console.log(`  Số lượng: ${dup.count} giao dịch`);
        console.log(`  IDs: ${dup.transaction_ids}`);
        console.log('');
      });
    } else {
      console.log('✅ Không có giao dịch trùng lặp\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  }
}

checkDetails();
