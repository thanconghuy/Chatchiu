require('dotenv').config();
const accessTradeLinkService = require('./backend/services/accessTradeLink');

async function testLinkGeneration() {
  try {
    console.log('=== TESTING ACCESSTRADE API LINK GENERATION ===\n');

    // Check if API is available
    const isAvailable = await accessTradeLinkService.isAvailable();
    console.log('1. API Available:', isAvailable);

    if (!isAvailable) {
      console.log('ERROR: API not available. Check ACCESSTRADE_ACCESS_TOKEN in .env');
      return;
    }

    // Test connection
    console.log('\n2. Testing API connection...');
    const testResult = await accessTradeLinkService.testConnection();
    console.log('Connection test result:', JSON.stringify(testResult, null, 2));

    if (!testResult.success) {
      console.log('ERROR: API connection failed');
      return;
    }

    // Test link generation
    console.log('\n3. Testing link generation...');

    const testUser = {
      id: 'test-user-123',
      username: 'testuser'
    };

    const testMerchant = {
      id: 'shopee',
      name: 'Shopee',
      campaign_id: '4751584435713464237',
      deep_link_base: 'https://shopee.vn'
    };

    const testClickId = 'test-click-' + Date.now();
    const testProductUrl = 'https://shopee.vn/product/123456';

    try {
      const linkData = await accessTradeLinkService.generateLink(
        testUser,
        testMerchant,
        testClickId,
        'link',
        testProductUrl
      );

      console.log('✅ Link generation SUCCESS!');
      console.log('Generated link data:');
      console.log('  - Source:', linkData.source);
      console.log('  - Aff SID:', linkData.affSid);
      console.log('  - Affiliate URL:', linkData.affiliateUrl.substring(0, 100) + '...');
      console.log('  - Original URL:', linkData.originalUrl);
      console.log('  - UTM Source:', linkData.utmParams.utm_source);
      console.log('  - UTM Medium:', linkData.utmParams.utm_medium);
      console.log('  - UTM Content:', linkData.utmParams.utm_content);
      console.log('  - Sub2 (Click ID):', linkData.utmParams.sub2);
    } catch (error) {
      console.log('❌ Link generation FAILED');
      console.log('Error:', error.message);
      console.log('Stack:', error.stack);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testLinkGeneration();
