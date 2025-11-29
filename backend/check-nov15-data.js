const { pool } = require('./config/database');

async function checkNov15Data() {
  try {
    const result = await pool.query(`
      SELECT
        sc.id,
        sc.user_id,
        sc.click_id,
        sc.order_code,
        cl.user_id as click_user_id,
        u.username,
        u.email,
        u.full_name
      FROM system_conversions sc
      LEFT JOIN clicks cl ON sc.click_id = cl.id
      LEFT JOIN users u ON COALESCE(sc.user_id, cl.user_id) = u.id
      WHERE sc.status = 'approved'
        AND sc.order_time >= '2025-11-15'
        AND sc.order_time <= '2025-11-15 23:59:59'
      ORDER BY sc.order_time DESC
    `);

    console.log('Nov 15 Data:');
    console.log(JSON.stringify(result.rows, null, 2));
    console.log('\nTotal:', result.rows.length);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkNov15Data();
