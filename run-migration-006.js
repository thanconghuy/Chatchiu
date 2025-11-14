// Run migration 006: Add sub parameters to clicks table
require('dotenv').config();
const { pool } = require('./backend/config/database');
const fs = require('fs');

async function runMigration() {
  try {
    console.log('🔄 Running migration 006: Add sub parameters to clicks table...');

    const sql = fs.readFileSync('./migrations/006-add-sub-parameters-to-clicks.sql', 'utf8');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📊 Checking new columns...');

    // Verify columns exist
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'clicks'
      AND column_name IN ('sub1', 'sub2', 'sub3', 'sub4')
      ORDER BY column_name
    `);

    console.log('New columns in clicks table:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
