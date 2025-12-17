const fs = require('fs').promises;
const path = require('path');
const { pool } = require('./config/database');

/**
 * Run Migration 034: Create Email Logs Table
 *
 * Usage:
 *   node backend/run-migration-034.js
 */

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting Migration 034: Create Email Logs Table...');

    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrations', '034_create_email_logs.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    // Begin transaction
    await client.query('BEGIN');

    // Execute migration
    await client.query(sql);

    // Commit transaction
    await client.query('COMMIT');

    console.log('✅ Migration 034 completed successfully!');
    console.log('\nCreated:');
    console.log('  - Table: email_logs');
    console.log('  - Indexes: 6 indexes for performance');
    console.log('  - Views: v_email_stats_by_type, v_recent_failed_emails, v_email_delivery_rate');
    console.log('  - Functions: get_email_stats, get_user_email_history, cleanup_old_email_logs');

    // Verify table creation
    const verifyResult = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'email_logs'
    `);

    if (verifyResult.rows[0].count === '1') {
      console.log('\n✅ Verification: email_logs table exists');
    } else {
      console.error('\n❌ Verification failed: email_logs table not found');
    }

    // Show table structure
    const structureResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'email_logs'
      ORDER BY ordinal_position
    `);

    console.log('\nTable Structure:');
    structureResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration script error:', error);
    process.exit(1);
  });
