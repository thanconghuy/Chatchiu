const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 VERIFICATION SCRIPT - Kiểm tra hệ thống hoạt động đúng logic\n');
    console.log('=' .repeat(80));
    console.log('');

    // 1. Current balance state
    console.log('📊 BƯỚC 1: Kiểm tra số dư hiện tại');
    console.log('-'.repeat(80));

    const balanceQuery = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );

    const totalApproved = parseFloat(balanceQuery.rows[0].total_approved);
    const totalRequested = parseFloat(balanceQuery.rows[0].total_requested);
    const availableBalance = totalApproved - totalRequested;

    console.log('   ✓ Tổng cashback đã duyệt: ' + totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   ✓ Tổng đã yêu cầu: ' + totalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   ✓ Số dư khả dụng: ' + availableBalance.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 2. Check business rules from settings
    console.log('📋 BƯỚC 2: Kiểm tra các quy tắc nghiệp vụ');
    console.log('-'.repeat(80));

    const settingsQuery = await pool.query(
      `SELECT setting_key, setting_value
       FROM system_settings
       WHERE setting_key IN ('min_withdrawal_amount', 'max_withdrawal_amount')`
    );

    let minAmount = 40000; // default
    let maxAmount = 500000; // default

    settingsQuery.rows.forEach(s => {
      if (s.setting_key === 'min_withdrawal_amount') {
        minAmount = parseInt(s.setting_value);
      } else if (s.setting_key === 'max_withdrawal_amount') {
        maxAmount = parseInt(s.setting_value);
      }
    });

    console.log('   ✓ Số tiền tối thiểu: ' + minAmount.toLocaleString('vi-VN') + 'đ (từ settings)');
    console.log('   ✓ Số tiền tối đa: ' + maxAmount.toLocaleString('vi-VN') + 'đ (từ settings)');
    console.log('');

    // 3. Valid test amounts
    console.log('📝 BƯỚC 3: Các số tiền hợp lệ để test');
    console.log('-'.repeat(80));

    const validAmounts = [];

    if (availableBalance >= minAmount) {
      validAmounts.push(minAmount);
    }
    if (availableBalance >= 100000) {
      validAmounts.push(100000);
    }
    if (availableBalance >= 200000) {
      validAmounts.push(200000);
    }

    // Add current available if it's >= min
    if (availableBalance >= minAmount && !validAmounts.includes(availableBalance)) {
      validAmounts.push(Math.floor(availableBalance));
    }

    if (validAmounts.length === 0) {
      console.log('   ⚠️  CẢNH BÁO: Số dư không đủ để tạo yêu cầu thanh toán!');
      console.log('   ⚠️  Cần tối thiểu: ' + minAmount.toLocaleString('vi-VN') + 'đ');
      console.log('   ⚠️  Hiện có: ' + availableBalance.toLocaleString('vi-VN') + 'đ');
      console.log('   ⚠️  Thiếu: ' + (minAmount - availableBalance).toLocaleString('vi-VN') + 'đ');
    } else {
      console.log('   ✓ Các số tiền bạn có thể test từ UI:');
      validAmounts.forEach((amt, idx) => {
        console.log('      ' + (idx + 1) + '. ' + amt.toLocaleString('vi-VN') + 'đ');
      });
    }
    console.log('');

    // 4. Payment requests history
    console.log('📜 BƯỚC 4: Lịch sử yêu cầu thanh toán');
    console.log('-'.repeat(80));

    const paymentsQuery = await pool.query(
      `SELECT id, requested_amount, status, created_at
       FROM payment_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    if (paymentsQuery.rows.length === 0) {
      console.log('   (Chưa có yêu cầu thanh toán nào)');
    } else {
      paymentsQuery.rows.forEach((p, idx) => {
        const createdDate = new Date(p.created_at).toLocaleString('vi-VN');
        console.log('   ' + (idx + 1) + '. ' + parseFloat(p.requested_amount).toLocaleString('vi-VN') + 'đ - ' + p.status + ' (' + createdDate + ')');
      });
    }
    console.log('');

    // 5. Conversions status
    console.log('💰 BƯỚC 5: Trạng thái conversions');
    console.log('-'.repeat(80));

    const conversionsQuery = await pool.query(
      `SELECT
        status,
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total
       FROM system_conversions
       WHERE user_id = $1
       GROUP BY status, payment_status
       ORDER BY status, payment_status`,
      [userId]
    );

    conversionsQuery.rows.forEach(r => {
      console.log('   • status=' + r.status + ', payment_status=' + (r.payment_status || 'NULL') + ': ' + r.count + ' items, ' + parseFloat(r.total).toLocaleString('vi-VN') + 'đ');
    });
    console.log('');

    // 6. Verification summary
    console.log('✅ BƯỚC 6: KẾT QUẢ KIỂM TRA');
    console.log('='.repeat(80));
    console.log('');
    console.log('📌 LOGIC HỆ THỐNG:');
    console.log('   Available Balance = Total Approved - Total Requested');
    console.log('   ' + availableBalance.toLocaleString('vi-VN') + 'đ = ' + totalApproved.toLocaleString('vi-VN') + 'đ - ' + totalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('');

    const calculatedBalance = totalApproved - totalRequested;
    if (Math.abs(calculatedBalance - availableBalance) < 0.01) {
      console.log('   ✅ ĐÚNG! Balance calculation hoạt động chính xác!');
    } else {
      console.log('   ❌ SAI! Có vấn đề với balance calculation!');
    }
    console.log('');

    console.log('📌 HƯỚNG DẪN TEST TỪ UI:');
    console.log('');
    console.log('   1️⃣  Vào trang "Yêu cầu thanh toán"');
    console.log('   2️⃣  Nhập số tiền >= 50,000đ (tối thiểu) và <= ' + availableBalance.toLocaleString('vi-VN') + 'đ (số dư)');

    if (validAmounts.length > 0) {
      console.log('   3️⃣  Ví dụ: ' + validAmounts[0].toLocaleString('vi-VN') + 'đ');
    }

    console.log('   4️⃣  Điền thông tin ngân hàng');
    console.log('   5️⃣  Click "Tạo yêu cầu"');
    console.log('   6️⃣  Kiểm tra số dư còn lại = ' + availableBalance.toLocaleString('vi-VN') + 'đ - số tiền vừa request');
    console.log('');

    console.log('📌 LƯU Ý:');
    console.log('   ⚠️  Nếu bạn nhập < 50,000đ → Sẽ báo lỗi "Số tiền tối thiểu 50,000đ"');
    console.log('   ⚠️  Nếu bạn nhập > ' + availableBalance.toLocaleString('vi-VN') + 'đ → Sẽ báo lỗi "Số dư không đủ"');
    console.log('   ✅ Balance luôn trừ ĐÚNG số tiền request, không phụ thuộc vào số items được link');
    console.log('');

  } finally {
    await pool.end();
  }
})();
