const { pool } = require('./config/database');
const fs = require('fs');

async function runMigration() {
  try {
    const sql = fs.readFileSync('./migrations/008_create_user_activity_logs.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migration 008 applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
