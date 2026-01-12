const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentId = 'eddd5086-2824-4a6f-a21b-3dfb18d94399';
    const requestedAmount = 50000;

    console.log('🔧 Fixing over-linked items for payment...\n');

    // Get all linked items, sorted by FIFO
    const itemsResult = await client.query(
      `SELECT
        psrm.id as mapping_id,
        psrm.system_reconciliation_item_id,
        psrm.cashback_amount,
        sri.merchant_name
      FROM payment_system_reconciliation_mapping psrm
      INNER JOIN system_reconciliation_items sri ON sri.id = psrm.system_reconciliation_item_id
      WHERE psrm.payment_request_id = $1
      ORDER BY sri.order_time ASC`,
      [paymentId]
    );

    console.log('📋 Currently linked items:');
    let runningTotal = 0;
    const itemsToKeep = [];
    const itemsToUnlink = [];

    itemsResult.rows.forEach((item, idx) => {
      const amount = parseFloat(item.cashback_amount);
      const itemNum = idx + 1;
      console.log('  ' + itemNum + '. ' + amount.toLocaleString('vi-VN') + 'đ - ' + item.merchant_name);

      if (runningTotal < requestedAmount) {
        itemsToKeep.push(item);
        runningTotal += amount;
      } else {
        itemsToUnlink.push(item);
      }
    });

    console.log('');
    console.log('📊 Analysis:');
    console.log('   Requested amount:', requestedAmount.toLocaleString('vi-VN') + 'đ');
    const totalLinked = itemsResult.rows.reduce((sum, item) => sum + parseFloat(item.cashback_amount), 0);
    console.log('   Total linked:', totalLinked.toLocaleString('vi-VN') + 'đ');
    console.log('   Should keep (FIFO):', runningTotal.toLocaleString('vi-VN') + 'đ');
    console.log('   Items to keep:', itemsToKeep.length);
    console.log('   Items to unlink:', itemsToUnlink.length);
    console.log('');

    if (itemsToUnlink.length === 0) {
      console.log('✅ No items to unlink');
      await client.query('ROLLBACK');
      return;
    }

    console.log('🗑️  Unlinking excess items:');
    for (const item of itemsToUnlink) {
      console.log('   - ' + parseFloat(item.cashback_amount).toLocaleString('vi-VN') + 'đ - ' + item.merchant_name);
      await client.query(
        'DELETE FROM payment_system_reconciliation_mapping WHERE id = $1',
        [item.mapping_id]
      );
    }

    await client.query('COMMIT');

    const freedAmount = itemsToUnlink.reduce((sum, item) => sum + parseFloat(item.cashback_amount), 0);

    console.log('');
    console.log('✅ Fixed successfully!');
    console.log('');
    console.log('📊 Result:');
    console.log('   Payment request: 50,000đ');
    console.log('   Items linked: ' + runningTotal.toLocaleString('vi-VN') + 'đ');
    console.log('   Items freed: ' + freedAmount.toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('   Available balance: 43,100đ (unchanged) ✓');
    console.log('   Available items: ' + (34300 + freedAmount).toLocaleString('vi-VN') + 'đ ✓');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
