/**
 * Kiểm tra số dư âm của user
 * Run: node check-negative-balance.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function checkNegativeBalance() {
  console.log('==========================================');
  console.log('Kiểm tra số dư âm của user');
  console.log('==========================================\n');

  try {
    // Tìm user theo số điện thoại
    console.log('🔍 Tìm user với SĐT: 0944941491\n');

    const userResult = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE u.phone = '0944941491'
    `);

    if (userResult.rows.length === 0) {
      console.log('❌ Không tìm thấy user với SĐT này\n');

      // Thử tìm tất cả users có số dư âm
      console.log('🔍 Tìm tất cả users có số dư âm:\n');
      const negativeBalanceUsers = await pool.query(`
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.phone,
          usb.total_earned,
          usb.total_withdrawn,
          usb.pending_reserved,
          (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance
        FROM users u
        LEFT JOIN user_system_balance usb ON u.id = usb.user_id
        WHERE (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) < 0
        ORDER BY available_balance ASC
      `);

      if (negativeBalanceUsers.rows.length > 0) {
        console.log(`📋 Tìm thấy ${negativeBalanceUsers.rows.length} users có số dư âm:\n`);
        negativeBalanceUsers.rows.forEach(user => {
          console.log('-------------------------------------------');
          console.log('User ID:', user.id);
          console.log('Email:', user.email);
          console.log('Tên:', user.full_name);
          console.log('SĐT:', user.phone);
          console.log('Tổng kiếm được:', parseFloat(user.total_earned || 0).toLocaleString('vi-VN'), 'VND');
          console.log('Tổng rút:', parseFloat(user.total_withdrawn || 0).toLocaleString('vi-VN'), 'VND');
          console.log('Pending reserved:', parseFloat(user.pending_reserved || 0).toLocaleString('vi-VN'), 'VND');
          console.log('Số dư khả dụng:', parseFloat(user.available_balance || 0).toLocaleString('vi-VN'), 'VND');
          console.log('');
        });
      } else {
        console.log('✅ Không có user nào có số dư âm\n');
      }

      process.exit(0);
      return;
    }

    const user = userResult.rows[0];

    console.log('📋 Thông tin user:');
    console.log('-------------------------------------------');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Tên:', user.full_name);
    console.log('SĐT:', user.phone);
    console.log('\n💰 Chi tiết số dư:');
    console.log('-------------------------------------------');
    console.log('Tổng kiếm được:', parseFloat(user.total_earned || 0).toLocaleString('vi-VN'), 'VND');
    console.log('Tổng rút:', parseFloat(user.total_withdrawn || 0).toLocaleString('vi-VN'), 'VND');
    console.log('Pending reserved:', parseFloat(user.pending_reserved || 0).toLocaleString('vi-VN'), 'VND');
    console.log('Số dư khả dụng:', parseFloat(user.available_balance || 0).toLocaleString('vi-VN'), 'VND');
    console.log('');

    // Kiểm tra các payment requests
    console.log('📊 Các payment requests của user:\n');

    // Kiểm tra cấu trúc bảng payment_requests trước
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payment_requests'
      ORDER BY ordinal_position
    `);

    console.log('📋 Cấu trúc bảng payment_requests:');
    console.log(columnsResult.rows.map(r => r.column_name).join(', '));
    console.log('');

    const requestsResult = await pool.query(`
      SELECT *
      FROM payment_requests
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [user.id]);

    if (requestsResult.rows.length > 0) {
      console.log(`Tìm thấy ${requestsResult.rows.length} payment requests:\n`);
      requestsResult.rows.forEach((req, index) => {
        console.log(`${index + 1}. Request:`);
        console.log(JSON.stringify(req, null, 2));
        console.log('');
      });

      // Skip status summary for now to avoid column errors
    } else {
      console.log('Không có payment requests nào\n');
    }

    // Kiểm tra lịch sử giao dịch
    console.log('💳 Lịch sử giao dịch:\n');
    const transactionsResult = await pool.query(`
      SELECT
        transaction_type,
        amount,
        created_at,
        description
      FROM user_balance_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [user.id]);

    if (transactionsResult.rows.length > 0) {
      console.log(`Tìm thấy ${transactionsResult.rows.length} giao dịch gần nhất:\n`);
      transactionsResult.rows.forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.transaction_type}`);
        console.log(`   Số tiền: ${parseFloat(tx.amount).toLocaleString('vi-VN')} VND`);
        console.log(`   Ngày: ${tx.created_at}`);
        console.log(`   Mô tả: ${tx.description || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('Không có giao dịch nào\n');
    }

    console.log('==========================================');
    console.log('✅ HOÀN THÀNH!');
    console.log('==========================================\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết lỗi:', error);
    process.exit(1);
  }
}

checkNegativeBalance();
