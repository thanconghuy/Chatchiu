// Test script to verify sub parameters are properly generated
require('dotenv').config();
const { generateAffiliateLink } = require('./backend/services/linkGenerator');

console.log('🧪 Testing sub parameters in link generation...\n');

// Mock user and merchant data
const user = {
  id: 'test-user-123',
  username: 'testuser'
};

const merchant = {
  id: 'shopee',
  name: 'Shopee',
  campaign_id: '4751584435713464237',
  deep_link_base: 'https://shopee.vn'
};

const clickId = 'test-click-uuid-456';
const clickType = 'button';
const productUrl = null;
const utmMedium = user.username;
const utmContent = clickId;

try {
  console.log('Input parameters:');
  console.log('  User ID:', user.id);
  console.log('  Username:', user.username);
  console.log('  Click ID:', clickId);
  console.log('  Click Type:', clickType);
  console.log('\n');

  const result = generateAffiliateLink(
    user,
    merchant,
    clickId,
    clickType,
    productUrl,
    utmMedium,
    utmContent
  );

  console.log('✅ Link generation successful!\n');
  console.log('Generated Link:');
  console.log('  Affiliate URL:', result.affiliateUrl);
  console.log('\n');

  console.log('UTM Parameters:');
  console.log('  utm_source:', result.utmParams.utm_source);
  console.log('  utm_campaign:', result.utmParams.utm_campaign);
  console.log('  utm_medium:', result.utmParams.utm_medium);
  console.log('  utm_content:', result.utmParams.utm_content);
  console.log('\n');

  console.log('Sub Parameters (NEW):');
  console.log('  sub1 (User ID):', result.utmParams.sub1);
  console.log('  sub2 (Click ID):', result.utmParams.sub2);
  console.log('  sub3 (Click Type):', result.utmParams.sub3);
  console.log('  sub4 (Fixed):', result.utmParams.sub4);
  console.log('\n');

  // Verify sub parameters are present
  if (result.utmParams.sub1 && result.utmParams.sub2 && result.utmParams.sub3) {
    console.log('✅ All sub parameters are present!');
    console.log('✅ Sub1 matches User ID:', result.utmParams.sub1 === user.id);
    console.log('✅ Sub2 matches Click ID:', result.utmParams.sub2 === clickId);
    console.log('✅ Sub3 matches Click Type:', result.utmParams.sub3 === clickType);
  } else {
    console.log('❌ Missing sub parameters!');
  }

  // Parse URL to verify parameters are in the query string
  const url = new URL(result.affiliateUrl);
  console.log('\n');
  console.log('Query String Verification:');
  console.log('  sub1 in URL:', url.searchParams.get('sub1'));
  console.log('  sub2 in URL:', url.searchParams.get('sub2'));
  console.log('  sub3 in URL:', url.searchParams.get('sub3'));
  console.log('  sub4 in URL:', url.searchParams.get('sub4'));

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error);
  process.exit(1);
}
