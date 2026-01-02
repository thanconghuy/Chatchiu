require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkPaymentHistoryData() {
  try {
    console.log('🔍 Checking user_payment_history table...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_payment_history'
      );
    `);

    console.log('Table exists:', tableCheck.rows[0].exists);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table user_payment_history does not exist!');
      console.log('Need to run migration to create it.');
      process.exit(0);
    }

    // Count total records
    const countResult = await pool.query('SELECT COUNT(*) FROM user_payment_history');
    console.log('Total records:', countResult.rows[0].count);

    // Get sample data
    const sampleResult = await pool.query(`
      SELECT * FROM user_payment_history
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('\nSample records:');
    sampleResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}.`, {
        id: row.id,
        user_id: row.user_id,
        payment_period: row.payment_period,
        status: row.status,
        total_cashback: row.total_cashback,
        created_at: row.created_at
      });
    });

    // Check user_payment_details table
    console.log('\n🔍 Checking user_payment_details table...\n');

    const detailsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_payment_details'
      );
    `);

    console.log('Details table exists:', detailsTableCheck.rows[0].exists);

    if (detailsTableCheck.rows[0].exists) {
      const detailsCount = await pool.query('SELECT COUNT(*) FROM user_payment_details');
      console.log('Total detail records:', detailsCount.rows[0].count);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkPaymentHistoryData();
