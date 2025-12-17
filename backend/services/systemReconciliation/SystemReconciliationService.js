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

      // Check if any selected orders are already in another reconciliation
      const checkOrdersQuery = `
        SELECT sri.conversion_id, sr.period_label
        FROM system_reconciliation_items sri
        JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
        WHERE sri.conversion_id = ANY($1)
        LIMIT 1
      `;
      const existingOrders = await client.query(checkOrdersQuery, [selectedOrderIds]);

      if (existingOrders.rows.length > 0) {
        const order = existingOrders.rows[0];
        throw new Error(`Một số đơn hàng đã có trong kỳ đối soát "${order.period_label}". Vui lòng chọn đơn hàng khác.`);
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

      // Update conversions status to 'pending'
      // This will auto-sync to system_conversions via trigger
      await client.query(`
        UPDATE conversions
        SET
          system_reconciliation_status = 'pending',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      `, [reconciliation.id, orders.map(o => o.conversion_id)]);

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
          COUNT(*) as order_count,
          ARRAY_AGG(conversion_id) as conversion_ids
        FROM system_reconciliation_items
        WHERE system_reconciliation_id = $1
        GROUP BY user_id
      `;

      const itemsResult = await client.query(itemsQuery, [reconciliationId]);
      const userBalances = itemsResult.rows;

      // Pay 100% cashback immediately (no reserved balance)
      for (const userBalance of userBalances) {
        const totalCashback = parseFloat(userBalance.total_cashback);

        // Update or insert user_system_balance - Pay 100% to available
        await client.query(`
          INSERT INTO user_system_balance (
            user_id, available_balance, total_earned,
            last_reconciliation_date, updated_at
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET
            available_balance = user_system_balance.available_balance + EXCLUDED.available_balance,
            total_earned = user_system_balance.total_earned + EXCLUDED.total_earned,
            last_reconciliation_date = EXCLUDED.last_reconciliation_date,
            updated_at = CURRENT_TIMESTAMP
        `, [
          userBalance.user_id,
          totalCashback,  // 100% goes to available
          totalCashback,
          recon.period_end
        ]);

        // Log transaction for each user
        // Get current balance first
        const balanceResult = await client.query(
          'SELECT available_balance FROM user_system_balance WHERE user_id = $1',
          [userBalance.user_id]
        );

        const currentBalance = balanceResult.rows[0]?.available_balance || 0;

        await client.query(`
          INSERT INTO user_balance_transactions (
            user_id, transaction_type, amount,
            balance_before, balance_after,
            description, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [
          userBalance.user_id,
          'reconciliation_finalized',
          totalCashback,
          parseFloat(currentBalance) - totalCashback,
          parseFloat(currentBalance),
          'Đối soát nội bộ: ' + recon.period_label
        ]);
      }

      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status = 'pending'
      `, [reconciliationId]);

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

      // Send email notifications to users (async, don't block)
      // Import dynamically to avoid circular dependencies
      setImmediate(async () => {
        try {
          const { sendReconciliationFinalizedEmails } = require('../emailHelpers/reconciliationEmailHelper');

          await sendReconciliationFinalizedEmails({
            reconciliationId,
            periodLabel: recon.period_label,
            userBalances: userBalances
          });
        } catch (emailError) {
          // Log but don't throw - email failures should not break finalization
          console.error('[SystemReconciliation] Failed to send finalization emails:', emailError.message);
        }
      });

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

  /**
   * Get available orders that can be added to a reconciliation
   *
   * @param {string} reconciliationId - ID of the reconciliation
   * @param {Object} filters - { search, page, limit }
   * @returns {Object} Available orders with pagination
   */
  static async getAvailableOrdersForReconciliation(reconciliationId, filters = {}) {
    const { search = '', page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Get reconciliation period
    const reconQuery = `
      SELECT period_start, period_end, period_label, status
      FROM system_reconciliations
      WHERE id = $1
    `;
    const reconResult = await pool.query(reconQuery, [reconciliationId]);

    if (reconResult.rows.length === 0) {
      throw new Error('Kỳ đối soát không tồn tại');
    }

    const recon = reconResult.rows[0];

    if (recon.status !== 'draft') {
      throw new Error('Chỉ có thể thêm đơn hàng vào kỳ đối soát DRAFT');
    }

    // Build search condition
    let searchCondition = '';
    const queryParams = [recon.period_start, recon.period_end];

    if (search) {
      queryParams.push(`%${search}%`);
      searchCondition = `
        AND (
          sc.id::text ILIKE $${queryParams.length}
          OR sc.order_code ILIKE $${queryParams.length}
          OR u.email ILIKE $${queryParams.length}
          OR u.full_name ILIKE $${queryParams.length}
          OR u.username ILIKE $${queryParams.length}
        )
      `;
    }

    // Count total available orders - include ALL approved orders in period (even those in other reconciliations)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_conversions sc
      LEFT JOIN clicks cl ON sc.click_id = cl.id
      LEFT JOIN users u ON COALESCE(sc.user_id, cl.user_id) = u.id
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        ${searchCondition}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated orders - include ALL approved orders with reconciliation info
    queryParams.push(limit, offset);
    const ordersQuery = `
      SELECT
        sc.at_conversion_id as conversion_id,
        COALESCE(sc.user_id, cl.user_id) as user_id,
        COALESCE(sc.order_code, sc.id::text) as order_id,
        sc.order_time,
        COALESCE(sc.approval_time, sc.order_time) as confirmed_time,
        COALESCE(sc.cashback_amount, 0) as cashback_amount,
        sc.status,
        sc.system_reconciliation_id,
        sc.system_reconciliation_status,
        COALESCE(
          NULLIF(TRIM(u.full_name), ''),
          NULLIF(TRIM(u.username), ''),
          u.email,
          'Order ' || COALESCE(sc.order_code, sc.id::text)
        ) as user_name,
        COALESCE(u.email, '') as user_email,
        CASE
          WHEN sc.system_reconciliation_id IS NOT NULL THEN true
          ELSE false
        END as is_in_reconciliation
      FROM system_conversions sc
      LEFT JOIN clicks cl ON sc.click_id = cl.id
      LEFT JOIN users u ON COALESCE(sc.user_id, cl.user_id) = u.id
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        ${searchCondition}
      ORDER BY sc.approval_time DESC NULLS LAST, sc.order_time DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
    `;

    const ordersResult = await pool.query(ordersQuery, queryParams);

    return {
      reconciliation: recon,
      orders: ordersResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Add orders to an existing draft reconciliation
   *
   * @param {string} reconciliationId - ID of the reconciliation
   * @param {Array<string>} orderIds - Array of conversion IDs to add
   * @param {string} performedBy - Admin user ID
   * @returns {Object} Updated reconciliation
   */
  static async addOrdersToReconciliation(reconciliationId, orderIds, performedBy) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Verify reconciliation is DRAFT
      const reconResult = await client.query(
        'SELECT * FROM system_reconciliations WHERE id = $1',
        [reconciliationId]
      );

      if (reconResult.rows.length === 0) {
        throw new Error('Kỳ đối soát không tồn tại');
      }

      const recon = reconResult.rows[0];

      if (recon.status !== 'draft') {
        throw new Error('Chỉ có thể thêm đơn hàng vào kỳ đối soát DRAFT');
      }

      // 2. Get order details (only approved, not already in any reconciliation)
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
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.conversion_id = c.id
          )
        ORDER BY c.order_time ASC
      `;

      const ordersResult = await client.query(ordersQuery, [orderIds]);
      const orders = ordersResult.rows;

      if (orders.length === 0) {
        throw new Error('Không có đơn hàng hợp lệ để thêm');
      }

      // 3. Insert reconciliation items
      let addedCashback = 0;
      const addedUserIds = new Set();

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
          reconciliationId,
          order.conversion_id,
          order.user_id,
          order.merchant_id,
          order.merchant_name,
          order.order_time,
          order.confirmed_time,
          order.order_value,
          order.commission,
          order.cashback_amount,
          'Đã duyệt',
          isHighRisk,
          riskScore
        ]);

        addedCashback += parseFloat(order.cashback_amount);
        addedUserIds.add(order.user_id);

        if (isHighRisk) {
          // Add to reserved amount
          const approvalRate = await this.getHistoricalApprovalRate(client);
          const rejectionBuffer = 1 - (approvalRate / 100);
          const reservedForThisOrder = parseFloat(order.cashback_amount) * rejectionBuffer;

          await client.query(`
            UPDATE system_reconciliations
            SET reserved_amount = reserved_amount + $1
            WHERE id = $2
          `, [reservedForThisOrder, reconciliationId]);
        }
      }

      // 4. Update conversions status
      await client.query(`
        UPDATE conversions
        SET
          system_reconciliation_status = 'pending',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      `, [reconciliationId, orders.map(o => o.conversion_id)]);

      // 5. Recalculate totals
      const totalsQuery = `
        SELECT
          COUNT(*) as total_orders,
          COUNT(DISTINCT user_id) as total_users,
          SUM(cashback_amount) as total_cashback
        FROM system_reconciliation_items
        WHERE system_reconciliation_id = $1
      `;

      const totalsResult = await client.query(totalsQuery, [reconciliationId]);
      const totals = totalsResult.rows[0];

      // 6. Update reconciliation
      await client.query(`
        UPDATE system_reconciliations
        SET
          total_orders = $1,
          total_users = $2,
          total_cashback = $3,
          approved_orders = $1
        WHERE id = $4
      `, [
        totals.total_orders,
        totals.total_users,
        totals.total_cashback,
        reconciliationId
      ]);

      // 7. Log action
      await client.query(`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          new_status, new_total_cashback, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        reconciliationId,
        'orders_added',
        performedBy,
        'draft',
        totals.total_cashback,
        `Thêm ${orders.length} đơn hàng vào kỳ đối soát`
      ]);

      await client.query('COMMIT');

      return {
        added_count: orders.length,
        added_cashback: addedCashback,
        updated_reconciliation: await this.getReconciliationById(reconciliationId)
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update reconciliation (status, label)
   * Only allow updating draft/finalized reconciliations that haven't been paid
   *
   * @param {string} reconciliationId - ID of the reconciliation
   * @param {Object} updates - { period_label, status }
   * @param {string} performedBy - Admin user ID
   * @returns {Object} Updated reconciliation
   */
  static async updateReconciliation(reconciliationId, updates, performedBy) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current reconciliation
      const reconResult = await client.query(
        'SELECT * FROM system_reconciliations WHERE id = $1',
        [reconciliationId]
      );

      if (reconResult.rows.length === 0) {
        throw new Error('Kỳ đối soát không tồn tại');
      }

      const currentRecon = reconResult.rows[0];

      // Validate: Cannot edit if already paid users
      if (currentRecon.status === 'paid') {
        throw new Error('Không thể chỉnh sửa kỳ đối soát đã thanh toán cho users');
      }

      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (updates.period_label) {
        updateFields.push(`period_label = $${paramIndex}`);
        updateValues.push(updates.period_label);
        paramIndex++;
      }

      if (updates.status) {
        // Validate status transition
        const validStatuses = ['draft', 'finalized'];
        if (!validStatuses.includes(updates.status)) {
          throw new Error('Trạng thái không hợp lệ. Chỉ cho phép: draft, finalized');
        }

        updateFields.push(`status = $${paramIndex}`);
        updateValues.push(updates.status);
        paramIndex++;

        // If changing to draft, clear finalized_at
        if (updates.status === 'draft') {
          updateFields.push('finalized_at = NULL');
          updateFields.push('performed_by = NULL');
        }

        // If changing to finalized, set finalized_at
        if (updates.status === 'finalized' && currentRecon.status !== 'finalized') {
          updateFields.push('finalized_at = CURRENT_TIMESTAMP');
          updateFields.push(`performed_by = $${paramIndex}`);
          updateValues.push(performedBy);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('Không có thông tin nào để cập nhật');
      }

      updateValues.push(reconciliationId);

      const updateQuery = `
        UPDATE system_reconciliations
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, updateValues);
      const updatedRecon = updateResult.rows[0];

      // If status changed from finalized to draft, revert conversions status
      if (currentRecon.status === 'finalized' && updates.status === 'draft') {
        // First, check if all users have sufficient balance to revert
        const itemsResult = await client.query(`
          SELECT user_id, SUM(cashback_amount) as total_cashback
          FROM system_reconciliation_items
          WHERE system_reconciliation_id = $1
          GROUP BY user_id
        `, [reconciliationId]);

        // Validate balances
        for (const item of itemsResult.rows) {
          const balanceCheck = await client.query(`
            SELECT available_balance
            FROM user_system_balance
            WHERE user_id = $1
          `, [item.user_id]);

          if (balanceCheck.rows.length === 0) {
            throw new Error(`Không tìm thấy balance cho user ${item.user_id}`);
          }

          const currentBalance = parseFloat(balanceCheck.rows[0].available_balance);
          const revertAmount = parseFloat(item.total_cashback);

          if (currentBalance < revertAmount) {
            throw new Error(
              `Không thể revert: User có số dư ${currentBalance.toLocaleString('vi-VN')}đ, ` +
              `cần trừ ${revertAmount.toLocaleString('vi-VN')}đ. ` +
              `Có thể user đã rút tiền.`
            );
          }
        }

        // If validation passes, proceed with revert
        await client.query(`
          UPDATE conversions
          SET
            system_reconciliation_status = 'pending'
          WHERE system_reconciliation_id = $1
            AND system_reconciliation_status = 'reconciled'
        `, [reconciliationId]);

        // Revert user balances
        for (const item of itemsResult.rows) {
          await client.query(`
            UPDATE user_system_balance
            SET
              available_balance = available_balance - $1,
              total_earned = total_earned - $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2
          `, [item.total_cashback, item.user_id]);
        }
      }

      // Log action
      await client.query(`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          old_status, new_status, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        reconciliationId,
        'updated',
        performedBy,
        currentRecon.status,
        updates.status || currentRecon.status,
        `Cập nhật kỳ đối soát: ${updates.period_label ? 'Đổi tên, ' : ''}${updates.status ? `Đổi trạng thái ${currentRecon.status} → ${updates.status}` : ''}`
      ]);

      await client.query('COMMIT');

      return updatedRecon;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = SystemReconciliationService;
