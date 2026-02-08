/**
 * Run Migration 066: Fix Balance Trigger - Restore Reconciled Check
 *
 * This migration fixes the sync_user_balance_on_conversion() trigger
 * to only update total_earned from RECONCILED conversions.
 *
 * Issue: Migration 065 simplified the trigger and removed reconciled check
 * Fix: Restore logic from migration 063
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./config/database');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Migration 066: Fix Balance Trigger - Restore Reconciled Check');
  console.log('='.repeat(60));

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // 1. Show current state before migration
    console.log('\n📊 Current state BEFORE migration:');

    const beforeStats = await client.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(total_earned) as sum_total_earned,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE status = 'approved' AND system_reconciliation_status = 'reconciled'
        ) as correct_total
      FROM user_system_balance
    `);

    const before = beforeStats.rows[0];
    console.log(`   - Users with balance: ${before.total_users}`);
    console.log(`   - Current sum(total_earned): ${parseFloat(before.sum_total_earned || 0).toLocaleString('vi-VN')}đ`);
    console.log(`   - Correct sum (reconciled only): ${parseFloat(before.correct_total || 0).toLocaleString('vi-VN')}đ`);
    console.log(`   - Difference: ${(parseFloat(before.sum_total_earned || 0) - parseFloat(before.correct_total || 0)).toLocaleString('vi-VN')}đ`);

    // 2. Read and execute migration SQL
    console.log('\n📄 Reading migration file...');
    const migrationPath = path.join(__dirname, 'migrations', '066_fix_balance_trigger_reconciled_check.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔧 Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully');

    // 3. Show state after migration
    console.log('\n📊 State AFTER migration:');

    const afterStats = await client.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(total_earned) as sum_total_earned,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE status = 'approved' AND system_reconciliation_status = 'reconciled'
        ) as correct_total
      FROM user_system_balance
    `);

    const after = afterStats.rows[0];
    console.log(`   - Users with balance: ${after.total_users}`);
    console.log(`   - New sum(total_earned): ${parseFloat(after.sum_total_earned || 0).toLocaleString('vi-VN')}đ`);
    console.log(`   - Correct sum (reconciled only): ${parseFloat(after.correct_total || 0).toLocaleString('vi-VN')}đ`);
    console.log(`   - Difference: ${(parseFloat(after.sum_total_earned || 0) - parseFloat(after.correct_total || 0)).toLocaleString('vi-VN')}đ`);

    // 4. Verify trigger function
    console.log('\n🔍 Verifying trigger function...');
    const triggerCheck = await client.query(`
      SELECT routine_definition
      FROM information_schema.routines
      WHERE routine_name = 'sync_user_balance_on_conversion'
    `);

    if (triggerCheck.rows.length > 0) {
      const definition = triggerCheck.rows[0].routine_definition;
      if (definition.includes('system_reconciliation_status')) {
        console.log('   ✅ Trigger contains reconciled status check');
      } else {
        console.log('   ⚠️  Warning: Trigger may not have reconciled check');
      }
    }

    console.log('\n✅ Migration 066 completed successfully!');
    console.log('\nSUMMARY:');
    console.log('- Trigger now only syncs RECONCILED conversions to total_earned');
    console.log('- All user balances have been re-synced');
    console.log('- available_balance = total_earned - total_withdrawn - pending_reserved');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration().catch(console.error);
