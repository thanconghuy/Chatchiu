require('dotenv').config();
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Running migrations...');

    // Migration 1: OAuth and reset fields
    const migration1Path = path.join(__dirname, '..', 'migrations', 'add-oauth-reset-fields.sql');
    const sql1 = fs.readFileSync(migration1Path, 'utf8');
    await pool.query(sql1);
    console.log('✓ Migration 1: add-oauth-reset-fields.sql completed');

    // Migration 2: Neon Auth ID
    const migration2Path = path.join(__dirname, '..', 'migrations', 'add-neon-auth-id.sql');
    const sql2 = fs.readFileSync(migration2Path, 'utf8');
    await pool.query(sql2);
    console.log('✓ Migration 2: add-neon-auth-id.sql completed');

    console.log('\nAll migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
