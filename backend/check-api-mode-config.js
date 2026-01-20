require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const accessTradeLinkService = require('./services/accessTradeLink');

(async () => {
  try {
    console.log('=== KIỂM TRA CẤU HÌNH API MODE ===\n');

    // Check environment variables
    console.log('1. ENVIRONMENT VARIABLES:\n');
    console.log(`USE_ACCESSTRADE_API = "${process.env.USE_ACCESSTRADE_API}"`);
    console.log(`USE_ACCESSTRADE_API === 'true': ${process.env.USE_ACCESSTRADE_API === 'true'}`);
    console.log(`ACCESSTRADE_ACCESS_TOKEN: ${process.env.ACCESSTRADE_ACCESS_TOKEN ? 'CÓ CẤU HÌNH ✅' : 'CHƯA CẤU HÌNH ❌'}`);

    // Check AccessTrade service availability
    console.log('\n2. ACCESSTRADE SERVICE:\n');
    const isAvailable = await accessTradeLinkService.isAvailable();
    console.log(`isAvailable(): ${isAvailable ? '✅ Sẵn sàng' : '❌ Không sẵn sàng'}`);

    // Test connection
    console.log('\n3. TEST CONNECTION:\n');
    const testResult = await accessTradeLinkService.testConnection();
    console.log('Result:', testResult);

    // Summary
    console.log('\n4. KẾT LUẬN:\n');
    if (process.env.USE_ACCESSTRADE_API !== 'true') {
      console.log('❌ API Mode CHƯA được bật!');
      console.log('   → Tất cả links đều sử dụng Deeplink (DIY)');
      console.log('   → Cần set USE_ACCESSTRADE_API=true trong .env hoặc settings');
    } else if (!isAvailable) {
      console.log('⚠️  API Mode đã bật nhưng AccessTrade service không khả dụng');
      console.log('   → Có thể thiếu ACCESSTRADE_ACCESS_TOKEN');
      console.log('   → Hoặc token không hợp lệ');
    } else {
      console.log('✅ API Mode đã bật và AccessTrade service sẵn sàng!');
    }

    console.log('\n✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
