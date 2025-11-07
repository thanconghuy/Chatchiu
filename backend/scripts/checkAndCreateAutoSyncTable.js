require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function checkAndCreateTable() {
  try {
    console.log('Checking if auto_sync_config table exists...');

    // Check if table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'auto_sync_config'
      );
    `;

    const checkResult = await pool.query(checkQuery);
    const tableExists = checkResult.rows[0].exists;

    if (tableExists) {
      console.log('✓ Table auto_sync_config already exists');

      // Show current config
      const configQuery = 'SELECT * FROM auto_sync_config ORDER BY id DESC LIMIT 1';
      const configResult = await pool.query(configQuery);

      if (configResult.rows.length > 0) {
        console.log('\nCurrent config:');
        console.log(JSON.stringify(configResult.rows[0], null, 2));
      } else {
        console.log('\n⚠ Table exists but no config found. Creating default...');
        const insertQuery = `
          INSERT INTO auto_sync_config (enabled, cron_schedule, sync_days)
          VALUES (FALSE, '0 8 * * *', 2)
          RETURNING *
        `;
        const insertResult = await pool.query(insertQuery);
        console.log('✓ Default config created:');
        console.log(JSON.stringify(insertResult.rows[0], null, 2));
      }
    } else {
      console.log('✗ Table auto_sync_config does not exist. Creating...');

      // Read migration file
      const migrationPath = path.join(__dirname, '../migrations/create_auto_sync_config.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      // Run migration
      await pool.query(migrationSQL);
      console.log('✓ Table auto_sync_config created successfully');

      // Show created config
      const configQuery = 'SELECT * FROM auto_sync_config ORDER BY id DESC LIMIT 1';
      const configResult = await pool.query(configQuery);
      console.log('\nCreated config:');
      console.log(JSON.stringify(configResult.rows[0], null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkAndCreateTable();
