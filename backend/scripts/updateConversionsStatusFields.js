/**
 * Update existing conversions with AccessTrade status fields
 * Fetch from AccessTrade API and update order_approved, products_count, order_pending, order_reject
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const db = require('../config/database');
const accessTradeService = require('../services/accesstrade');

async function updateConversions() {
  try {
    console.log('🔄 Starting update process...\n');

    // Get all conversions that need update (where all status fields = 0)
    const conversionsResult = await db.query(`
      SELECT id, accesstrade_id, order_code, created_at
      FROM conversions
      WHERE order_approved = 0
        AND products_count = 0
        AND order_pending = 0
        AND order_reject = 0
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const conversions = conversionsResult.rows;
    console.log(`Found ${conversions.length} conversions to update\n`);

    if (conversions.length === 0) {
      console.log('✅ No conversions need updating!');
      process.exit(0);
    }

    // Fetch from AccessTrade (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    console.log(`Fetching conversions from AccessTrade (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})...\n`);

    const atResult = await accessTradeService.getConversions(startDate, endDate, { limit: 300 });
    console.log(`Fetched ${atResult.data.length} conversions from AccessTrade\n`);

    // Create a map of AccessTrade conversions by order_id
    const atMap = new Map();
    atResult.data.forEach(conv => {
      atMap.set(conv.order_id, conv);
    });

    let updated = 0;
    let notFound = 0;

    // Update each conversion
    for (const conv of conversions) {
      const atConv = atMap.get(conv.accesstrade_id);

      if (atConv) {
        // Update with AccessTrade data
        await db.query(`
          UPDATE conversions
          SET
            order_approved = $1,
            products_count = $2,
            order_pending = $3,
            order_reject = $4,
            updated_at = NOW()
          WHERE id = $5
        `, [
          parseInt(atConv.order_approved) || 0,
          parseInt(atConv.products_count) || 0,
          parseInt(atConv.order_pending) || 0,
          parseInt(atConv.order_reject) || 0,
          conv.id
        ]);

        updated++;
        console.log(`✓ Updated ${conv.order_code}: order_approved=${atConv.order_approved}, products_count=${atConv.products_count}, order_pending=${atConv.order_pending}, order_reject=${atConv.order_reject}`);
      } else {
        notFound++;
        console.log(`✗ Not found in AT: ${conv.order_code}`);
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Not found: ${notFound}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

updateConversions();
