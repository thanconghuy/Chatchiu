const { pool } = require('./config/database');

async function debugSystemConversions() {
  try {
    console.log('='.repeat(60));
    console.log('DEBUGGING SYSTEM_CONVERSIONS USER DATA');
    console.log('='.repeat(60));

    // Check if user_id exists in system_conversions
    const checkColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
        AND column_name IN ('user_id', 'at_conversion_id')
      ORDER BY ordinal_position
    `);

    console.log('\n1. Column Check:');
    console.log(checkColumns.rows);

    // Check sample data from system_conversions
    const sampleData = await pool.query(`
      SELECT
        sc.id,
        sc.at_conversion_id,
        sc.user_id,
        sc.order_code,
        sc.order_time,
        c.user_id as conversion_user_id,
        u.username,
        u.email,
        u.full_name
      FROM system_conversions sc
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.order_time >= '2025-10-01'
        AND sc.order_time <= '2025-10-31'
        AND sc.status = 'approved'
      LIMIT 10
    `);

    console.log('\n2. Sample Data (10 rows):');
    console.log(JSON.stringify(sampleData.rows, null, 2));

    // Count NULL user_id
    const nullCount = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(user_id) as with_user_id,
        COUNT(*) - COUNT(user_id) as null_user_id
      FROM system_conversions
      WHERE order_time >= '2025-10-01'
        AND order_time <= '2025-10-31'
        AND status = 'approved'
    `);

    console.log('\n3. NULL user_id count:');
    console.log(nullCount.rows[0]);

    // Check if conversions have user_id
    const conversionCheck = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(user_id) as with_user_id,
        COUNT(*) - COUNT(user_id) as null_user_id
      FROM conversions
      WHERE order_time >= '2025-10-01'
        AND order_time <= '2025-10-31'
        AND status = 'approved'
    `);

    console.log('\n4. Conversions table user_id count:');
    console.log(conversionCheck.rows[0]);

    // Check if migration synced data
    const syncCheck = await pool.query(`
      SELECT
        sc.at_conversion_id,
        sc.user_id as sc_user_id,
        c.user_id as c_user_id,
        CASE
          WHEN sc.user_id IS NULL AND c.user_id IS NOT NULL THEN 'NOT_SYNCED'
          WHEN sc.user_id IS NOT NULL AND c.user_id IS NOT NULL THEN 'SYNCED'
          WHEN sc.user_id IS NULL AND c.user_id IS NULL THEN 'BOTH_NULL'
          ELSE 'OTHER'
        END as sync_status
      FROM system_conversions sc
      LEFT JOIN conversions c ON sc.at_conversion_id = c.id
      WHERE sc.order_time >= '2025-10-01'
        AND sc.order_time <= '2025-10-31'
        AND sc.status = 'approved'
      LIMIT 20
    `);

    console.log('\n5. Sync Status Check (20 rows):');
    console.log(JSON.stringify(syncCheck.rows, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('DEBUG COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

debugSystemConversions();
