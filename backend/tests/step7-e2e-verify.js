/**
 * BƯỚC 7: E2E Verification Script
 *
 * Script này giúp verify một payment request đã được xử lý đúng cách
 * Run sau khi admin đã mark payment as paid
 */

const db = require('../config/database');

// CONFIGURATION - Thay đổi payment request ID cần verify
const PAYMENT_REQUEST_ID = process.argv[2];

if (!PAYMENT_REQUEST_ID) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Usage Error
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: node step7-e2e-verify.js <payment-request-id>

Example:
  node step7-e2e-verify.js 9dc40011-e662-44ac-b0c0-b3d9ba33fb83

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
  process.exit(1);
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 BƯỚC 7: E2E Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verifying payment request: ${PAYMENT_REQUEST_ID}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

async function verify() {
  try {
    console.log('\n📋 STEP 1: Verify Payment Request Status\n');

    const prQuery = `
      SELECT
        pr.id,
        pr.user_id,
        u.email,
        pr.requested_amount,
        pr.status,
        pr.paid_at,
        pr.transaction_reference,
        pr.created_at
      FROM payment_requests pr
      INNER JOIN users u ON u.id = pr.user_id
      WHERE pr.id = $1
    `;

    const prResult = await db.pool.query(prQuery, [PAYMENT_REQUEST_ID]);

    if (prResult.rows.length === 0) {
      console.log('❌ Payment request not found!\n');
      process.exit(1);
    }

    const pr = prResult.rows[0];
    console.log('Payment Request Details:');
    console.table([pr]);

    if (pr.status !== 'paid') {
      console.log(`⚠️  Payment request status is "${pr.status}", not "paid"`);
      console.log('   This verification script is meant for paid requests only.\n');
      process.exit(1);
    }

    if (!pr.paid_at) {
      console.log('❌ paid_at is NULL! This should not happen for paid status.\n');
      process.exit(1);
    }

    console.log('✅ Payment request status is "paid" with valid paid_at timestamp\n');

    const userId = pr.user_id;
    const requestedAmount = parseFloat(pr.requested_amount);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 STEP 2: Verify Balance Deduction\n');

    const balanceQuery = `
      SELECT
        available_balance,
        total_withdrawn,
        total_earned,
        updated_at
      FROM user_system_balance
      WHERE user_id = $1
    `;

    const balanceResult = await db.pool.query(balanceQuery, [userId]);

    if (balanceResult.rows.length === 0) {
      console.log('❌ User balance record not found!\n');
      process.exit(1);
    }

    const balance = balanceResult.rows[0];
    console.log('Current Balance:');
    console.table([{
      available_balance: parseFloat(balance.available_balance).toLocaleString('vi-VN') + 'đ',
      total_withdrawn: parseFloat(balance.total_withdrawn).toLocaleString('vi-VN') + 'đ',
      total_earned: parseFloat(balance.total_earned).toLocaleString('vi-VN') + 'đ',
      updated_at: balance.updated_at
    }]);

    const totalWithdrawn = parseFloat(balance.total_withdrawn);

    if (totalWithdrawn >= requestedAmount) {
      console.log(`✅ total_withdrawn (${totalWithdrawn.toLocaleString('vi-VN')}đ) >= requested_amount (${requestedAmount.toLocaleString('vi-VN')}đ)`);
      console.log('   Balance appears to have been deducted.\n');
    } else {
      console.log(`⚠️  total_withdrawn (${totalWithdrawn.toLocaleString('vi-VN')}đ) < requested_amount (${requestedAmount.toLocaleString('vi-VN')}đ)`);
      console.log('   This might indicate balance was not deducted properly!\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 STEP 3: Verify Transaction Log\n');

    const logQuery = `
      SELECT
        id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        created_at
      FROM user_balance_transactions
      WHERE payment_request_id = $1
      ORDER BY created_at DESC
    `;

    const logResult = await db.pool.query(logQuery, [PAYMENT_REQUEST_ID]);

    if (logResult.rows.length === 0) {
      console.log('❌ No transaction log found for this payment request!');
      console.log('   Expected: Transaction with type "payment_deducted"\n');
      console.log('🔍 This indicates the NEW markAsPaid() code was NOT used.');
      console.log('   The payment was likely processed with OLD code.\n');
    } else {
      console.log('Transaction Logs:');
      console.table(logResult.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount).toLocaleString('vi-VN') + 'đ',
        balance_before: parseFloat(r.balance_before).toLocaleString('vi-VN') + 'đ',
        balance_after: parseFloat(r.balance_after).toLocaleString('vi-VN') + 'đ'
      })));

      const deductLog = logResult.rows.find(r => r.transaction_type === 'payment_deducted');

      if (deductLog) {
        const logAmount = Math.abs(parseFloat(deductLog.amount));
        if (Math.abs(logAmount - requestedAmount) < 0.01) {
          console.log(`✅ Found valid payment_deducted log with correct amount: ${logAmount.toLocaleString('vi-VN')}đ\n`);
        } else {
          console.log(`⚠️  Found payment_deducted log but amount mismatch:`);
          console.log(`   Log amount: ${logAmount.toLocaleString('vi-VN')}đ`);
          console.log(`   Expected: ${requestedAmount.toLocaleString('vi-VN')}đ\n`);
        }
      } else {
        console.log('⚠️  Transaction log exists but no "payment_deducted" type found.\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 STEP 4: Verify system_conversions Payment Status\n');

    const conversionsQuery = `
      SELECT
        sc.id,
        sc.order_amount,
        sc.cashback_amount,
        sc.status,
        sc.payment_status,
        sc.payment_request_id,
        sc.payment_linked_at
      FROM system_conversions sc
      INNER JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id
      INNER JOIN payment_reconciliation_mapping prm ON prm.reconciliation_item_id = sri.id
      WHERE prm.payment_request_id = $1
      ORDER BY sc.order_time ASC
    `;

    const conversionsResult = await db.pool.query(conversionsQuery, [PAYMENT_REQUEST_ID]);

    if (conversionsResult.rows.length === 0) {
      console.log('⚠️  No conversions linked to this payment request.');
      console.log('   This might be a manual payment or test payment.\n');
    } else {
      console.log(`Found ${conversionsResult.rows.length} linked conversions:`);
      console.table(conversionsResult.rows.map(r => ({
        id: r.id.substring(0, 8) + '...',
        order_amount: parseFloat(r.order_amount).toLocaleString('vi-VN') + 'đ',
        cashback_amount: parseFloat(r.cashback_amount).toLocaleString('vi-VN') + 'đ',
        status: r.status,
        payment_status: r.payment_status || 'NULL',
        payment_linked_at: r.payment_linked_at || 'NULL'
      })));

      const paidCount = conversionsResult.rows.filter(r => r.payment_status === 'paid').length;
      const unpaidCount = conversionsResult.rows.filter(r => !r.payment_status || r.payment_status !== 'paid').length;

      if (unpaidCount === 0) {
        console.log(`✅ All ${conversionsResult.rows.length} conversions marked as paid!\n`);
      } else {
        console.log(`⚠️  ${unpaidCount} conversions NOT marked as paid:`);
        console.log(`   Paid: ${paidCount}`);
        console.log(`   Unpaid: ${unpaidCount}\n`);
        console.log('🔍 This indicates the NEW markAsPaid() code was NOT used.');
        console.log('   The payment was likely processed with OLD code.\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 STEP 5: Verify Conversions Excluded from Reconciliation\n');

    if (conversionsResult.rows.length > 0) {
      const conversionIds = conversionsResult.rows.map(r => r.id);

      const reconciliationQuery = `
        SELECT sc.id
        FROM system_conversions sc
        WHERE sc.id = ANY($1)
          AND sc.status = 'approved'
          AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')
          AND NOT EXISTS (
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.system_conversion_id = sc.id
          )
      `;

      const reconResult = await db.pool.query(reconciliationQuery, [conversionIds]);

      if (reconResult.rows.length === 0) {
        console.log('✅ Conversions will NOT be included in future reconciliations.');
        console.log('   (Either marked as paid OR already reconciled)\n');
      } else {
        console.log(`⚠️  ${reconResult.rows.length} conversions would still be included in reconciliation!`);
        console.log('   This might indicate payment_status was not set correctly.\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 FINAL SUMMARY\n');

    const checks = {
      statusPaid: pr.status === 'paid' && pr.paid_at !== null,
      hasTransactionLog: logResult.rows.length > 0 && logResult.rows.some(r => r.transaction_type === 'payment_deducted'),
      conversionsMarked: conversionsResult.rows.length === 0 || conversionsResult.rows.every(r => r.payment_status === 'paid'),
      balanceDeducted: totalWithdrawn >= requestedAmount
    };

    console.log('Verification Results:');
    console.log(`  ✅ Payment Request Status: ${checks.statusPaid ? 'PASS' : 'FAIL'}`);
    console.log(`  ${checks.balanceDeducted ? '✅' : '⚠️ '} Balance Deducted: ${checks.balanceDeducted ? 'PASS' : 'UNCLEAR'}`);
    console.log(`  ${checks.hasTransactionLog ? '✅' : '❌'} Transaction Log: ${checks.hasTransactionLog ? 'PASS' : 'FAIL'}`);
    console.log(`  ${checks.conversionsMarked ? '✅' : '⚠️ '} Conversions Marked: ${checks.conversionsMarked ? 'PASS' : 'FAIL'}`);

    const allPassed = checks.statusPaid && checks.hasTransactionLog && checks.conversionsMarked;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (allPassed) {
      console.log('🎉 ALL CHECKS PASSED!');
      console.log('\n✅ This payment was processed with the NEW code.');
      console.log('✅ All fixes are working correctly.\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      process.exit(0);
    } else {
      console.log('⚠️  SOME CHECKS FAILED');
      console.log('\nPossible causes:');
      if (!checks.hasTransactionLog) {
        console.log('  - Payment was processed with OLD code (before fix)');
        console.log('  - Need to fix this in BƯỚC 8 (Historical Data Fix)');
      }
      if (!checks.conversionsMarked) {
        console.log('  - system_conversions not updated (OLD code)');
        console.log('  - Need to fix this in BƯỚC 8 (Historical Data Fix)');
      }
      console.log('\n💡 Next steps:');
      console.log('  1. If this is a NEW payment after code changes → Investigate error');
      console.log('  2. If this is an OLD payment before code changes → Will fix in BƯỚC 8');
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  }
}

verify();
