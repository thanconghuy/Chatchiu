/**
 * Check users table schema
 */

require('dotenv').config();
const pool = require('./config/database');

async function checkSchema() {
  try {
    // Get table columns
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('\n📊 Users table columns:');
    console.log('==================================================');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('==================================================\n');

    // Get sample user
    const userResult = await pool.query(`
      SELECT * FROM users
      WHERE email = 'test@gmail.com'
      LIMIT 1
    `);

    if (userResult.rows.length > 0) {
      console.log('✅ Sample user (test@gmail.com):');
      console.log(JSON.stringify(userResult.rows[0], null, 2));
    } else {
      console.log('❌ No user found with email: test@gmail.com');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkSchema();
