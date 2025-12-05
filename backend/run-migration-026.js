const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting migration 026: Add reset token columns...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '026_add_reset_token_columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✅ Migration 026 completed successfully!');

    // Verify columns exist
    const verifyQuery = `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('reset_token', 'reset_token_expiry')
      ORDER BY column_name;
    `;

    const result = await client.query(verifyQuery);

    console.log('\n📋 Verification - Columns added:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}: ${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''} - nullable: ${row.is_nullable}`);
    });

    // Check index
    const indexQuery = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'users'
        AND indexname = 'idx_users_reset_token';
    `;

    const indexResult = await client.query(indexQuery);

    if (indexResult.rows.length > 0) {
      console.log('\n📊 Index created:');
      console.log(`  ✓ ${indexResult.rows[0].indexname}`);
    }

    console.log('\n✨ Migration 026 verification completed!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 026 failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration();
