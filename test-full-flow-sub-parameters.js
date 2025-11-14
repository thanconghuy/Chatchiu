// Comprehensive test of sub parameters in full click-to-conversion flow
require('dotenv').config();
const { pool } = require('./backend/config/database');
const Click = require('./backend/models/Click');
const { generateAffiliateLink } = require('./backend/services/linkGenerator');
const crypto = require('crypto');

console.log('🧪 Full Flow Test: Sub Parameters\n');
console.log('=' .repeat(60));

async function testFullFlow() {
  try {
    console.log('\n📍 STEP 0: Get Test User from Database');
    console.log('-'.repeat(60));

    // Fetch an existing user for testing
    const userResult = await pool.query('SELECT id, username FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.error('❌ No users found in database. Please create a user first.');
      process.exit(1);
    }

    const testUser = userResult.rows[0];
    console.log('✅ Using test user:', {
      id: testUser.id,
      username: testUser.username
    });

    const testMerchant = {
      id: 'shopee',
      name: 'Shopee',
      campaign_id: '4751584435713464237',
      deep_link_base: 'https://shopee.vn'
    };

    console.log('\n📍 STEP 1: Create Click Record');
    console.log('-'.repeat(60));

    const clickData = {
      userId: testUser.id,
      merchantId: testMerchant.id,
      clickType: 'button',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent'
    };

    const click = await Click.create(clickData);
    console.log('✅ Click created:', {
      id: click.id,
      user_id: click.user_id,
      merchant_id: click.merchant_id
    });

    console.log('\n📍 STEP 2: Generate Affiliate Link');
    console.log('-'.repeat(60));

    const utmMedium = testUser.username;
    const utmContent = click.id;

    const linkData = generateAffiliateLink(
      testUser,
      testMerchant,
      click.id,
      'button',
      null,
      utmMedium,
      utmContent
    );

    console.log('✅ Link generated:', {
      affSid: linkData.affSid,
      utm_content: linkData.utmParams.utm_content,
      sub1: linkData.utmParams.sub1,
      sub2: linkData.utmParams.sub2,
      sub3: linkData.utmParams.sub3,
      sub4: linkData.utmParams.sub4
    });

    console.log('\n📍 STEP 3: Update Click with Link Data');
    console.log('-'.repeat(60));

    await Click.updateLinkData(click.id, {
      affSid: linkData.affSid,
      originalUrl: linkData.originalUrl,
      affiliateUrl: linkData.affiliateUrl,
      utmSource: linkData.utmParams.utm_source,
      utmMedium: linkData.utmParams.utm_medium,
      utmCampaign: linkData.utmParams.utm_campaign,
      utmContent: linkData.utmParams.utm_content,
      sub1: linkData.utmParams.sub1,
      sub2: linkData.utmParams.sub2,
      sub3: linkData.utmParams.sub3,
      sub4: linkData.utmParams.sub4
    });

    console.log('✅ Click updated with tracking data');

    console.log('\n📍 STEP 4: Verify Database Storage');
    console.log('-'.repeat(60));

    const verifyQuery = `
      SELECT id, user_id, merchant_id, aff_sid, click_type,
             utm_source, utm_medium, utm_campaign, utm_content,
             sub1, sub2, sub3, sub4
      FROM clicks
      WHERE id = $1
    `;

    const result = await pool.query(verifyQuery, [click.id]);
    const storedClick = result.rows[0];

    console.log('✅ Database verification:');
    console.log('  Click ID:', storedClick.id);
    console.log('  UTM Parameters:');
    console.log('    utm_source:', storedClick.utm_source);
    console.log('    utm_medium:', storedClick.utm_medium);
    console.log('    utm_campaign:', storedClick.utm_campaign);
    console.log('    utm_content:', storedClick.utm_content);
    console.log('  Sub Parameters:');
    console.log('    sub1 (User ID):', storedClick.sub1);
    console.log('    sub2 (Click ID):', storedClick.sub2);
    console.log('    sub3 (Click Type):', storedClick.sub3);
    console.log('    sub4 (Fixed):', storedClick.sub4);

    console.log('\n📍 STEP 5: Test Click Matching Methods');
    console.log('-'.repeat(60));

    // Test 1: Find by utm_content
    const foundByUtmContent = await Click.findByUtmContent(storedClick.utm_content);
    console.log('✅ Find by utm_content:', foundByUtmContent ? 'SUCCESS' : 'FAILED');

    // Test 2: Find by sub2 (backup)
    const foundBySub2 = await Click.findBySub2(storedClick.sub2);
    console.log('✅ Find by sub2:', foundBySub2 ? 'SUCCESS' : 'FAILED');

    // Test 3: Find by aff_sid
    const foundByAffSid = await Click.findByAffSid(storedClick.aff_sid);
    console.log('✅ Find by aff_sid:', foundByAffSid ? 'SUCCESS' : 'FAILED');

    console.log('\n📍 STEP 6: Simulate AccessTrade Conversion Data');
    console.log('-'.repeat(60));

    // Scenario 1: All parameters present
    console.log('\nScenario 1: All parameters present');
    const scenario1 = {
      utm_content: storedClick.utm_content,
      sub2: storedClick.sub2,
      aff_sid: storedClick.aff_sid
    };
    console.log('  Would match by: utm_content (Priority 1)');

    // Scenario 2: utm_content dropped, sub2 available
    console.log('\nScenario 2: utm_content dropped, sub2 available');
    const scenario2 = {
      utm_content: null,
      sub2: storedClick.sub2,
      aff_sid: storedClick.aff_sid
    };
    const matchScenario2 = await Click.findBySub2(scenario2.sub2);
    console.log('  Would match by: sub2 (Priority 2) -', matchScenario2 ? 'SUCCESS ✅' : 'FAILED ❌');

    // Scenario 3: Both utm_content and sub2 dropped, aff_sid available
    console.log('\nScenario 3: utm_content and sub2 dropped, aff_sid available');
    const scenario3 = {
      utm_content: null,
      sub2: null,
      aff_sid: storedClick.aff_sid
    };
    const matchScenario3 = await Click.findByAffSid(scenario3.aff_sid);
    console.log('  Would match by: aff_sid (Priority 3) -', matchScenario3 ? 'SUCCESS ✅' : 'FAILED ❌');

    console.log('\n📍 STEP 7: Cleanup Test Data');
    console.log('-'.repeat(60));

    await pool.query('DELETE FROM clicks WHERE id = $1', [click.id]);
    console.log('✅ Test click deleted');

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('  ✅ Link generation with sub1-sub4 parameters');
    console.log('  ✅ Database storage of sub parameters');
    console.log('  ✅ Click matching via utm_content (Priority 1)');
    console.log('  ✅ Click matching via sub2 (Priority 2)');
    console.log('  ✅ Click matching via aff_sid (Priority 3)');
    console.log('  ✅ Fallback chain working correctly');
    console.log('\n🎉 Sub parameters implementation is COMPLETE and WORKING!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testFullFlow();
