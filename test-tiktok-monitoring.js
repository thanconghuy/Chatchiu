/**
 * Test TikTok Shop API Monitoring
 * Verify monitoring endpoint returns correct metrics
 */

const axios = require('axios');

const API_URL = 'http://localhost:3007/api';

// You need to replace this with a valid admin token
// Get it by logging in as admin
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

async function testTikTokMonitoring() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              TIKTOK SHOP API MONITORING TEST                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  if (!ADMIN_TOKEN) {
    console.log('⚠️  ADMIN_TOKEN not set. Testing with unauthenticated request...\n');
    console.log('To get a token:');
    console.log('1. Login as admin via /api/auth/login');
    console.log('2. Copy the token from response');
    console.log('3. Run: ADMIN_TOKEN=<your-token> node test-tiktok-monitoring.js\n');
  }

  const periods = ['24h', '7d', '30d'];

  for (const period of periods) {
    console.log(`\n📊 Testing Period: ${period}`);
    console.log('─'.repeat(80));

    try {
      const response = await axios.get(
        `${API_URL}/admin/monitoring/tiktok-api?period=${period}`,
        {
          headers: ADMIN_TOKEN ? {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
          } : {},
          validateStatus: () => true // Accept all status codes
        }
      );

      if (response.status === 401) {
        console.log('❌ Unauthorized - Need admin token');
        continue;
      }

      if (response.status === 500) {
        console.log('❌ Server error:', response.data.message);
        continue;
      }

      if (response.data.success) {
        const { summary, productMetrics, dailyData, recommendations } = response.data.data;

        console.log('\n✅ API Response Successful\n');

        console.log('📈 Summary Metrics:');
        console.log(`├─ Total Links: ${summary.totalLinks}`);
        console.log(`├─ API Success: ${summary.apiLinks} (${summary.apiSuccessRate}%)`);
        console.log(`├─ API Fallback: ${summary.fallbackLinks} (${summary.apiFailureRate}%)`);
        console.log(`├─ With Product Info: ${summary.linksWithProductInfo}`);
        console.log(`└─ Conversion Rate: ${summary.conversionRate}%`);

        console.log('\n🛍️  Product Metrics:');
        console.log(`├─ Total Products: ${productMetrics.totalProducts}`);
        console.log(`├─ Avg Commission Rate: ${productMetrics.avgCommissionRate} bps`);
        console.log(`└─ Total Product Value: ${productMetrics.totalProductValue.toLocaleString('vi-VN')} VND`);

        console.log('\n📅 Daily Breakdown:');
        if (dailyData.length > 0) {
          dailyData.slice(0, 5).forEach(day => {
            console.log(`├─ ${day.date}: ${day.total} links (${day.apiSuccess} API, ${day.apiFallback} fallback) - ${day.successRate}% success`);
          });
          if (dailyData.length > 5) {
            console.log(`└─ ... and ${dailyData.length - 5} more days`);
          }
        } else {
          console.log('└─ No data available');
        }

        console.log('\n💡 Recommendations:');
        recommendations.forEach(rec => {
          const icon = rec.type === 'success' ? '✅' : rec.type === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`${icon} ${rec.message}`);
        });

      } else {
        console.log('❌ Request failed:', response.data.message);
      }

    } catch (error) {
      console.log('❌ Error:', error.message);
      if (error.response) {
        console.log('   Status:', error.response.status);
        console.log('   Data:', error.response.data);
      }
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST COMPLETE                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📚 Monitoring Endpoint: GET /api/admin/monitoring/tiktok-api');
  console.log('📚 Query Parameters:');
  console.log('   ├─ period: 24h | 7d | 30d (default: 7d)');
  console.log('   └─ Requires: Admin authentication');

  console.log('\n📊 Response Structure:');
  console.log('   ├─ summary: Total links, API success/failure rates, conversion rate');
  console.log('   ├─ productMetrics: Product count, avg commission, total value');
  console.log('   ├─ dailyData: Daily breakdown of link generation');
  console.log('   └─ recommendations: AI-generated recommendations based on metrics\n');
}

testTikTokMonitoring();
