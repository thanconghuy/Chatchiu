const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('➕ Adding new test conversions (simple method)...\n');

    // Check current balance
    const currentResult = await client.query(
      `SELECT COALESCE(SUM(cashback_amount), 0) as total FROM system_conversions WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );
    const currentTotal = parseFloat(currentResult.rows[0].total);
    console.log('📊 Current approved cashback: ' + currentTotal.toLocaleString('vi-VN') + 'đ\n');

    // Get an existing conversion to duplicate its structure
    const templateResult = await client.query(
      `SELECT * FROM system_conversions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (templateResult.rows.length === 0) {
      throw new Error('No existing conversions found');
    }

    const template = templateResult.rows[0];

    // New conversions data
    const newConversions = [
      { merchant: 'Shopee', amount: 25000, order_amount: 500000 },
      { merchant: 'Lazada', amount: 30000, order_amount: 600000 },
      { merchant: 'Tiki', amount: 15000, order_amount: 300000 },
      { merchant: 'Sendo', amount: 20000, order_amount: 400000 },
      { merchant: 'Grab', amount: 10000, order_amount: 200000 }
    ];

    console.log('Adding new conversions (duplicating existing structure):');
    let totalAdded = 0;

    for (const conv of newConversions) {
      // First create a conversion record
      const convInsert = await client.query(
        `INSERT INTO conversions (
          user_id, click_id, merchant_name, order_amount, cashback_amount,
          status, order_time, approval_time, confirmed_time, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'approved', NOW(), NOW(), NOW(), NOW(), NOW())
        RETURNING id`,
        [userId, template.click_id, conv.merchant, conv.order_amount, conv.amount]
      );

      const newConversionId = convInsert.rows[0].id;

      // Then create system_conversion using that conversion
      const sysInsert = await client.query(
        `INSERT INTO system_conversions (
          user_id, click_id, at_conversion_id, merchant_id, merchant_name,
          order_amount, cashback_amount, status,
          order_time, approval_time, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', NOW(), NOW(), NOW(), NOW())
        RETURNING id, merchant_name, cashback_amount`,
        [
          userId,
          template.click_id,
          newConversionId,
          template.merchant_id,
          conv.merchant,
          conv.order_amount,
          conv.amount
        ]
      );

      const inserted = sysInsert.rows[0];
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
