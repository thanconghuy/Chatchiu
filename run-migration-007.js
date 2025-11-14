// Run migration 007: Add timestamp tracking to clicks table
require('dotenv').config();
const { pool } = require('./backend/config/database');
const fs = require('fs');

async function runMigration() {
  try {
    console.log('🔄 Running migration 007: Add timestamp tracking to clicks table...');

    const sql = fs.readFileSync('./migrations/007-add-timestamp-tracking-to-clicks.sql', 'utf8');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📊 Checking new columns...');

    // Verify columns exist
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'clicks'
      AND column_name IN ('link_clicked_at', 'link_expires_at', 'last_checked_at')
      ORDER BY column_name
    `);

    console.log('New timestamp columns in clicks table:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`);
    });

    // Check sample data
    console.log('\n📋 Sample data from recent clicks:');
    const sampleResult = await pool.query(`
      SELECT
        id,
        link_clicked_at,
        link_expires_at,
        last_checked_at,
        clicked_at
      FROM clicks
      ORDER BY clicked_at DESC
      LIMIT 3
    `);

    sampleResult.rows.forEach((row, i) => {
      console.log(`\nClick ${i + 1}:`);
      console.log(`  ID: ${row.id}`);
      console.log(`  Clicked At: ${row.clicked_at}`);
      console.log(`  Link Clicked At: ${row.link_clicked_at}`);
      console.log(`  Link Expires At: ${row.link_expires_at}`);
      console.log(`  Last Checked At: ${row.last_checked_at || 'Not checked yet'}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
