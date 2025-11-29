require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  try {
    console.log('Running migration 020: Create auto_sync_history tables...');

    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrations', '020_create_auto_sync_history.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute migration
    await pool.query(sql);

    console.log('✅ Migration 020 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
