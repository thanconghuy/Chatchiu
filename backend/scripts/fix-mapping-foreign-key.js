/**
 * Fix payment_system_reconciliation_mapping foreign key to reference system_conversions
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

async function fixForeignKey() {
  const client = await pool.connect();

  try {
    console.log('🔧 Fixing payment_system_reconciliation_mapping foreign key...\n');

    await client.query('BEGIN');

    // 1. Drop old foreign key constraint
    console.log('1. Dropping old foreign key constraint...');
    await client.query(`
      ALTER TABLE payment_system_reconciliation_mapping
      DROP CONSTRAINT IF EXISTS payment_system_reconciliation_mapping_conversion_id_fkey
    `);
    console.log('   ✓ Old constraint dropped\n');

    // 2. Clean up invalid data (conversion_ids not in system_conversions)
    console.log('2. Cleaning up invalid conversion_ids...');
    const deleteResult = await client.query(`
      DELETE FROM payment_system_reconciliation_mapping
      WHERE conversion_id IS NOT NULL
        AND conversion_id NOT IN (SELECT id FROM system_conversions)
    `);
    console.log(`   ✓ Deleted ${deleteResult.rowCount} invalid rows\n`);

    // 3. Add new foreign key constraint to system_conversions
    console.log('3. Adding new foreign key to system_conversions...');
    await client.query(`
      ALTER TABLE payment_system_reconciliation_mapping
      ADD CONSTRAINT payment_system_reconciliation_mapping_conversion_id_fkey
      FOREIGN KEY (conversion_id) REFERENCES system_conversions(id)
      ON DELETE RESTRICT
    `);
    console.log('   ✓ New constraint added\n');

    await client.query('COMMIT');

    // 4. Verify
    console.log('4. Verifying new constraint...');
    const verifyQuery = `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'payment_system_reconciliation_mapping'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'conversion_id'
    `;

    const result = await client.query(verifyQuery);
    if (result.rows.length > 0) {
      console.log(`   ✓ ${result.rows[0].column_name} -> ${result.rows[0].foreign_table_name}.${result.rows[0].foreign_column_name}`);
    }

    console.log('\n✅ Foreign key update completed successfully!');
    console.log('   conversion_id now references system_conversions.id instead of conversions.id');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing foreign key:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixForeignKey();
