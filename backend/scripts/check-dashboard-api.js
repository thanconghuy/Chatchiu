/**
 * Check what Dashboard API returns for testuser
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = 'testuser@test.com';

async function checkDashboardAPI() {
  console.log('='.repeat(70));
  console.log('CHECK DASHBOARD API VALUES');
  console.log('='.repeat(70));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // Get user ID
    const userResult = await pool.query(`
      SELECT id FROM users WHERE email = $1
    `, [TEST_USER_EMAIL]);

    const userId = userResult.rows[0].id;
    console.log(`\nUser ID: ${userId}`);

    // Run the same query as dashboard.js
    console.log('\n' + '='.repeat(70));
    console.log('DASHBOARD QUERY RESULT');
    console.log('='.repeat(70));

    const balanceQuery = `
      SELECT
        usb.pending_balance,
        usb.reserved_balance,
        usb.total_earned,
        usb.total_withdrawn,
        usb.debt_balance,
        usb.pending_reserved,
        -- Tổng cashback đã duyệt (tất cả, bao gồm chưa đối soát)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = $1 AND status = 'approved'
        ), 0) as total_approved_cashback,
        -- Cashback ĐÃ ĐỐI SOÁT và CHƯA THANH TOÁN
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = $1
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        ), 0) as reconciled_cashback,
        -- SỐ DƯ KHẢ DỤNG = Đã đối soát (chưa TT) - Đã rút - Đang chờ xử lý
        GREATEST(0,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = $1
              AND status = 'approved'
              AND system_reconciliation_status = 'reconciled'
              AND (payment_status IS NULL OR payment_status = 'unpaid')
          ), 0) - COALESCE(usb.total_withdrawn, 0) - COALESCE(usb.pending_reserved, 0)
        ) as available_balance
      FROM user_system_balance usb
      WHERE usb.user_id = $1
    `;

    const balanceResult = await pool.query(balanceQuery, [userId]);
    const b = balanceResult.rows[0];

    console.log(`\n  total_earned (DB): ${parseFloat(b.total_earned).toLocaleString('vi-VN')}đ`);
    console.log(`  total_withdrawn (DB): ${parseFloat(b.total_withdrawn).toLocaleString('vi-VN')}đ`);
    console.log(`  pending_reserved (DB): ${parseFloat(b.pending_reserved).toLocaleString('vi-VN')}đ`);
    console.log(`\n  total_approved_cashback: ${parseFloat(b.total_approved_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  reconciled_cashback (unpaid): ${parseFloat(b.reconciled_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  available_balance (computed): ${parseFloat(b.available_balance).toLocaleString('vi-VN')}đ`);

    // Also check conversions breakdown
    console.log('\n' + '='.repeat(70));
    console.log('CONVERSIONS BREAKDOWN');
    console.log('='.repeat(70));

    const convResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid,
        SUM(cashback_amount) FILTER (WHERE status = 'approved') as approved_sum,
        SUM(cashback_amount) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled_sum,
        SUM(cashback_amount) FILTER (WHERE payment_status = 'paid') as paid_sum,
        SUM(cashback_amount) FILTER (
          WHERE status = 'approved'
            AND system_reconciliation_status = 'reconciled'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        ) as reconciled_unpaid_sum
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    const c = convResult.rows[0];
    console.log(`\n  Total conversions: ${c.total}`);
    console.log(`  Approved: ${c.approved} (${parseFloat(c.approved_sum || 0).toLocaleString('vi-VN')}đ)`);
    console.log(`  Reconciled: ${c.reconciled} (${parseFloat(c.reconciled_sum || 0).toLocaleString('vi-VN')}đ)`);
    console.log(`  Paid: ${c.paid} (${parseFloat(c.paid_sum || 0).toLocaleString('vi-VN')}đ)`);
    console.log(`  Reconciled but NOT paid: ${parseFloat(c.reconciled_unpaid_sum || 0).toLocaleString('vi-VN')}đ`);

    // Check old conversions table
    console.log('\n' + '='.repeat(70));
    console.log('OLD CONVERSIONS TABLE (API orders)');
    console.log('='.repeat(70));

    const oldConvResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM conversions
      WHERE user_id = $1
    `, [userId]);

    const old = oldConvResult.rows[0];
    console.log(`\n  Total: ${old.total}`);
    console.log(`  Total cashback: ${parseFloat(old.total_cashback || 0).toLocaleString('vi-VN')}đ`);

    console.log('\n' + '='.repeat(70));
    console.log('DONE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkDashboardAPI().catch(console.error);
