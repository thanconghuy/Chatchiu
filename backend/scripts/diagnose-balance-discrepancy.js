const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 BALANCE DISCREPANCY DIAGNOSIS\n');
    console.log('='.repeat(80));
    console.log('');

    // 1. Check user_system_balance table (used by widget)
    console.log('📊 1. user_system_balance TABLE (Widget reads from here)');
    console.log('-'.repeat(80));

    const userBalanceResult = await pool.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    if (userBalanceResult.rows.length === 0) {
      console.log('   ❌ NO RECORD in user_system_balance table!');
      console.log('   This is why widget shows 0 or old data.');
    } else {
      const bal = userBalanceResult.rows[0];
      console.log('   available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN') + 'đ');
      console.log('   total_earned:', parseFloat(bal.total_earned).toLocaleString('vi-VN') + 'đ');
      console.log('   total_withdrawn:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN') + 'đ');
      console.log('   pending_balance:', parseFloat(bal.pending_balance || 0).toLocaleString('vi-VN') + 'đ');
      console.log('   reserved_balance:', parseFloat(bal.reserved_balance || 0).toLocaleString('vi-VN') + 'đ');
      console.log('   debt_balance:', parseFloat(bal.debt_balance || 0).toLocaleString('vi-VN') + 'đ');
      console.log('   updated_at:', bal.updated_at);
    }
    console.log('');

    // 2. Calculate CORRECT balance from system_conversions + payment_requests
    console.log('💰 2. CORRECT CALCULATION (Dashboard logic)');
    console.log('-'.repeat(80));

    const correctBalanceQuery = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );

    const totalApproved = parseFloat(correctBalanceQuery.rows[0].total_approved);
    const totalRequested = parseFloat(correctBalanceQuery.rows[0].total_requested);
    const correctAvailable = totalApproved - totalRequested;

    console.log('   Total Approved (system_conversions):', totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Total Requested (payment_requests):', totalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   ✅ CORRECT Available Balance:', correctAvailable.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 3. Payment requests breakdown
    console.log('💳 3. PAYMENT REQUESTS BREAKDOWN');
    console.log('-'.repeat(80));

    const paymentsResult = await pool.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(requested_amount), 0) as total
       FROM payment_requests
       WHERE user_id = $1
       GROUP BY status
       ORDER BY status`,
      [userId]
    );

    paymentsResult.rows.forEach(r => {
      console.log('   ' + r.status + ': ' + r.count + ' requests, ' + parseFloat(r.total).toLocaleString('vi-VN') + 'đ');
    });
    console.log('');

    // 4. Comparison
    console.log('⚖️  4. COMPARISON');
    console.log('-'.repeat(80));

    if (userBalanceResult.rows.length > 0) {
      const storedAvailable = parseFloat(userBalanceResult.rows[0].available_balance);
      const discrepancy = storedAvailable - correctAvailable;

      console.log('   Widget shows (from user_system_balance):', storedAvailable.toLocaleString('vi-VN') + 'đ');
      console.log('   Should show (calculated correctly):', correctAvailable.toLocaleString('vi-VN') + 'đ');
      console.log('   ❌ DISCREPANCY:', discrepancy.toLocaleString('vi-VN') + 'đ');
      console.log('');

      if (Math.abs(discrepancy) > 0.01) {
        console.log('🔍 5. ROOT CAUSE ANALYSIS');
        console.log('-'.repeat(80));
        console.log('');
        console.log('   ❌ PROBLEM: user_system_balance table is OUT OF SYNC');
        console.log('');
        console.log('   💡 Why this happens:');
        console.log('   1. paymentRequestService.createPaymentRequest() does NOT update user_system_balance');
        console.log('   2. paymentRequestService.cancelPaymentRequest() does NOT update user_system_balance');
        console.log('   3. Only markAsPaid() updates user_system_balance (too late!)');
        console.log('');
        console.log('   📌 SOLUTION OPTIONS:');
        console.log('');
        console.log('   Option A: UPDATE user_system_balance on create/cancel (keep table in sync)');
        console.log('     ✅ Pros: Fast reads from pre-calculated table');
        console.log('     ❌ Cons: More complex code, risk of sync issues');
        console.log('');
        console.log('   Option B: REMOVE user_system_balance, always calculate on-the-fly');
        console.log('     ✅ Pros: Single source of truth, no sync issues');
        console.log('     ✅ Pros: Simpler code, easier to maintain');
        console.log('     ⚠️  Cons: Slightly more DB load (acceptable for small-medium systems)');
        console.log('');
        console.log('   Option C: UPDATE user_system_balance to match correct value RIGHT NOW');
        console.log('     ✅ Pros: Quick fix');
        console.log('     ❌ Cons: Will get out of sync again on next create/cancel');
        console.log('');
      } else {
        console.log('   ✅ No discrepancy - balances match!');
      }
    } else {
      console.log('   ⚠️  user_system_balance has no record for this user');
      console.log('   The widget will show 0 or error.');
    }
    console.log('');

    // 6. Quick fix query (if needed)
    if (userBalanceResult.rows.length > 0) {
      const storedAvailable = parseFloat(userBalanceResult.rows[0].available_balance);
      if (Math.abs(storedAvailable - correctAvailable) > 0.01) {
        console.log('⚡ 6. QUICK FIX QUERY (Option C)');
        console.log('-'.repeat(80));
        console.log('');
        console.log('   Run this to sync user_system_balance RIGHT NOW:');
        console.log('');
        console.log('   UPDATE user_system_balance');
        console.log('   SET available_balance = ' + correctAvailable + ',');
        console.log('       updated_at = CURRENT_TIMESTAMP');
        console.log('   WHERE user_id = \'' + userId + '\';');
        console.log('');
        console.log('   ⚠️  WARNING: This is temporary fix. Balance will get out of sync');
        console.log('   again when user creates/cancels payment requests.');
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('✅ Diagnosis complete!');
    console.log('');

  } finally {
    await pool.end();
  }
})();
