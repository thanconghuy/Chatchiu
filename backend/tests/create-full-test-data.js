/**
 * Tạo đầy đủ test data theo đúng logic hệ thống
 * Bao gồm: clicks, conversions, reconciliation, payment requests
 */

const bcrypt = require('bcrypt');
const db = require('../config/database');
const crypto = require('crypto');

async function createFullTestData() {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔨 Tạo dữ liệu test đầy đủ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Create test user
    console.log('1️⃣ Tạo test user...');
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('Test123456', 10);

    await client.query(`
      INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        username = EXCLUDED.username,
        updated_at = NOW()
      RETURNING id
    `, [userId, 'testuser@test.com', 'testuser_e2e', hash, 'Test User E2E']);

    // Get the actual user ID (in case of conflict)
    const userResult = await client.query(`SELECT id FROM users WHERE email = 'testuser@test.com'`);
    const actualUserId = userResult.rows[0].id;

    console.log('   ✅ User created:', actualUserId);

    // 2. Create clicks
    console.log('\n2️⃣ Tạo clicks (tracking)...');
    const clickIds = [];
    const merchants = [
      { id: 'shopee-vn', name: 'Shopee VN' },
      { id: 'lazada-vn', name: 'Lazada VN' },
      { id: 'tiki-vn', name: 'Tiki' }
    ];

    for (let i = 0; i < 5; i++) {
      const clickId = crypto.randomUUID();
      const merchant = merchants[i % merchants.length];

      await client.query(`
        INSERT INTO clicks (
          id, user_id, merchant_id,
          affiliate_url, original_url,
          clicked_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '7 days')
        ON CONFLICT (id) DO NOTHING
      `, [
        clickId,
        actualUserId,
        merchant.id,
        `https://test.com/aff/${clickId}`,
        `https://${merchant.id}.com/product`
      ]);

      clickIds.push({ id: clickId, merchant });
    }

    console.log(`   ✅ Created ${clickIds.length} clicks`);

    // 3. Create conversions (from AccessTrade)
    console.log('\n3️⃣ Tạo conversions (đơn hàng)...');
    const conversionIds = [];

    for (let i = 0; i < 3; i++) {
      const clickData = clickIds[i];
      const conversionId = crypto.randomUUID();
      const atConversionId = crypto.randomUUID();

      const orderAmount = 50000 + (i * 20000); // 50k, 70k, 90k
      const commission = orderAmount * 0.07; // 7% commission
      const cashback = commission * 0.7; // 70% cashback to user

      await client.query(`
        INSERT INTO conversions (
          id, user_id, click_id, merchant_id, merchant_name,
          order_code, order_amount, commission, cashback_amount,
          order_time, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '6 days', 'approved', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        conversionId,
        actualUserId,
        clickData.id,
        clickData.merchant.id,
        clickData.merchant.name,
        'TEST-ORDER-' + Date.now() + '-' + i,
        orderAmount,
        commission,
        cashback
      ]);

      conversionIds.push({ id: conversionId, atConversionId, cashback, orderAmount });
    }

    console.log(`   ✅ Created ${conversionIds.length} conversions`);
    console.log(`   💰 Total cashback: ${conversionIds.reduce((sum, c) => sum + c.cashback, 0).toLocaleString('vi-VN')}đ`);

    // 4. Create system_conversions (internal tracking)
    console.log('\n4️⃣ Tạo system_conversions (đối soát nội bộ)...');

    for (let i = 0; i < conversionIds.length; i++) {
      const conv = conversionIds[i];
      const clickData = clickIds[i];
      const systemConvId = crypto.randomUUID();

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
          NOW() - INTERVAL '6 days',
          NOW() - INTERVAL '3 days',
          'approved',
          NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        systemConvId,
        actualUserId,
        clickData.id,
        conv.atConversionId,
        clickData.merchant.id,
        clickData.merchant.name,
        'TEST-SYS-' + Date.now() + '-' + i,
        conv.orderAmount,
        conv.orderAmount * 0.07,
        conv.cashback
      ]);

      conv.systemConvId = systemConvId;
    }

    console.log('   ✅ System conversions created');

    // 5. Create reconciliation
    console.log('\n5️⃣ Tạo reconciliation (kỳ đối soát)...');

    const reconciliationId = crypto.randomUUID();
    const totalCashback = conversionIds.reduce((sum, c) => sum + c.cashback, 0);

    await client.query(`
      INSERT INTO system_reconciliations (
        id, reconciliation_date, status,
        total_conversions, total_cashback,
        created_at, created_by
      )
      VALUES ($1, CURRENT_DATE, 'completed', $2, $3, NOW(), 'system')
      ON CONFLICT (id) DO NOTHING
    `, [reconciliationId, conversionIds.length, totalCashback]);

    console.log(`   ✅ Reconciliation created: ${reconciliationId}`);

    // 6. Link conversions to reconciliation
    console.log('\n6️⃣ Liên kết conversions với reconciliation...');

    for (const conv of conversionIds) {
      const itemId = crypto.randomUUID();

      await client.query(`
        INSERT INTO system_reconciliation_items (
          id, reconciliation_id, system_conversion_id,
          user_id, cashback_amount, status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'paid', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [itemId, reconciliationId, conv.systemConvId, actualUserId, conv.cashback]);
    }

    console.log('   ✅ Linked conversions to reconciliation');

    // 7. Create user_system_balance
    console.log('\n7️⃣ Tạo balance cho user...');

    await client.query(`
      INSERT INTO user_system_balance (
        user_id, available_balance, pending_balance,
        reserved_balance, debt_balance,
        total_earned, total_withdrawn,
        updated_at
      )
      VALUES ($1, $2, 0, 0, 0, $2, 0, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        available_balance = $2,
        total_earned = $2,
        total_withdrawn = 0,
        updated_at = NOW()
    `, [actualUserId, totalCashback]);

    console.log(`   ✅ Balance created: ${totalCashback.toLocaleString('vi-VN')}đ`);

    // 8. Log initial balance transaction
    await client.query(`
      INSERT INTO user_balance_transactions (
        id, user_id, transaction_type, amount,
        balance_before, balance_after,
        description, created_at
      )
      VALUES ($1, $2, 'reconciliation_added', $3, 0, $3, 'Initial test data reconciliation', NOW())
    `, [crypto.randomUUID(), actualUserId, totalCashback]);

    await client.query('COMMIT');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TẠO DỮ LIỆU THÀNH CÔNG!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 THÔNG TIN TEST USER:\n');
    console.log('Email: testuser@test.com');
    console.log('Password: Test123456');
    console.log(`Balance: ${totalCashback.toLocaleString('vi-VN')}đ`);
    console.log(`Clicks: ${clickIds.length}`);
    console.log(`Conversions: ${conversionIds.length}`);
    console.log(`Reconciliation: 1 kỳ (completed)`);
    console.log('\nLogin at: http://localhost:3007/login\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Next steps for BƯỚC 7:');
    console.log('1. Login: testuser@test.com / Test123456');
    console.log('2. Xem balance đã có sẵn');
    console.log('3. Tạo payment request: 50,000đ');
    console.log('4. Admin confirm & mark as paid');
    console.log('5. Verify: node backend/tests/step7-e2e-verify.js <payment-id>\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

createFullTestData();
