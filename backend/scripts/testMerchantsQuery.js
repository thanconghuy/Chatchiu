require('dotenv').config();
const { pool } = require('../config/database');

async function testMerchantsQuery() {
  try {
    console.log('Testing merchants query with clicks and conversions...\n');

    // First check if we have any clicks
    const clicksCheck = await pool.query('SELECT COUNT(*) as count FROM clicks');
    console.log(`Total clicks in database: ${clicksCheck.rows[0].count}`);

    const conversionsCheck = await pool.query('SELECT COUNT(*) as count FROM system_conversions');
    console.log(`Total system_conversions in database: ${conversionsCheck.rows[0].count}\n`);

    // Test the query
    const query = `
      SELECT
        m.id,
        m.name,
        m.is_active,
        COALESCE(COUNT(DISTINCT c.id), 0)::INTEGER as total_clicks,
        COALESCE(COUNT(DISTINCT sc.id), 0)::INTEGER as total_conversions,
        COALESCE(SUM(sc.commission), 0)::NUMERIC as total_commission
      FROM merchants m
      LEFT JOIN clicks c ON c.merchant_id = m.id
      LEFT JOIN system_conversions sc ON sc.merchant_id = m.id AND sc.status = 'approved'
      GROUP BY m.id
      ORDER BY m.name
      LIMIT 10
    `;

    const result = await pool.query(query);

    console.log(`Found ${result.rows.length} merchants:\n`);

    result.rows.forEach((merchant, index) => {
      console.log(`${index + 1}. ${merchant.name} (${merchant.id})`);
      console.log(`   Active: ${merchant.is_active}`);
      console.log(`   Total Clicks: ${merchant.total_clicks}`);
      console.log(`   Total Conversions: ${merchant.total_conversions}`);
      console.log(`   Total Commission: ${merchant.total_commission}`);
      console.log('');
    });

    // Check sample clicks data
    console.log('\nSample clicks data:');
    const sampleClicks = await pool.query(`
      SELECT
        c.id,
        c.merchant_id,
        m.name as merchant_name,
        c.user_id,
        c.clicked_at
      FROM clicks c
      LEFT JOIN merchants m ON m.id = c.merchant_id
      ORDER BY c.clicked_at DESC
      LIMIT 5
    `);

    if (sampleClicks.rows.length > 0) {
      sampleClicks.rows.forEach((click, index) => {
        console.log(`${index + 1}. Click ID: ${click.id}`);
        console.log(`   Merchant: ${click.merchant_name} (${click.merchant_id})`);
        console.log(`   User ID: ${click.user_id}`);
        console.log(`   Clicked at: ${click.clicked_at}`);
        console.log('');
      });
    } else {
      console.log('No clicks found in database!');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMerchantsQuery();
