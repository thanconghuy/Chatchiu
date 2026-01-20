/**
 * Check real cashback from system_conversions vs user_system_balance
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function checkRealCashback() {
  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    console.log('==========================================');
    console.log('KIỂM TRA NGUỒN DỮ LIỆU CASHBACK THỰC TẾ');
    console.log('==========================================\n');

    // 1. Tổng cashback từ system_conversions (NGUỒN THỰC TẾ)
    const conversions = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN cashback_amount ELSE 0 END), 0) as rejected
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    const conv = conversions.rows[0];

    console.log('📊 TỪ SYSTEM_CONVERSIONS (NGUỒN THỰC TẾ):\n');
    console.log('  Tổng đơn hàng:', conv.total_orders);
    console.log('  Tổng cashback:', parseFloat(conv.total_cashback).toLocaleString('vi-VN'), 'VND');
    console.log('  - Chờ duyệt:', parseFloat(conv.pending).toLocaleString('vi-VN'), 'VND');
    console.log('  - Đã duyệt:', parseFloat(conv.approved).toLocaleString('vi-VN'), 'VND');
    console.log('  - Đã hủy:', parseFloat(conv.rejected).toLocaleString('vi-VN'), 'VND');
    console.log('');

    // 2. Số dư trong user_system_balance (ĐÃ LƯU)
    const balance = await pool.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [userId]);

    if (balance.rows.length === 0) {
      console.log('❌ User không có record trong user_system_balance\n');
      process.exit(1);
    }

    const bal = balance.rows[0];

    console.log('💾 TỪ USER_SYSTEM_BALANCE (ĐÃ LƯU):\n');
    console.log('  total_earned:', parseFloat(bal.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved:', parseFloat(bal.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('  available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('');

    // 3. So sánh
    console.log('⚖️  SO SÁNH:\n');
    const diff = parseFloat(conv.total_cashback) - parseFloat(bal.total_earned);
    console.log('  Chênh lệch (conversions - balance):', diff.toLocaleString('vi-VN'), 'VND');

    if (Math.abs(diff) > 0.01) {
      console.log('  ❌ KHÔNG KHỚP! Cần cập nhật lại total_earned');
      console.log('');
      console.log('💡 SỐ LIỆU ĐÚNG NÊN LÀ:');
      console.log('  total_earned:', parseFloat(conv.total_cashback).toLocaleString('vi-VN'), 'VND');
      console.log('  total_withdrawn: 130.000 VND (đã thanh toán)');
      console.log('  available_balance:', (parseFloat(conv.total_cashback) - 130000).toLocaleString('vi-VN'), 'VND');
    } else {
      console.log('  ✅ KHỚP!');
    }

    console.log('');
    console.log('==========================================');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

checkRealCashback();
