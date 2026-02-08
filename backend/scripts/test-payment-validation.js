/**
 * Test Payment Validation Logic
 *
 * Kiểm tra logic validation thanh toán:
 * 1. Số tiền phải là bội số của minAmount (50,000đ)
 * 2. Số tiền tối đa = floor(availableBalance / minAmount) * minAmount
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = 'testuser@test.com';

async function testPaymentValidation() {
  console.log('='.repeat(70));
  console.log('TEST PAYMENT VALIDATION LOGIC');
  console.log('='.repeat(70));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // Get user ID
    const userResult = await pool.query(`
      SELECT id FROM users WHERE email = $1
    `, [TEST_USER_EMAIL]);

    if (userResult.rows.length === 0) {
      console.log('User not found!');
      return;
    }

    const userId = userResult.rows[0].id;
    console.log(`\nUser ID: ${userId}`);

    // Get balance info
    const balanceResult = await pool.query(`
      SELECT
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance,
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = $1
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        ), 0) as reconciled_balance
      FROM user_system_balance usb
      WHERE usb.user_id = $1
    `, [userId]);

    if (balanceResult.rows.length === 0) {
      console.log('No balance record found!');
      return;
    }

    const balance = balanceResult.rows[0];
    const availableBalance = parseFloat(balance.available_balance);
    const reconciledBalance = parseFloat(balance.reconciled_balance);

    console.log('\n' + '='.repeat(70));
    console.log('CURRENT BALANCE');
    console.log('='.repeat(70));
    console.log(`  total_earned: ${parseFloat(balance.total_earned).toLocaleString('vi-VN')}đ`);
    console.log(`  total_withdrawn: ${parseFloat(balance.total_withdrawn).toLocaleString('vi-VN')}đ`);
    console.log(`  pending_reserved: ${parseFloat(balance.pending_reserved).toLocaleString('vi-VN')}đ`);
    console.log(`  available_balance: ${availableBalance.toLocaleString('vi-VN')}đ`);
    console.log(`  reconciled_balance: ${reconciledBalance.toLocaleString('vi-VN')}đ`);

    // Test validation logic
    console.log('\n' + '='.repeat(70));
    console.log('VALIDATION LOGIC TEST');
    console.log('='.repeat(70));

    const minAmount = 50000;
    const maxPayable = Math.floor(availableBalance / minAmount) * minAmount;

    console.log(`\n  minAmount: ${minAmount.toLocaleString('vi-VN')}đ`);
    console.log(`  availableBalance: ${availableBalance.toLocaleString('vi-VN')}đ`);
    console.log(`  maxPayable (floor): ${maxPayable.toLocaleString('vi-VN')}đ`);

    // Test cases
    console.log('\n  Test Cases:');
    console.log('  ' + '-'.repeat(60));

    const testAmounts = [
      { amount: 50000, desc: '50,000 (min)' },
      { amount: 100000, desc: '100,000 (2x min)' },
      { amount: 75000, desc: '75,000 (not multiple)' },
      { amount: 123456, desc: '123,456 (random)' },
      { amount: maxPayable, desc: `${maxPayable.toLocaleString('vi-VN')} (max)` },
      { amount: maxPayable + minAmount, desc: `${(maxPayable + minAmount).toLocaleString('vi-VN')} (over max)` },
      { amount: availableBalance, desc: `${availableBalance.toLocaleString('vi-VN')} (exact available)` },
    ];

    testAmounts.forEach(test => {
      const isMultiple = test.amount % minAmount === 0;
      const withinMax = test.amount <= maxPayable;
      const isValid = isMultiple && withinMax && test.amount >= minAmount;

      console.log(`  ${test.desc}:`);
      console.log(`    - Is multiple of ${minAmount.toLocaleString('vi-VN')}: ${isMultiple ? '✅' : '❌'}`);
      console.log(`    - Within maxPayable: ${withinMax ? '✅' : '❌'}`);
      console.log(`    - VALID: ${isValid ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });

    // Example scenario
    console.log('\n' + '='.repeat(70));
    console.log('EXAMPLE SCENARIO');
    console.log('='.repeat(70));
    console.log(`
  Ví dụ: Số dư khả dụng = 238,500đ, minAmount = 50,000đ

  Công thức: maxPayable = floor(238500 / 50000) * 50000
           = floor(4.77) * 50000
           = 4 * 50000
           = 200,000đ

  Các số tiền hợp lệ:
  - 50,000đ ✅
  - 100,000đ ✅
  - 150,000đ ✅
  - 200,000đ ✅ (MAX)
  - 238,500đ ❌ (vượt maxPayable, không phải bội số)
  - 250,000đ ❌ (vượt maxPayable)
  - 75,000đ ❌ (không phải bội số của 50,000đ)
`);

    console.log('\n' + '='.repeat(70));
    console.log('DONE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testPaymentValidation().catch(console.error);
