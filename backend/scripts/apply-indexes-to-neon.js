/**
 * Apply Payment Indexes to Neon Database
 *
 * Script này đọc file SQL và apply lên Neon database
 * Dùng connection string từ .env
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Colors for console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`)
};

// Determine which environment to use
const envFile = process.argv[2] === '--test' ? '.env.test' : '.env';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile) });

const isTestMode = process.argv[2] === '--test';
const dbName = process.env.DB_NAME;

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Apply Payment Optimization Indexes');
  console.log('='.repeat(60) + '\n');

  log.info(`Environment: ${envFile}`);
  log.info(`Database: ${dbName}`);

  if (!isTestMode) {
    log.warning('⚠️  YOU ARE ABOUT TO MODIFY PRODUCTION DATABASE!');
    log.warning('⚠️  Make sure you have a backup!');
    console.log('\n');

    // Require confirmation for production
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question('Type "YES" to confirm applying indexes to PRODUCTION: ', resolve);
    });
    readline.close();

    if (answer !== 'YES') {
      log.warning('Aborted by user');
      process.exit(0);
    }
  }

  // Create database connection
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection
    log.info('Testing database connection...');
    const testResult = await pool.query('SELECT current_database(), version()');
    log.success(`Connected to: ${testResult.rows[0].current_database}`);
    log.info(`PostgreSQL version: ${testResult.rows[0].version.split(',')[0]}`);
    console.log('');

    // Check current indexes
    log.info('Checking existing payment indexes...');
    const existingIndexes = await pool.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_payment%'
    `);
    log.info(`Existing payment indexes: ${existingIndexes.rows[0].count}`);
    console.log('');

    // Read SQL file
    const sqlFilePath = path.join(__dirname, '../database/migrations/optimize-payment-indexes.sql');
    log.info('Reading SQL file...');

    if (!fs.existsSync(sqlFilePath)) {
      log.error(`SQL file not found: ${sqlFilePath}`);
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    log.success('SQL file loaded successfully');
    console.log('');

    // Execute SQL
    log.info('Applying indexes... (this may take 1-2 minutes)');
    const startTime = Date.now();

    await pool.query(sqlContent);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`Indexes applied successfully in ${duration}s`);
    console.log('');

    // Verify indexes created
    log.info('Verifying indexes...');
    const newIndexes = await pool.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_payment%'
    `);

    const indexesCreated = newIndexes.rows[0].count - existingIndexes.rows[0].count;
    log.success(`Total payment indexes now: ${newIndexes.rows[0].count}`);
    log.success(`New indexes created: ${indexesCreated}`);
    console.log('');

    // Show sample of created indexes
    log.info('Sample of indexes created:');
    const sampleIndexes = await pool.query(`
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_payment%'
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 10
    `);

    sampleIndexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname} on ${idx.tablename} (${idx.size})`);
    });
    console.log('');

    // Run ANALYZE
    log.info('Running ANALYZE to update statistics...');
    await pool.query(`
      ANALYZE payment_requests;
      ANALYZE payment_system_reconciliation_mapping;
      ANALYZE system_reconciliation_items;
      ANALYZE payment_validation_audit_log;
    `);
    log.success('Statistics updated');
    console.log('');

    // Check database size
    const dbSize = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    log.info(`Current database size: ${dbSize.rows[0].size}`);
    console.log('');

    log.success('✅ All done! Indexes have been applied successfully.');
    console.log('');
    log.info('Next steps:');
    console.log('  1. Monitor query performance over next 24-48 hours');
    console.log('  2. Check index usage with: node backend/scripts/check-index-usage.js');
    console.log('  3. If satisfied, proceed to deploy optimized service');
    console.log('');

  } catch (error) {
    log.error('Failed to apply indexes:');
    console.error(error);
    process.exit(1);

  } finally {
    await pool.end();
  }
}

// Run
main().catch(error => {
  console.error(error);
  process.exit(1);
});
