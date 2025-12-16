/**
 * Run Auto-Sync Migration 029: Add User Info to get_eligible_conversions_for_waiting_list()
 *
 * This migration updates the database function to include user email and full name
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('🚀 Running Auto-Sync Migration 029...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'backend/migrations/029_update_autosync_add_user_info.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file:', migrationPath);
    console.log('📝 Executing SQL...\n');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Testing function...\n');

    // Test function
    const testResult = await pool.query('SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 5');

    console.log(`✅ Function returns ${testResult.rows.length} rows`);
    if (testResult.rows.length > 0) {
      console.log('\n📋 Sample row:');
      console.log(JSON.stringify(testResult.rows[0], null, 2));

      // Check if user fields exist
      const firstRow = testResult.rows[0];
      if (firstRow.user_email || firstRow.user_full_name) {
        console.log('\n✅ User info fields (user_email, user_full_name) are present!');
      } else {
        console.log('\n⚠️  Warning: User info fields are NULL (might not have user data in this conversion)');
      }
    } else {
      console.log('\nℹ️  No eligible orders found. This is normal if:');
      console.log('   - All approved orders are already in waiting list');
      console.log('   - No orders have passed 15-day eligibility period');
    }

  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);
    if (error.detail) {
      console.error('Detail:', error.detail);
    }
    if (error.hint) {
      console.error('Hint:', error.hint);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
