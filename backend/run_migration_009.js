const { pool } = require('./config/database');
const fs = require('fs');

async function runMigration() {
  try {
    const sql = fs.readFileSync('./migrations/009_create_system_settings.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migration 009 applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
