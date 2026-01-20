require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA CHI TIẾT CLICKS ===\n');

    // Check click types vs link sources
    console.log('1. CLICK TYPE VS LINK SOURCE (7 ngày qua):\n');
    const typeVsSource = await pool.query(`
      SELECT
        click_type,
        link_source,
        COUNT(*) as count
      FROM clicks
      WHERE clicked_at > NOW() - INTERVAL '7 days'
      GROUP BY click_type, link_source
      ORDER BY click_type, link_source
    `);

    if (typeVsSource.rows.length === 0) {
      console.log('Không có dữ liệu');
    } else {
      typeVsSource.rows.forEach(row => {
        console.log(`  ${row.click_type || 'NULL'} + ${row.link_source || 'NULL'}: ${row.count} clicks`);
      });
    }

    // Check 5 most recent "link" type clicks
    console.log('\n\n2. 5 CLICKS GẦN NHẤT CÓ click_type = "link":\n');
    const linkClicks = await pool.query(`
      SELECT
        c.id,
        c.clicked_at,
        c.click_type,
        c.link_source,
        c.original_url,
        c.affiliate_url,
        m.name as merchant_name,
        m.campaign_id,
        m.api_type
      FROM clicks c
      LEFT JOIN merchants m ON c.merchant_id::text = m.id::text
      WHERE c.click_type = 'link'
        AND c.clicked_at > NOW() - INTERVAL '7 days'
      ORDER BY c.clicked_at DESC
      LIMIT 5
    `);

    if (linkClicks.rows.length === 0) {
      console.log('Không có clicks nào với click_type = "link"');
    } else {
      linkClicks.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.clicked_at.toLocaleString('vi-VN')}`);
        console.log(`   Merchant: ${row.merchant_name || 'N/A'}`);
        console.log(`   Campaign ID: ${row.campaign_id || 'N/A'}`);
        console.log(`   API Type: ${row.api_type || 'N/A'}`);
        console.log(`   Click Type: ${row.click_type}`);
        console.log(`   Link Source: ${row.link_source}`);
        console.log(`   Original URL: ${row.original_url?.substring(0, 60) || 'N/A'}...`);
        console.log(`   Affiliate URL: ${row.affiliate_url?.substring(0, 60) || 'N/A'}...`);
        console.log('');
      });
    }

    // Check merchants configuration
    console.log('\n3. CẤU HÌNH MERCHANTS (có clicks trong 7 ngày):\n');
    const merchantsConfig = await pool.query(`
      SELECT DISTINCT
        m.id,
        m.name,
        m.campaign_id,
        m.api_type,
        m.deep_link_base
      FROM clicks c
      JOIN merchants m ON c.merchant_id::text = m.id::text
      WHERE c.clicked_at > NOW() - INTERVAL '7 days'
    `);

    merchantsConfig.rows.forEach(row => {
      console.log(`- ${row.name}:`);
      console.log(`  ID: ${row.id}`);
      console.log(`  Campaign ID: ${row.campaign_id || 'KHÔNG CÓ ❌'}`);
      console.log(`  API Type: ${row.api_type || 'KHÔNG CÓ'}`);
      console.log(`  Deep Link Base: ${row.deep_link_base || 'KHÔNG CÓ'}`);
      console.log('');
    });

    await pool.end();
    console.log('✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
