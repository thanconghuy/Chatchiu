/**
 * Verify current database state after sync
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function verifyData() {
  try {
    console.log('========================================');
    console.log('XÁC MINH DỮ LIỆU SAU KHI SYNC');
    console.log('========================================\n');

    // Check specific users mentioned
    const emails = [
      'bachanhtivi@gmail.com',
      'andytt19@gmail.com',
      'exccbuy@gmail.com'
    ];

    for (const email of emails) {
      const result = await pool.query(`
        SELECT
          u.id, u.email, u.username,
          usb.total_earned,
          usb.total_withdrawn,
          usb.available_balance,
          (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE user_id = u.id) as from_conversions,
          (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE user_id = u.id AND status = 'pending') as pending,
          (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE user_id = u.id AND status = 'approved') as approved
        FROM users u
        LEFT JOIN user_system_balance usb ON u.id = usb.user_id
        WHERE u.email = $1
      `, [email]);

      if (result.rows.length > 0) {
        const user = result.rows[0];
        console.log(`📧 ${email} (${user.username})`);
        console.log(`   ID: ${user.id}`);
        console.log('');
        console.log('   💰 Trong user_system_balance:');
        console.log(`      total_earned: ${parseFloat(user.total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`      total_withdrawn: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`      available_balance: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} đ`);
        console.log('');
        console.log('   📊 Từ system_conversions:');
        console.log(`      Tổng: ${parseFloat(user.from_conversions).toLocaleString('vi-VN')} đ`);
        console.log(`      Pending: ${parseFloat(user.pending).toLocaleString('vi-VN')} đ`);
        console.log(`      Approved: ${parseFloat(user.approved).toLocaleString('vi-VN')} đ`);
        console.log('');

        // Check if matches
        const diff = Math.abs(parseFloat(user.total_earned) - parseFloat(user.from_conversions));
        if (diff < 0.01) {
          console.log('   ✅ KHỚP! total_earned = tổng conversions');
        } else {
          console.log(`   ❌ KHÔNG KHỚP! Chênh lệch: ${diff.toLocaleString('vi-VN')} đ`);
        }

        console.log('');
        console.log('   📋 Hiển thị trên frontend (theo API):');
        console.log(`      Tổng Cashback: ${parseFloat(user.total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`      Chờ Duyệt: ${parseFloat(user.pending).toLocaleString('vi-VN')} đ`);
        console.log(`      Đã Duyệt: ${parseFloat(user.approved).toLocaleString('vi-VN')} đ`);
        console.log(`      Đã Thanh Toán: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`      Số Dư Còn Lại: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} đ`);
        console.log('');
        console.log('========================================\n');
      } else {
        console.log(`❌ Không tìm thấy user: ${email}\n`);
      }
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

verifyData();
