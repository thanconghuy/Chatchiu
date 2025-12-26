// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔄 Running migration 032: Add Notification Settings...\n');

  try {
    // Read SQL file
    const sqlFile = path.join(__dirname, 'migrations', '032_add_notification_settings.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute migration
    await pool.query(sql);

    console.log('✅ Migration 032 completed successfully!');
    console.log('\n📊 Verification:');

    // Verify settings added
    const result = await pool.query(`
      SELECT setting_key, setting_value, description
      FROM system_settings
      WHERE category = 'notifications'
      ORDER BY setting_key
    `);

    console.log(`\n✓ Notification settings added: ${result.rows.length}`);
    result.rows.forEach(row => {
      console.log(`  - ${row.setting_key}: ${row.setting_value}`);
      console.log(`    ${row.description}`);
    });

    console.log('\n🎉 Migration 032 setup complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

runMigration();
