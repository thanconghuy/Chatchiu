require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  try {
    console.log('Running migration 024: Add OAuth fields to users table...');

    const sqlPath = path.join(__dirname, 'migrations', '024_add_oauth_fields_to_users.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration 024 completed successfully!');
    console.log('');
    console.log('Added OAuth fields to users table:');
    console.log('   - google_id: For Google OAuth users');
    console.log('   - oauth_provider: Generic provider (google, facebook, apple, etc.)');
    console.log('   - oauth_id: Generic OAuth ID');
    console.log('   - profile_picture: User avatar from OAuth');
    console.log('   - email_verified: Auto-verified for OAuth users');
    console.log('');
    console.log('✅ password_hash is now NULLABLE (OAuth users don\'t need password)');
    console.log('✅ Added constraint: Users must have password OR OAuth');
    console.log('✅ Created indexes for fast OAuth lookups');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
