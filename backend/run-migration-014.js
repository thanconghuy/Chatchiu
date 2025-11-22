/**
 * Migration Runner for 014: System Reconciliation Module
 *
 * Purpose: Create tables for internal reconciliation system (month + 15 days)
 * This is a NEW module that doesn't affect existing reconciliation (API-based)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/chatchiu',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function runMigration() {
  console.log('🚀 Starting Migration 014: System Reconciliation Module\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '014_create_system_reconciliation.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded successfully');
    console.log('📊 Creating tables for System Reconciliation...\n');

    // Execute migration
    await pool.query(sql);

    console.log('✅ Migration 014 completed successfully!\n');
    console.log('📋 Created tables:');
    console.log('   - system_reconciliations');
    console.log('   - system_reconciliation_items');
    console.log('   - system_reconciliation_logs');
    console.log('   - user_system_balance\n');

    // Verify tables were created
    const verifyQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'system_reconciliations',
          'system_reconciliation_items',
          'system_reconciliation_logs',
          'user_system_balance'
        )
      ORDER BY table_name;
    `;

    const result = await pool.query(verifyQuery);

    console.log('🔍 Verification:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    if (result.rows.length === 4) {
      console.log('\n✅ All tables created successfully!');
    } else {
      console.warn('\n⚠️  Warning: Some tables may not have been created');
    }

    // Show table details
    console.log('\n📊 Table Statistics:');

    const statsQueries = [
      {
        name: 'system_reconciliations',
        query: `SELECT COUNT(*) as count FROM system_reconciliations`
      },
      {
        name: 'system_reconciliation_items',
        query: `SELECT COUNT(*) as count FROM system_reconciliation_items`
      },
      {
        name: 'user_system_balance',
        query: `SELECT COUNT(*) as count FROM user_system_balance`
      }
    ];

    for (const { name, query } of statsQueries) {
      const { rows } = await pool.query(query);
      console.log(`   ${name}: ${rows[0].count} rows`);
    }

    console.log('\n📚 Next Steps:');
    console.log('   1. Phase 2: Build Backend Services');
    console.log('   2. Phase 3: Create Scheduled Jobs');
    console.log('   3. Phase 4: Build Admin UI');
    console.log('   4. Phase 5: Build User UI');
    console.log('   5. Phase 6: Implement API Sync\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
