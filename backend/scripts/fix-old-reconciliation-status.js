/**
 * Fix Old Reconciliation Status
 *
 * Update system_conversions.system_reconciliation_id for orders that were
 * reconciled BEFORE the fix was applied.
 *
 * This script links system_conversions to system_reconciliation_items
 * by matching conversion_id or system_conversion_id.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function fixOldReconciliationStatus() {
  const client = await pool.connect();

  try {
    console.log('🔧 Starting fix for old reconciliation status...\n');

    await client.query('BEGIN');

    // Find all system_conversions that should have system_reconciliation_id
    // but currently don't
    const updateQuery = `
      UPDATE system_conversions sc
      SET system_reconciliation_id = sri.system_reconciliation_id
      FROM system_reconciliation_items sri
      WHERE (
        sc.id = sri.system_conversion_id
        OR sc.id::text = sri.conversion_id::text
      )
      AND sc.system_reconciliation_id IS NULL
      AND sri.system_reconciliation_id IS NOT NULL
    `;

    const result = await client.query(updateQuery);

    console.log(`✅ Updated ${result.rowCount} system_conversions with reconciliation IDs\n`);

    // Verify the results
    const verifyQuery = `
      SELECT
        COUNT(*) FILTER (WHERE sc.system_reconciliation_id IS NOT NULL) as with_recon_id,
        COUNT(*) FILTER (WHERE sc.system_reconciliation_id IS NULL) as without_recon_id,
        COUNT(*) as total
      FROM system_conversions sc
      WHERE sc.status = 'approved'
    `;

    const verifyResult = await client.query(verifyQuery);
    const stats = verifyResult.rows[0];

    console.log('📊 Current Status:');
    console.log(`   - Total approved conversions: ${stats.total}`);
    console.log(`   - With reconciliation ID: ${stats.with_recon_id}`);
    console.log(`   - Without reconciliation ID: ${stats.without_recon_id}`);

    await client.query('COMMIT');

    console.log('\n✅ Fix completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing old reconciliation status:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixOldReconciliationStatus()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
