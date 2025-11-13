/**
 * Run Reconciliation Migrations
 * Script to execute all reconciliation-related database migrations
 *
 * Usage: node migrations/run-reconciliation-migrations.js
 */

const fs = require('fs');
const path = require('path');
const { pool, testConnection, closePool } = require('../backend/config/database');

// Migration files in order
const MIGRATION_FILES = [
  '001-add-reconciliation-fields-to-conversions.sql',
  '002-create-reconciliations-table.sql',
  '003-create-reconciliation-items-table.sql',
  '004-create-reconciliation-logs-table.sql',
  '005-create-payments-table.sql'
];

/**
 * Execute a single migration file
 */
async function executeMigration(filename) {
  const filePath = path.join(__dirname, filename);

  console.log(`\n📄 Executing: ${filename}`);

  try {
    // Read SQL file
    const sql = fs.readFileSync(filePath, 'utf8');

    // Execute SQL
    await pool.query(sql);

    console.log(`✅ Success: ${filename}`);
    return { file: filename, status: 'success' };
  } catch (error) {
    console.error(`❌ Failed: ${filename}`);
    console.error(`   Error: ${error.message}`);
    return { file: filename, status: 'failed', error: error.message };
  }
}

/**
 * Main migration runner
 */
async function runMigrations() {
  console.log('🚀 Starting Reconciliation Module Migrations...\n');
  console.log('=' .repeat(60));

  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    const connected = await testConnection();

    if (!connected) {
      throw new Error('Cannot connect to database. Please check DATABASE_URL in .env');
    }

    console.log('✅ Database connection successful\n');
    console.log('=' .repeat(60));

    // Execute migrations
    const results = [];

    for (const filename of MIGRATION_FILES) {
      const result = await executeMigration(filename);
      results.push(result);

      // Stop on first error
      if (result.status === 'failed') {
        console.log('\n⚠️  Migration stopped due to error');
        break;
      }
    }

    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Migration Summary:');
    console.log('=' .repeat(60));

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`\n✅ Successful: ${successful}/${MIGRATION_FILES.length}`);
    console.log(`❌ Failed: ${failed}/${MIGRATION_FILES.length}`);

    if (failed > 0) {
      console.log('\n⚠️  Some migrations failed. Please check the errors above.');
      console.log('\nFailed migrations:');
      results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`  • ${r.file}: ${r.error}`);
        });
    } else {
      console.log('\n🎉 All migrations completed successfully!');
      console.log('\n📝 New tables created:');
      console.log('  • reconciliations - Quản lý kỳ đối soát');
      console.log('  • reconciliation_items - Chi tiết đơn hàng trong kỳ đối soát');
      console.log('  • reconciliation_logs - Audit trail các thao tác');
      console.log('  • payments - Quản lý thanh toán (schema only)');
      console.log('\n📝 Updated tables:');
      console.log('  • conversions - Thêm fields: is_confirmed, confirmed_time, order_approved/pending/reject');
    }

    console.log('\n' + '=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations, executeMigration };
