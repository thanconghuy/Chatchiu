require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== CHẨN ĐOÁN VẤN ĐỀ SYNC CONVERSIONS ===\n');
    console.log('Ngày hiện tại:', new Date().toLocaleString('vi-VN'));
    console.log('='.repeat(80));

    // ========================================
    // 1. Kiểm tra conversions trong bảng `conversions` (dữ liệu AT)
    // ========================================
    console.log('\n\n📊 1. BẢNG CONVERSIONS (Dữ liệu đơn AT):\n');

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
    // 2. Kiểm tra system_conversions (Conversions Management)
    // ========================================
    console.log('\n\n📊 2. BẢNG SYSTEM_CONVERSIONS (Conversions Management):\n');

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
    // 3. So sánh: Có bao nhiêu conversions trong AT nhưng KHÔNG có trong system
    // ========================================
    console.log('\n\n📊 3. CONVERSIONS CHƯA ĐƯỢC SYNC:\n');

    const notSynced = await pool.query(`
      SELECT COUNT(*) as count
      FROM conversions c
      WHERE NOT EXISTS (
        SELECT 1 FROM system_conversions sc
        WHERE sc.at_conversion_id = c.at_conversion_id
           OR sc.order_code = c.order_code
      )
    `);

    console.log('Số conversions trong AT nhưng CHƯA có trong system:', notSynced.rows[0].count);

    // Show sample not synced
    if (parseInt(notSynced.rows[0].count) > 0) {
      const samples = await pool.query(`
        SELECT
          c.at_conversion_id,
          c.order_code,
          c.merchant_name,
          c.status,
          c.order_time,
          c.created_at
        FROM conversions c
        WHERE NOT EXISTS (
          SELECT 1 FROM system_conversions sc
          WHERE sc.at_conversion_id = c.at_conversion_id
             OR sc.order_code = c.order_code
        )
        ORDER BY c.created_at DESC
        LIMIT 5
      `);

      console.log('\nMẫu conversions chưa sync:');
      samples.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.order_code} - ${row.merchant_name}`);
        console.log(`   AT ID: ${row.at_conversion_id}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Order time: ${row.order_time?.toLocaleString('vi-VN') || 'N/A'}`);
        console.log(`   Created: ${row.created_at?.toLocaleString('vi-VN') || 'N/A'}`);
      });
    }

    // ========================================
    // 4. Kiểm tra Auto Sync History
    // ========================================
    console.log('\n\n📊 4. AUTO SYNC HISTORY:\n');

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
      LIMIT 5
    `);

    if (syncHistory.rows.length === 0) {
      console.log('Không có lịch sử sync nào!');
    } else {
      console.log('5 lần sync gần nhất:');
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
    // 5. Kiểm tra Auto Sync Config
    // ========================================
    console.log('\n\n📊 5. AUTO SYNC CONFIG:\n');

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
    // 6. Kiểm tra Cron Jobs
    // ========================================
    console.log('\n\n📊 6. CRON JOBS STATUS:\n');

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
      WHERE job_key LIKE '%sync%' OR job_key LIKE '%conversion%'
      ORDER BY job_key
    `);

    if (cronJobs.rows.length === 0) {
      console.log('Không tìm thấy cron jobs liên quan đến sync!');
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
    // 7. Kiểm tra bảng có tồn tại không
    // ========================================
    console.log('\n\n📊 7. KIỂM TRA CẤU TRÚC BẢNG:\n');

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('conversions', 'system_conversions', 'auto_sync_history', 'auto_sync_config', 'cron_jobs')
    `);

    console.log('Các bảng tồn tại:');
    tables.rows.forEach(t => console.log(`  ✅ ${t.table_name}`));

    const expectedTables = ['conversions', 'system_conversions', 'auto_sync_history', 'auto_sync_config', 'cron_jobs'];
    const existingTables = tables.rows.map(t => t.table_name);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.log('\nBảng THIẾU:');
      missingTables.forEach(t => console.log(`  ❌ ${t}`));
    }

    await pool.end();
    console.log('\n\n✅ Chẩn đoán hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
