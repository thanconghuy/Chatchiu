/**
 * System Reconciliation Admin Routes
 *
 * Admin endpoints for managing system reconciliation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const SystemReconciliationService = require('../services/systemReconciliation/SystemReconciliationService');
const BalanceManagementService = require('../services/systemReconciliation/BalanceManagementService');
const { DailyCollectionJob, MonthlyReconciliationJob, APISyncJob } = require('../jobs/systemReconciliation');
const { pool } = require('../config/database');

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/system-reconciliation
 * List all system reconciliations with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const result = await SystemReconciliationService.listReconciliations({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      search
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error listing reconciliations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/stats
 * Get overall statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_reconciliations,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        SUM(total_cashback) as total_cashback_all_time,
        SUM(CASE WHEN status = 'finalized' THEN total_cashback ELSE 0 END) as total_cashback_finalized,
        SUM(CASE WHEN status = 'draft' THEN total_cashback ELSE 0 END) as total_cashback_pending,
        SUM(reserved_amount) as total_reserved
      FROM system_reconciliations
    `;

    const statsResult = await pool.query(query);
    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        reconciliation_stats: stats
      }
    });

  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/preview
 * Preview eligible orders from system_conversions for a specific period before creating reconciliation
 */
router.get('/preview', async (req, res) => {
  try {
    const { periodStart: startStr, periodEnd: endStr, page = 1, limit = 50 } = req.query;

    if (!startStr || !endStr) {
      return res.status(400).json({
        success: false,
        message: 'periodStart and periodEnd are required'
      });
    }

    // Parse dates
    const periodStart = new Date(startStr);
    const periodEnd = new Date(endStr);
    periodEnd.setHours(23, 59, 59, 999);

    if (periodStart > periodEnd) {
      return res.status(400).json({
        success: false,
        message: 'periodStart must be before periodEnd'
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Query from system_conversions only (Cashback System orders)
    // Only include orders that have NOT been reconciled yet
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_conversions sc
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
    `;

    const summaryQuery = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(DISTINCT sc.user_id) as total_users,
        COALESCE(SUM(sc.cashback_amount), 0) as total_cashback,
        COALESCE(SUM(sc.commission), 0) as total_commission,
        COALESCE(SUM(sc.order_amount), 0) as total_order_amount
      FROM system_conversions sc
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
    `;

    const ordersQuery = `
      SELECT
        sc.id,
        sc.user_id,
        COALESCE(u.full_name, u.username, 'N/A') as user_name,
        COALESCE(u.email, 'N/A') as user_email,
        'Cashback System' as aff_sid,
        sc.merchant_id,
        COALESCE(sc.merchant_name, 'Unknown') as merchant_name,
        COALESCE(sc.order_code, 'N/A') as order_code,
        COALESCE(sc.order_amount, 0) as order_amount,
        COALESCE(sc.commission, 0) as commission,
        COALESCE(sc.cashback_amount, 0) as cashback,
        sc.status as conversion_status,
        sc.order_time,
        sc.created_at,
        false as is_reconciled
      FROM system_conversions sc
      LEFT JOIN users u ON sc.user_id = u.id
      WHERE sc.status = 'approved'
        AND sc.order_time >= $1
        AND sc.order_time <= $2
        AND sc.system_reconciliation_id IS NULL
      ORDER BY sc.order_time DESC
      LIMIT $3 OFFSET $4
    `;

    // Execute queries
    const countResult = await pool.query(countQuery, [periodStart, periodEnd]);
    const totalOrders = parseInt(countResult.rows[0].total);

    const summaryResult = await pool.query(summaryQuery, [periodStart, periodEnd]);
    const summary = summaryResult.rows[0];

    const result = await pool.query(ordersQuery, [periodStart, periodEnd, limitNum, offset]);
    const orders = result.rows;

    res.json({
      success: true,
      data: {
        orders,
        summary: {
          total_orders: parseInt(summary.total_orders),
          total_users: parseInt(summary.total_users),
          total_cashback: parseFloat(summary.total_cashback),
          total_commission: parseFloat(summary.total_commission),
          total_order_amount: parseFloat(summary.total_order_amount)
        },
        period: {
          start: periodStart,
          end: periodEnd
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalOrders,
          totalPages: Math.ceil(totalOrders / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Error previewing orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/create
 * Create a new reconciliation period
 */
router.post('/create', async (req, res) => {
  try {
    const { periodStart, periodEnd, periodLabel, selectedOrderIds } = req.body;

    if (!periodStart || !periodEnd || !periodLabel) {
      return res.status(400).json({
        success: false,
        message: 'periodStart, periodEnd, and periodLabel are required'
      });
    }

    if (!selectedOrderIds || !Array.isArray(selectedOrderIds) || selectedOrderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'selectedOrderIds is required and must contain at least one order'
      });
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'periodStart must be before periodEnd'
      });
    }

    const reconciliation = await SystemReconciliationService.createReconciliation({
      periodStart: startDate,
      periodEnd: endDate,
      periodLabel,
      selectedOrderIds,
      createdBy: req.userId
    });

    res.json({
      success: true,
      message: `Kỳ đối soát "${periodLabel}" đã được tạo với ${selectedOrderIds.length} đơn hàng`,
      data: reconciliation
    });

  } catch (error) {
    console.error('Error creating reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id
 * Get reconciliation details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await SystemReconciliationService.getReconciliationById(id);

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: 'Kỳ đối soát không tồn tại'
      });
    }

    res.json({
      success: true,
      data: reconciliation
    });

  } catch (error) {
    console.error('Error getting reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/items
 * Get reconciliation items with pagination
 */
router.get('/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, userId, isHighRisk } = req.query;

    const offset = (page - 1) * limit;
    const params = [id];
    let paramIndex = 2;
    let whereConditions = ['sri.system_reconciliation_id = $1'];

    if (userId) {
      whereConditions.push(`sri.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (isHighRisk !== undefined) {
      whereConditions.push(`sri.is_high_risk = $${paramIndex++}`);
      params.push(isHighRisk === 'true');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_reconciliation_items sri
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get items
    params.push(limit, offset);
    const itemsQuery = `
      SELECT
        sri.*,
        u.full_name as user_name,
        u.email as user_email,
        COALESCE(sc.order_code, 'N/A') as order_code
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE ${whereClause}
      ORDER BY sri.order_time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const itemsResult = await pool.query(itemsQuery, params);

    res.json({
      success: true,
      data: {
        items: itemsResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting reconciliation items:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/finalize
 * Finalize reconciliation and update user balances
 */
router.post('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await SystemReconciliationService.finalizeReconciliation(
      id,
      req.userId
    );

    res.json({
      success: true,
      message: 'Hoàn tất thành công! Số dư người dùng đã được cập nhật.',
      data: reconciliation
    });

  } catch (error) {
    console.error('Error finalizing reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/available-orders
 * Get available orders that can be added to reconciliation
 */
router.get('/:id/available-orders', async (req, res) => {
  try {
    const { id } = req.params;
    const { search = '', page = 1, limit = 20 } = req.query;

    const result = await SystemReconciliationService.getAvailableOrdersForReconciliation(id, {
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error getting available orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/add-orders
 * Add orders to an existing draft reconciliation
 */
router.post('/:id/add-orders', async (req, res) => {
  try {
    const { id } = req.params;
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderIds phải là mảng và không được rỗng'
      });
    }

    const result = await SystemReconciliationService.addOrdersToReconciliation(
      id,
      orderIds,
      req.userId
    );

    res.json({
      success: true,
      message: `Đã thêm ${result.added_count} đơn hàng vào kỳ đối soát`,
      data: result
    });

  } catch (error) {
    console.error('Error adding orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/admin/system-reconciliation/:id/label
 * Update reconciliation period label (draft only)
 */
router.patch('/:id/label', async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!label || label.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tên kỳ đối soát không được để trống'
      });
    }

    if (label.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Tên kỳ đối soát không được vượt quá 100 ký tự'
      });
    }

    // Check if reconciliation exists and is draft
    const checkQuery = `
      SELECT id, status, period_label
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kỳ đối soát không tồn tại'
      });
    }

    const reconciliation = checkResult.rows[0];

    if (reconciliation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể sửa tên kỳ đối soát ở trạng thái nháp'
      });
    }

    // Update period_label
    const updateQuery = `
      UPDATE system_reconciliations
      SET period_label = $1
      WHERE id = $2
      RETURNING *
    `;
    const updateResult = await pool.query(updateQuery, [label.trim(), id]);

    res.json({
      success: true,
      message: 'Cập nhật tên kỳ đối soát thành công',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating reconciliation label:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/system-reconciliation/:id
 * Update reconciliation (status, label)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { period_label, status } = req.body;

    const updates = {};
    if (period_label) updates.period_label = period_label;
    if (status) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có thông tin nào để cập nhật'
      });
    }

    const updatedRecon = await SystemReconciliationService.updateReconciliation(
      id,
      updates,
      req.userId
    );

    res.json({
      success: true,
      message: 'Cập nhật kỳ đối soát thành công',
      data: updatedRecon
    });

  } catch (error) {
    console.error('Error updating reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/system-reconciliation/:id
 * Delete reconciliation (only draft status)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if reconciliation exists and is draft
    const checkQuery = `
      SELECT id, status, period_label
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy kỳ đối soát'
      });
    }

    const reconciliation = checkResult.rows[0];

    if (reconciliation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể xóa kỳ đối soát ở trạng thái nháp (draft)'
      });
    }

    // IMPORTANT: Restore system_conversions before deleting
    // Get all system_conversion IDs from this reconciliation
    const getConversionsQuery = `
      SELECT system_conversion_id
      FROM system_reconciliation_items
      WHERE system_reconciliation_id = $1
    `;
    const conversionsResult = await pool.query(getConversionsQuery, [id]);
    const conversionIds = conversionsResult.rows.map(r => r.system_conversion_id);

    console.log(`[Delete Reconciliation] Restoring ${conversionIds.length} system_conversions`);

    // Restore system_conversions: clear system_reconciliation_id
    if (conversionIds.length > 0) {
      const restoreConversionsQuery = `
        UPDATE system_conversions
        SET
          system_reconciliation_id = NULL,
          updated_at = NOW()
        WHERE id = ANY($1)
      `;
      await pool.query(restoreConversionsQuery, [conversionIds]);

      console.log(`[Delete Reconciliation] Restored ${conversionIds.length} system_conversions`);

      // Note: No need to restore waiting list status
      // Items were removed from waiting list when added to reconciliation
      // They won't be re-added automatically (user must manually add them again)
    }

    // Delete reconciliation (CASCADE will delete items and logs)
    const deleteQuery = `
      DELETE FROM system_reconciliations
      WHERE id = $1
      RETURNING id
    `;
    await pool.query(deleteQuery, [id]);

    console.log(`[Delete Reconciliation] Deleted reconciliation ${id}`);

    res.json({
      success: true,
      message: `Đã xóa kỳ đối soát "${reconciliation.period_label}" và trả ${conversionIds.length} đơn hàng về trạng thái chờ`
    });

  } catch (error) {
    console.error('Error deleting reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/:id/logs
 * Get reconciliation logs
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        srl.*,
        u.full_name as performed_by_name
      FROM system_reconciliation_logs srl
      LEFT JOIN users u ON srl.performed_by = u.id
      WHERE srl.system_reconciliation_id = $1
      ORDER BY srl.created_at DESC
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/users/balances
 * Get all user balances
 */
router.get('/users/balances', async (req, res) => {
  try {
    const { page = 1, limit = 50, minBalance = 0 } = req.query;

    const result = await BalanceManagementService.getAllUserBalances({
      page: parseInt(page),
      limit: parseInt(limit),
      minBalance: parseFloat(minBalance)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error getting user balances:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/jobs/run
 * Manually run a job
 */
router.post('/jobs/run', async (req, res) => {
  try {
    const { jobName } = req.body;

    let result;

    switch (jobName) {
      case 'daily':
        result = await DailyCollectionJob.run();
        break;
      case 'monthly':
        result = await MonthlyReconciliationJob.run();
        break;
      case 'sync':
        result = await APISyncJob.run();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid job name. Use: daily, monthly, or sync'
        });
    }

    res.json({
      success: true,
      message: `Job ${jobName} completed`,
      data: result
    });

  } catch (error) {
    console.error('Error running job:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/jobs/stats
 * Get job statistics
 */
router.get('/jobs/stats', async (req, res) => {
  try {
    const syncStats = await APISyncJob.getStats();

    // Get daily collection stats for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const dailyStats = await DailyCollectionJob.getStats(startDate, endDate);

    res.json({
      success: true,
      data: {
        sync_stats: syncStats,
        daily_stats: dailyStats
      }
    });

  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/:id/sync
 * Manually sync a specific reconciliation with API data
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify reconciliation exists
    const checkQuery = `
      SELECT id, period_label, status
      FROM system_reconciliations
      WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const reconciliation = checkResult.rows[0];

    // Run sync for this reconciliation
    const result = await APISyncJob.syncReconciliation(id);

    // Log the sync action
    await pool.query(`
      INSERT INTO system_reconciliation_logs (
        system_reconciliation_id,
        action,
        performed_by,
        metadata
      ) VALUES ($1, $2, $3, $4)
    `, [
      id,
      'api_sync',
      req.userId || 'system',
      JSON.stringify({
        synced: result.synced,
        released: result.released,
        released_amount: result.released_amount,
        deducted: result.deducted,
        deducted_amount: result.deducted_amount,
        duration: result.duration
      })
    ]);

    res.json({
      success: true,
      data: result,
      message: `Đã đồng bộ ${result.synced} items cho kỳ ${reconciliation.period_label}`
    });
  } catch (error) {
    console.error('Error syncing reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// AUTO-SYNC WAITING LIST ROUTES
// ========================================

/**
 * GET /api/admin/system-reconciliation/auto-sync/preview
 * Preview eligible orders not yet in waiting list
 */
router.get('/auto-sync/preview', async (req, res) => {
  try {
    // Get eligible conversions not yet in waiting list
    // Join with users to get user info
    // Note: e.conversion_id is actually system_conversions.id
    const eligibleQuery = `
      SELECT
        e.conversion_id,
        e.user_id,
        COALESCE(u.email, 'N/A') as user_email,
        COALESCE(u.full_name, u.username, 'N/A') as user_full_name,
        e.merchant_id,
        e.merchant_name,
        e.order_code,
        e.order_amount,
        e.commission,
        e.cashback_amount,
        e.order_time,
        e.approval_time,
        e.eligible_date,
        e.approval_month,
        e.days_since_approval
      FROM get_eligible_conversions_for_waiting_list() e
      LEFT JOIN users u ON e.user_id = u.id
    `;

    const result = await pool.query(eligibleQuery);
    const eligibleOrders = result.rows;

    // Group by month
    const byMonth = {};
    eligibleOrders.forEach(order => {
      const monthKey = order.approval_month;
      if (!byMonth[monthKey]) {
        const date = new Date(monthKey);
        byMonth[monthKey] = {
          month: monthKey,
          label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
          count: 0,
          cashback: 0,
          orders: []
        };
      }
      byMonth[monthKey].count++;
      byMonth[monthKey].cashback += parseFloat(order.cashback_amount);
      byMonth[monthKey].orders.push(order);
    });

    const summary = Object.values(byMonth);

    // Format response to match frontend expectations
    const totalCashback = eligibleOrders.reduce((sum, o) => sum + parseFloat(o.cashback_amount || 0), 0);
    const monthCount = Object.keys(byMonth).length;

    // Transform byMonth to array with period_label
    const byMonthArray = Object.values(byMonth).map(m => ({
      approval_month: m.month,
      period_label: m.label,
      order_count: m.count,
      total_cashback: m.cashback
    }));

    res.json({
      success: true,
      data: {
        summary: {
          total_count: eligibleOrders.length,
          total_cashback: totalCashback,
          month_count: monthCount
        },
        byMonth: byMonthArray,
        orders: eligibleOrders
      }
    });

  } catch (error) {
    console.error('Error previewing auto-sync:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/auto-sync/add-to-waiting
 * Add eligible orders to waiting list
 */
router.post('/auto-sync/add-to-waiting', async (req, res) => {
  try {
    const addedBy = req.userId || 'admin';

    const result = await pool.query(
      'SELECT * FROM add_eligible_conversions_to_waiting_list($1)',
      [addedBy]
    );

    const { added_count, total_cashback } = result.rows[0];

    // Get updated waiting list count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM reconciliation_waiting_list WHERE status = $1',
      ['waiting']
    );
    const totalWaiting = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      message: `Đã thêm ${added_count} đơn hàng vào danh sách chờ đối soát`,
      data: {
        added_count: parseInt(added_count),
        total_cashback: parseFloat(total_cashback || 0),
        total_waiting: totalWaiting
      }
    });

  } catch (error) {
    console.error('Error adding to waiting list:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/auto-sync/waiting-list
 * Get waiting list with optional filters
 */
router.get('/auto-sync/waiting-list', async (req, res) => {
  try {
    const { month, status = 'waiting', page = 1, limit = 50 } = req.query;

    let query = `
      SELECT
        rwl.*,
        u.full_name as user_name,
        u.email as user_email
      FROM reconciliation_waiting_list rwl
      LEFT JOIN users u ON rwl.user_id = u.id
      WHERE rwl.status = $1
    `;

    const params = [status];
    let paramIndex = 2;

    if (month) {
      query += ` AND rwl.approval_month = $${paramIndex}`;
      params.push(month);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY rwl.approval_time ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get summary
    const summaryResult = await pool.query('SELECT * FROM get_waiting_list_summary()');

    // Map month_label to period_label for summary
    const summaryWithPeriodLabel = summaryResult.rows.map(s => ({
      approval_month: s.approval_month,
      period_label: s.month_label,
      count: s.order_count,
      total_cashback: s.total_cashback,
      user_count: s.user_count
    }));

    // Add period_label to each item
    const itemsWithLabels = result.rows.map(item => {
      const date = new Date(item.approval_month);
      return {
        ...item,
        period_label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
        username: item.user_name
      };
    });

    res.json({
      success: true,
      data: {
        items: itemsWithLabels,
        summary: summaryWithPeriodLabel,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting waiting list:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }
});

/**
 * GET /api/admin/system-reconciliation/auto-sync/check-draft-reconciliation
 * Check if there's an existing draft reconciliation for a given month
 */
router.get('/auto-sync/check-draft-reconciliation', async (req, res) => {
  try {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'month parameter is required'
      });
    }

    // Calculate period dates from month
    const monthDate = new Date(month);
    const periodStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const periodEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    // Check for draft reconciliations overlapping with this period
    const query = `
      SELECT
        id,
        period_label,
        period_start,
        period_end,
        total_orders,
        total_cashback,
        status,
        created_at
      FROM system_reconciliations
      WHERE status = 'draft'
        AND period_start <= $2
        AND period_end >= $1
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const result = await pool.query(query, [periodStart, periodEnd]);

    res.json({
      success: true,
      data: {
        has_draft: result.rows.length > 0,
        draft_reconciliations: result.rows
      }
    });

  } catch (error) {
    console.error('Error checking draft reconciliation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/system-reconciliation/auto-sync/create-from-waiting
 * Create reconciliation from waiting list orders
 */
router.post('/auto-sync/create-from-waiting', async (req, res) => {
  try {
    const { month, periodLabel, reconciliationId } = req.body;

    console.log('[create-from-waiting] Received:', { month, periodLabel, reconciliationId });

    if (!month || !periodLabel) {
      return res.status(400).json({
        success: false,
        message: 'month and periodLabel are required'
      });
    }

    // Get all orders from waiting list for this month
    // Use system_conversion_id for system reconciliation (migration 038)
    console.log('[create-from-waiting] Querying waiting list for month:', month);
    const waitingOrdersResult = await pool.query(`
      SELECT system_conversion_id, cashback_amount
      FROM reconciliation_waiting_list
      WHERE approval_month = $1 AND status = 'waiting'
      ORDER BY approval_time ASC
    `, [month]);

    console.log('[create-from-waiting] Found orders:', waitingOrdersResult.rows.length);

    if (waitingOrdersResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có đơn hàng nào trong danh sách chờ cho tháng này'
      });
    }

    const selectedOrderIds = waitingOrdersResult.rows.map(o => o.system_conversion_id);
    const totalCashback = waitingOrdersResult.rows.reduce((sum, o) => sum + parseFloat(o.cashback_amount || 0), 0);

    let reconciliation;
    let action = 'created'; // 'created' or 'added'

    // Check if reconciliationId provided (add to existing draft)
    if (reconciliationId) {
      // Verify reconciliation exists and is draft
      const reconCheck = await pool.query(
        'SELECT id, status, period_label FROM system_reconciliations WHERE id = $1',
        [reconciliationId]
      );

      if (reconCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Kỳ đối soát không tồn tại'
        });
      }

      if (reconCheck.rows[0].status !== 'draft') {
        return res.status(400).json({
          success: false,
          message: 'Chỉ có thể thêm đơn hàng vào kỳ đối soát ở trạng thái Nháp'
        });
      }

      // Add orders to existing draft
      await SystemReconciliationService.addOrdersToReconciliation(
        reconciliationId,
        selectedOrderIds,
        req.userId
      );

      reconciliation = { id: reconciliationId };
      action = 'added';

    } else {
      // Calculate period dates from month
      const monthDate = new Date(month);
      const periodStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const periodEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      periodEnd.setHours(23, 59, 59, 999);

      // Create new reconciliation using existing service
      reconciliation = await SystemReconciliationService.createReconciliation({
        periodStart,
        periodEnd,
        periodLabel,
        selectedOrderIds,
        createdBy: req.userId
      });

      action = 'created';
    }

    // Note: Waiting list cleanup is now handled automatically in SystemReconciliationService
    // Both createReconciliation() and addOrdersToReconciliation() delete from waiting list

    // Get remaining waiting list count
    const remainingResult = await pool.query(
      'SELECT COUNT(*) as remaining FROM reconciliation_waiting_list WHERE status = $1',
      ['waiting']
    );
    const remaining = parseInt(remainingResult.rows[0].remaining);

    const message = action === 'created'
      ? `Đã tạo kỳ đối soát "${periodLabel}" với ${selectedOrderIds.length} đơn hàng`
      : `Đã thêm ${selectedOrderIds.length} đơn hàng vào kỳ đối soát "${periodLabel}"`;

    res.json({
      success: true,
      message,
      data: {
        reconciliation_id: reconciliation.id,
        order_count: selectedOrderIds.length,
        total_cashback: totalCashback,
        remaining_in_waiting: remaining,
        action // 'created' or 'added'
      }
    });

  } catch (error) {
    console.error('[create-from-waiting] ERROR:', error);
    console.error('[create-from-waiting] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/system-reconciliation/auto-sync/waiting-list/:id
 * Remove order from waiting list
 */
router.delete('/auto-sync/waiting-list/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM reconciliation_waiting_list WHERE id = $1 AND status = $2 RETURNING *',
      [id, 'waiting']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng trong danh sách chờ'
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa đơn hàng khỏi danh sách chờ',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error removing from waiting list:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
 
