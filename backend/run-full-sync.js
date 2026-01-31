require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { syncConversions } = require('./jobs/syncConversions');
const AutoSyncConfig = require('./models/AutoSyncConfig');
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== CHẠY FULL SYNC ===\n');
    console.log('Ngày hiện tại:', new Date().toLocaleString('vi-VN'));
    console.log('');

    // ========================================
    // STEP 1: Check current status
    // ========================================
    console.log('📊 STEP 1: Trạng thái trước khi sync:\n');
    const before = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions) as at_conversions,
        (SELECT COUNT(*) FROM system_conversions) as system_conversions,
        (SELECT COUNT(*) FROM conversions WHERE click_id IS NOT NULL) as matched_conversions
    `);
    console.log(`  Conversions (AT): ${before.rows[0].at_conversions}`);
    console.log(`  Matched với clicks: ${before.rows[0].matched_conversions}`);
    console.log(`  System Conversions: ${before.rows[0].system_conversions}`);

    // ========================================
    // STEP 2: Sync from AccessTrade API
    // ========================================
    console.log('\n\n🔄 STEP 2: Sync từ AccessTrade API (30 ngày)...\n');

    await AutoSyncConfig.updateLastRun('running', 'Full sync in progress...');

    // Sync 30 days to get all recent conversions
    const syncResult = await syncConversions(30, 'manual');

    console.log(`\n✅ Sync từ AT API hoàn tất:`);
    console.log(`  - Total fetched: ${syncResult.total || 0}`);
    console.log(`  - Created: ${syncResult.created || syncResult.imported || 0}`);
    console.log(`  - Updated: ${syncResult.updated || 0}`);
    console.log(`  - Skipped/Duplicates: ${syncResult.skipped || syncResult.duplicates || 0}`);

    // ========================================
    // STEP 3: Sync to system_conversions
    // ========================================
    console.log('\n\n🔄 STEP 3: Sync từ conversions → system_conversions...\n');

    // Find missing conversions
    const missingQuery = `
      SELECT
        c.id as conversion_id,
        c.click_id,
        cl.user_id,
        c.merchant_id,
        c.merchant_name,
        c.order_code,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        c.status,
        c.order_time,
        c.created_at
      FROM conversions c
      INNER JOIN clicks cl ON c.click_id = cl.id
      LEFT JOIN system_conversions sc ON sc.at_conversion_id = c.id
      WHERE sc.id IS NULL
        AND cl.user_id IS NOT NULL
      ORDER BY c.order_time DESC
    `;

    const missingResult = await pool.query(missingQuery);
    const missingConversions = missingResult.rows;

    console.log(`Tìm thấy ${missingConversions.length} conversions cần sync vào system_conversions\n`);

    if (missingConversions.length > 0) {
      let syncedCount = 0;
      const errors = [];

      for (const conv of missingConversions) {
        try {
          await pool.query(`
            INSERT INTO system_conversions (
              at_conversion_id,
              user_id,
              click_id,
              merchant_id,
              merchant_name,
              order_code,
              order_amount,
              commission,
              cashback_amount,
              status,
              order_time,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (at_conversion_id) DO NOTHING
          `, [
            conv.conversion_id,
            conv.user_id,
            conv.click_id,
            conv.merchant_id,
            conv.merchant_name,
            conv.order_code,
            conv.order_amount,
            conv.commission,
            conv.cashback_amount,
            conv.status,
            conv.order_time,
            conv.created_at
          ]);

          syncedCount++;

          if (syncedCount % 50 === 0) {
            console.log(`  Đã sync ${syncedCount}/${missingConversions.length}...`);
          }
        } catch (err) {
          errors.push({
            conversion_id: conv.conversion_id,
            error: err.message
          });
        }
      }

      console.log(`\n✅ Đã sync ${syncedCount}/${missingConversions.length} conversions`);
      if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} lỗi`);
      }
    }

    // ========================================
    // STEP 4: Update last run
    // ========================================
    const message = `Full sync: ${syncResult.imported || syncResult.created || 0} từ AT, ${missingConversions.length} vào system`;
    await AutoSyncConfig.updateLastRun('success', message);

    // ========================================
    // STEP 5: Check final status
    // ========================================
    console.log('\n\n📊 STEP 5: Trạng thái sau khi sync:\n');
    const after = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions) as at_conversions,
        (SELECT COUNT(*) FROM system_conversions) as system_conversions,
        (SELECT COUNT(*) FROM conversions WHERE click_id IS NOT NULL) as matched_conversions,
        (SELECT MAX(created_at) FROM conversions) as latest_at,
        (SELECT MAX(created_at) FROM system_conversions) as latest_sys
    `);
    console.log(`  Conversions (AT): ${after.rows[0].at_conversions}`);
    console.log(`  Matched với clicks: ${after.rows[0].matched_conversions}`);
    console.log(`  System Conversions: ${after.rows[0].system_conversions}`);
    console.log(`  Latest AT conversion: ${after.rows[0].latest_at?.toLocaleString('vi-VN') || 'N/A'}`);
    console.log(`  Latest System conversion: ${after.rows[0].latest_sys?.toLocaleString('vi-VN') || 'N/A'}`);

    await pool.end();
    console.log('\n\n✅ Full Sync hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);

    try {
      await AutoSyncConfig.updateLastRun('error', error.message);
    } catch (e) {
      // Ignore
    }

    process.exit(1);
  }
})();
