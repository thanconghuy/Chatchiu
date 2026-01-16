/**
 * Sync ALL users' balance from system_conversions to user_system_balance
 * Fix issue: user_system_balance.total_earned not matching system_conversions
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function syncAllUsersBalance() {
  try {
    console.log('========================================');
    console.log('SYNC TẤT CẢ USER BALANCE');
    console.log('========================================\n');

    // 1. Tìm tất cả users có conversions
    console.log('🔍 Tìm users có conversions...\n');

    const usersWithConversions = await pool.query(`
      SELECT DISTINCT user_id FROM system_conversions
    `);

    console.log(`Tìm thấy ${usersWithConversions.rows.length} users có conversions\n`);

    let fixed = 0;
    let errors = 0;

    // 2. Với mỗi user, tính tổng từ conversions và sync vào balance
    for (const row of usersWithConversions.rows) {
      const userId = row.user_id;

      try {
        // Tính tổng thực tế từ conversions
        const convResult = await pool.query(`
          SELECT
            COALESCE(SUM(cashback_amount), 0) as total_cashback
          FROM system_conversions
          WHERE user_id = $1
        `, [userId]);

        const realTotalEarned = parseFloat(convResult.rows[0].total_cashback);

        // Lấy số dư hiện tại
        const balResult = await pool.query(`
          SELECT total_earned, total_withdrawn, user_id
          FROM user_system_balance
          WHERE user_id = $1
        `, [userId]);

        if (balResult.rows.length === 0) {
          // User chưa có record trong balance - tạo mới
          await pool.query(`
            INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved)
            VALUES ($1, $2, 0, 0)
          `, [userId, realTotalEarned]);

          console.log(`✅ [NEW] User ${userId.substring(0, 8)}... : ${realTotalEarned.toLocaleString('vi-VN')} đ`);
          fixed++;
        } else {
          const currentEarned = parseFloat(balResult.rows[0].total_earned);
          const totalWithdrawn = parseFloat(balResult.rows[0].total_withdrawn);

          // So sánh
          const diff = Math.abs(realTotalEarned - currentEarned);

          if (diff > 0.01) {
            // Cập nhật
            await pool.query(`
              UPDATE user_system_balance
              SET total_earned = $1, updated_at = NOW()
              WHERE user_id = $2
            `, [realTotalEarned, userId]);

            console.log(`🔧 [FIXED] User ${userId.substring(0, 8)}...`);
            console.log(`   Old: ${currentEarned.toLocaleString('vi-VN')} đ`);
            console.log(`   New: ${realTotalEarned.toLocaleString('vi-VN')} đ`);
            console.log(`   Diff: ${(realTotalEarned - currentEarned).toLocaleString('vi-VN')} đ`);
            fixed++;
          }
        }

      } catch (err) {
        console.error(`❌ Error with user ${userId}:`, err.message);
        errors++;
      }
    }

    console.log('');
    console.log('========================================');
    console.log('TỔNG KẾT:');
    console.log('========================================');
    console.log(`Tổng users kiểm tra: ${usersWithConversions.rows.length}`);
    console.log(`Đã fix/tạo mới: ${fixed}`);
    console.log(`Lỗi: ${errors}`);
    console.log('');

    if (fixed > 0) {
      console.log('✅ ĐÃ SYNC THÀNH CÔNG!');
      console.log('   Tất cả users giờ đã có total_earned = tổng từ conversions\n');
    } else {
      console.log('✅ TẤT CẢ USERS ĐÃ ĐÚNG - Không cần fix\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

syncAllUsersBalance();
