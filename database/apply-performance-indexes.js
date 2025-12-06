require('dotenv').config();
const { pool } = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

/**
 * Apply Performance Indexes Migration
 *
 * This script applies database indexes to improve query performance
 * Run this script once to add all necessary indexes
 */

async function applyPerformanceIndexes() {
  console.log('='.repeat(60));
  console.log('APPLYING PERFORMANCE INDEXES MIGRATION');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '008_add_performance_indexes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📋 Migration file loaded:', migrationPath);
    console.log('');

    // Split by statements (simple split by ;)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    console.log('');

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and SELECT statements (verification queries)
      if (statement.startsWith('--') || statement.trim().startsWith('/*')) {
        continue;
      }

      // Extract index name for better logging
      const indexMatch = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/i);
      const indexName = indexMatch ? indexMatch[1] : `Statement ${i + 1}`;

      try {
        await pool.query(statement);
        successCount++;
        console.log(`✅ ${indexName}`);
      } catch (error) {
        errorCount++;
        console.error(`❌ ${indexName}:`, error.message);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('');

    // Verify indexes
    console.log('Verifying indexes...');
    const verifyQuery = `
      SELECT
        tablename,
        COUNT(*) as index_count
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN (
        'conversions',
        'user_payment_details',
        'user_payment_history',
        'users',
        'user_system_balance',
        'activity_logs'
      )
      GROUP BY tablename
      ORDER BY tablename;
    `;

    const result = await pool.query(verifyQuery);

    console.log('');
    console.log('Index Count by Table:');
    console.log('-'.repeat(40));
    result.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.index_count} indexes`);
    });

    console.log('');
    console.log('🎉 Migration completed successfully!');
    console.log('');
    console.log('Performance improvements:');
    console.log('  - Faster JOIN operations');
    console.log('  - Faster filtering by status, period, type');
    console.log('  - Faster sorting by date fields');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
applyPerformanceIndexes()
  .then(() => {
    console.log('Migration script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
