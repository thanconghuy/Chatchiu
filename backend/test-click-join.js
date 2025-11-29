const { pool } = require('./config/database');

async function testClickJoin() {
  try {
    // Test JOIN conversions with clicks via utm_content
    const result = await pool.query(`
      SELECT
        c.id,
        c.order_code,
        c.utm_content,
        c.user_id as c_user_id,
        cl.id as click_id,
        cl.user_id as click_user_id,
        u.username,
        u.email,
        u.full_name
      FROM conversions c
      LEFT JOIN clicks cl ON c.utm_content = cl.id::text
      LEFT JOIN users u ON cl.user_id = u.id
      WHERE c.order_time >= '2025-10-01'
        AND c.order_time <= '2025-10-31'
        AND c.status = 'approved'
      LIMIT 10
    `);

    console.log('Test JOIN Result:');
    console.log(JSON.stringify(result.rows, null, 2));

    // Count how many conversions can be matched with clicks
    const countResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(cl.user_id) as with_click_user,
        COUNT(*) - COUNT(cl.user_id) as no_click_user
      FROM conversions c
      LEFT JOIN clicks cl ON c.utm_content = cl.id::text
      WHERE c.order_time >= '2025-10-01'
        AND c.order_time <= '2025-10-31'
        AND c.status = 'approved'
    `);

    console.log('\nCount Result:');
    console.log(countResult.rows[0]);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testClickJoin();
