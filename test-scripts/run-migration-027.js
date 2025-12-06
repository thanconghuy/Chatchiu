/**
 * Run Migration 027: Enable Cron Jobs by Default
 *
 * This script inserts the default auto_cron_enabled setting into the database
 * to ensure cron jobs are enabled by default on server startup.
 */

require('dotenv').config();
const { pool } = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Migration 027: Enable Cron Jobs by Default');
  console.log('='.repeat(60));

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'backend', 'migrations', '027_add_default_auto_cron_enabled.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📄 Migration SQL:');
    console.log(migrationSQL);

    // Execute migration
    console.log('\n🔄 Executing migration...');
    const result = await pool.query(migrationSQL);

    console.log('\n✅ Migration executed successfully!');

    // Verify
    console.log('\n🔍 Verifying setting...');
    const verifyResult = await pool.query(
      "SELECT * FROM system_settings WHERE setting_key = 'auto_cron_enabled'"
    );

    if (verifyResult.rows.length > 0) {
      console.log('\n✅ Setting verified:');
      console.table(verifyResult.rows);
    } else {
      console.log('\n⚠️  Warning: Setting not found in database');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Restart server: npm start');
    console.log('2. Check logs for: "Auto Cron setting: true"');
    console.log('3. Go to admin/settings and verify cron jobs are running');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
