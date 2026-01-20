/**
 * Fix user balance - CORRECT VERSION
 * Số dư thực tế = 137.751,6 VND (balance_after từ transaction cuối)
 * Đã thanh toán = 130.000 VND
 * Còn lại = 7.751,6 VND
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function fixUserBalance() {
  console.log('==========================================');
  console.log('Điều chỉnh số dư user về ĐÚNG số liệu thực');
  console.log('==========================================\n');

  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    // Số dư thực tế từ transaction log
    const correctTotalEarned = 137751.60; // balance_after từ transaction #4
    const correctTotalWithdrawn = 130000; // Đã thanh toán
    const correctPendingReserved = 0;
    const expectedAvailableBalance = correctTotalEarned - correctTotalWithdrawn;

    console.log('📊 SỐ DƯ THỰC TẾ (từ transaction log):\n');
    console.log('  Tổng cashback kiếm được:', correctTotalEarned.toLocaleString('vi-VN'), 'VND');
    console.log('  Đã thanh toán:', correctTotalWithdrawn.toLocaleString('vi-VN'), 'VND');
    console.log('  Số dư còn lại:', expectedAvailableBalance.toLocaleString('vi-VN'), 'VND');
    console.log('');

    // Kiểm tra số dư hiện tại
    const currentResult = await pool.query(`
      SELECT
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance
      FROM user_system_balance
      WHERE user_id = $1
    `, [userId]);

    if (currentResult.rows.length > 0) {
      const current = currentResult.rows[0];
      console.log('📋 Số dư hiện tại trong DB:\n');
      console.log('  total_earned:', parseFloat(current.total_earned).toLocaleString('vi-VN'), 'VND');
      console.log('  total_withdrawn:', parseFloat(current.total_withdrawn).toLocaleString('vi-VN'), 'VND');
      console.log('  pending_reserved:', parseFloat(current.pending_reserved).toLocaleString('vi-VN'), 'VND');
      console.log('  available_balance:', parseFloat(current.available_balance).toLocaleString('vi-VN'), 'VND');
      console.log('');
    }

    // Cập nhật
    console.log('🔄 Cập nhật vào database...\n');

    const updateResult = await pool.query(`
      UPDATE user_system_balance
      SET
        total_earned = $1,
        total_withdrawn = $2,
        pending_reserved = 0,
        updated_at = NOW()
      WHERE user_id = $3
      RETURNING *
    `, [correctTotalEarned, correctTotalWithdrawn, userId]);

    const updated = updateResult.rows[0];

    console.log('✅ ĐÃ CẬP NHẬT THÀNH CÔNG!\n');
    console.log('📋 Số dư sau khi cập nhật:\n');
    console.log('  total_earned:', parseFloat(updated.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', parseFloat(updated.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved:', parseFloat(updated.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('  available_balance:', parseFloat(updated.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('');

    if (Math.abs(parseFloat(updated.available_balance) - expectedAvailableBalance) < 0.01) {
      console.log('✅ Số dư khả dụng ĐÚNG:', expectedAvailableBalance.toLocaleString('vi-VN'), 'VND\n');
    } else {
      console.log('⚠️  Số dư khả dụng không khớp!\n');
    }

    console.log('==========================================');
    console.log('✅ HOÀN THÀNH!');
    console.log('==========================================\n');

    console.log('📝 GHI CHÚ:');
    console.log('- User đã kiếm được: 137.751,6 VND từ cashback');
    console.log('- Đã thanh toán: 130.000 VND');
    console.log('- Còn lại: 7.751,6 VND khả dụng để rút tiếp\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

fixUserBalance();
