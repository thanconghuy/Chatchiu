/**
 * Update Admin Notification Email
 *
 * Run: node update-admin-email.js your-admin@example.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function updateAdminEmail() {
  const adminEmail = process.argv[2];

  if (!adminEmail) {
    console.error('❌ Error: Please provide admin email');
    console.log('\nUsage: node update-admin-email.js your-admin@example.com');
    process.exit(1);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    console.error('❌ Error: Invalid email format');
    process.exit(1);
  }

  try {
    console.log('==========================================');
    console.log('Update Admin Notification Email');
    console.log('==========================================\n');

    console.log(`📧 New admin email: ${adminEmail}\n`);

    // Update admin email
    const result = await pool.query(`
      UPDATE system_settings
      SET setting_value = $1, updated_at = NOW()
      WHERE setting_key = 'admin_notification_email'
      RETURNING *
    `, [adminEmail]);

    if (result.rowCount === 0) {
      console.error('❌ Error: admin_notification_email setting not found');
      console.log('\nRun migration first: node run-email-migration.js');
      process.exit(1);
    }

    console.log('✅ Admin email updated successfully!\n');

    // Verify
    const verify = await pool.query(`
      SELECT setting_value
      FROM system_settings
      WHERE setting_key = 'admin_notification_email'
    `);

    console.log('📋 Current admin email:', verify.rows[0].setting_value);
    console.log('\n==========================================');
    console.log('✅ DONE!');
    console.log('==========================================\n');

    console.log('Next steps:');
    console.log('1. Restart backend server');
    console.log('2. Test email notifications\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  }
}

updateAdminEmail();
