/**
 * Run Email Templates Migration
 */

// Load environment variables from parent directory
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('==========================================');
  console.log('Email Templates Migration');
  console.log('==========================================\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add_payment_email_templates.sql');
    console.log('📄 Reading:', migrationPath);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('✓ File loaded\n');

    // Execute migration
    console.log('🚀 Executing migration...');
    await pool.query(sql);
    console.log('✓ Migration executed!\n');

    // Verify templates
    console.log('🔍 Verifying templates...\n');
    const result = await pool.query(`
      SELECT setting_key, LENGTH(setting_value) as content_length, description
      FROM system_settings
      WHERE setting_key LIKE 'email_template_payment%'
         OR setting_key = 'admin_notification_email'
      ORDER BY setting_key
    `);

    console.log('📋 Templates in database:');
    console.log('==========================================');
    result.rows.forEach(row => {
      console.log(`✓ ${row.setting_key}`);
      console.log(`  Length: ${row.content_length} chars`);
      console.log('');
    });

    console.log('==========================================');
    console.log('✅ SUCCESS!');
    console.log('==========================================\n');

    console.log('📧 Next: Update admin email');
    console.log("   UPDATE system_settings SET setting_value = 'your-admin@example.com'");
    console.log("   WHERE setting_key = 'admin_notification_email';\n");

    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
