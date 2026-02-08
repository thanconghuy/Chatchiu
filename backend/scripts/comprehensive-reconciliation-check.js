/**
 * Comprehensive Reconciliation & Balance Check
 *
 * 1. Kiểm tra từng kỳ đối soát - tìm các đơn chưa match trạng thái
 * 2. Kiểm tra logic đối soát - system_reconciliation_status phải được cập nhật
 * 3. Kiểm tra tính toán số dư khả dụng với user cụ thể
 *
 * Run: node backend/scripts/comprehensive-reconciliation-check.js
 */

require('dotenv').config();
const { pool } = require('../config/database');

async function comprehensiveCheck() {
  console.log('='.repeat(120));
  console.log('KIỂM TRA TOÀN DIỆN HỆ THỐNG ĐỐI SOÁT VÀ SỐ DƯ');
  console.log('='.repeat(120));

  try {
    // ========================================
    // PART 1: KIỂM TRA TỪNG KỲ ĐỐI SOÁT
    // ========================================
    console.log('\n' + '█'.repeat(120));
    console.log('PHẦN 1: KIỂM TRA TỪNG KỲ ĐỐI SOÁT');
    console.log('█'.repeat(120));

    // Get all reconciliations
    const reconciliations = await pool.query(`
      SELECT
        sr.id,
        sr.period_label,
        sr.status,
        sr.total_orders,
        sr.total_cashback,
        sr.created_at,
        COUNT(sri.id) as actual_items,
        COALESCE(SUM(sri.cashback_amount), 0) as actual_cashback
      FROM system_reconciliations sr
      LEFT JOIN system_reconciliation_items sri ON sr.id = sri.system_reconciliation_id
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
    `);

    console.log(`\n📊 Tổng số kỳ đối soát: ${reconciliations.rows.length}`);

    for (const recon of reconciliations.rows) {
      console.log('\n' + '-'.repeat(100));
      console.log(`📅 KỲ: ${recon.period_label} | Status: ${recon.status}`);
      console.log(`   ID: ${recon.id}`);
      console.log(`   Recorded: ${recon.total_orders} đơn, ${parseFloat(recon.total_cashback).toLocaleString('vi-VN')}đ`);
      console.log(`   Actual: ${recon.actual_items} đơn, ${parseFloat(recon.actual_cashback).toLocaleString('vi-VN')}đ`);

      const mismatch = parseInt(recon.total_orders) !== parseInt(recon.actual_items);
      if (mismatch) {
        console.log(`   ❌ MISMATCH: Recorded=${recon.total_orders}, Actual=${recon.actual_items}`);
      } else {
        console.log(`   ✅ OK: Counts match`);
      }

      // Check items in this reconciliation
      const itemsCheck = await pool.query(`
        SELECT
          sri.id as item_id,
          sri.system_conversion_id,
          sri.merchant_name as item_merchant,
          sri.cashback_amount as item_cashback,
          sc.id as conversion_id,
          sc.merchant_name as conv_merchant,
          sc.cashback_amount as conv_cashback,
          sc.status as conv_status,
          sc.system_reconciliation_id as conv_recon_id,
          sc.system_reconciliation_status as conv_recon_status,
          sc.payment_status
        FROM system_reconciliation_items sri
        LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
        WHERE sri.system_reconciliation_id = $1
      `, [recon.id]);

      let issues = {
        nullConversion: 0,
        statusNotReconciled: 0,
        reconIdMismatch: 0,
        statusNotApproved: 0,
        alreadyPaid: 0
      };

      const problemItems = [];

      for (const item of itemsCheck.rows) {
        let itemIssues = [];

        // 1. Check NULL conversion
        if (!item.conversion_id) {
          issues.nullConversion++;
          itemIssues.push('NULL conversion_id');
        } else {
          // 2. Check system_reconciliation_status
          if (item.conv_recon_status !== 'reconciled') {
            issues.statusNotReconciled++;
            itemIssues.push(`recon_status=${item.conv_recon_status || 'NULL'}`);
          }

          // 3. Check system_reconciliation_id matches
          if (item.conv_recon_id !== recon.id) {
            issues.reconIdMismatch++;
            itemIssues.push(`recon_id mismatch (${item.conv_recon_id} != ${recon.id})`);
          }

          // 4. Check conversion status is approved
          if (item.conv_status !== 'approved') {
            issues.statusNotApproved++;
            itemIssues.push(`conv_status=${item.conv_status}`);
          }

          // 5. Check if already paid
          if (item.payment_status === 'paid') {
            issues.alreadyPaid++;
            itemIssues.push('ALREADY PAID');
          }
        }

        if (itemIssues.length > 0) {
          problemItems.push({
            item_id: item.item_id,
            conversion_id: item.system_conversion_id,
            merchant: item.item_merchant,
            issues: itemIssues
          });
        }
      }

      // Report issues for this reconciliation
      if (Object.values(issues).some(v => v > 0)) {
        console.log(`\n   ⚠️ VẤN ĐỀ PHÁT HIỆN:`);
        if (issues.nullConversion > 0) console.log(`      - NULL system_conversion_id: ${issues.nullConversion}`);
        if (issues.statusNotReconciled > 0) console.log(`      - system_reconciliation_status != 'reconciled': ${issues.statusNotReconciled}`);
        if (issues.reconIdMismatch > 0) console.log(`      - system_reconciliation_id không khớp: ${issues.reconIdMismatch}`);
        if (issues.statusNotApproved > 0) console.log(`      - Đơn hàng không phải 'approved': ${issues.statusNotApproved}`);
        if (issues.alreadyPaid > 0) console.log(`      - Đơn hàng đã thanh toán: ${issues.alreadyPaid}`);

        // Show first 5 problem items
        if (problemItems.length > 0) {
          console.log(`\n   📋 Chi tiết (hiện ${Math.min(5, problemItems.length)}/${problemItems.length} items có vấn đề):`);
          problemItems.slice(0, 5).forEach(p => {
            console.log(`      - ${p.merchant || 'N/A'}: ${p.issues.join(', ')}`);
          });
        }
      } else {
        console.log(`   ✅ Không có vấn đề với các items trong kỳ này`);
      }
    }

    // ========================================
    // PART 2: KIỂM TRA LOGIC ĐỐI SOÁT
    // ========================================
    console.log('\n\n' + '█'.repeat(120));
    console.log('PHẦN 2: KIỂM TRA LOGIC ĐỐI SOÁT');
    console.log('█'.repeat(120));

    // 2a. Conversions in reconciliation_items but status not 'reconciled'
    const notReconciledStatus = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        sc.system_reconciliation_status,
        sc.system_reconciliation_id,
        sri.system_reconciliation_id as item_recon_id,
        sr.period_label
      FROM system_conversions sc
      JOIN system_reconciliation_items sri ON sc.id = sri.system_conversion_id
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
         OR sc.system_reconciliation_id IS DISTINCT FROM sri.system_reconciliation_id
    `);

    console.log(`\n📊 Đơn hàng trong reconciliation_items nhưng status chưa cập nhật: ${notReconciledStatus.rows.length}`);
    if (notReconciledStatus.rows.length > 0) {
      console.log('\n   Chi tiết:');
      notReconciledStatus.rows.slice(0, 10).forEach(r => {
        console.log(`   ❌ ${r.order_code || 'N/A'} | ${r.merchant_name} | recon_status: ${r.system_reconciliation_status || 'NULL'} | recon_id: ${r.system_reconciliation_id || 'NULL'} vs ${r.item_recon_id}`);
      });
      if (notReconciledStatus.rows.length > 10) {
        console.log(`   ... và ${notReconciledStatus.rows.length - 10} đơn khác`);
      }
    }

    // 2b. Conversions with system_reconciliation_id but NOT in reconciliation_items
    const hasReconIdNoItem = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        sc.system_reconciliation_id,
        sc.system_reconciliation_status
      FROM system_conversions sc
      WHERE sc.system_reconciliation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = sc.id
        )
    `);

    console.log(`\n📊 Đơn có system_reconciliation_id nhưng KHÔNG có trong reconciliation_items: ${hasReconIdNoItem.rows.length}`);
    if (hasReconIdNoItem.rows.length > 0) {
      hasReconIdNoItem.rows.slice(0, 5).forEach(r => {
        console.log(`   ⚠️ ${r.order_code || 'N/A'} | ${r.merchant_name} | recon_id: ${r.system_reconciliation_id}`);
      });
    }

    // 2c. Items in reconciliation_items but conversion has no system_reconciliation_id
    const inItemsNoReconId = await pool.query(`
      SELECT
        sri.id as item_id,
        sri.system_conversion_id,
        sri.merchant_name,
        sri.system_reconciliation_id as item_recon_id,
        sc.system_reconciliation_id as conv_recon_id,
        sc.system_reconciliation_status
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sc.system_reconciliation_id IS NULL
    `);

    console.log(`\n📊 Items trong reconciliation_items nhưng conversion KHÔNG có system_reconciliation_id: ${inItemsNoReconId.rows.length}`);
    if (inItemsNoReconId.rows.length > 0) {
      inItemsNoReconId.rows.slice(0, 5).forEach(r => {
        console.log(`   ⚠️ ${r.merchant_name} | item_recon_id: ${r.item_recon_id} | conv_recon_id: NULL`);
      });
    }

    // ========================================
    // PART 3: KIỂM TRA TÍNH TOÁN SỐ DƯ
    // ========================================
    console.log('\n\n' + '█'.repeat(120));
    console.log('PHẦN 3: KIỂM TRA TÍNH TOÁN SỐ DƯ');
    console.log('█'.repeat(120));

    // Find a user with reconciled orders to test
    const testUserQuery = await pool.query(`
      SELECT DISTINCT
        u.id,
        u.email,
        u.full_name
      FROM users u
      JOIN system_conversions sc ON u.id = sc.user_id
      WHERE sc.system_reconciliation_status = 'reconciled'
        AND sc.status = 'approved'
      LIMIT 5
    `);

    if (testUserQuery.rows.length === 0) {
      console.log('\n⚠️ Không tìm thấy user có đơn đã đối soát để test');
    } else {
      console.log(`\n📊 Kiểm tra ${testUserQuery.rows.length} users có đơn đã đối soát:\n`);

      for (const user of testUserQuery.rows) {
        console.log('-'.repeat(100));
        console.log(`👤 User: ${user.email} (${user.full_name || 'N/A'})`);
        console.log(`   ID: ${user.id}`);

        // Get user's balance record
        const balanceRecord = await pool.query(`
          SELECT * FROM user_system_balance WHERE user_id = $1
        `, [user.id]);

        if (balanceRecord.rows.length === 0) {
          console.log('   ⚠️ Không có bản ghi số dư');
          continue;
        }

        const balance = balanceRecord.rows[0];

        // Calculate expected values from conversions
        const expectedCalc = await pool.query(`
          SELECT
            -- Total earned = SUM of all reconciled conversions
            COALESCE(SUM(CASE
              WHEN system_reconciliation_status = 'reconciled' AND status = 'approved'
              THEN cashback_amount
              ELSE 0
            END), 0) as calc_total_earned,

            -- Total withdrawn = SUM of paid conversions
            COALESCE(SUM(CASE
              WHEN payment_status = 'paid'
              THEN cashback_amount
              ELSE 0
            END), 0) as calc_total_withdrawn,

            -- Counts
            COUNT(CASE WHEN system_reconciliation_status = 'reconciled' THEN 1 END) as reconciled_count,
            COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
            COUNT(*) as total_conversions
          FROM system_conversions
          WHERE user_id = $1
        `, [user.id]);

        const calc = expectedCalc.rows[0];

        // Get pending_reserved from confirmed payment requests
        const pendingReserved = await pool.query(`
          SELECT COALESCE(SUM(requested_amount), 0) as pending
          FROM payment_requests
          WHERE user_id = $1 AND status = 'confirmed'
        `, [user.id]);

        const calcPendingReserved = parseFloat(pendingReserved.rows[0].pending);

        // Get total_withdrawn from payment_requests
        const totalWithdrawnFromPR = await pool.query(`
          SELECT COALESCE(SUM(requested_amount), 0) as total
          FROM payment_requests
          WHERE user_id = $1 AND status = 'paid'
        `, [user.id]);

        const calcTotalWithdrawnPR = parseFloat(totalWithdrawnFromPR.rows[0].total);

        // Display comparison
        console.log('\n   📈 SO SÁNH SỐ DƯ:');
        console.log('   ' + '-'.repeat(80));
        console.log('   | Metric'.padEnd(35) + '| DB Value'.padEnd(20) + '| Calculated'.padEnd(20) + '| Match |');
        console.log('   ' + '-'.repeat(80));

        const dbTotalEarned = parseFloat(balance.total_earned);
        const dbTotalWithdrawn = parseFloat(balance.total_withdrawn);
        const dbPendingReserved = parseFloat(balance.pending_reserved);
        const dbAvailableBalance = parseFloat(balance.available_balance);

        const calcTotalEarned = parseFloat(calc.calc_total_earned);
        // Use payment_requests for withdrawn, not conversions
        const calcTotalWithdrawn = calcTotalWithdrawnPR;
        const calcAvailableBalance = calcTotalEarned - calcTotalWithdrawn - calcPendingReserved;

        const matchEarned = Math.abs(dbTotalEarned - calcTotalEarned) < 0.01;
        const matchWithdrawn = Math.abs(dbTotalWithdrawn - calcTotalWithdrawn) < 0.01;
        const matchPending = Math.abs(dbPendingReserved - calcPendingReserved) < 0.01;
        const matchAvailable = Math.abs(dbAvailableBalance - calcAvailableBalance) < 0.01;

        console.log(`   | total_earned`.padEnd(35) + `| ${dbTotalEarned.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${calcTotalEarned.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${matchEarned ? '✅' : '❌'}    |`);
        console.log(`   | total_withdrawn`.padEnd(35) + `| ${dbTotalWithdrawn.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${calcTotalWithdrawn.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${matchWithdrawn ? '✅' : '❌'}    |`);
        console.log(`   | pending_reserved`.padEnd(35) + `| ${dbPendingReserved.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${calcPendingReserved.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${matchPending ? '✅' : '❌'}    |`);
        console.log(`   | available_balance`.padEnd(35) + `| ${dbAvailableBalance.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${calcAvailableBalance.toLocaleString('vi-VN')}đ`.padEnd(20) + `| ${matchAvailable ? '✅' : '❌'}    |`);
        console.log('   ' + '-'.repeat(80));

        // Show order breakdown
        console.log(`\n   📊 Chi tiết đơn hàng:`);
        console.log(`      - Tổng conversions: ${calc.total_conversions}`);
        console.log(`      - Đã đối soát: ${calc.reconciled_count}`);
        console.log(`      - Đã thanh toán: ${calc.paid_count}`);

        // Show any discrepancies
        if (!matchEarned || !matchWithdrawn || !matchPending || !matchAvailable) {
          console.log(`\n   ⚠️ CÓ SAI LỆCH - Cần kiểm tra!`);

          if (!matchEarned) {
            console.log(`      total_earned: DB=${dbTotalEarned}, Calc=${calcTotalEarned}, Diff=${dbTotalEarned - calcTotalEarned}`);
          }
          if (!matchWithdrawn) {
            console.log(`      total_withdrawn: DB=${dbTotalWithdrawn}, Calc=${calcTotalWithdrawn}, Diff=${dbTotalWithdrawn - calcTotalWithdrawn}`);
          }
          if (!matchPending) {
            console.log(`      pending_reserved: DB=${dbPendingReserved}, Calc=${calcPendingReserved}, Diff=${dbPendingReserved - calcPendingReserved}`);
          }
        }
      }
    }

    // ========================================
    // PART 4: TÓM TẮT VẤN ĐỀ TỔNG QUAN
    // ========================================
    console.log('\n\n' + '█'.repeat(120));
    console.log('PHẦN 4: TÓM TẮT VẤN ĐỀ');
    console.log('█'.repeat(120));

    // Summary queries
    const summaryQueries = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM system_reconciliation_items WHERE system_conversion_id IS NULL`),
      pool.query(`
        SELECT COUNT(*) as count
        FROM system_reconciliation_items sri
        JOIN system_conversions sc ON sri.system_conversion_id = sc.id
        WHERE sc.payment_status = 'paid'
      `),
      pool.query(`
        SELECT COUNT(*) as count
        FROM system_reconciliation_items sri
        JOIN system_conversions sc ON sri.system_conversion_id = sc.id
        WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
      `),
      pool.query(`
        SELECT COUNT(*) as count
        FROM system_reconciliations sr
        WHERE sr.total_orders != (
          SELECT COUNT(*) FROM system_reconciliation_items sri WHERE sri.system_reconciliation_id = sr.id
        )
      `),
      pool.query(`
        SELECT COUNT(*) as count
        FROM user_system_balance usb
        WHERE usb.pending_reserved < 0
      `)
    ]);

    console.log('\n   📋 TỔNG HỢP VẤN ĐỀ:');
    console.log('   ' + '-'.repeat(60));
    console.log(`   | Items với NULL conversion_id:`.padEnd(50) + `| ${summaryQueries[0].rows[0].count.toString().padStart(6)} |`);
    console.log(`   | Items cho đơn đã thanh toán:`.padEnd(50) + `| ${summaryQueries[1].rows[0].count.toString().padStart(6)} |`);
    console.log(`   | Conversions chưa cập nhật trạng thái đối soát:`.padEnd(50) + `| ${summaryQueries[2].rows[0].count.toString().padStart(6)} |`);
    console.log(`   | Kỳ đối soát có total_orders không khớp:`.padEnd(50) + `| ${summaryQueries[3].rows[0].count.toString().padStart(6)} |`);
    console.log(`   | Users có pending_reserved âm:`.padEnd(50) + `| ${summaryQueries[4].rows[0].count.toString().padStart(6)} |`);
    console.log('   ' + '-'.repeat(60));

    const totalIssues = summaryQueries.reduce((sum, q) => sum + parseInt(q.rows[0].count), 0);
    if (totalIssues === 0) {
      console.log('\n   🎉 KHÔNG CÓ VẤN ĐỀ NÀO ĐƯỢC PHÁT HIỆN!');
    } else {
      console.log(`\n   ⚠️ TỔNG CỘNG ${totalIssues} VẤN ĐỀ CẦN XỬ LÝ`);
    }

    console.log('\n' + '='.repeat(120));
    console.log('KẾT THÚC KIỂM TRA');
    console.log('='.repeat(120));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

comprehensiveCheck();
