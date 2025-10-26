#!/usr/bin/env node

/**
 * Wake up Neon database if it's sleeping
 * Run: node wake-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 30000, // 30 seconds for first connection
  query_timeout: 30000,
});

async function wakeDatabase() {
  console.log('⏰ Waking up Neon database...');
  console.log('   (This may take 5-15 seconds on first connection)\n');

  const startTime = Date.now();

  try {
    // Simple query to wake up database
    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('✅ Database is awake!');
    console.log(`   Connection time: ${duration}s`);
    console.log(`   Current time: ${result.rows[0].current_time}`);
    console.log(`   PostgreSQL: ${result.rows[0].db_version.split(' ')[0]} ${result.rows[0].db_version.split(' ')[1]}\n`);

    // Test a simple count query
    console.log('🔍 Checking tables...');
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`   Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

    console.log('\n✅ Database is ready to use!\n');

    await pool.end();
    process.exit(0);

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.error(`❌ Failed to wake database after ${duration}s`);
    console.error(`   Error: ${error.message}\n`);

    if (error.message.includes('timeout')) {
      console.log('💡 Possible solutions:');
      console.log('   1. Check internet connection');
      console.log('   2. Verify DATABASE_URL in .env is correct');
      console.log('   3. Try again (Neon may be under maintenance)');
      console.log('   4. Check Neon Console: https://console.neon.tech\n');
    } else if (error.message.includes('password')) {
      console.log('💡 Authentication failed:');
      console.log('   1. Verify DATABASE_URL credentials in .env');
      console.log('   2. Check Neon Console for correct connection string\n');
    }

    await pool.end();
    process.exit(1);
  }
}

wakeDatabase();
