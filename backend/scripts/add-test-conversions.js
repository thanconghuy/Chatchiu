const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('➕ Adding new test conversions...\n');

    // Check current balance
    const currentResult = await client.query(
      `SELECT COALESCE(SUM(cashback_amount), 0) as total FROM system_conversions WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );
    const currentTotal = parseFloat(currentResult.rows[0].total);
    console.log('📊 Current approved cashback: ' + currentTotal.toLocaleString('vi-VN') + 'đ\n');

    // Add 5 new conversions with different amounts
    const newConversions = [
      { merchant: 'Shopee', amount: 25000, order_amount: 500000 },
      { merchant: 'Lazada', amount: 30000, order_amount: 600000 },
      { merchant: 'Tiki', amount: 15000, order_amount: 300000 },
      { merchant: 'Sendo', amount: 20000, order_amount: 400000 },
      { merchant: 'Grab', amount: 10000, order_amount: 200000 }
    ];

    console.log('Adding new conversions:');
    let totalAdded = 0;

    for (const conv of newConversions) {
      // Step 1: Create a conversion first
      const conversionInsert = `
        INSERT INTO conversions (
          user_id,
          merchant_name,
          order_value,
          cashback_amount,
          status,
          order_time,
          confirmed_time,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, 'confirmed', NOW(), NOW(), NOW(), NOW())
        RETURNING id
      `;

      const convResult = await client.query(conversionInsert, [
        userId,
        conv.merchant,
        conv.order_amount,
        conv.amount
      ]);

      const conversionId = convResult.rows[0].id;

      // Step 2: Get click_id from existing system_conversions
      const clickResult = await client.query(
        `SELECT click_id FROM system_conversions WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      const click_id = clickResult.rows[0]?.click_id || '00000000-0000-0000-0000-000000000000';

      // Step 3: Create system_conversion
      const sysConvInsert = `
        INSERT INTO system_conversions (
          user_id,
          click_id,
          at_conversion_id,
          merchant_name,
          order_amount,
          cashback_amount,
          status,
          order_time,
          approval_time,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW(), NOW(), NOW(), NOW())
        RETURNING id, merchant_name, cashback_amount
      `;

      const result = await client.query(sysConvInsert, [
        userId,
        click_id,
        conversionId, // Use the conversion ID we just created
        conv.merchant,
        conv.order_amount,
        conv.amount
      ]);

      const inserted = result.rows[0];
      console.log('  ✓ ' + inserted.merchant_name + ': ' + parseFloat(inserted.cashback_amount).toLocaleString('vi-VN') + 'đ (order: ' + conv.order_amount.toLocaleString('vi-VN') + 'đ)');
      totalAdded += conv.amount;
    }

    await client.query('COMMIT');

    const newTotal = currentTotal + totalAdded;

    console.log('');
    console.log('✅ Successfully added ' + newConversions.length + ' conversions!');
    console.log('');
    console.log('📊 Summary:');
    console.log('   Previous total: ' + currentTotal.toLocaleString('vi-VN') + 'đ');
    console.log('   Added: ' + totalAdded.toLocaleString('vi-VN') + 'đ');
    console.log('   New total: ' + newTotal.toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('💰 Available balance: ' + newTotal.toLocaleString('vi-VN') + 'đ');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
