/**
 * API Sync Job
 *
 * Purpose: Sync system reconciliation with AccessTrade API reconciliation
 * Schedule: Every 6 hours
 *
 * Workflow:
 * 1. Find system reconciliation items that need API confirmation
 * 2. Check if corresponding API reconciliation exists
 * 3. Update status based on API data:
 *    - Approved → Release reserved balance
 *    - Rejected → Deduct reserved balance
 *    - Pending → Keep reserved
 */

const pool = require('../../config/database');
const BalanceManagementService = require('../../services/systemReconciliation/BalanceManagementService');

class APISyncJob {
  /**
   * Run the API sync job
   */
  static async run() {
    const startTime = Date.now();
    console.log('[APISyncJob] Starting API sync...');

    try {
      // Find system reconciliation items not yet confirmed by API
      const itemsQuery = `
        SELECT
          sri.id as item_id,
          sri.system_reconciliation_id,
          sri.conversion_id,
          sri.user_id,
          sri.cashback_amount,
          sri.is_high_risk,
          sri.conversion_status as system_status,
          c.status as api_status,
          ri.id as api_reconciliation_item_id,
          ri.reconciliation_id as api_reconciliation_id
        FROM system_reconciliation_items sri
        JOIN conversions c ON sri.conversion_id = c.id
        LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
        WHERE sri.api_reconciled = FALSE
          AND c.status IN ('approved', 'rejected')
        ORDER BY sri.created_at ASC
        LIMIT 1000
      `;

      const result = await pool.query(itemsQuery);
      const items = result.rows;

      if (items.length === 0) {
        console.log('[APISyncJob] No items to sync');
        return {
          success: true,
          synced: 0,
          duration: Date.now() - startTime
        };
      }

      console.log(`[APISyncJob] Found ${items.length} items to sync`);

      let syncedCount = 0;
      let releasedCount = 0;
      let deductedCount = 0;
      let releasedAmount = 0;
      let deductedAmount = 0;

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Process each item
        for (const item of items) {
          const apiStatus = item.api_status;
          const systemStatus = item.system_status;
          const cashbackAmount = parseFloat(item.cashback_amount);
          const isHighRisk = item.is_high_risk;

          // Update system reconciliation item
          await client.query(`
            UPDATE system_reconciliation_items
            SET
              api_reconciled = TRUE,
              api_reconciliation_id = $2,
              conversion_status = $3,
              reconciled_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [item.item_id, item.api_reconciliation_id, apiStatus]);

          // If high-risk order, adjust reserved balance
          if (isHighRisk) {
            if (apiStatus === 'approved') {
              // API confirmed approved → Release reserved to available
              await BalanceManagementService.releaseReserved(
                item.user_id,
                cashbackAmount
              );

              releasedCount++;
              releasedAmount += cashbackAmount;

              console.log(`  ✓ Released ${this.formatMoney(cashbackAmount)} for user ${item.user_id.substring(0, 8)}`);

            } else if (apiStatus === 'rejected') {
              // API rejected → Deduct reserved balance
              await BalanceManagementService.deductReserved(
                item.user_id,
                cashbackAmount
              );

              deductedCount++;
              deductedAmount += cashbackAmount;

              console.log(`  ✗ Deducted ${this.formatMoney(cashbackAmount)} for user ${item.user_id.substring(0, 8)}`);
            }
          }

          syncedCount++;
        }

        await client.query('COMMIT');

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const duration = Date.now() - startTime;

      console.log('[APISyncJob] Summary:');
      console.log(`  - Items synced: ${syncedCount}`);
      console.log(`  - Released: ${releasedCount} (${this.formatMoney(releasedAmount)})`);
      console.log(`  - Deducted: ${deductedCount} (${this.formatMoney(deductedAmount)})`);
      console.log(`  - Duration: ${duration}ms`);

      return {
        success: true,
        synced: syncedCount,
        released: releasedCount,
        released_amount: releasedAmount,
        deducted: deductedCount,
        deducted_amount: deductedAmount,
        duration
      };

    } catch (error) {
      console.error('[APISyncJob] Error:', error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN api_reconciled = TRUE THEN 1 END) as synced_items,
        COUNT(CASE WHEN api_reconciled = FALSE THEN 1 END) as pending_items,
        COUNT(CASE WHEN api_reconciled = TRUE AND conversion_status = 'approved' THEN 1 END) as approved_items,
        COUNT(CASE WHEN api_reconciled = TRUE AND conversion_status = 'rejected' THEN 1 END) as rejected_items,
        SUM(CASE WHEN api_reconciled = FALSE AND is_high_risk = TRUE THEN cashback_amount ELSE 0 END) as pending_reserved_amount
      FROM system_reconciliation_items
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Format money helper
   */
  static formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Manual sync for specific reconciliation
   */
  static async syncReconciliation(reconciliationId) {
    console.log(`[APISyncJob] Manually syncing reconciliation ${reconciliationId}...`);
    const startTime = Date.now();

    const query = `
      SELECT
        sri.id as item_id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.user_id,
        sri.cashback_amount,
        sri.is_high_risk,
        sri.conversion_status as system_status,
        c.status as api_status,
        ri.id as api_reconciliation_item_id,
        ri.reconciliation_id as api_reconciliation_id
      FROM system_reconciliation_items sri
      JOIN conversions c ON sri.conversion_id = c.id
      LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
      WHERE sri.system_reconciliation_id = $1
        AND sri.api_reconciled = FALSE
        AND c.status IN ('approved', 'rejected')
    `;

    const result = await pool.query(query, [reconciliationId]);
    const items = result.rows;

    if (items.length === 0) {
      return {
        success: true,
        message: 'No items to sync',
        synced: 0
      };
    }

    let syncedCount = 0;
    let releasedCount = 0;
    let deductedCount = 0;
    let releasedAmount = 0;
    let deductedAmount = 0;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Process each item
      for (const item of items) {
        const apiStatus = item.api_status;
        const cashbackAmount = parseFloat(item.cashback_amount);
        const isHighRisk = item.is_high_risk;

        // Update system reconciliation item
        await client.query(`
          UPDATE system_reconciliation_items
          SET
            api_reconciled = TRUE,
            api_reconciliation_id = $2,
            conversion_status = $3,
            reconciled_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [item.item_id, item.api_reconciliation_id, apiStatus]);

        // If high-risk order, adjust reserved balance
        if (isHighRisk) {
          if (apiStatus === 'approved') {
            await BalanceManagementService.releaseReserved(
              item.user_id,
              cashbackAmount
            );
            releasedCount++;
            releasedAmount += cashbackAmount;
          } else if (apiStatus === 'rejected') {
            await BalanceManagementService.deductReserved(
              item.user_id,
              cashbackAmount
            );
            deductedCount++;
            deductedAmount += cashbackAmount;
          }
        }

        syncedCount++;
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const duration = Date.now() - startTime;

    console.log(`[APISyncJob] Reconciliation ${reconciliationId} sync completed:`);
    console.log(`  - Items synced: ${syncedCount}`);
    console.log(`  - Released: ${releasedCount} (${this.formatMoney(releasedAmount)})`);
    console.log(`  - Deducted: ${deductedCount} (${this.formatMoney(deductedAmount)})`);
    console.log(`  - Duration: ${duration}ms`);

    return {
      success: true,
      synced: syncedCount,
      released: releasedCount,
      released_amount: releasedAmount,
      deducted: deductedCount,
      deducted_amount: deductedAmount,
      duration
    };
  }
}

module.exports = APISyncJob;
