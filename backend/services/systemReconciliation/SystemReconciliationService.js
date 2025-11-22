/**
 * System Reconciliation Service
 *
 * Purpose: Internal reconciliation system for faster cashback payout
 * Timeline: Month + 15 days (vs API 65-105 days)
 *
 * This is a NEW module that works alongside existing API reconciliation
 */

const pool = require('../../config/database');
const RiskAssessmentService = require('./RiskAssessmentService');

class SystemReconciliationService {
  /**
   * Create a new system reconciliation period
   *
   * @param {Object} params
   * @param {number} params.month - Month (1-12)
   * @param {number} params.year - Year
   * @param {string} params.createdBy - Admin user ID
   * @returns {Object} Created reconciliation
   */
  static async createReconciliation({ month, year, createdBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Calculate period dates
      const periodStart = new Date(year, month - 1, 1); // First day of month
      const periodEnd = new Date(year, month, 0);       // Last day of month
      const reconciliationDate = new Date(periodEnd);
      reconciliationDate.setDate(periodEnd.getDate() + 15); // +15 days

      const periodLabel = `Tháng ${month}/${year}`;

      // Check if reconciliation already exists
      const checkQuery = `
        SELECT id FROM system_reconciliations
        WHERE period_start = $1 AND period_end = $2
      `;
      const existing = await client.query(checkQuery, [periodStart, periodEnd]);

      if (existing.rows.length > 0) {
        throw new Error(`Kỳ đối soát ${periodLabel} đã tồn tại`);
      }

      // Collect approved orders from system_conversions
      const ordersQuery = `
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
          AND c.order_time >= $1
          AND c.order_time < $2
          AND NOT EXISTS (
            -- Exclude already reconciled orders
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.conversion_id = c.id
          )
        ORDER BY c.order_time ASC
      `;

      const ordersResult = await client.query(ordersQuery, [periodStart, new Date(year, month, 1)]);
      const orders = ordersResult.rows;

      if (orders.length === 0) {
        throw new Error(`Không có đơn hàng nào được duyệt trong ${periodLabel}`);
      }

      // Calculate stats
      const totalOrders = orders.length;
      const uniqueUsers = new Set(orders.map(o => o.user_id)).size;
      const totalCashback = orders.reduce((sum, o) => sum + parseFloat(o.cashback_amount), 0);

      // Get historical approval rate
      const approvalRate = await this.getHistoricalApprovalRate(client);

      // Calculate reserved amount based on risk
      let reservedAmount = 0;
      const highRiskOrders = [];

      for (const order of orders) {
        const riskScore = await RiskAssessmentService.calculateRiskScore({
          conversion: order,
          userCreatedAt: order.user_created_at
        });

        if (riskScore >= 50) {
          highRiskOrders.push(order.conversion_id);
          reservedAmount += parseFloat(order.cashback_amount);
        }
      }

      // Apply conservative buffer: reserve 15% of high-risk amount
      const rejectionBuffer = 1 - (approvalRate / 100);
      reservedAmount = reservedAmount * rejectionBuffer;

      // Create reconciliation record
      const insertReconQuery = `
        INSERT INTO system_reconciliations (
          period_label, period_start, period_end, reconciliation_date,
          total_orders, total_users, total_cashback,
          approved_orders, pending_orders,
          estimated_approval_rate, reserved_amount,
          status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const reconResult = await client.query(insertReconQuery, [
        periodLabel,
        periodStart,
        periodEnd,
        reconciliationDate,
        totalOrders,
        uniqueUsers,
        totalCashback,
        totalOrders, // Initially all are "approved" from API
        0,           // No pending orders yet
        approvalRate,
        reservedAmount,
        'draft',
        createdBy
      ]);

      const reconciliation = reconResult.rows[0];

      // Insert reconciliation items
      for (const order of orders) {
        const riskScore = await RiskAssessmentService.calculateRiskScore({
          conversion: order,
          userCreatedAt: order.user_created_at
        });

        const isHighRisk = riskScore >= 50;

        await client.query(`
          INSERT INTO system_reconciliation_items (
            system_reconciliation_id, conversion_id, user_id,
            merchant_id, merchant_name, order_time, approval_time,
            order_value, commission_amount, cashback_amount,
            conversion_status, is_high_risk, risk_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          reconciliation.id,
          order.conversion_id,
          order.user_id,
          order.merchant_id,
          order.merchant_name,
          order.order_time,
          order.approval_time,
          order.order_value,
          order.commission,
          order.cashback_amount,
          'approved', // From system_conversions
          isHighRisk,
          riskScore
        ]);
      }

