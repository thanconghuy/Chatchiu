const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 KIỂM TRA TOÀN BỘ LOGIC HỆ THỐNG\n');
    console.log('='.repeat(100));
    console.log('');

    // 1. Check system_conversions (approved conversions)
    console.log('1️⃣  SYSTEM_CONVERSIONS (Đơn hàng đã approve)');
    console.log('-'.repeat(100));

    const conversionsResult = await pool.query(
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

    let totalApprovedConversions = 0;
    let totalUnpaidConversions = 0;
    let totalPaidConversions = 0;

    conversionsResult.rows.forEach(r => {
      const amt = parseFloat(r.total);
      console.log('   ' + r.status + ' / payment_status=' + (r.payment_status || 'NULL') + ': ' + r.count + ' items, ' + amt.toLocaleString('vi-VN') + 'đ');

      if (r.status === 'approved') {
        totalApprovedConversions += amt;
        if (!r.payment_status || r.payment_status === 'unpaid') {
          totalUnpaidConversions += amt;
        } else if (r.payment_status === 'paid') {
          totalPaidConversions += amt;
        }
      }
    });

    console.log('');
    console.log('   📊 Tổng kết:');
    console.log('      Total approved: ' + totalApprovedConversions.toLocaleString('vi-VN') + 'đ');
    console.log('      Chưa thanh toán (NULL/unpaid): ' + totalUnpaidConversions.toLocaleString('vi-VN') + 'đ');
    console.log('      Đã thanh toán (paid): ' + totalPaidConversions.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 2. Check system_reconciliation_items (đã được đối soát)
    console.log('2️⃣  SYSTEM_RECONCILIATION_ITEMS (Đã được đối soát)');
    console.log('-'.repeat(100));

    const reconItemsResult = await pool.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total
       FROM system_reconciliation_items
       WHERE user_id = $1 AND conversion_status = 'approved'`,
      [userId]
    );

    const totalReconciled = parseFloat(reconItemsResult.rows[0].total);
    console.log('   Total items: ' + reconItemsResult.rows[0].count);
    console.log('   Total amount: ' + totalReconciled.toLocaleString('vi-VN') + 'đ');
    console.log('');

    if (totalReconciled < totalApprovedConversions) {
      console.log('   ⚠️  WARNING: Có conversions approved CHƯA được đối soát!');
      console.log('   Conversions approved: ' + totalApprovedConversions.toLocaleString('vi-VN') + 'đ');
      console.log('   Đã đối soát: ' + totalReconciled.toLocaleString('vi-VN') + 'đ');
      console.log('   Thiếu: ' + (totalApprovedConversions - totalReconciled).toLocaleString('vi-VN') + 'đ');
    } else {
      console.log('   ✅ Tất cả conversions approved đã được đối soát!');
    }
    console.log('');

    // 3. Check user_system_balance (source of truth)
    console.log('3️⃣  USER_SYSTEM_BALANCE (Source of Truth)');
    console.log('-'.repeat(100));

    const balanceResult = await pool.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    if (balanceResult.rows.length === 0) {
      console.log('   ❌ KHÔNG CÓ RECORD trong user_system_balance!');
      console.log('   → Cần tạo balance record cho user này');
      console.log('');
    } else {
      const bal = balanceResult.rows[0];
      const available = parseFloat(bal.available_balance);
      const earned = parseFloat(bal.total_earned);
      const withdrawn = parseFloat(bal.total_withdrawn);

      console.log('   available_balance: ' + available.toLocaleString('vi-VN') + 'đ');
      console.log('   total_earned: ' + earned.toLocaleString('vi-VN') + 'đ');
      console.log('   total_withdrawn: ' + withdrawn.toLocaleString('vi-VN') + 'đ');
      console.log('   last_reconciliation_date: ' + bal.last_reconciliation_date);
      console.log('   updated_at: ' + bal.updated_at);
      console.log('');

      // Verify formula: available = earned - withdrawn
      const expectedAvailable = earned - withdrawn;
      console.log('   🧮 Verification:');
      console.log('      available_balance = total_earned - total_withdrawn');
      console.log('      ' + available.toLocaleString('vi-VN') + 'đ = ' + earned.toLocaleString('vi-VN') + 'đ - ' + withdrawn.toLocaleString('vi-VN') + 'đ');

      if (Math.abs(available - expectedAvailable) < 0.01) {
        console.log('      ✅ ĐÚNG công thức!');
      } else {
        console.log('      ❌ SAI công thức! Expected: ' + expectedAvailable.toLocaleString('vi-VN') + 'đ');
      }
      console.log('');

      // Compare with reconciliation
      if (Math.abs(earned - totalReconciled) > 0.01) {
        console.log('   ⚠️  WARNING: total_earned KHÔNG KHỚP với system_reconciliation_items!');
        console.log('      total_earned (user_system_balance): ' + earned.toLocaleString('vi-VN') + 'đ');
        console.log('      total reconciled (items): ' + totalReconciled.toLocaleString('vi-VN') + 'đ');
        console.log('      Chênh lệch: ' + (earned - totalReconciled).toLocaleString('vi-VN') + 'đ');
        console.log('');
      } else {
        console.log('   ✅ total_earned KHỚP với system_reconciliation_items!');
        console.log('');
      }
    }

    // 4. Check payment_requests
    console.log('4️⃣  PAYMENT_REQUESTS (Lịch sử yêu cầu thanh toán)');
    console.log('-'.repeat(100));

    const paymentsResult = await pool.query(
      `SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(requested_amount), 0) as total
       FROM payment_requests
       WHERE user_id = $1
       GROUP BY status
       ORDER BY status`,
      [userId]
    );

    let totalPaidRequests = 0;
    let totalPendingRequests = 0;
    let totalConfirmedRequests = 0;

    if (paymentsResult.rows.length === 0) {
      console.log('   (Chưa có payment requests)');
    } else {
      paymentsResult.rows.forEach(r => {
        const amt = parseFloat(r.total);
        console.log('   ' + r.status + ': ' + r.count + ' requests, ' + amt.toLocaleString('vi-VN') + 'đ');

        if (r.status === 'paid') totalPaidRequests += amt;
        if (r.status === 'pending') totalPendingRequests += amt;
        if (r.status === 'confirmed') totalConfirmedRequests += amt;
      });
    }
    console.log('');

    // 5. Cross verification
    console.log('5️⃣  CROSS VERIFICATION (Kiểm tra chéo)');
    console.log('-'.repeat(100));
    console.log('');

    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      const withdrawn = parseFloat(bal.total_withdrawn);

      console.log('   A. total_withdrawn vs payment_requests(paid):');
      console.log('      user_system_balance.total_withdrawn: ' + withdrawn.toLocaleString('vi-VN') + 'đ');
      console.log('      payment_requests (status=paid): ' + totalPaidRequests.toLocaleString('vi-VN') + 'đ');

      if (Math.abs(withdrawn - totalPaidRequests) < 0.01) {
        console.log('      ✅ KHỚP!');
      } else {
        console.log('      ❌ KHÔNG KHỚP! Chênh lệch: ' + (withdrawn - totalPaidRequests).toLocaleString('vi-VN') + 'đ');
      }
      console.log('');

      console.log('   B. available_balance vs conversions(unpaid):');
      console.log('      user_system_balance.available_balance: ' + parseFloat(bal.available_balance).toLocaleString('vi-VN') + 'đ');
      console.log('      conversions (payment_status=NULL/unpaid): ' + totalUnpaidConversions.toLocaleString('vi-VN') + 'đ');

      if (Math.abs(parseFloat(bal.available_balance) - totalUnpaidConversions) < 0.01) {
        console.log('      ✅ KHỚP!');
      } else {
        console.log('      ⚠️  Có thể không khớp nếu có conversions chưa được đối soát');
        console.log('      Chênh lệch: ' + (parseFloat(bal.available_balance) - totalUnpaidConversions).toLocaleString('vi-VN') + 'đ');
      }
      console.log('');

      console.log('   C. total_earned vs system_reconciliation_items:');
      console.log('      user_system_balance.total_earned: ' + parseFloat(bal.total_earned).toLocaleString('vi-VN') + 'đ');
      console.log('      system_reconciliation_items total: ' + totalReconciled.toLocaleString('vi-VN') + 'đ');

      if (Math.abs(parseFloat(bal.total_earned) - totalReconciled) < 0.01) {
        console.log('      ✅ KHỚP!');
      } else {
        console.log('      ❌ KHÔNG KHỚP! Chênh lệch: ' + (parseFloat(bal.total_earned) - totalReconciled).toLocaleString('vi-VN') + 'đ');
      }
      console.log('');
    }

    // 6. Final summary
    console.log('6️⃣  FINAL SUMMARY');
    console.log('='.repeat(100));
    console.log('');

    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      console.log('   💰 SỐ DƯ KHẢ DỤNG CHÍNH THỨC: ' + parseFloat(bal.available_balance).toLocaleString('vi-VN') + 'đ');
      console.log('');
      console.log('   📊 Breakdown:');
      console.log('      Total earned (đã đối soát): ' + parseFloat(bal.total_earned).toLocaleString('vi-VN') + 'đ');
      console.log('      Total withdrawn (đã thanh toán): ' + parseFloat(bal.total_withdrawn).toLocaleString('vi-VN') + 'đ');
      console.log('      = Available balance: ' + parseFloat(bal.available_balance).toLocaleString('vi-VN') + 'đ');
      console.log('');

      if (totalReconciled < totalApprovedConversions) {
        console.log('   ⚠️  ACTION REQUIRED:');
        console.log('      Có ' + (totalApprovedConversions - totalReconciled).toLocaleString('vi-VN') + 'đ conversions approved CHƯA được đối soát');
        console.log('      → Cần chạy system reconciliation để cập nhật số dư');
        console.log('');
      }

      console.log('   ✅ LOGIC ĐÚNG:');
      console.log('      1. Conversions approved → Chạy reconciliation → Cập nhật total_earned');
      console.log('      2. User tạo payment request → KHÔNG đổi balance');
      console.log('      3. Admin mark paid → Trừ available_balance, tăng total_withdrawn');
      console.log('      4. Available balance = Total earned - Total withdrawn');
      console.log('');
    }

  } finally {
    await pool.end();
  }
})();
