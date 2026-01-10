/**
 * Fix payment_requests amount constraint to use 50,000 VND minimum
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

async function fixConstraint() {
  const client = await pool.connect();

  try {
    console.log('🔄 Fixing payment_requests amount constraint...\n');

    // 1. Check current constraint
    console.log('1. Checking current constraint...');
    const checkQuery = `
      SELECT pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conname = 'payment_requests_requested_amount_check'
        AND n.nspname = 'public'
    `;
    const checkResult = await client.query(checkQuery);

    if (checkResult.rows.length > 0) {
      console.log('   Current constraint:', checkResult.rows[0].definition);
    } else {
      console.log('   ⚠ Constraint not found');
    }

    // 2. Drop old constraint
    console.log('\n2. Dropping old constraint...');
    await client.query(`
      ALTER TABLE payment_requests
      DROP CONSTRAINT IF EXISTS payment_requests_requested_amount_check
    `);
    console.log('   ✓ Old constraint dropped');

    // 3. Add new constraint with 50,000 minimum
    console.log('\n3. Adding new constraint (minimum 50,000 VND)...');
    await client.query(`
      ALTER TABLE payment_requests
      ADD CONSTRAINT payment_requests_requested_amount_check
      CHECK (requested_amount >= 50000)
    `);
    console.log('   ✓ New constraint added');

    // 4. Verify new constraint
    console.log('\n4. Verifying new constraint...');
    const verifyResult = await client.query(checkQuery);
    console.log('   New constraint:', verifyResult.rows[0].definition);

    console.log('\n✅ Constraint update completed successfully!');
    console.log('   Payment requests can now be created with amounts >= 50,000 VND');

  } catch (error) {
    console.error('❌ Error fixing constraint:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixConstraint().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
