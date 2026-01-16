require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('=== CHẠY MIGRATION 041: Fix Missing Reconciliation Status ===\n');

    // Check current state
    const beforeResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE system_reconciliation_id IS NOT NULL
        AND system_reconciliation_status IS NULL
    `);

    const beforeCount = parseInt(beforeResult.rows[0].count);
    console.log(`Tìm thấy ${beforeCount} conversions cần fix...\n`);

    // Execute fix
    const fixResult = await pool.query(`
      UPDATE system_conversions
      SET
        system_reconciliation_status = 'reconciled',
        system_reconciled_at = COALESCE(system_reconciled_at, NOW())
      WHERE system_reconciliation_id IS NOT NULL
        AND system_reconciliation_status IS NULL
    `);

    console.log(`✅ Đã fix ${fixResult.rowCount} conversions!`);

    console.log('\n✅ Migration hoàn tất!');

    // Verify
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled_count,
        COUNT(*) FILTER (WHERE system_reconciliation_id IS NOT NULL AND system_reconciliation_status IS NULL) as missing_status_count
      FROM system_conversions
    `);

    const stats = verifyResult.rows[0];
    console.log('\n📊 KẾT QUẢ:');
    console.log(`  - Đã đối soát (status = 'reconciled'): ${stats.reconciled_count}`);
    console.log(`  - Còn thiếu status: ${stats.missing_status_count} ${stats.missing_status_count === '0' ? '✅' : '❌'}`);

    await pool.end();
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
