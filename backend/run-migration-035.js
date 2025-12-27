const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  try {
    console.log('🔄 Running Migration 035: Add Payment Stats Indexes...');

    const migrationPath = path.join(__dirname, 'migrations', '035_add_payment_stats_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration 035 completed successfully!');
    console.log('📊 Payment stats indexes created');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration 035 failed:', error);
    process.exit(1);
  }
}

runMigration();
