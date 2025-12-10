/**
 * Apply Auto-Sync Migration (028_create_reconciliation_waiting_list)
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./backend/config/database');

async function applyMigration() {
  try {
    console.log('Starting migration application...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '028_create_reconciliation_waiting_list.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration SQL...');
    await pool.query(migrationSQL);

    console.log('✅ Migration 028 applied successfully!');
    console.log('\nCreated:');
    console.log('  - Table: reconciliation_waiting_list');
    console.log('  - Function: get_eligible_conversions_for_waiting_list()');
    console.log('  - Function: add_eligible_conversions_to_waiting_list()');
    console.log('  - Function: get_waiting_list_summary()');
    console.log('  - Function: move_from_waiting_to_reconciliation()');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
