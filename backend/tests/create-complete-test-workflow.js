/**
 * Tạo COMPLETE TEST WORKFLOW từ đầu đến cuối
 *
 * Flow:
 * 1. User + Balance
 * 2. System Conversions (5-10 đơn approved)
 * 3. Reconciliation (tạo kỳ đối soát, gán cashback)
 * 4. Balance được cộng
 * → User có thể tạo payment request
 * → Admin mark as paid → TEST CODE MỚI!
 */

const bcrypt = require('bcrypt');
const db = require('../config/database');
const crypto = require('crypto');

async function createCompleteWorkflow() {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔨 TẠO COMPLETE TEST WORKFLOW');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ========================================
    // STEP 1: Create test user
    // ========================================
    console.log('1️⃣ Tạo test user...');
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('Test123456', 10);

    await client.query(`
      INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
    `, [userId, 'testuser@test.com', 'testuser_e2e', hash, 'Test User E2E']);

    const userResult = await client.query(`SELECT id FROM users WHERE email = 'testuser@test.com'`);
    const actualUserId = userResult.rows[0].id;
    console.log('   ✅ User ID:', actualUserId);

    // ========================================
    // STEP 2: Create clicks (tracking)
    // ========================================
    console.log('\n2️⃣ Tạo 8 clicks (tracking)...');

    const clicks = [];
    const merchants = [
      { id: 'tiki', name: 'Tiki' },
      { id: 'lazada', name: 'Lazada' },
      { id: 'sendo', name: 'Sendo' },
      { id: 'tiktok', name: 'TikTok Shop' }
    ];

    for (let i = 0; i < 8; i++) {
      const merchant = merchants[i % merchants.length];
      const clickId = crypto.randomUUID();

      await client.query(`
        INSERT INTO clicks (
          id, user_id, merchant_id, click_type,
          affiliate_url, original_url, clicked_at
        )
        VALUES ($1, $2, $3, 'link', $4, $5, NOW() - INTERVAL '10 days')
      `, [
        clickId,
        actualUserId,
        merchant.id,
        `https://test.com/aff/${clickId}`,
        `https://${merchant.id}.com/product/${i}`
      ]);

      clicks.push({ id: clickId, merchant });
    }

    console.log(`   ✅ Created ${clicks.length} clicks`);

    // ========================================
    // STEP 3: Create conversions (AccessTrade conversions)
    // ========================================
    console.log('\n3️⃣ Tạo 8 conversions (AccessTrade)...');

    const atConversions = [];

    for (let i = 0; i < 8; i++) {
      const click = clicks[i];
      const atConvId = crypto.randomUUID();

      // Random order amount: 100k - 500k
      const orderAmount = 100000 + (Math.floor(Math.random() * 4) * 100000);
      const commission = orderAmount * 0.07; // 7%
      const cashback = commission * 0.7; // 70% of commission

      await client.query(`
        INSERT INTO conversions (
          id, user_id, click_id, merchant_id, merchant_name,
          order_code, order_amount, commission, cashback_amount,
          order_time, status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          NOW() - INTERVAL '10 days',
          'approved',
          NOW(), NOW()
        )
      `, [
        atConvId, actualUserId, click.id,
        click.merchant.id, click.merchant.name,
        `TEST-AT-${Date.now()}-${i}`,
        orderAmount, commission, cashback
      ]);

      atConversions.push({
        id: atConvId,
        click,
        orderAmount,
        commission,
        cashback
      });
    }

    console.log(`   ✅ Created ${atConversions.length} AccessTrade conversions`);

    // ========================================
    // STEP 4: Create system_conversions (đơn hàng)
    // ========================================
    console.log('\n4️⃣ Tạo 8 đơn hàng approved (system_conversions)...');

    const conversions = [];

    for (let i = 0; i < 8; i++) {
      const atConv = atConversions[i];
      const convId = crypto.randomUUID();

      await client.query(`
        INSERT INTO system_conversions (
          id, user_id, click_id, at_conversion_id,
          merchant_id, merchant_name,
          order_code, order_amount, commission, cashback_amount,
          order_time, approval_time, status,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          NOW() - INTERVAL '10 days',
          NOW() - INTERVAL '7 days',
          'approved',
          NOW(), NOW()
        )
      `, [
        convId, actualUserId, atConv.click.id, atConv.id,
        atConv.click.merchant.id, atConv.click.merchant.name,
        `TEST-SYS-${Date.now()}-${i}`,
        atConv.orderAmount, atConv.commission, atConv.cashback
      ]);

      conversions.push({
        id: convId,
        merchantName: atConv.click.merchant.name,
        orderAmount: atConv.orderAmount,
        cashback: atConv.cashback
      });
    }

    const totalCashback = conversions.reduce((sum, c) => sum + c.cashback, 0);
    console.log(`   ✅ Created ${conversions.length} conversions`);
    console.log(`   💰 Total cashback: ${totalCashback.toLocaleString('vi-VN')}đ`);

    // ========================================
    // STEP 5: Create reconciliation (kỳ đối soát)
    // ========================================
    console.log('\n5️⃣ Tạo reconciliation (kỳ đối soát)...');

    // Get admin user ID for created_by
    const adminResult = await client.query(`SELECT id FROM users WHERE email = 'admin@test.com'`);
    const adminId = adminResult.rows[0]?.id;

    if (!adminId) {
      throw new Error('Admin user not found. Please run create-admin.js first.');
    }

    const reconciliationId = crypto.randomUUID();
    const periodLabel = 'Test Period ' + new Date().toISOString().split('T')[0];

    await client.query(`
      INSERT INTO system_reconciliations (
        id, period_label, period_start, period_end, reconciliation_date, status,
        total_orders, total_cashback,
        created_at, created_by
      )
      VALUES (
        $1, $2,
        CURRENT_DATE - INTERVAL '15 days',
        CURRENT_DATE - INTERVAL '7 days',
        CURRENT_DATE - INTERVAL '5 days',
        'paid', $3, $4, NOW(), $5
      )
    `, [reconciliationId, periodLabel, conversions.length, totalCashback, adminId]);

    console.log(`   ✅ Reconciliation ID: ${reconciliationId}`);
    console.log(`   📅 Date: ${new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString('vi-VN')}`);

    // ========================================
    // STEP 6: Link conversions to reconciliation
    // ========================================
    console.log('\n6️⃣ Liên kết conversions với reconciliation...');

    for (let i = 0; i < conversions.length; i++) {
      const conv = conversions[i];
      const atConv = atConversions[i];
      const itemId = crypto.randomUUID();

      await client.query(`
        INSERT INTO system_reconciliation_items (
          id, system_reconciliation_id, system_conversion_id,
          user_id, merchant_id, merchant_name,
          order_time, approval_time, order_value, commission_amount, cashback_amount,
          conversion_status, api_reconciled, created_at, reconciled_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          NOW() - INTERVAL '10 days',
          NOW() - INTERVAL '7 days',
          $7, $8, $9,
          'approved', false, NOW(), NOW()
        )
      `, [
        itemId, reconciliationId, conv.id,
        actualUserId, atConv.click.merchant.id, conv.merchantName,
        conv.orderAmount, atConv.commission, conv.cashback
      ]);
    }

    console.log(`   ✅ Linked ${conversions.length} conversions`);

    // ========================================
    // STEP 7: Create/Update user_system_balance
    // ========================================
    console.log('\n7️⃣ Cập nhật balance cho user...');

    // Delete existing balance to start fresh
    await client.query(`DELETE FROM user_system_balance WHERE user_id = $1`, [actualUserId]);

    await client.query(`
      INSERT INTO user_system_balance (
        user_id, available_balance, pending_balance,
        reserved_balance, debt_balance,
        total_earned, total_withdrawn,
        updated_at
      )
      VALUES ($1, $2, 0, 0, 0, $2, 0, NOW())
    `, [actualUserId, totalCashback]);

    console.log(`   ✅ Balance: ${totalCashback.toLocaleString('vi-VN')}đ`);

    // ========================================
    // STEP 8: Log transaction
    // ========================================
    console.log('\n8️⃣ Ghi log transaction...');

    // Clean old logs
    await client.query(`DELETE FROM user_balance_transactions WHERE user_id = $1`, [actualUserId]);

    await client.query(`
      INSERT INTO user_balance_transactions (
        id, user_id, transaction_type, amount,
        balance_before, balance_after,
        description, created_at
      )
      VALUES ($1, $2, 'reconciliation_added', $3, 0, $3, 'Reconciliation: ${conversions.length} orders', NOW())
    `, [crypto.randomUUID(), actualUserId, totalCashback]);

    console.log('   ✅ Transaction logged');

    await client.query('COMMIT');

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TẠO WORKFLOW THÀNH CÔNG!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 CHI TIẾT DỮ LIỆU:\n');
    console.log(`User: testuser@test.com`);
    console.log(`Password: Test123456`);
    console.log(`User ID: ${actualUserId}\n`);

    console.log(`Conversions: ${conversions.length} đơn`);
    console.log('Chi tiết:');
    conversions.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.merchantName}: ${c.orderAmount.toLocaleString('vi-VN')}đ → Cashback: ${c.cashback.toLocaleString('vi-VN')}đ`);
    });

    console.log(`\nReconciliation: 1 kỳ (completed)`);
    console.log(`Total Cashback: ${totalCashback.toLocaleString('vi-VN')}đ`);
    console.log(`Available Balance: ${totalCashback.toLocaleString('vi-VN')}đ ✅\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎯 BÂY GIỜ BẠN CÓ THỂ TEST FULL WORKFLOW:\n');
    console.log('1️⃣ Login: http://localhost:3007/login');
    console.log('   → testuser@test.com / Test123456');
    console.log(`   → Xem balance: ${totalCashback.toLocaleString('vi-VN')}đ`);
    console.log('   → Xem conversions: 8 đơn');
    console.log('   → Xem reconciliation history: 1 kỳ\n');

    console.log('2️⃣ Tạo Payment Request:');
    console.log('   → Amount: 50,000đ');
    console.log('   → Bank: Test Bank E2E\n');

    console.log('3️⃣ Get Payment ID:');
    console.log('   → node backend/tests/get-latest-payment.js\n');

    console.log('4️⃣ Admin Mark as Paid: ⚠️ CODE MỚI CHẠY!');
    console.log('   → Login: admin@test.com / Admin123456');
    console.log('   → Confirm → Mark as Paid');
    console.log('   → Ref: E2E-TEST-FULL\n');

    console.log('5️⃣ Verify:');
    console.log('   → node backend/tests/step7-e2e-verify.js <id>\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 EXPECTED RESULTS:\n');
    console.log(`✅ Balance giảm: ${totalCashback.toLocaleString('vi-VN')} → ${(totalCashback - 50000).toLocaleString('vi-VN')}đ`);
    console.log('✅ total_withdrawn: 0 → 50,000đ');
    console.log('✅ Transaction log: payment_deducted');
    console.log('✅ system_conversions: payment_status = paid (nếu có link)');
    console.log('✅ Code mới hoạt động đúng!\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

createCompleteWorkflow();
