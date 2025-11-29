const { pool } = require('./config/database');

async function checkSystemConversionsClick() {
  try {
    // Check if click_id exists and has user_id
    const result = await pool.query(`
      SELECT
        sc.id,
        sc.user_id as sc_user_id,
        sc.click_id,
        sc.order_code,
        cl.id as click_record_id,
        cl.user_id as click_user_id,
        u.username,
        u.email,
        u.full_name
      FROM system_conversions sc
      LEFT JOIN clicks cl ON sc.click_id = cl.id
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE sc.order_time >= '2025-10-01'
        AND sc.order_time <= '2025-10-31'
        AND sc.status = 'approved'
      ORDER BY sc.order_time DESC
      LIMIT 20
    `);

    console.log('System Conversions with Click Data:');
    console.log(JSON.stringify(result.rows, null, 2));

    // Count
    const countResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(sc.click_id) as with_click_id,
        COUNT(cl.user_id) as with_click_user
      FROM system_conversions sc
      LEFT JOIN clicks cl ON sc.click_id = cl.id
      WHERE sc.order_time >= '2025-10-01'
        AND sc.order_time <= '2025-10-31'
        AND sc.status = 'approved'
    `);

    console.log('\nCount:');
    console.log(countResult.rows[0]);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSystemConversionsClick();
