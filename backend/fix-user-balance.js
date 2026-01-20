/**
 * Fix user balance to match actual cashback earned
 * Run: node fix-user-balance.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function fixUserBalance() {
  console.log('==========================================');
  console.log('Điều chỉnh số dư user về đúng số liệu thực');
  console.log('==========================================\n');

  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    // Step 1: Tính tổng cashback thực tế từ user_balance_transactions
    console.log('📊 BƯỚC 1: Tính tổng cashback THỰC TẾ từ transactions\n');

    const transactionsResult = await pool.query(`
      SELECT
        transaction_type,
        amount,
        created_at,
        description
      FROM user_balance_transactions
      WHERE user_id = $1
      ORDER BY created_at ASC
    `, [userId]);

    console.log(`Tìm thấy ${transactionsResult.rows.length} giao dịch:\n`);

    let totalCashbackEarned = 0;
    let totalWithdrawn = 0;

    transactionsResult.rows.forEach((tx, index) => {
      const amount = parseFloat(tx.amount);
      console.log(`${index + 1}. ${tx.transaction_type}: ${amount.toLocaleString('vi-VN')} VND`);
      console.log(`   Ngày: ${tx.created_at}`);
      console.log(`   Mô tả: ${tx.description || 'N/A'}`);

      // Các loại giao dịch TĂNG số dư (cashback kiếm được)
      if (tx.transaction_type === 'balance_increased' ||
          tx.transaction_type === 'reconciliation_credit' ||
          tx.transaction_type === 'reconciliation_finalized' ||
          tx.transaction_type === 'reserved_released') {
        totalCashbackEarned += amount;
        console.log(`   → Cộng vào cashback: +${amount.toLocaleString('vi-VN')}`);
      }

      // Các loại giao dịch GIẢM số dư (rút tiền)
      if (tx.transaction_type === 'withdrawal' ||
          tx.transaction_type === 'balance_withdrawn') {
        totalWithdrawn += amount;
        console.log(`   → Rút tiền: -${amount.toLocaleString('vi-VN')}`);
      }

      console.log('');
    });

    console.log('📈 TỔNG HỢP:');
    console.log('-------------------------------------------');
    console.log('Tổng cashback kiếm được:', totalCashbackEarned.toLocaleString('vi-VN'), 'VND');
    console.log('Tổng đã rút:', totalWithdrawn.toLocaleString('vi-VN'), 'VND');
    console.log('Số dư thực tế:', (totalCashbackEarned - totalWithdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('');

    // Step 2: Kiểm tra số dư hiện tại trong database
    console.log('📋 BƯỚC 2: Số dư hiện tại trong database\n');

    const currentBalanceResult = await pool.query(`
      SELECT
        total_earned,
        total_withdrawn,
        pending_reserved,
        available_balance
      FROM user_system_balance
      WHERE user_id = $1
    `, [userId]);

    if (currentBalanceResult.rows.length === 0) {
      console.log('❌ User không có record trong user_system_balance\n');
      process.exit(1);
    }

    const currentBalance = currentBalanceResult.rows[0];
    console.log('Hiện tại trong DB:');
    console.log('  total_earned:', parseFloat(currentBalance.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', parseFloat(currentBalance.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved:', parseFloat(currentBalance.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('  available_balance:', parseFloat(currentBalance.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('');

    // Step 3: Tính toán số dư đúng
    console.log('💡 BƯỚC 3: Tính toán số dư ĐÚNG\n');

    // Số dư đúng = Tổng cashback từ transactions - Số tiền đã thanh toán (130,000)
    const correctTotalEarned = totalCashbackEarned;
    const correctTotalWithdrawn = 130000; // Đã thanh toán 130,000 VND
    const correctAvailableBalance = correctTotalEarned - correctTotalWithdrawn;

    console.log('Số dư ĐÚNG cần điều chỉnh:');
    console.log('  total_earned:', correctTotalEarned.toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', correctTotalWithdrawn.toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved: 0 VND');
    console.log('  available_balance (auto):', correctAvailableBalance.toLocaleString('vi-VN'), 'VND');
    console.log('');

    // Step 4: Cập nhật vào database
    console.log('🔄 BƯỚC 4: Cập nhật vào database\n');

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

    const updatedBalance = updateResult.rows[0];

    console.log('✅ ĐÃ CẬP NHẬT THÀNH CÔNG!');
    console.log('-------------------------------------------');
    console.log('Số dư sau khi cập nhật:');
    console.log('  total_earned:', parseFloat(updatedBalance.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('  total_withdrawn:', parseFloat(updatedBalance.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('  pending_reserved:', parseFloat(updatedBalance.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('  available_balance:', parseFloat(updatedBalance.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('');

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

fixUserBalance();
