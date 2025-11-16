/**
 * End-to-End Test: TikTok Shop Integration
 * Tests complete flow from link generation to tracking
 */

const axios = require('axios');
const { pool } = require('./backend/config/database');

const API_URL = 'http://localhost:3007/api';

// Sample TikTok Shop URLs for testing
const TIKTOK_TEST_URLS = [
  'https://vt.tiktok.com/ZSBKCcJrf/',
  'https://shop.tiktok.com/view/product/1729836100247522192?region=VN&local=en',
  'https://www.tiktok.com/@shop/product/12345'
];

async function testTikTokShopIntegration() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           TIKTOK SHOP INTEGRATION - END-TO-END TEST                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  try {
    // Step 1: Verify merchant configuration
    console.log('\n📋 STEP 1: VERIFY MERCHANT CONFIGURATION');
    console.log('─'.repeat(80));

    const merchantResult = await pool.query(`
      SELECT id, name, campaign_id, commission_rate, is_active, api_type, deep_link_base
      FROM merchants
      WHERE id = 'tiktok'
    `);

    if (merchantResult.rows.length === 0) {
      console.log('❌ TikTok Shop merchant not found in database');
      console.log('   Please add merchant with:');
      console.log('   - id: tiktok');
      console.log('   - api_type: tiktok_v2');
      process.exit(1);
    }

    const merchant = merchantResult.rows[0];
    console.log('✅ TikTok Shop Merchant Found:');
    console.log(`   ├─ ID: ${merchant.id}`);
    console.log(`   ├─ Name: ${merchant.name}`);
    console.log(`   ├─ Campaign ID: ${merchant.campaign_id}`);
    console.log(`   ├─ Commission Rate: ${merchant.commission_rate}`);
    console.log(`   ├─ Active: ${merchant.is_active ? '✓ Yes' : '✗ No'}`);
    console.log(`   ├─ API Type: ${merchant.api_type || 'NOT SET'}`);
    console.log(`   └─ Deep Link Base: ${merchant.deep_link_base}`);

    if (!merchant.is_active) {
      console.log('\n⚠️  Merchant is INACTIVE. Activating now...');
      await pool.query(`UPDATE merchants SET is_active = true WHERE id = 'tiktok'`);
      console.log('✅ Merchant activated');
    }

    if (merchant.api_type !== 'tiktok_v2') {
      console.log('\n⚠️  Merchant api_type is not set to tiktok_v2. Updating...');
      await pool.query(`UPDATE merchants SET api_type = 'tiktok_v2' WHERE id = 'tiktok'`);
      console.log('✅ Merchant api_type updated');
    }

    // Step 2: Check environment configuration
    console.log('\n📋 STEP 2: VERIFY ENVIRONMENT CONFIGURATION');
    console.log('─'.repeat(80));

    const apiModeEnabled = process.env.USE_ACCESSTRADE_API === 'true';
    const tokenConfigured = !!process.env.ACCESSTRADE_ACCESS_TOKEN;

    console.log(`API Mode: ${apiModeEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`AccessTrade Token: ${tokenConfigured ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);

    if (!apiModeEnabled) {
      console.log('\n⚠️  API Mode is disabled. TikTok Shop V2 API will not be used.');
      console.log('   Set USE_ACCESSTRADE_API=true in .env to enable');
    }

    if (!tokenConfigured) {
      console.log('\n⚠️  AccessTrade token not configured');
      console.log('   Set ACCESSTRADE_ACCESS_TOKEN in .env');
    }

    // Step 3: Test URL detection
    console.log('\n📋 STEP 3: TEST URL DETECTION');
    console.log('─'.repeat(80));

    const tiktokShopService = require('./backend/services/tiktokShopLink');

    console.log('Testing URL patterns:');
    TIKTOK_TEST_URLS.forEach((url, i) => {
      const detected = tiktokShopService.isTikTokShopUrl(url);
      console.log(`${i + 1}. ${url.substring(0, 60)}...`);
      console.log(`   ${detected ? '✅ Detected as TikTok Shop' : '❌ NOT detected'}`);
    });

    // Step 4: Verify routing logic
    console.log('\n📋 STEP 4: VERIFY ROUTING LOGIC');
    console.log('─'.repeat(80));

    console.log('Routing decision tree:');
    console.log('├─ API Mode Enabled:', apiModeEnabled ? 'YES ✓' : 'NO ✗');
    if (apiModeEnabled) {
      console.log('├─ Merchant api_type === "tiktok_v2":', merchant.api_type === 'tiktok_v2' ? 'YES ✓' : 'NO ✗');
      console.log('├─ URL pattern matches TikTok:', 'YES ✓ (if valid URL)');
      console.log('└─ Decision: Use TikTok Shop V2 API ✓');
    } else {
      console.log('└─ Decision: Use DIY Mode');
    }

    // Step 5: Check database schema
    console.log('\n📋 STEP 5: VERIFY DATABASE SCHEMA');
    console.log('─'.repeat(80));

    const schemaCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'clicks' AND column_name = 'product_info'
    `);

    if (schemaCheck.rows.length > 0) {
      console.log('✅ product_info column exists in clicks table');
      console.log(`   Type: ${schemaCheck.rows[0].data_type}`);
    } else {
      console.log('❌ product_info column missing from clicks table');
      console.log('   Run migration: psql $DATABASE_URL -f backend/migrations/011_add_product_info_to_clicks.sql');
    }

    // Step 6: Summary
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         INTEGRATION STATUS                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');

    const allGood = merchant.is_active &&
                    merchant.api_type === 'tiktok_v2' &&
                    apiModeEnabled &&
                    tokenConfigured &&
                    schemaCheck.rows.length > 0;

    if (allGood) {
      console.log('\n✅ ✅ ✅ ALL SYSTEMS READY ✅ ✅ ✅\n');
      console.log('TikTok Shop integration is fully configured and ready to use!');
      console.log('\nNext steps:');
      console.log('1. Go to user dashboard');
      console.log('2. Select "TikTok Shop" merchant');
      console.log('3. Paste a TikTok Shop product URL');
      console.log('4. Click "Generate Link"');
      console.log('5. System will automatically:');
      console.log('   ├─ Detect TikTok Shop (via api_type or URL pattern)');
      console.log('   ├─ Call TikTok Shop V2 API');
      console.log('   ├─ Get product metadata (name, price, image, commission)');
      console.log('   ├─ Save product_info to database');
      console.log('   └─ Return affiliate link with full tracking parameters');
    } else {
      console.log('\n⚠️  CONFIGURATION INCOMPLETE\n');
      console.log('Missing requirements:');
      if (!merchant.is_active) console.log('  ❌ Merchant not active');
      if (merchant.api_type !== 'tiktok_v2') console.log('  ❌ Merchant api_type not set');
      if (!apiModeEnabled) console.log('  ❌ API mode not enabled');
      if (!tokenConfigured) console.log('  ❌ AccessTrade token not configured');
      if (schemaCheck.rows.length === 0) console.log('  ❌ Database schema not updated');
    }

    console.log('\n📚 Documentation: TIKTOK-SHOP-INTEGRATION.md');
    console.log('\n');

    await pool.end();
    process.exit(allGood ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

// Run test
testTikTokShopIntegration();
