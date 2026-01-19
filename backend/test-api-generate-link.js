require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const accessTradeLinkService = require('./services/accessTradeLink');
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== TEST ACCESSTRADE API GENERATE LINK ===\n');

    // Get Shopee merchant
    const merchantResult = await pool.query(`
      SELECT * FROM merchants WHERE id = 'shopee' LIMIT 1
    `);

    if (merchantResult.rows.length === 0) {
      console.log('❌ Merchant Shopee không tồn tại');
      process.exit(1);
    }

    const merchant = merchantResult.rows[0];
    console.log('Merchant:', merchant.name);
    console.log('Campaign ID:', merchant.campaign_id);
    console.log('API Type:', merchant.api_type);
    console.log('Deep Link Base:', merchant.deep_link_base);
    console.log('');

    // Mock user
    const user = {
      id: 'test-user-id',
      username: 'testuser'
    };

    // Mock click ID
    const clickId = 'test-click-' + Date.now();

    // Test with button click (no product URL)
    console.log('\n📍 TEST 1: Button Click (không có product URL)\n');
    try {
      const result1 = await accessTradeLinkService.generateLink(
        user,
        merchant,
        clickId + '-button',
        'button',
        null
      );
      console.log('✅ SUCCESS!');
      console.log('Affiliate URL:', result1.affiliateUrl.substring(0, 100) + '...');
      console.log('Source:', result1.source);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }

    // Test with link click (có product URL)
    console.log('\n📍 TEST 2: Link Click (có product URL)\n');
    const productUrl = 'https://shopee.vn/product-test-123';
    try {
      const result2 = await accessTradeLinkService.generateLink(
        user,
        merchant,
        clickId + '-link',
        'link',
        productUrl
      );
      console.log('✅ SUCCESS!');
      console.log('Affiliate URL:', result2.affiliateUrl.substring(0, 100) + '...');
      console.log('Source:', result2.source);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }

    // Test with real Shopee URL
    console.log('\n📍 TEST 3: Link Click (Shopee URL thực)\n');
    const realShopeeUrl = 'https://shopee.vn/Vinamil-Optimum-Gold-4-1.5kg-i.88201679.29839823775';
    try {
      const result3 = await accessTradeLinkService.generateLink(
        user,
        merchant,
        clickId + '-real',
        'link',
        realShopeeUrl
      );
      console.log('✅ SUCCESS!');
      console.log('Affiliate URL:', result3.affiliateUrl.substring(0, 100) + '...');
      console.log('Source:', result3.source);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
    }

    await pool.end();
    console.log('\n✅ Test hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
