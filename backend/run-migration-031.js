// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔄 Running migration 031: Cashback Notification System...\n');

  try {
    // Read SQL file
    const sqlFile = path.join(__dirname, 'migrations', '031_create_cashback_notifications.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute migration
    await pool.query(sql);

    console.log('✅ Migration 031 completed successfully!');
    console.log('\n📊 Verification:');

    // Verify tables created
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('cashback_notifications', 'user_notification_preferences', 'notification_statistics')
      ORDER BY table_name
    `);

    console.log('\n✓ Tables created:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Count existing user preferences
    const prefsCount = await pool.query('SELECT COUNT(*) FROM user_notification_preferences');
    console.log(`\n✓ User preferences initialized: ${prefsCount.rows[0].count} users`);

    // Show indexes
    const indexes = await pool.query(`
      SELECT
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('cashback_notifications', 'user_notification_preferences', 'notification_statistics')
      ORDER BY tablename, indexname
    `);

    console.log(`\n✓ Indexes created: ${indexes.rows.length} indexes`);

    console.log('\n🎉 Migration 031 setup complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

runMigration();
