// Use Neon serverless driver for Vercel compatibility
const { neonConfig, Pool } = require('@neondatabase/serverless');
require('dotenv').config();

/**
 * PostgreSQL Database Configuration for Neon Serverless
 *
 * Environment Variables Required:
 * - DATABASE_URL: Full PostgreSQL connection string from Neon
 *   Format: postgres://username:password@host/database?sslmode=require
 *
 * Uses @neondatabase/serverless for optimal Vercel serverless performance
 */

// Configure for serverless (use WebSocket in production, TCP in dev)
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  // Use WebSocket for Vercel serverless functions
  neonConfig.webSocketConstructor = require('ws');
  neonConfig.useSecureWebSocket = true;
  neonConfig.pipelineConnect = 'password';
}

// Create connection pool optimized for both serverless and local dev
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Set timezone to Vietnam (UTC+7)
  options: '-c timezone=Asia/Ho_Chi_Minh'
};

// Optimize pool settings for serverless vs local
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  // Serverless optimization - allow a few connections for concurrent requests
  poolConfig.max = 3; // Allow up to 3 connections per serverless instance
  poolConfig.idleTimeoutMillis = 10000; // Close idle after 10s
  poolConfig.connectionTimeoutMillis = 30000; // 30s timeout (Neon cold start can take time)
  poolConfig.allowExitOnIdle = true; // Allow exit when idle (serverless)
} else {
  // Local dev - normal pooling
  poolConfig.max = 10;
  poolConfig.min = 2;
  poolConfig.idleTimeoutMillis = 30000;
  poolConfig.connectionTimeoutMillis = 15000;
  poolConfig.allowExitOnIdle = false;
}

const pool = new Pool(poolConfig);

// Handle pool errors gracefully - don't exit process
pool.on('error', (err, client) => {
  console.error('⚠️ Database connection error:', err.message);
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
    // Only log query text in development (may contain sensitive data)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { text, duration, rows: result.rowCount });
    } else {
      console.log('Query executed', { duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Query error:', error.message);
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
