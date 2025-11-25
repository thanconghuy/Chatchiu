require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkLinkGeneration() {
  try {
    // Check recent clicks with merchant info
    const result = await pool.query(`
      SELECT
        c.id,
        c.clicked_at,
        c.click_type,
        c.link_source,
        c.affiliate_url,
        m.name as merchant_name,
        m.campaign_id,
        m.api_type
      FROM clicks c
      JOIN merchants m ON c.merchant_id = m.id
      WHERE c.clicked_at > NOW() - INTERVAL '24 hours'
      ORDER BY c.clicked_at DESC
      LIMIT 10
    `);

    console.log('=== RECENT LINK GENERATION DETAILS (Last 24h) ===');
    console.log(`Total clicks in last 24 hours: ${result.rows.length}`);

    result.rows.forEach((click, idx) => {
      console.log(`\n[${idx + 1}] Click ID: ${click.id}`);
      console.log(`  Time: ${click.clicked_at}`);
      console.log(`  Merchant: ${click.merchant_name}`);
      console.log(`  Campaign ID: ${click.campaign_id || 'NULL'}`);
      console.log(`  API Type: ${click.api_type || 'NULL'}`);
      console.log(`  Link Source: ${click.link_source}`);
      console.log(`  Click Type: ${click.click_type}`);
      if (click.affiliate_url) {
        console.log(`  Affiliate URL: ${click.affiliate_url.substring(0, 80)}...`);
      } else {
        console.log(`  Affiliate URL: NULL`);
      }
    });

    // Check merchants configuration
    console.log('\n\n=== MERCHANTS CONFIGURATION ===');
    const merchants = await pool.query(`
      SELECT id, name, campaign_id, api_type, is_active
      FROM merchants
      WHERE is_active = true
      ORDER BY name
    `);

    merchants.rows.forEach(m => {
      console.log(`\nMerchant: ${m.name} (${m.id})`);
      console.log(`  Campaign ID: ${m.campaign_id || 'NOT SET'}`);
      console.log(`  API Type: ${m.api_type || 'NULL (uses AccessTrade V1)'}`);
      console.log(`  Active: ${m.is_active}`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkLinkGeneration();
