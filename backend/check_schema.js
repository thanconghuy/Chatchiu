const { pool } = require('./config/database');

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    
    console.log('Users table columns:');
    result.rows.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
