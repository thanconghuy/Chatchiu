/**
 * System Reconciliation Service
 *
 * Purpose: Internal reconciliation system for faster cashback payout
 * Timeline: Month + 15 days (vs API 65-105 days)
 *
 * This is a NEW module that works alongside existing API reconciliation
 */

const { pool } = require('../../config/database');
const RiskAssessmentService = require('./RiskAssessmentService');

class SystemReconciliationService {
  /**
   * Create a new system reconciliation period
   *
   * @param {Object} params
   * @param {Date} params.periodStart - Start date of the period
   * @param {Date} params.periodEnd - End date of the period
   * @param {string} params.periodLabel - Label for the reconciliation period
   * @param {Array<string>} params.selectedOrderIds - Array of selected conversion IDs
   * @param {string} params.createdBy - Admin user ID
   * @returns {Object} Created reconciliation
   */
  static async createReconciliation({ periodStart, periodEnd, periodLabel, selectedOrderIds, createdBy }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Calculate reconciliation date (period end + 15 days)
      const reconciliationDate = new Date(periodEnd);
      reconciliationDate.setDate(periodEnd.getDate() + 15);

      // Check if reconciliation already exists
      const checkQuery = `
        SELECT id FROM system_reconciliations
        WHERE period_start = $1 AND period_end = $2
      `;
      const existing = await client.query(checkQuery, [periodStart, periodEnd]);

      if (existing.rows.length > 0) {
        throw new Error(`Kỳ đối soát ${periodLabel} đã tồn tại`);
      }

      // Collect selected orders from conversions
      // Filter by selectedOrderIds array
      const ordersQuery = `
        SELECT
          c.id as conversion_id,
          c.user_id,
          c.merchant_id,
          COALESCE(c.merchant_name, 'Unknown') as merchant_name,
          c.order_time,
          c.confirmed_time,
          COALESCE(c.order_amount, 0) as order_value,
          COALESCE(c.commission, 0) as commission,
          COALESCE(c.cashback_amount, 0) as cashback_amount,
          c.status,
          u.created_at as user_created_at
        FROM conversions c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ANY($1)
          AND c.status = 'approved'
          AND NOT EXISTS (
            -- Exclude already reconciled orders
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.conversion_id = c.id
          )
        ORDER BY c.order_time ASC
      `;

      const ordersResult = await client.query(ordersQuery, [selectedOrderIds]);
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
          order.confirmed_time,  // Use confirmed_time from query
          order.order_value,
          order.commission,
          order.cashback_amount,
          'Đã duyệt', // Use conversion_status value
          isHighRisk,
          riskScore
        ]);
      }
