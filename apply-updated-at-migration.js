/**
 * Apply migration 034: Add updated_at to system_reconciliations
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  console.log('\n========================================');
  console.log('📦 Applying Migration 034');
  console.log('========================================\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '034_add_updated_at_to_system_reconciliations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('1. Checking current schema...');
    const schemaCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'system_reconciliations'
        AND column_name = 'updated_at'
    `);

    if (schemaCheck.rows.length > 0) {
      console.log('   ⚠️  Column updated_at already exists');
      console.log('   Current type:', schemaCheck.rows[0].data_type);
      console.log('   Skipping migration.\n');
      await pool.end();
      return;
    }

    console.log('   ✅ Column does not exist yet\n');

    // Apply migration
    console.log('2. Running migration SQL...');
    await pool.query(sql);
    console.log('   ✅ Migration SQL executed\n');

    // Verify
    console.log('3. Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'system_reconciliations'
        AND column_name = 'updated_at'
    `);

    if (verifyResult.rows.length === 0) {
      throw new Error('Migration verification failed: updated_at column not found');
    }

    const column = verifyResult.rows[0];
    console.log('   Column name:', column.column_name);
    console.log('   Data type:', column.data_type);
    console.log('   Nullable:', column.is_nullable);
    console.log('   Default:', column.column_default || 'CURRENT_TIMESTAMP');
    console.log('   ✅ Migration verified\n');

    // Check trigger
    console.log('4. Checking trigger...');
    const triggerCheck = await pool.query(`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE event_object_table = 'system_reconciliations'
        AND trigger_name = 'trigger_update_system_reconciliation_timestamp'
    `);

    if (triggerCheck.rows.length > 0) {
      console.log('   ✅ Trigger exists:', triggerCheck.rows[0].trigger_name);
    } else {
      console.log('   ⚠️  Trigger not found');
    }

    console.log('\n========================================');
    console.log('✅ Migration 034 Applied Successfully');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

applyMigration();
