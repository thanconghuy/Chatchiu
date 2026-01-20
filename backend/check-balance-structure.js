/**
 * Check user_system_balance table structure
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function checkStructure() {
  console.log('==========================================');
  console.log('Kiểm tra cấu trúc user_system_balance');
  console.log('==========================================\n');

  try {
    // Check columns
    const columnsResult = await pool.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable,
        udt_name
      FROM information_schema.columns
      WHERE table_name = 'user_system_balance'
      ORDER BY ordinal_position
    `);

    console.log('📋 Cấu trúc bảng user_system_balance:\n');
    columnsResult.rows.forEach(col => {
      console.log(`  ${col.column_name}`);
      console.log(`    - Type: ${col.data_type} (${col.udt_name})`);
      console.log(`    - Default: ${col.column_default || 'NULL'}`);
      console.log(`    - Nullable: ${col.is_nullable}`);
      console.log('');
    });

    // Check if available_balance is computed or stored
    console.log('📊 Kiểm tra available_balance có phải computed column không:\n');

    const generatedResult = await pool.query(`
      SELECT
        attname as column_name,
        attgenerated as is_generated
      FROM pg_attribute
      WHERE attrelid = 'user_system_balance'::regclass
        AND attname = 'available_balance'
        AND NOT attisdropped
    `);

    if (generatedResult.rows.length > 0) {
      console.log('  available_balance generated:', generatedResult.rows[0].is_generated || 'NO (stored column)');
    }

    // Check actual data calculation
    console.log('\n💾 Kiểm tra dữ liệu thực tế của user a73b55e7-a176-4299-b4aa-387c5ee4488c:\n');

    const dataResult = await pool.query(`
      SELECT
        user_id,
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance,
        (total_earned - total_withdrawn - pending_reserved) as calculated_available
      FROM user_system_balance
      WHERE user_id = 'a73b55e7-a176-4299-b4aa-387c5ee4488c'
    `);

    if (dataResult.rows.length > 0) {
      const data = dataResult.rows[0];
      console.log('  total_earned:', parseFloat(data.total_earned).toLocaleString('vi-VN'), 'VND');
      console.log('  total_withdrawn:', parseFloat(data.total_withdrawn).toLocaleString('vi-VN'), 'VND');
      console.log('  pending_reserved:', parseFloat(data.pending_reserved).toLocaleString('vi-VN'), 'VND');
      console.log('  available_balance (stored):', parseFloat(data.available_balance).toLocaleString('vi-VN'), 'VND');
      console.log('  calculated_available:', parseFloat(data.calculated_available).toLocaleString('vi-VN'), 'VND');
      console.log('');

      if (data.available_balance !== data.calculated_available) {
        console.log('  ⚠️  CẢNH BÁO: available_balance không khớp với công thức tính!');
        console.log('  Chênh lệch:', parseFloat(data.available_balance - data.calculated_available).toLocaleString('vi-VN'), 'VND');
      } else {
        console.log('  ✅ available_balance khớp với công thức tính');
      }
    }

    // Check transaction history sum
    console.log('\n📈 Tổng hợp giao dịch từ user_balance_transactions:\n');

    const txResult = await pool.query(`
      SELECT
        transaction_type,
        SUM(amount) as total_amount,
        COUNT(*) as count
      FROM user_balance_transactions
      WHERE user_id = 'a73b55e7-a176-4299-b4aa-387c5ee4488c'
      GROUP BY transaction_type
      ORDER BY transaction_type
    `);

    txResult.rows.forEach(tx => {
      console.log(`  ${tx.transaction_type}:`, parseFloat(tx.total_amount).toLocaleString('vi-VN'), 'VND', `(${tx.count} giao dịch)`);
    });

    console.log('\n==========================================');
    console.log('✅ HOÀN THÀNH!');
    console.log('==========================================\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết lỗi:', error);
    process.exit(1);
  }
}

checkStructure();
