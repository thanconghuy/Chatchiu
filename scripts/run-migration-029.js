const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

/**
 * Run Migration 029: Add encryption columns to payment_requests
 */
async function runMigration() {
  console.log('\n🚀 Running Migration 029: Add encryption columns to payment_requests\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../backend/migrations/029_add_encryption_columns_to_payment_requests.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing SQL...\n');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration executed successfully!');
    console.log('\nAdded columns:');
    console.log('  - bank_account_number_encrypted (TEXT)');
    console.log('  - bank_account_number_hash (TEXT)');
    console.log('  - bank_account_name_encrypted (TEXT)');
    console.log('  - encryption_version (INTEGER)');
    console.log('  - last_decrypted_at (TIMESTAMPTZ)');
    console.log('  - last_decrypted_by (UUID)');
    console.log('  - decrypt_count (INTEGER)');
    console.log('\nCreated indexes:');
    console.log('  - idx_payment_requests_bank_account_hash');
    console.log('  - idx_payment_requests_last_decrypted_by');

    // Verify the columns were added
    console.log('\n🔍 Verifying columns...');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment_requests'
        AND column_name IN (
          'bank_account_number_encrypted',
          'bank_account_number_hash',
          'bank_account_name_encrypted',
          'encryption_version',
          'last_decrypted_at',
          'last_decrypted_by',
          'decrypt_count'
        )
      ORDER BY column_name;
    `);

    if (result.rows.length === 7) {
      console.log('✅ All columns verified:');
      result.rows.forEach(row => {
        console.log(`  ✓ ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    } else {
      console.warn(`⚠️  Expected 7 columns, found ${result.rows.length}`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }

  console.log('\n✅ Migration completed successfully!\n');
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runMigration };
