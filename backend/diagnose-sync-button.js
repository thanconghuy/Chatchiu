require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== DIAGNOSTIC: SYNC BUTTON ISSUE ===\n');

    // 1. Check system_conversions table structure
    console.log('1. CẤU TRÚC BẢNG SYSTEM_CONVERSIONS:\n');
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
      ORDER BY ordinal_position
    `);

    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    // 2. Check conversions with click_id
    console.log('\n\n2. CONVERSIONS CÓ CLICK_ID:\n');
    const withClickId = await pool.query(`
      SELECT COUNT(*) as total
      FROM conversions
      WHERE click_id IS NOT NULL
    `);
    console.log(`  Conversions có click_id: ${withClickId.rows[0].total}`);

    // 3. Check conversions without click_id
    const withoutClickId = await pool.query(`
      SELECT COUNT(*) as total
      FROM conversions
      WHERE click_id IS NULL
    `);
    console.log(`  Conversions KHÔNG có click_id: ${withoutClickId.rows[0].total}`);

    // 4. Run the EXACT same query as the sync button
    console.log('\n\n3. QUERY ĐỒNG BỘ (GIỐNG BUTTON):\n');
    const syncQuery = await pool.query(`
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
    `);
    console.log(`  Conversions cần sync (theo query): ${syncQuery.rows.length}`);

    if (syncQuery.rows.length > 0) {
      console.log('\n  Sample (5 đầu tiên):');
      syncQuery.rows.slice(0, 5).forEach((row, i) => {
        console.log(`    ${i+1}. ID: ${row.conversion_id}`);
        console.log(`       click_id: ${row.click_id}`);
        console.log(`       user_id: ${row.user_id}`);
        console.log(`       order_code: ${row.order_code}`);
        console.log(`       cashback: ${row.cashback_amount}`);
        console.log('');
      });
    }

    // 5. Check if already in system_conversions
    console.log('\n4. SYSTEM_CONVERSIONS HIỆN TẠI:\n');
    const systemConvCount = await pool.query(`
      SELECT COUNT(*) as total FROM system_conversions
    `);
    console.log(`  Tổng system_conversions: ${systemConvCount.rows[0].total}`);

    // 6. Try to insert one and see the error
    if (syncQuery.rows.length > 0) {
      console.log('\n\n5. THỬ INSERT 1 CONVERSION:\n');
      const testConv = syncQuery.rows[0];
      console.log(`  Testing với conversion_id: ${testConv.conversion_id}`);

      try {
        const insertResult = await pool.query(`
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
          RETURNING id
        `, [
          testConv.conversion_id,
          testConv.user_id,
          testConv.click_id,
          testConv.merchant_id,
          testConv.merchant_name,
          testConv.order_code,
          testConv.order_amount,
          testConv.commission,
          testConv.cashback_amount,
          testConv.status,
          testConv.order_time,
          testConv.created_at
        ]);

        if (insertResult.rows.length > 0) {
          console.log(`  ✅ INSERT THÀNH CÔNG! ID: ${insertResult.rows[0].id}`);
          // Rollback - delete test insert
          await pool.query('DELETE FROM system_conversions WHERE id = $1', [insertResult.rows[0].id]);
          console.log('  (Đã rollback - xóa test insert)');
        } else {
          console.log('  ⚠️ INSERT không có lỗi nhưng không trả về ID (có thể do conflict)');

          // Check if it already exists
          const exists = await pool.query(`
            SELECT id FROM system_conversions WHERE at_conversion_id = $1
          `, [testConv.conversion_id]);

          if (exists.rows.length > 0) {
            console.log(`  → Đã tồn tại trong system_conversions với ID: ${exists.rows[0].id}`);
          }
        }
      } catch (insertError) {
        console.log(`  ❌ INSERT LỖI: ${insertError.message}`);
        console.log(`  Detail: ${insertError.detail || 'N/A'}`);
        console.log(`  Constraint: ${insertError.constraint || 'N/A'}`);
      }
    }

    // 7. Check constraint on system_conversions
    console.log('\n\n6. CONSTRAINTS TRÊN SYSTEM_CONVERSIONS:\n');
    const constraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'system_conversions'::regclass
    `);

    constraints.rows.forEach(c => {
      console.log(`  ${c.conname} (${c.contype}): ${c.definition}`);
    });

    // 8. Check if there's a NOT NULL column we're not inserting
    console.log('\n\n7. COLUMNS NOT NULL MÀ KHÔNG CÓ DEFAULT:\n');
    const notNullCols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
        AND is_nullable = 'NO'
        AND column_default IS NULL
    `);

    notNullCols.rows.forEach(c => {
      console.log(`  - ${c.column_name}`);
    });

    await pool.end();
    console.log('\n✅ Diagnostic hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
