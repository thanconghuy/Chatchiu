/**
 * Script tổng hợp để restore tất cả orphaned conversions
 * Bao gồm:
 * 1. Restore conversions table (system_reconciliation_id, system_reconciliation_status)
 * 2. Restore reconciliation_waiting_list table (status)
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function restoreAllOrphaned() {
  try {
    console.log('\n🔍 ===== BẮT ĐẦU RESTORE ORPHANED CONVERSIONS =====\n');

    // STEP 1: Tìm orphaned conversions
    console.log('📊 STEP 1: Tìm các conversions bị orphaned...\n');

    const findOrphanedQuery = `
      SELECT
        c.id,
        c.order_code,
        c.merchant_name,
        c.cashback_amount,
        c.system_reconciliation_id
      FROM conversions c
      WHERE c.system_reconciliation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliations sr
          WHERE sr.id = c.system_reconciliation_id
        )
    `;

    const orphanedResult = await pool.query(findOrphanedQuery);
    const orphanedCount = orphanedResult.rows.length;

    if (orphanedCount === 0) {
      console.log('✅ Không có conversions nào bị orphaned trong bảng conversions\n');
    } else {
      console.log(`⚠️ Tìm thấy ${orphanedCount} conversions bị orphaned:\n`);

      orphanedResult.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.order_code} - ${row.merchant_name} - ${row.cashback_amount} VNĐ`);
      });

      const totalCashback = orphanedResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.cashback_amount || 0),
        0
      );
      console.log(`\n  💰 Tổng cashback: ${totalCashback.toLocaleString('vi-VN')} VNĐ\n`);

      // Restore conversions table
      console.log('🔧 Đang restore conversions table...\n');

      const restoreConversionsQuery = `
        UPDATE conversions
        SET
          system_reconciliation_status = NULL,
          system_reconciliation_id = NULL,
          updated_at = NOW()
        WHERE system_reconciliation_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM system_reconciliations sr
            WHERE sr.id = conversions.system_reconciliation_id
          )
        RETURNING id, order_code
      `;

      const restoreConversionsResult = await pool.query(restoreConversionsQuery);
      console.log(`✅ Restored ${restoreConversionsResult.rows.length} conversions in conversions table\n`);
    }

    // STEP 2: Tìm và restore waiting list với status = 'reconciled' nhưng không có reconciliation
    console.log('📊 STEP 2: Tìm conversions trong waiting list cần restore status...\n');

    const findWaitingListQuery = `
      SELECT
        rwl.id,
        c.order_code,
        rwl.status,
        rwl.selected_for_reconciliation_id
      FROM reconciliation_waiting_list rwl
      JOIN conversions c ON c.id = rwl.conversion_id
      WHERE rwl.status = 'reconciled'
        AND (
          rwl.selected_for_reconciliation_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM system_reconciliations sr
            WHERE sr.id = rwl.selected_for_reconciliation_id
          )
        )
    `;

    const waitingListResult = await pool.query(findWaitingListQuery);
    const waitingListCount = waitingListResult.rows.length;

    if (waitingListCount === 0) {
      console.log('✅ Không có conversions nào cần restore status trong waiting list\n');
    } else {
      console.log(`⚠️ Tìm thấy ${waitingListCount} conversions cần restore trong waiting list:\n`);

      waitingListResult.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.order_code} - status: ${row.status}`);
      });
      console.log('');

      // Restore waiting list status
      console.log('🔧 Đang restore waiting list status về "waiting"...\n');

      const restoreWaitingListQuery = `
        UPDATE reconciliation_waiting_list
        SET
          status = 'waiting',
          selected_for_reconciliation_id = NULL,
          updated_at = NOW()
        WHERE status = 'reconciled'
          AND (
            selected_for_reconciliation_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM system_reconciliations sr
              WHERE sr.id = reconciliation_waiting_list.selected_for_reconciliation_id
            )
          )
        RETURNING id
      `;

      const restoreWaitingListResult = await pool.query(restoreWaitingListQuery);
      console.log(`✅ Restored ${restoreWaitingListResult.rows.length} conversions in waiting list to 'waiting' status\n`);
    }

    // STEP 3: Summary
    console.log('📋 ===== TỔNG KẾT =====\n');
    console.log(`✅ Conversions table: ${orphanedCount} conversions restored`);
    console.log(`✅ Waiting list: ${waitingListCount} conversions restored`);
    console.log('\n💡 Các đơn hàng đã được restore và sẵn sàng hiển thị trong Danh Sách Chờ Đối Soát!\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    await pool.end();
    process.exit(1);
  }
}

restoreAllOrphaned();
