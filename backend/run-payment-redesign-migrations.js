const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Running Payment Redesign Migrations...\n');

    // Migration 060: Add idempotency to payment_requests
    console.log('Running Migration 060: Add idempotency to payment_requests...');
    const migration060Path = path.join(__dirname, 'migrations', '060_add_idempotency_to_payment_requests.sql');
    const sql060 = fs.readFileSync(migration060Path, 'utf8');
    await client.query(sql060);
    console.log('✓ Migration 060 completed\n');

    // Migration 061: Create balance_transactions
    console.log('Running Migration 061: Create balance_transactions...');
    const migration061Path = path.join(__dirname, 'migrations', '061_create_balance_transactions.sql');
    const sql061 = fs.readFileSync(migration061Path, 'utf8');
    await client.query(sql061);
    console.log('✓ Migration 061 completed\n');

    // Migration 062: Create balance trigger
    console.log('Running Migration 062: Create balance trigger...');
    const migration062Path = path.join(__dirname, 'migrations', '062_create_balance_trigger.sql');
    const sql062 = fs.readFileSync(migration062Path, 'utf8');
    await client.query(sql062);
    console.log('✓ Migration 062 completed\n');

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigrations();
