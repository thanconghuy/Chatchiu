// Test Retry Service manually
require('dotenv').config();
const retryService = require('./backend/services/retryService');
const logger = require('./backend/utils/logger');

console.log('🧪 Testing Retry Service\n');
console.log('='.repeat(60));

async function testRetryService() {
  try {
    console.log('\n📊 Step 1: Get Retry Statistics');
    console.log('-'.repeat(60));

    const stats = await retryService.getStats();
    console.log('Current Stats:', {
      unmatchedClicks: stats.unmatchedClicks,
      expiringClicks: stats.expiringClicks,
      isRunning: stats.isRunning
    });

    console.log('\n🔄 Step 2: Run Retry on Unmatched Clicks');
    console.log('-'.repeat(60));
    console.log('This will attempt to match unmatched clicks with conversions from AccessTrade...\n');

    const results = await retryService.retryUnmatchedClicks({
      daysOld: 1,  // Retry clicks older than 1 day
      limit: 50    // Max 50 clicks per run (for testing)
    });

    console.log('\n✅ Retry Completed!');
    console.log('-'.repeat(60));
    console.log('Results:');
    console.log(`  Total clicks processed: ${results.total}`);
    console.log(`  Successfully matched: ${results.matched} ✅`);
    console.log(`  Still unmatched: ${results.stillUnmatched} ⏳`);
    console.log(`  Expired: ${results.expired} ⚠️`);
    console.log(`  Errors: ${results.errors} ❌`);

    if (results.details && results.details.length > 0) {
      console.log('\nDetails (first 5):');
      results.details.slice(0, 5).forEach((detail, i) => {
        console.log(`  ${i + 1}. Click ${detail.clickId}: ${detail.status}`);
        if (detail.conversionId) {
          console.log(`     → Matched with conversion: ${detail.conversionId}`);
        }
      });
    }

    console.log('\n📈 Step 3: Get Expiring Clicks Report');
    console.log('-'.repeat(60));

    const expiringClicks = await retryService.getExpiringClicksReport(3, 10);

    if (expiringClicks.length > 0) {
      console.log(`Found ${expiringClicks.length} clicks expiring within 3 days:\n`);
      expiringClicks.slice(0, 5).forEach((click, i) => {
        console.log(`  ${i + 1}. Click ${click.clickId}`);
        console.log(`     Merchant: ${click.merchantName}`);
        console.log(`     Days remaining: ${click.daysRemaining}`);
        console.log(`     Expires at: ${new Date(click.expiresAt).toLocaleString('vi-VN')}`);
      });
    } else {
      console.log('No clicks expiring soon. Good! ✅');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testRetryService();
