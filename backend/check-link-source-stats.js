require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA LINK SOURCE TRONG CLICKS ===\n');

    // Check table structure
    console.log('1. CẤU TRÚC BẢNG CLICKS:\n');
    const columns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'clicks'
      ORDER BY ordinal_position
    `);

    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    // Check link_source values in last 7 days
    console.log('\n\n2. THỐNG KÊ LINK_SOURCE (7 ngày qua):\n');
    const sourceStats = await pool.query(`
      SELECT
        link_source,
        COUNT(*) as count
      FROM clicks
      WHERE clicked_at > NOW() - INTERVAL '7 days'
      GROUP BY link_source
      ORDER BY count DESC
    `);

    if (sourceStats.rows.length === 0) {
      console.log('Không có dữ liệu clicks trong 7 ngày qua');
    } else {
      sourceStats.rows.forEach(row => {
        console.log(`  ${row.link_source || 'NULL'}: ${row.count} clicks`);
      });
    }

    // Check sample data
    console.log('\n\n3. MẪU DỮ LIỆU CLICKS (10 gần nhất):\n');
    const samples = await pool.query(`
      SELECT
        c.id,
        c.clicked_at,
        c.link_source,
        c.click_type,
        c.status,
        m.name as merchant_name,
        u.username
      FROM clicks c
      LEFT JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.clicked_at > NOW() - INTERVAL '7 days'
      ORDER BY c.clicked_at DESC
      LIMIT 10
    `);

    if (samples.rows.length === 0) {
      console.log('Không có dữ liệu');
    } else {
      samples.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.clicked_at.toLocaleString('vi-VN')}`);
        console.log(`   User: ${row.username || 'N/A'}`);
        console.log(`   Merchant: ${row.merchant_name || 'N/A'}`);
        console.log(`   Link Source: ${row.link_source || 'NULL'}`);
        console.log(`   Click Type: ${row.click_type || 'N/A'}`);
        console.log(`   Status: ${row.status || 'N/A'}`);
        console.log('');
      });
    }

    // Check API vs DIY logic
    console.log('\n4. KIỂM TRA ĐIỀU KIỆN TẠO LINK:\n');

    // Check if AccessTrade token is configured
    const atToken = process.env.ACCESSTRADE_ACCESS_TOKEN;
    console.log(`AccessTrade API Token: ${atToken ? 'CÓ CẤU HÌNH ✅' : 'CHƯA CẤU HÌNH ❌'}`);

    // Check merchants with campaign_id
    const merchantsWithApi = await pool.query(`
      SELECT id, name, campaign_id, api_type
      FROM merchants
      WHERE campaign_id IS NOT NULL AND campaign_id != ''
      LIMIT 5
    `);

    console.log(`\nMerchants có campaign_id (hỗ trợ API):`);
    if (merchantsWithApi.rows.length === 0) {
      console.log('  Không có merchant nào có campaign_id');
    } else {
      merchantsWithApi.rows.forEach(m => {
        console.log(`  - ${m.name}: campaign_id=${m.campaign_id}, api_type=${m.api_type || 'NULL'}`);
      });
    }

    await pool.end();
    console.log('\n✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
