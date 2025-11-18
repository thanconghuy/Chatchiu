/**
 * Test Cashback Stats Route
 * Run this to check if the route works
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function testCashbackStatsQuery() {
  try {
    console.log('🧪 Testing cashback stats SQL query...\n');

    // Test parameters
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const toDate = new Date();
    const limitNum = 20;
    const offset = 0;

    console.log('📅 Date range:', {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0]
    });

    const orderByClause = 'ORDER BY total_cashback_earned DESC';

    const statsQuery = `
      SELECT
        u.id AS user_id,
        u.username,
        u.email,
        u.full_name,
        u.available_balance,
        u.pending_balance,
        u.total_cashback AS total_cashback_all_time,

        -- Stats in date range
        COUNT(DISTINCT sc.id) AS total_orders,
        COALESCE(SUM(sc.order_amount), 0) AS total_order_value,
        COALESCE(SUM(sc.cashback_amount), 0) AS total_cashback_earned,

        -- Breakdown by status
        COUNT(DISTINCT CASE WHEN sc.status = 'approved' THEN sc.id END) AS approved_orders,
        COUNT(DISTINCT CASE WHEN sc.status = 'pending' THEN sc.id END) AS pending_orders,
        COUNT(DISTINCT CASE WHEN sc.status = 'rejected' THEN sc.id END) AS rejected_orders,

        COALESCE(SUM(CASE WHEN sc.status = 'approved' THEN sc.cashback_amount ELSE 0 END), 0) AS approved_cashback,
        COALESCE(SUM(CASE WHEN sc.status = 'pending' THEN sc.cashback_amount ELSE 0 END), 0) AS pending_cashback

      FROM users u
      LEFT JOIN system_conversions sc
        ON sc.user_id = u.id
        AND sc.order_time >= $1
        AND sc.order_time <= $2

      WHERE u.is_admin = false

      GROUP BY
        u.id, u.username, u.email, u.full_name,
        u.available_balance, u.pending_balance, u.total_cashback

      ${orderByClause}

      LIMIT $3 OFFSET $4
    `;

    console.log('\n📝 Executing query...');
    const result = await pool.query(statsQuery, [fromDate, toDate, limitNum, offset]);

    console.log('\n✅ Query executed successfully!');
    console.log('📊 Results:', {
      rowCount: result.rows.length,
      sampleData: result.rows.slice(0, 2)
    });

    // Test count query
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total_users
      FROM users u
      LEFT JOIN system_conversions sc
        ON sc.user_id = u.id
        AND sc.order_time >= $1
        AND sc.order_time <= $2
      WHERE u.is_admin = false
    `;

    console.log('\n📝 Testing count query...');
    const countResult = await pool.query(countQuery, [fromDate, toDate]);
    console.log('✅ Count query successful!');
    console.log('👥 Total users:', countResult.rows[0].total_users);

    await pool.end();
    console.log('\n✨ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testCashbackStatsQuery();
