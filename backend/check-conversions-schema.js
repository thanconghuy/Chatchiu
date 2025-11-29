const { pool } = require('./config/database');

async function checkConversionsSchema() {
  try {
    console.log('='.repeat(60));
    console.log('CHECKING CONVERSIONS TABLE SCHEMA');
    console.log('='.repeat(60));

    // Get all columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'conversions'
      ORDER BY ordinal_position
    `);

    console.log('\nAll columns in conversions table:');
    console.log(columns.rows);

    // Sample data to see what fields exist
    const sampleData = await pool.query(`
      SELECT *
      FROM conversions
      WHERE order_time >= '2025-10-01'
        AND order_time <= '2025-10-31'
        AND status = 'approved'
      LIMIT 5
    `);

    console.log('\nSample data (5 rows):');
    console.log(JSON.stringify(sampleData.rows, null, 2));

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkConversionsSchema();
