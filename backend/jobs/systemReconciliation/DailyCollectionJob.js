/**
 * Daily Collection Job
 *
 * Purpose: Collect approved orders daily and update pending balance
 * Schedule: Every day at 00:30 AM
 *
 * Workflow:
 * 1. Find approved conversions from yesterday
 * 2. Calculate potential cashback for each user
 * 3. Update user_system_balance.pending_balance
 */

const pool = require('../../config/database');
const RiskAssessmentService = require('../../services/systemReconciliation/RiskAssessmentService');

class DailyCollectionJob {
  /**
   * Run the daily collection job
   */
  static async run() {
    const startTime = Date.now();
    console.log('[DailyCollectionJob] Starting daily collection...');

    try {
      // Get yesterday's date range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      console.log(`[DailyCollectionJob] Collecting orders from ${yesterday.toISOString()} to ${today.toISOString()}`);

      // Find approved conversions from yesterday that haven't been collected yet
      const conversionsQuery = `
        SELECT
          c.id as conversion_id,
          c.user_id,
          c.merchant_id,
          m.name as merchant_name,
          c.order_time,
          c.approval_time,
          c.order_value,
          c.commission,
          c.cashback_amount,
          c.status,
          u.created_at as user_created_at
        FROM conversions c
        LEFT JOIN merchants m ON c.merchant_id = m.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.status = 'approved'
          AND c.approval_time >= $1
          AND c.approval_time < $2
          AND NOT EXISTS (
            -- Exclude orders already in system reconciliation
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.conversion_id = c.id
          )
        ORDER BY c.user_id, c.order_time
      `;

      const result = await pool.query(conversionsQuery, [yesterday, today]);
      const conversions = result.rows;

      if (conversions.length === 0) {
        console.log('[DailyCollectionJob] No new approved orders found');
        return {
          success: true,
          collected: 0,
          duration: Date.now() - startTime
        };
      }

      console.log(`[DailyCollectionJob] Found ${conversions.length} approved orders`);

      // Group by user
      const userGroups = {};
      for (const conv of conversions) {
        if (!userGroups[conv.user_id]) {
          userGroups[conv.user_id] = [];
        }
        userGroups[conv.user_id].push(conv);
      }

      const userCount = Object.keys(userGroups).length;
      console.log(`[DailyCollectionJob] Processing ${userCount} users...`);

      // Update pending balance for each user
      let updatedUsers = 0;
      let totalPendingAdded = 0;

      for (const [userId, userConversions] of Object.entries(userGroups)) {
        const totalCashback = userConversions.reduce(
          (sum, conv) => sum + parseFloat(conv.cashback_amount),
          0
        );

        // Update or insert pending balance
        await pool.query(`
          INSERT INTO user_system_balance (
            user_id, pending_balance, updated_at
          ) VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET
            pending_balance = user_system_balance.pending_balance + EXCLUDED.pending_balance,
            updated_at = CURRENT_TIMESTAMP
        `, [userId, totalCashback]);

        updatedUsers++;
        totalPendingAdded += totalCashback;
      }

      const duration = Date.now() - startTime;

      console.log('[DailyCollectionJob] Summary:');
      console.log(`  - Orders collected: ${conversions.length}`);
      console.log(`  - Users updated: ${updatedUsers}`);
      console.log(`  - Total pending added: ${this.formatMoney(totalPendingAdded)}`);
      console.log(`  - Duration: ${duration}ms`);

      return {
        success: true,
        collected: conversions.length,
        users: updatedUsers,
        totalPending: totalPendingAdded,
        duration
      };

    } catch (error) {
      console.error('[DailyCollectionJob] Error:', error);
      throw error;
    }
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
   * Get collection statistics for date range
   */
  static async getStats(startDate, endDate) {
    const query = `
      SELECT
        DATE(c.approval_time) as date,
        COUNT(*) as order_count,
        COUNT(DISTINCT c.user_id) as user_count,
        SUM(c.cashback_amount) as total_cashback
      FROM conversions c
      WHERE c.status = 'approved'
        AND c.approval_time >= $1
        AND c.approval_time < $2
      GROUP BY DATE(c.approval_time)
      ORDER BY date DESC
    `;

    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  }
}

module.exports = DailyCollectionJob;
