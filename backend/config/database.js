const { Pool } = require('pg');
require('dotenv').config();

/**
 * PostgreSQL Database Configuration for Neon
 *
 * Environment Variables Required:
 * - DATABASE_URL: Full PostgreSQL connection string from Neon
 *   Format: postgres://username:password@host/database?sslmode=require
 *
 * OR individual variables:
 * - DB_HOST
 * - DB_PORT
 * - DB_NAME
 * - DB_USER
 * - DB_PASSWORD
 */

// Create connection pool with Neon-optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  },
  // Connection pool settings optimized for Neon serverless
  max: 10, // Reduced for serverless (Neon recommends 10)
  min: 2, // Keep minimum connections alive
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 20000, // Increased timeout for slow connections
  // Keepalive to prevent connection drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Handle pool errors gracefully - don't exit process
pool.on('error', (err, client) => {
  console.error('⚠️ Database connection error (will auto-reconnect):', err.message);
  // Don't exit - let pool handle reconnection
});

// Test connection function
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection successful!');
    console.log('🕐 Server time:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Query helper function with error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
async function closePool() {
  try {
    await pool.end();
    console.log('✅ Database pool closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database pool:', error);
  }
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  closePool
};
