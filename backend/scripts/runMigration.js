/**
 * Run SQL Migration Script
 */

const fs = require('fs');
const path = require('path');

// Load .env from project root
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../config/database');

async function runMigration(migrationFile) {
  try {
    const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);
    console.log('SQL:', sql);
    console.log('---');

    await db.query(sql);

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node runMigration.js <migration-file>');
  console.error('Example: node runMigration.js add_at_status_fields_to_conversions.sql');
  process.exit(1);
}

runMigration(migrationFile);
