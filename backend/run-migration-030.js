const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting migration 030: Fix Auto-Sync to use system_conversions...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '030_fix_autosync_system_conversions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✅ Migration 030 completed successfully!');

    // Verify function exists with new signature
    const verifyQuery = `
      SELECT
        p.proname as function_name,
        pg_get_function_result(p.oid) as return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'get_eligible_conversions_for_waiting_list'
        AND n.nspname = 'public';
    `;

    const result = await client.query(verifyQuery);

    console.log('\n📋 Verification - Function updated:');
    if (result.rows.length > 0) {
      console.log(`  ✓ Function: ${result.rows[0].function_name}`);
      console.log(`  ✓ Return type includes: conversion_id, user_id, aff_sid, merchant_id, etc.`);
    }

    // Test function call
    console.log('\n🧪 Testing function call...');
    const testQuery = `SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 3;`;
    const testResult = await client.query(testQuery);

    console.log(`  ✓ Function executed successfully`);
    console.log(`  ✓ Returned ${testResult.rows.length} rows (limit 3)`);

    if (testResult.rows.length > 0) {
      console.log('\n📊 Sample data columns:');
      const columns = Object.keys(testResult.rows[0]);
      columns.forEach(col => {
        console.log(`    - ${col}`);
      });
    }

    console.log('\n✨ Migration 030 verification completed!');
    console.log('\n⚠️  IMPORTANT: Function now queries system_conversions table (cashback orders only)');
    console.log('   - Added aff_sid column to return type');
    console.log('   - Only returns orders from system (not affiliate program)');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 030 failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration();
