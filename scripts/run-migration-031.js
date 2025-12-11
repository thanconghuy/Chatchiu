const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/config/database');

/**
 * Run Migration 031: Add resubmitted_at tracking column
 */
async function runMigration() {
  console.log('\n🚀 Running Migration 031: Add resubmitted_at tracking column\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../backend/migrations/031_add_resubmitted_tracking.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing SQL...\n');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration executed successfully!');
    console.log('\nAdded column:');
    console.log('  - resubmitted_at (TIMESTAMPTZ)');
    console.log('\nPurpose:');
    console.log('  - Track when a cancelled payment request was resubmitted');
    console.log('  - Distinguish between cancelled requests that haven\'t been resubmitted vs those that have');

    // Verify the column was added
    console.log('\n🔍 Verifying column...');
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment_requests'
        AND column_name = 'resubmitted_at'
      ORDER BY column_name;
    `);

    if (result.rows.length === 1) {
      console.log('✅ Column verified:');
      result.rows.forEach(row => {
        console.log(`  ✓ ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    } else {
      console.warn(`⚠️  Expected 1 column, found ${result.rows.length}`);
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
