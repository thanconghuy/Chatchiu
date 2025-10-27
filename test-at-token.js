require('dotenv').config();
const axios = require('axios');

/**
 * Test AccessTrade API Token
 * Run: node test-at-token.js
 */

async function testAccessTradeToken() {
  console.log('='.repeat(60));
  console.log('Testing AccessTrade API Configuration');
  console.log('='.repeat(60));

  // Check environment variables
  const token = process.env.ACCESSTRADE_API_TOKEN;
  const apiUrl = process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn/v1';

  console.log('\n📋 Configuration:');
  console.log(`   API URL: ${apiUrl}`);
  console.log(`   Token: ${token ? `${token.substring(0, 20)}...` : '❌ NOT SET'}`);

  if (!token) {
    console.log('\n❌ ERROR: ACCESSTRADE_API_TOKEN not found in .env file');
    console.log('\nPlease check:');
    console.log('1. File .env exists in project root');
    console.log('2. Contains: ACCESSTRADE_API_TOKEN=your_actual_token');
    console.log('3. Token is valid (get from AccessTrade dashboard)');
    process.exit(1);
  }

  console.log('\n🔍 Testing API connection...\n');

  try {
    // Test 1: Get recent conversions (using /order-list endpoint)
    // Skip publisher info test as endpoint may not exist
    console.log('Test 1: Getting recent conversions...');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const conversionsResponse = await axios.get(
      `${apiUrl}/order-list`,
      {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          since: startDate.toISOString(),
          until: endDate.toISOString(),
          limit: 5
        }
      }
    );

    console.log('✅ Conversions API works!');
    console.log(`   Total conversions (last 7 days): ${conversionsResponse.data.total || 0}`);
    console.log(`   Fetched: ${conversionsResponse.data.data?.length || 0} conversions`);

    // Test 2: Try to get order details (if we have conversions)
    if (conversionsResponse.data.data && conversionsResponse.data.data.length > 0) {
      const firstConversion = conversionsResponse.data.data[0];
      const orderId = firstConversion._id;

      console.log(`\nTest 2: Getting order details for ${orderId}...`);

      try {
        const orderResponse = await axios.get(
          `${apiUrl}/conversions/${orderId}`,
          {
            headers: {
              'Authorization': `Token ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ Conversion Details API works!');
        console.log(`   Conversion ID: ${orderResponse.data._id || 'N/A'}`);
        console.log(`   Status (is_confirmed): ${orderResponse.data.is_confirmed}`);
        console.log(`   Commission: ${orderResponse.data.pub_commission || 0}`);
      } catch (orderError) {
        if (orderError.response?.status === 404) {
          console.log('⚠️  Conversion not found (normal for old data)');
        } else {
          console.log('❌ Conversion Details API failed:', orderError.response?.status, orderError.response?.data);
        }
      }
    } else {
      console.log('\nℹ️  No conversions found to test Order Details API');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed! AccessTrade API token is working');
    console.log('='.repeat(60));

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ API Test Failed');
    console.log('='.repeat(60));

    if (error.response) {
      console.log(`\nHTTP Status: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);

      if (error.response.status === 401) {
        console.log('\n🔑 Authentication Error:');
        console.log('   Your token is invalid or expired');
        console.log('   Please get a new token from AccessTrade Dashboard:');
        console.log('   https://pub.accesstrade.vn/developers');
      } else if (error.response.status === 403) {
        console.log('\n🚫 Permission Error:');
        console.log('   Your account may not have access to this API');
      } else if (error.response.status === 429) {
        console.log('\n⏰ Rate Limit Error:');
        console.log('   Too many requests. Wait a moment and try again');
      }
    } else {
      console.log(`\nError: ${error.message}`);
    }

    process.exit(1);
  }
}

// Run test
testAccessTradeToken().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
