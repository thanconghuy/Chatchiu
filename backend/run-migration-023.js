require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  try {
    console.log('Running migration 023: Add sub1, sub2, sub3 to clicks table...');

    const sqlPath = path.join(__dirname, 'migrations', '023_add_sub_params_to_clicks.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);

    console.log('✅ Migration 023 completed successfully!');
    console.log('   - Added sub1 column (User ID backup)');
    console.log('   - Added sub2 column (Click ID - PRIMARY for matching)');
    console.log('   - Added sub3 column (Click type)');
    console.log('   - Created indexes for conversion matching');
    console.log('');
    console.log('⚠️  IMPORTANT: sub2 is the PRIMARY parameter for conversion matching!');
    console.log('   When AccessTrade sends conversion data, we match using sub2 = click_id');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
