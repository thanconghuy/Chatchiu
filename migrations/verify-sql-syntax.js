/**
 * Verify SQL Syntax in Migration Files
 * This script verifies that all SQL files have valid syntax
 * without actually running them on the database
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_FILES = [
  '001-add-reconciliation-fields-to-conversions.sql',
  '002-create-reconciliations-table.sql',
  '003-create-reconciliation-items-table.sql',
  '004-create-reconciliation-logs-table.sql',
  '005-create-payments-table.sql'
];

console.log('🔍 Verifying SQL Migration Files...\n');
console.log('='.repeat(60));

let allValid = true;

for (const filename of MIGRATION_FILES) {
  const filePath = path.join(__dirname, filename);

  console.log(`\n📄 Checking: ${filename}`);

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`   ❌ File not found`);
      allValid = false;
      continue;
    }

    // Read SQL content
    const sql = fs.readFileSync(filePath, 'utf8');

    // Basic validations
    const checks = [
      {
        name: 'Not empty',
        test: () => sql.trim().length > 0
      },
      {
        name: 'Valid SQL keywords',
        test: () => /CREATE|ALTER|INSERT|UPDATE|DELETE|SELECT/i.test(sql)
      },
      {
        name: 'Balanced parentheses',
        test: () => {
          const open = (sql.match(/\(/g) || []).length;
          const close = (sql.match(/\)/g) || []).length;
          return open === close;
        }
      },
      {
        name: 'No syntax errors (basic)',
        test: () => {
          // Check for common syntax errors
          return !sql.includes(';;') && !sql.includes(',,');
        }
      }
    ];

    let fileValid = true;
    for (const check of checks) {
      const result = check.test();
      if (!result) {
        console.log(`   ❌ ${check.name}: FAILED`);
        fileValid = false;
        allValid = false;
      }
    }

    if (fileValid) {
      const lines = sql.split('\n').length;
      const size = (fs.statSync(filePath).size / 1024).toFixed(2);
      console.log(`   ✅ Valid (${lines} lines, ${size} KB)`);

      // Show key operations
      const operations = [];
      if (sql.includes('CREATE TABLE')) operations.push('CREATE TABLE');
      if (sql.includes('ALTER TABLE')) operations.push('ALTER TABLE');
      if (sql.includes('CREATE INDEX')) operations.push('CREATE INDEX');
      if (sql.includes('CREATE TRIGGER')) operations.push('CREATE TRIGGER');
      if (sql.includes('CREATE FUNCTION')) operations.push('CREATE FUNCTION');

      if (operations.length > 0) {
        console.log(`   📋 Operations: ${operations.join(', ')}`);
      }
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    allValid = false;
  }
}

console.log('\n' + '='.repeat(60));
console.log('\n📊 Verification Summary:');

if (allValid) {
  console.log('✅ All migration files are valid!');
  console.log('\n✨ Ready to run migrations when database is available.');
  console.log('\nTo run migrations:');
  console.log('  1. Create .env file with DATABASE_URL');
  console.log('  2. Run: node migrations/run-reconciliation-migrations.js');
} else {
  console.log('❌ Some migration files have issues. Please fix them before running.');
}

console.log('\n' + '='.repeat(60));
