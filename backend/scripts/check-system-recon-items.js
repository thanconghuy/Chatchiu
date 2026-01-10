const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Kiểm tra system_conversions vs system_reconciliation_items\n');

    // 1. Total from system_conversions
    const conversionsResult = await client.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total,
        COALESCE(SUM(CASE WHEN system_reconciliation_id IS NOT NULL THEN cashback_amount ELSE 0 END), 0) as reconciled,
        COALESCE(SUM(CASE WHEN system_reconciliation_id IS NULL THEN cashback_amount ELSE 0 END), 0) as not_reconciled
      FROM system_conversions
      WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );

    console.log('📊 system_conversions (approved):');
    console.log('   Count:', conversionsResult.rows[0].count);
    console.log('   Total:', parseFloat(conversionsResult.rows[0].total).toLocaleString('vi-VN') + 'đ');
    console.log('   Đã đối soát:', parseFloat(conversionsResult.rows[0].reconciled).toLocaleString('vi-VN') + 'đ');
    console.log('   Chưa đối soát:', parseFloat(conversionsResult.rows[0].not_reconciled).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 2. Total from system_reconciliation_items
    const itemsResult = await client.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(sri.cashback_amount), 0) as total,
        COALESCE(SUM(CASE WHEN psrm.id IS NOT NULL THEN sri.cashback_amount ELSE 0 END), 0) as linked,
        COALESCE(SUM(CASE WHEN psrm.id IS NULL THEN sri.cashback_amount ELSE 0 END), 0) as not_linked
      FROM system_reconciliation_items sri
      INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      LEFT JOIN payment_system_reconciliation_mapping psrm ON psrm.system_reconciliation_item_id = sri.id
      WHERE sri.user_id = $1
        AND sr.status IN ('finalized', 'paid')
        AND sri.conversion_status = 'approved'`,
      [userId]
    );

    console.log('📦 system_reconciliation_items (finalized/paid):');
    console.log('   Count:', itemsResult.rows[0].count);
    console.log('   Total:', parseFloat(itemsResult.rows[0].total).toLocaleString('vi-VN') + 'đ');
    console.log('   Đã link với payment:', parseFloat(itemsResult.rows[0].linked).toLocaleString('vi-VN') + 'đ');
    console.log('   Chưa link:', parseFloat(itemsResult.rows[0].not_linked).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 3. Calculate discrepancy
    const totalConversions = parseFloat(conversionsResult.rows[0].total);
    const totalItems = parseFloat(itemsResult.rows[0].total);
    const discrepancy = totalConversions - totalItems;

    console.log('🧮 So sánh:');
    console.log('   system_conversions (approved):', totalConversions.toLocaleString('vi-VN') + 'đ');
    console.log('   system_reconciliation_items:', totalItems.toLocaleString('vi-VN') + 'đ');
    console.log('   Chênh lệch:', discrepancy.toLocaleString('vi-VN') + 'đ');
    console.log('');

    if (Math.abs(discrepancy) > 0.01) {
      console.log('⚠️  CÓ CHÊNH LỆCH!');
      console.log('   → Có cashback đã approved nhưng chưa được đối soát (chưa có trong reconciliation items)');
    } else {
      console.log('✅ Không có chênh lệch');
    }

  } finally {
    client.release();
    await pool.end();
  }
})();
