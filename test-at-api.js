/**
 * Test AccessTrade API to check what fields are returned
 */

const path = require('path');
require('dotenv').config();
const accessTradeService = require(path.join(__dirname, 'backend', 'services', 'accesstrade'));

async function testAPI() {
  try {
    console.log('Fetching conversions from AccessTrade...\n');

    // Get conversions from last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const result = await accessTradeService.getConversions(startDate, endDate, { limit: 5 });

    console.log('Found', result.data.length, 'conversions\n');

    if (result.data.length > 0) {
      const sample = result.data[0];
      console.log('Sample conversion fields:');
      console.log(JSON.stringify(sample, null, 2));

      console.log('\n\n=== CHECKING STATUS FIELDS ===');
      console.log('✓ order_approved:', sample.order_approved);
      console.log('✓ products_count:', sample.products_count);
      console.log('✓ order_pending:', sample.order_pending);
      console.log('✓ order_reject:', sample.order_reject);
      console.log('✓ is_confirmed:', sample.is_confirmed);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testAPI();
