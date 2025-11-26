require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('=== RUNNING PAYMENT HISTORY MIGRATIONS ===\n');

    // Migration files to run
    const migrations = [
      '021_create_user_payment_history.sql',
      '022_create_user_payment_details.sql'
    ];

    for (const migrationFile of migrations) {
      const filePath = path.join(__dirname, 'backend', 'migrations', migrationFile);

      if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${migrationFile}`);
        continue;
      }

      console.log(`Running migration: ${migrationFile}...`);

      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query(sql);
        console.log(`✅ Successfully ran: ${migrationFile}\n`);
      } catch (error) {
        console.error(`❌ Error running ${migrationFile}:`);
        console.error(error.message);
        console.error('\n');
      }
    }

    console.log('=== MIGRATION COMPLETE ===\n');

    // Verify tables were created
    console.log('Verifying tables...\n');

    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('user_payment_history', 'user_payment_details')
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 2) {
      console.log('✅ Both tables created successfully:');
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  Warning: Not all tables were created');
      console.log('Found tables:', tablesResult.rows.map(r => r.table_name));
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
