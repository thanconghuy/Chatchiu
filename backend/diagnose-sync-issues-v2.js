require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== CHẨN ĐOÁN VẤN ĐỀ SYNC CONVERSIONS ===\n');
    console.log('Ngày hiện tại:', new Date().toLocaleString('vi-VN'));
    console.log('='.repeat(80));

    // ========================================
    // 1. Kiểm tra cấu trúc bảng conversions
    // ========================================
    console.log('\n\n📊 1. CẤU TRÚC BẢNG CONVERSIONS:\n');

    const convColumns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'conversions'
      ORDER BY ordinal_position
    `);

    console.log('Columns:', convColumns.rows.map(c => c.column_name).join(', '));

    // ========================================
    // 2. Kiểm tra conversions trong bảng `conversions`
    // ========================================
    console.log('\n\n📊 2. BẢNG CONVERSIONS (Dữ liệu đơn AT):\n');

    const atConversions = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days') as last_14_days,
        MAX(created_at) as latest_created,
        MAX(order_time) as latest_order_time
      FROM conversions
    `);

    const at = atConversions.rows[0];
    console.log('Tổng số conversions:', at.total);
    console.log('7 ngày qua:', at.last_7_days);
    console.log('14 ngày qua:', at.last_14_days);
    console.log('Conversion mới nhất (created_at):', at.latest_created?.toLocaleString('vi-VN') || 'N/A');
    console.log('Order time mới nhất:', at.latest_order_time?.toLocaleString('vi-VN') || 'N/A');

    // ========================================
    // 3. Kiểm tra system_conversions
    // ========================================
    console.log('\n\n📊 3. BẢNG SYSTEM_CONVERSIONS:\n');

    const sysConversions = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days') as last_14_days,
        MAX(created_at) as latest_created,
        MAX(order_time) as latest_order_time
      FROM system_conversions
    `);

    const sys = sysConversions.rows[0];
    console.log('Tổng số system_conversions:', sys.total);
    console.log('7 ngày qua:', sys.last_7_days);
    console.log('14 ngày qua:', sys.last_14_days);
    console.log('Conversion mới nhất (created_at):', sys.latest_created?.toLocaleString('vi-VN') || 'N/A');
    console.log('Order time mới nhất:', sys.latest_order_time?.toLocaleString('vi-VN') || 'N/A');

    // ========================================
    // 4. So sánh conversions chưa sync
    // ========================================
    console.log('\n\n📊 4. CONVERSIONS CHƯA ĐƯỢC SYNC:\n');

    // Kiểm tra xem có conversion_id không
    const hasConversionId = convColumns.rows.some(c => c.column_name === 'conversion_id');
    const hasAtConversionId = convColumns.rows.some(c => c.column_name === 'at_conversion_id');

    let idColumn = 'id';
    if (hasConversionId) idColumn = 'conversion_id';
    if (hasAtConversionId) idColumn = 'at_conversion_id';

    console.log('ID column used:', idColumn);

    const notSynced = await pool.query(`
      SELECT COUNT(*) as count
      FROM conversions c
      WHERE NOT EXISTS (
        SELECT 1 FROM system_conversions sc
        WHERE sc.order_code = c.order_code
      )
    `);

    console.log('Số conversions trong AT nhưng CHƯA có trong system:', notSynced.rows[0].count);

    // Show sample not synced
    if (parseInt(notSynced.rows[0].count) > 0) {
      const samples = await pool.query(`
        SELECT
          c.order_code,
          c.merchant_name,
          c.status,
          c.order_time,
          c.created_at,
          c.cashback_amount
        FROM conversions c
        WHERE NOT EXISTS (
          SELECT 1 FROM system_conversions sc
          WHERE sc.order_code = c.order_code
        )
        ORDER BY c.created_at DESC
        LIMIT 10
      `);

      console.log('\nMẫu conversions chưa sync (10 gần nhất):');
      samples.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.order_code} - ${row.merchant_name}`);
        console.log(`   Status: ${row.status}, Cashback: ${row.cashback_amount}`);
        console.log(`   Order time: ${row.order_time?.toLocaleString('vi-VN') || 'N/A'}`);
        console.log(`   Created: ${row.created_at?.toLocaleString('vi-VN') || 'N/A'}`);
      });
    }

    // ========================================
    // 5. Kiểm tra Auto Sync History
    // ========================================
    console.log('\n\n📊 5. AUTO SYNC HISTORY:\n');

    const syncHistory = await pool.query(`
      SELECT
        id,
        sync_type,
        sync_started_at,
        sync_status,
        total_fetched,
        total_created,
        total_updated,
        error_message
      FROM auto_sync_history
      ORDER BY sync_started_at DESC
      LIMIT 10
    `);

    if (syncHistory.rows.length === 0) {
      console.log('Không có lịch sử sync nào!');
    } else {
      console.log('10 lần sync gần nhất:');
      syncHistory.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.sync_started_at?.toLocaleString('vi-VN')}`);
        console.log(`   Type: ${row.sync_type}, Status: ${row.sync_status}`);
        console.log(`   Fetched: ${row.total_fetched}, Created: ${row.total_created}, Updated: ${row.total_updated}`);
        if (row.error_message) {
          console.log(`   Error: ${row.error_message}`);
        }
      });
    }

    // ========================================
    // 6. Kiểm tra Auto Sync Config
    // ========================================
    console.log('\n\n📊 6. AUTO SYNC CONFIG:\n');

    const syncConfig = await pool.query(`
      SELECT *
      FROM auto_sync_config
      ORDER BY id DESC
      LIMIT 1
    `);

    if (syncConfig.rows.length > 0) {
      const config = syncConfig.rows[0];
      console.log('Enabled:', config.enabled ? '✅ BẬT' : '❌ TẮT');
      console.log('Cron Schedule:', config.cron_schedule);
      console.log('Sync Days:', config.sync_days);
      console.log('Last Run At:', config.last_run_at?.toLocaleString('vi-VN') || 'N/A');
      console.log('Last Run Status:', config.last_run_status);
      console.log('Last Run Message:', config.last_run_message);
    }

    // ========================================
    // 7. Kiểm tra Cron Jobs
    // ========================================
    console.log('\n\n📊 7. CRON JOBS STATUS:\n');

    const cronJobs = await pool.query(`
      SELECT
        job_key,
        job_name,
        is_enabled,
        is_running,
        last_run_at,
        last_run_status,
        next_run_at,
        total_runs,
        success_runs,
        failed_runs
      FROM cron_jobs
      ORDER BY job_key
    `);

    if (cronJobs.rows.length === 0) {
      console.log('Không tìm thấy cron jobs!');
    } else {
      cronJobs.rows.forEach(job => {
        console.log(`\n${job.job_key}:`);
        console.log(`  Name: ${job.job_name}`);
        console.log(`  Enabled: ${job.is_enabled ? '✅' : '❌'}`);
        console.log(`  Running: ${job.is_running ? '🔄' : '⏹️'}`);
        console.log(`  Last Run: ${job.last_run_at?.toLocaleString('vi-VN') || 'Never'}`);
        console.log(`  Last Status: ${job.last_run_status || 'N/A'}`);
        console.log(`  Next Run: ${job.next_run_at?.toLocaleString('vi-VN') || 'N/A'}`);
        console.log(`  Stats: ${job.success_runs}/${job.total_runs} success`);
      });
    }

    // ========================================
    // 8. KẾT LUẬN
    // ========================================
    console.log('\n\n📊 8. KẾT LUẬN:\n');
    console.log('='.repeat(80));

    const issues = [];

    // Check if conversions not synced
    const notSyncedCount = parseInt(notSynced.rows[0].count);
    if (notSyncedCount > 0) {
      issues.push(`❌ Có ${notSyncedCount} conversions trong bảng conversions CHƯA được sync vào system_conversions`);
    }

    // Check if auto sync hasn't run recently
    const latestSync = syncHistory.rows[0];
    if (latestSync) {
      const syncDate = new Date(latestSync.sync_started_at);
      const daysSinceSync = Math.floor((Date.now() - syncDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceSync > 1) {
        issues.push(`❌ Auto sync chưa chạy trong ${daysSinceSync} ngày (lần cuối: ${syncDate.toLocaleString('vi-VN')})`);
      }
    }

    // Check if auto sync is enabled
    if (syncConfig.rows.length > 0 && !syncConfig.rows[0].enabled) {
      issues.push('❌ Auto sync đang TẮT');
    }

    if (issues.length > 0) {
      console.log('\nCÁC VẤN ĐỀ PHÁT HIỆN:');
      issues.forEach(issue => console.log(issue));
    } else {
      console.log('\n✅ Không phát hiện vấn đề nào!');
    }

    await pool.end();
    console.log('\n\n✅ Chẩn đoán hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
