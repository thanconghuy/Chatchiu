/**
 * AUDIT TOÀN BỘ LOGIC HỆ THỐNG CASHBACK
 * Kiểm tra tất cả các điểm có thể gây ra lỗi số liệu tài chính
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function auditSystem() {
  console.log('========================================');
  console.log('AUDIT HỆ THỐNG CASHBACK');
  console.log('========================================\n');

  try {
    // 1. KIỂM TRA TỔNG QUAN
    console.log('📊 1. TỔNG QUAN HỆ THỐNG\n');

    const overview = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(DISTINCT user_id) FROM system_conversions) as users_with_conversions,
        (SELECT COUNT(*) FROM system_conversions) as total_conversions,
        (SELECT COUNT(*) FROM user_system_balance) as users_with_balance,
        (SELECT COUNT(*) FROM payment_requests) as total_payment_requests
    `);

    const ov = overview.rows[0];
    console.log(`   Tổng users: ${ov.total_users}`);
    console.log(`   Users có conversions: ${ov.users_with_conversions}`);
    console.log(`   Users có balance record: ${ov.users_with_balance}`);
    console.log(`   Tổng conversions: ${ov.total_conversions}`);
    console.log(`   Tổng payment requests: ${ov.total_payment_requests}`);
    console.log('');

    // 2. KIỂM TRA USERS KHÔNG ĐỒNG BỘ
    console.log('🔍 2. USERS KHÔNG ĐỒNG BỘ GIỮA CONVERSIONS VÀ BALANCE\n');

    const mismatchUsers = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.username,
        COALESCE(usb.total_earned, 0) as balance_total_earned,
        COALESCE((SELECT SUM(cashback_amount) FROM system_conversions WHERE user_id = u.id), 0) as conversions_total,
        COALESCE((SELECT SUM(cashback_amount) FROM system_conversions WHERE user_id = u.id), 0) - COALESCE(usb.total_earned, 0) as diff
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE EXISTS (SELECT 1 FROM system_conversions WHERE user_id = u.id)
        AND ABS(COALESCE((SELECT SUM(cashback_amount) FROM system_conversions WHERE user_id = u.id), 0) - COALESCE(usb.total_earned, 0)) > 0.01
      ORDER BY ABS(COALESCE((SELECT SUM(cashback_amount) FROM system_conversions WHERE user_id = u.id), 0) - COALESCE(usb.total_earned, 0)) DESC
      LIMIT 10
    `);

    if (mismatchUsers.rows.length > 0) {
      console.log(`   ❌ Tìm thấy ${mismatchUsers.rows.length} users KHÔNG ĐỒNG BỘ:\n`);
      mismatchUsers.rows.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email}`);
        console.log(`      Balance: ${parseFloat(user.balance_total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`      Conversions: ${parseFloat(user.conversions_total).toLocaleString('vi-VN')} đ`);
        console.log(`      Chênh lệch: ${parseFloat(user.diff).toLocaleString('vi-VN')} đ`);
        console.log('');
      });
    } else {
      console.log('   ✅ TẤT CẢ USERS ĐỒNG BỘ\n');
    }

    // 3. KIỂM TRA LOGIC CẬP NHẬT BALANCE
    console.log('🔧 3. KIỂM TRA CÁC ĐIỂM CẬP NHẬT BALANCE\n');

    console.log('   a) Khi tạo conversion mới:');
    console.log('      - File: backend/services/conversionService.js');
    console.log('      - Cần: Tự động cộng vào user_system_balance.total_earned');
    console.log('      - Hiện tại: ❓ Cần kiểm tra code\n');

    console.log('   b) Khi approve conversion:');
    console.log('      - File: backend/routes/admin.js');
    console.log('      - Cần: Có thể update balance hoặc chỉ đổi status');
    console.log('      - Hiện tại: ❓ Cần kiểm tra code\n');

    console.log('   c) Khi reject conversion:');
    console.log('      - File: backend/routes/admin.js');
    console.log('      - Cần: Có thể trừ balance nếu đã cộng trước đó');
    console.log('      - Hiện tại: ❓ Cần kiểm tra code\n');

    // 4. KIỂM TRA CONVERSIONS CÓ VẤN ĐỀ
    console.log('⚠️  4. CONVERSIONS CÓ VẤN ĐỀ\n');

    const problematicConversions = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.user_id,
        u.email,
        sc.cashback_amount,
        sc.status,
        sc.created_at
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.cashback_amount <= 0
         OR sc.cashback_amount > 1000000
      ORDER BY sc.created_at DESC
      LIMIT 10
    `);

    if (problematicConversions.rows.length > 0) {
      console.log(`   ⚠️  Tìm thấy ${problematicConversions.rows.length} conversions có giá trị bất thường:\n`);
      problematicConversions.rows.forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.order_code}`);
        console.log(`      User: ${conv.email}`);
        console.log(`      Cashback: ${parseFloat(conv.cashback_amount).toLocaleString('vi-VN')} đ`);
        console.log(`      Status: ${conv.status}`);
        console.log('');
      });
    } else {
      console.log('   ✅ Không có conversions bất thường\n');
    }

    // 5. KIỂM TRA BALANCE ÂM
    console.log('💰 5. KIỂM TRA BALANCE ÂM\n');

    const negativeBalances = await pool.query(`
      SELECT
        u.id,
        u.email,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        usb.available_balance
      FROM users u
      JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.available_balance < 0
         OR usb.total_earned < 0
         OR usb.total_withdrawn < 0
      ORDER BY usb.available_balance ASC
      LIMIT 10
    `);

    if (negativeBalances.rows.length > 0) {
      console.log(`   ❌ Tìm thấy ${negativeBalances.rows.length} users có số dư ÂM:\n`);
      negativeBalances.rows.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email}`);
        console.log(`      total_earned: ${parseFloat(user.total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`      total_withdrawn: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`      available_balance: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} đ`);
        console.log('');
      });
    } else {
      console.log('   ✅ Không có balance âm\n');
    }

    // 6. KIỂM TRA PAYMENT REQUESTS
    console.log('💳 6. KIỂM TRA PAYMENT REQUESTS\n');

    const paymentStats = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(requested_amount), 0) as total_amount
      FROM payment_requests
      GROUP BY status
      ORDER BY status
    `);

    console.log('   Thống kê payment requests theo status:\n');
    paymentStats.rows.forEach(stat => {
      console.log(`   ${stat.status}: ${stat.count} requests, tổng ${parseFloat(stat.total_amount).toLocaleString('vi-VN')} đ`);
    });
    console.log('');

    // 7. KIỂM TRA PENDING_RESERVED
    console.log('⏳ 7. KIỂM TRA PENDING_RESERVED\n');

    const pendingReservedCheck = await pool.query(`
      SELECT
        u.id,
        u.email,
        usb.pending_reserved,
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = u.id AND status IN ('pending', 'processing')
        ), 0) as actual_pending_requests,
        usb.pending_reserved - COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = u.id AND status IN ('pending', 'processing')
        ), 0) as diff
      FROM users u
      JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.pending_reserved > 0
      ORDER BY ABS(usb.pending_reserved - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests
        WHERE user_id = u.id AND status IN ('pending', 'processing')
      ), 0)) DESC
      LIMIT 10
    `);

    if (pendingReservedCheck.rows.length > 0) {
      console.log(`   Kiểm tra ${pendingReservedCheck.rows.length} users có pending_reserved:\n`);
      pendingReservedCheck.rows.forEach((user, index) => {
        const diff = Math.abs(parseFloat(user.diff));
        const status = diff < 0.01 ? '✅' : '❌';
        console.log(`   ${status} ${index + 1}. ${user.email}`);
        console.log(`      pending_reserved: ${parseFloat(user.pending_reserved).toLocaleString('vi-VN')} đ`);
        console.log(`      actual pending requests: ${parseFloat(user.actual_pending_requests).toLocaleString('vi-VN')} đ`);
        if (diff > 0.01) {
          console.log(`      ⚠️  Chênh lệch: ${diff.toLocaleString('vi-VN')} đ`);
        }
        console.log('');
      });
    } else {
      console.log('   ℹ️  Không có user nào có pending_reserved > 0\n');
    }

    // 8. TỔNG KẾT
    console.log('========================================');
    console.log('📋 TỔNG KẾT VẤN ĐỀ CẦN FIX:');
    console.log('========================================\n');

    const issues = [];

    if (mismatchUsers.rows.length > 0) {
      issues.push(`❌ ${mismatchUsers.rows.length} users không đồng bộ giữa conversions và balance`);
    }

    if (negativeBalances.rows.length > 0) {
      issues.push(`❌ ${negativeBalances.rows.length} users có số dư âm`);
    }

    if (problematicConversions.rows.length > 0) {
      issues.push(`⚠️  ${problematicConversions.rows.length} conversions có giá trị bất thường`);
    }

    if (issues.length > 0) {
      console.log('   CÁC VẤN ĐỀ PHÁT HIỆN:\n');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
      console.log('');
    } else {
      console.log('   ✅ KHÔNG CÓ VẤN ĐỀ NÀO!\n');
    }

    console.log('========================================');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

auditSystem();
