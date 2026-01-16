/**
 * Fix user balance - FINAL CORRECT VERSION
 * Based on REAL DATA from system_conversions
 *
 * Real data:
 * - Total cashback from conversions: 252.674,1 VND
 * - Already paid: 130.000 VND
 * - Should have available: 122.674,1 VND
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function fixUserBalanceFinal() {
  console.log('==========================================');
  console.log('ĐIỀU CHỈNH SỐ DƯ CUỐI CÙNG - DỰA TRÊN DỮ LIỆU THỰC');
  console.log('==========================================\n');

  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    // Lấy số liệu thực từ system_conversions
    const conversions = await pool.query(`
      SELECT
        COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    const realTotalEarned = parseFloat(conversions.rows[0].total_cashback);
    const totalWithdrawn = 130000; // Đã thanh toán thực tế
    const expectedAvailable = realTotalEarned - totalWithdrawn;

    console.log('📊 SỐ LIỆU THỰC TẾ (từ system_conversions):\n');
    console.log('  Tổng cashback kiếm được:', realTotalEarned.toLocaleString('vi-VN'), 'VND');
    console.log('  Đã thanh toán:', totalWithdrawn.toLocaleString('vi-VN'), 'VND');
    console.log('  Số dư khả dụng:', expectedAvailable.toLocaleString('vi-VN'), 'VND');
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
      console.log('📋 Số dư hiện tại trong DB (SAI):\n');
      console.log('  total_earned:', parseFloat(current.total_earned).toLocaleString('vi-VN'), 'VND');
      console.log('  total_withdrawn:', parseFloat(current.total_withdrawn).toLocaleString('vi-VN'), 'VND');
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
    `, [realTotalEarned, totalWithdrawn, userId]);

    const updated = updateResult.rows[0];

    console.log('✅ ĐÃ CẬP NHẬT THÀNH CÔNG!\n');
    console.log('📋 Số dư sau khi cập nhật (ĐÚNG):\n');
    console.log('  total_earned:', parseFloat(updated.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', parseFloat(updated.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved:', parseFloat(updated.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('  available_balance:', parseFloat(updated.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('');

    if (Math.abs(parseFloat(updated.available_balance) - expectedAvailable) < 0.01) {
      console.log('✅ Số dư khả dụng ĐÚNG:', expectedAvailable.toLocaleString('vi-VN'), 'VND\n');
    } else {
      console.log('⚠️  Số dư khả dụng không khớp!\n');
    }

    console.log('==========================================');
    console.log('✅ HOÀN THÀNH!');
    console.log('==========================================\n');

    console.log('📝 TỔNG KẾT:');
    console.log('- User đã kiếm được: 252.674,1 VND từ 32 đơn cashback');
    console.log('- Đã thanh toán: 130.000 VND');
    console.log('- Còn lại: 122.674,1 VND khả dụng để rút tiếp\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

fixUserBalanceFinal();