      // Log creation
      await client.query(`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          new_status, new_total_cashback, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        reconciliation.id,
        'created',
        createdBy,
        'draft',
        totalCashback,
        `Tạo kỳ đối soát ${periodLabel} với ${totalOrders} đơn hàng`
      ]);

      await client.query('COMMIT');

      return {
        ...reconciliation,
        high_risk_count: highRiskOrders.length
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Finalize reconciliation and update user balances
   *
   * @param {string} reconciliationId
   * @param {string} performedBy - Admin user ID
   * @returns {Object} Updated reconciliation
   */
  static async finalizeReconciliation(reconciliationId, performedBy) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get reconciliation
      const reconResult = await client.query(
        'SELECT * FROM system_reconciliations WHERE id = $1',
        [reconciliationId]
      );

      if (reconResult.rows.length === 0) {
        throw new Error('Kỳ đối soát không tồn tại');
      }

      const recon = reconResult.rows[0];

      if (recon.status !== 'draft') {
        throw new Error(`Kỳ đối soát đã ${recon.status}, không thể finalize`);
      }

      // Get all items grouped by user
      const itemsQuery = `
        SELECT
          user_id,
          SUM(cashback_amount) as total_cashback,
          SUM(CASE WHEN is_high_risk THEN cashback_amount ELSE 0 END) as high_risk_cashback,
          COUNT(*) as order_count,
          COUNT(CASE WHEN is_high_risk THEN 1 END) as high_risk_count
        FROM system_reconciliation_items
        WHERE system_reconciliation_id = $1
        GROUP BY user_id
      `;

      const itemsResult = await client.query(itemsQuery, [reconciliationId]);
      const userBalances = itemsResult.rows;

      // Calculate available vs reserved for each user
      const rejectionRate = 1 - (recon.estimated_approval_rate / 100);

      for (const userBalance of userBalances) {
        const totalCashback = parseFloat(userBalance.total_cashback);
        const highRiskCashback = parseFloat(userBalance.high_risk_cashback);

        // Reserve a portion of high-risk cashback
        const reservedForUser = highRiskCashback * rejectionRate;
        const availableForUser = totalCashback - reservedForUser;

        // Update or insert user_system_balance
        await client.query(`
          INSERT INTO user_system_balance (
            user_id, available_balance, reserved_balance,
            total_earned, last_reconciliation_date, updated_at
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET
            available_balance = user_system_balance.available_balance + EXCLUDED.available_balance,
            reserved_balance = user_system_balance.reserved_balance + EXCLUDED.reserved_balance,
            total_earned = user_system_balance.total_earned + EXCLUDED.total_earned,
            last_reconciliation_date = EXCLUDED.last_reconciliation_date,
            updated_at = CURRENT_TIMESTAMP
        `, [
          userBalance.user_id,
          availableForUser,
          reservedForUser,
          totalCashback,
          recon.period_end
        ]);
      }

      // Update reconciliation status
      await client.query(`
        UPDATE system_reconciliations
        SET status = 'finalized',
            finalized_at = CURRENT_TIMESTAMP,
            performed_by = $2
        WHERE id = $1
      `, [reconciliationId, performedBy]);

      // Log finalization
      await client.query(`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          old_status, new_status, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        reconciliationId,
        'finalized',
        performedBy,
        'draft',
        'finalized',
        `Finalize kỳ đối soát - cập nhật balance cho ${userBalances.length} users`
      ]);

      await client.query('COMMIT');

      return await this.getReconciliationById(reconciliationId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get reconciliation by ID with statistics
   */
  static async getReconciliationById(reconciliationId) {
    const query = `
      SELECT
        sr.*,
        (SELECT COUNT(*) FROM system_reconciliation_items WHERE system_reconciliation_id = sr.id) as items_count,
        (SELECT COUNT(DISTINCT user_id) FROM system_reconciliation_items WHERE system_reconciliation_id = sr.id) as users_count,
        (SELECT COUNT(*) FROM system_reconciliation_items WHERE system_reconciliation_id = sr.id AND is_high_risk = TRUE) as high_risk_count
      FROM system_reconciliations sr
      WHERE sr.id = $1
    `;

    const result = await pool.query(query, [reconciliationId]);
    return result.rows[0];
  }

  /**
   * Get historical approval rate (last 3 months)
   */
  static async getHistoricalApprovalRate(client = pool) {
    const query = `
      SELECT
        COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL /
        NULLIF(COUNT(*), 0)::DECIMAL * 100 as approval_rate
      FROM conversions
      WHERE created_at >= NOW() - INTERVAL '3 months'
        AND status IN ('approved', 'rejected')
    `;

    const result = await client.query(query);
    const rate = result.rows[0]?.approval_rate || 85.0; // Default 85%

    return parseFloat(rate);
  }

  /**
   * List all reconciliations with pagination
   */
  static async listReconciliations({ page = 1, limit = 20, status = null }) {
    const offset = (page - 1) * limit;
    const params = [];
    let whereClause = '';

    if (status) {
      params.push(status);
      whereClause = `WHERE status = $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM system_reconciliations ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const dataQuery = `
      SELECT
        sr.*,
        (SELECT COUNT(*) FROM system_reconciliation_items WHERE system_reconciliation_id = sr.id) as items_count
      FROM system_reconciliations sr
      ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const dataResult = await pool.query(dataQuery, params);

    return {
      reconciliations: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = SystemReconciliationService;
