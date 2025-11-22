/**
 * Run Migration 015: User Balance Transactions Table
 *
 * Usage: node backend/run-migration-015.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./config/database');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Running Migration 015: User Balance Transactions');
  console.log('='.repeat(60));
  console.log();

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '015_create_user_balance_transactions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    console.log('Executing migration...');
    await pool.query(sql);
    console.log('✅ Migration executed successfully');
    console.log();

    // Verify table creation
    console.log('Verifying table creation...');
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'user_balance_transactions'
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ Table user_balance_transactions created');
    } else {
      console.log('❌ Table user_balance_transactions not found');
    }

    // Show table structure
    console.log('\nTable structure:');
    const columns = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_balance_transactions'
      ORDER BY ordinal_position
    `);

    console.table(columns.rows);

    // Show indexes
    console.log('\nIndexes:');
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'user_balance_transactions'
    `);

    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });

    // Show statistics
    console.log('\nStatistics:');
    const stats = await pool.query(`
      SELECT COUNT(*) as total_transactions
      FROM user_balance_transactions
    `);

    console.log(`  Total transactions: ${stats.rows[0].total_transactions}`);

    console.log();
    console.log('='.repeat(60));
    console.log('Migration 015 completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
