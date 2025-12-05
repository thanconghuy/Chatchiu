require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  try {
    console.log('Running migration 022: Add link_source to clicks table...');

    const sqlPath = path.join(__dirname, 'migrations', '022_add_link_source_to_clicks.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration 022 completed successfully!');
    console.log('   - Added link_source column to clicks table');
    console.log('   - Created index on link_source');
    console.log('   - Updated existing rows with default value "diy"');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
