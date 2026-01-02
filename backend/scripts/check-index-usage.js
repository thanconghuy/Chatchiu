/**
 * Check Payment Index Usage
 *
 * Script to monitor how indexes are being used
 */

const path = require('path');
const envFile = process.argv[2] === '--test' ? '.env.test' : '.env';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile) });

const { Pool } = require('pg');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`)
};

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('\n' + '='.repeat(70));
    console.log('Payment Index Usage Report');
    console.log('='.repeat(70) + '\n');

    log.info(`Database: ${process.env.DB_NAME}`);
    console.log('');

    // 1. Index usage statistics
    log.info('Index Usage Statistics:');
    console.log('');

    const usageStats = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND (tablename LIKE '%payment%' OR tablename LIKE '%reconciliation%')
        AND indexname LIKE 'idx_%'
      ORDER BY idx_scan DESC
    `);

    console.log('┌─────────────────────────────────────────────┬────────┬──────────────┬─────────┐');
    console.log('│ Index Name                                  │ Scans  │ Tuples Read  │ Size    │');
    console.log('├─────────────────────────────────────────────┼────────┼──────────────┼─────────┤');

    usageStats.rows.forEach(row => {
      const name = row.indexname.padEnd(43);
      const scans = row.scans.toString().padStart(6);
      const tuples = row.tuples_read.toString().padStart(12);
      const size = row.size.padEnd(7);

      const color = row.scans === 0 ? colors.red : row.scans > 100 ? colors.green : colors.yellow;
      console.log(`│ ${color}${name}${colors.reset} │ ${color}${scans}${colors.reset} │ ${tuples} │ ${size} │`);
    });

    console.log('└─────────────────────────────────────────────┴────────┴──────────────┴─────────┘');
    console.log('');

    // 2. Unused indexes
    const unusedIndexes = usageStats.rows.filter(row => row.scans === 0);
    if (unusedIndexes.length > 0) {
      log.warning(`Found ${unusedIndexes.length} unused indexes (scans = 0):`);
      unusedIndexes.forEach(row => {
        console.log(`  - ${row.indexname} on ${row.tablename} (${row.size})`);
      });
      console.log('  💡 Consider dropping these if unused after 1 week');
      console.log('');
    } else {
      log.success('All indexes are being used! ✅');
      console.log('');
    }

    // 3. Most used indexes
    const topIndexes = usageStats.rows.slice(0, 5);
    if (topIndexes.length > 0) {
      log.success('Top 5 Most Used Indexes:');
      topIndexes.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.indexname}: ${row.scans} scans`);
      });
      console.log('');
    }

    // 4. Table sizes
    log.info('Payment Tables Size:');
    const tableSizes = await pool.query(`
      SELECT
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size
      FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename LIKE '%payment%' OR tablename LIKE '%reconciliation%')
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    console.log('┌─────────────────────────────────────────────┬────────────┬────────────┬─────────────┐');
    console.log('│ Table Name                                  │ Table Size │ Index Size │ Total Size  │');
    console.log('├─────────────────────────────────────────────┼────────────┼────────────┼─────────────┤');

    tableSizes.rows.forEach(row => {
      const name = row.tablename.padEnd(43);
      const tableSize = row.table_size.padEnd(10);
      const indexSize = row.indexes_size.padEnd(10);
      const totalSize = row.total_size.padEnd(11);

      console.log(`│ ${name} │ ${tableSize} │ ${indexSize} │ ${totalSize} │`);
    });

    console.log('└─────────────────────────────────────────────┴────────────┴────────────┴─────────────┘');
    console.log('');

    // 5. Cache hit ratio
    log.info('Index Cache Hit Ratio:');
    const cacheStats = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        CASE
          WHEN idx_blks_hit + idx_blks_read = 0 THEN 0
          ELSE ROUND(100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read), 2)
        END as cache_hit_ratio
      FROM pg_statio_user_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_payment%'
        AND idx_blks_hit + idx_blks_read > 0
      ORDER BY cache_hit_ratio DESC
      LIMIT 10
    `);

    if (cacheStats.rows.length > 0) {
      cacheStats.rows.forEach(row => {
        const ratio = row.cache_hit_ratio;
        const color = ratio > 90 ? colors.green : ratio > 70 ? colors.yellow : colors.red;
        console.log(`  ${color}${row.indexname}: ${ratio}%${colors.reset}`);
      });
      console.log('  💡 Higher is better (target: >90%)');
      console.log('');
    }

    // 6. Summary
    console.log('='.repeat(70));
    log.success('Report Complete');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);

  } finally {
    await pool.end();
  }
}

main();
