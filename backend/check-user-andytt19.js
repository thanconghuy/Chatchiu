/**
 * Check user andytt19@gmail.com - có sự chênh lệch bất thường
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function checkUserAndy() {
  try {
    console.log('========================================');
    console.log('KIỂM TRA USER: andytt19@gmail.com');
    console.log('========================================\n');

    // 1. Tìm user ID
    const userResult = await pool.query(`
      SELECT id, email, username FROM users WHERE email = $1
    `, ['andytt19@gmail.com']);

    if (userResult.rows.length === 0) {
      console.log('❌ Không tìm thấy user\n');
      process.exit(1);
    }

    const user = userResult.rows[0];
    const userId = user.id;

    console.log('👤 User Info:');
    console.log('   ID:', userId);
    console.log('   Email:', user.email);
    console.log('   Username:', user.username);
    console.log('');

    // 2. Kiểm tra conversions
    const conversions = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(cashback_amount), 0) as total_from_orders,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN cashback_amount ELSE 0 END), 0) as rejected
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    const conv = conversions.rows[0];

    console.log('📊 TỪ SYSTEM_CONVERSIONS:');
    console.log('   Tổng đơn:', conv.total_orders);
    console.log('   Tổng cashback:', parseFloat(conv.total_from_orders).toLocaleString('vi-VN'), 'đ');
    console.log('   - Chờ duyệt:', parseFloat(conv.pending).toLocaleString('vi-VN'), 'đ');
    console.log('   - Đã duyệt:', parseFloat(conv.approved).toLocaleString('vi-VN'), 'đ');
    console.log('   - Đã hủy:', parseFloat(conv.rejected).toLocaleString('vi-VN'), 'đ');
    console.log('');

    // 3. Kiểm tra balance
    const balanceResult = await pool.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [userId]);

    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      console.log('💰 TỪ USER_SYSTEM_BALANCE:');
      console.log('   total_earned:', parseFloat(bal.total_earned).toLocaleString('vi-VN'), 'đ');
      console.log('   total_withdrawn:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN'), 'đ');
      console.log('   pending_reserved:', parseFloat(bal.pending_reserved).toLocaleString('vi-VN'), 'đ');
      console.log('   available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'đ');
      console.log('');

      // So sánh
      const diff = parseFloat(bal.total_earned) - parseFloat(conv.total_from_orders);
      console.log('⚖️  SO SÁNH:');
      console.log('   total_earned vs tổng conversions:', diff.toLocaleString('vi-VN'), 'đ');

      if (Math.abs(diff) > 0.01) {
        console.log('   ❌ KHÔNG KHỚP!');
      } else {
        console.log('   ✅ KHỚP!');
      }
      console.log('');
    } else {
      console.log('⚠️  User chưa có record trong user_system_balance\n');
    }

    // 4. Liệt kê chi tiết các conversions
    console.log('📋 CHI TIẾT CÁC CONVERSIONS:\n');
    const detailResult = await pool.query(`
      SELECT
        order_code,
        cashback_amount,
        status,
        created_at
      FROM system_conversions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    if (detailResult.rows.length > 0) {
      detailResult.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.order_code}`);
        console.log(`      Cashback: ${parseFloat(row.cashback_amount).toLocaleString('vi-VN')} đ`);
        console.log(`      Status: ${row.status}`);
        console.log(`      Created: ${row.created_at}`);
        console.log('');
      });
    } else {
      console.log('   Không có conversions nào\n');
    }

    // 5. Kiểm tra API trả về gì
    console.log('🔍 KIỂM TRA API RESPONSE:');
    const apiQuery = `
      SELECT
        u.id as user_id,
        u.email,

        COALESCE(usb.total_earned, 0) as total_cashback,

        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'pending'
        ), 0) as pending_cashback,

        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'approved'
        ), 0) as approved_cashback,

        COALESCE(usb.total_withdrawn, 0) as paid_cashback,
        COALESCE(usb.available_balance, 0) as available_balance
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE u.id = $1
    `;

    const apiResult = await pool.query(apiQuery, [userId]);
    const api = apiResult.rows[0];

    console.log('   Tổng Cashback (API):', parseFloat(api.total_cashback).toLocaleString('vi-VN'), 'đ');
    console.log('   Chờ Duyệt (API):', parseFloat(api.pending_cashback).toLocaleString('vi-VN'), 'đ');
    console.log('   Đã Duyệt (API):', parseFloat(api.approved_cashback).toLocaleString('vi-VN'), 'đ');
    console.log('   Đã Thanh Toán (API):', parseFloat(api.paid_cashback).toLocaleString('vi-VN'), 'đ');
    console.log('   Số Dư Còn Lại (API):', parseFloat(api.available_balance).toLocaleString('vi-VN'), 'đ');
    console.log('');

    console.log('========================================');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

checkUserAndy();
