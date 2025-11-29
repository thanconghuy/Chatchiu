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
 * Preview eligible orders for a specific period before creating reconciliation
 */
router.get('/preview', async (req, res) => {
  try {
    const { periodStart: startStr, periodEnd: endStr, affSid, page = 1, limit = 50 } = req.query;

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

    // Build aff_sid filter
    let affSidCondition = '';
    if (affSid && affSid !== 'all') {
      affSidCondition = ` AND c.aff_sid = '${affSid}'`;
    }

    // Count total eligible orders
    const countQuery = `
      SELECT COUNT(*) as total
      FROM conversions c
      WHERE c.status = 'approved'
        AND c.order_time >= $1
        AND c.order_time <= $2
        ${affSidCondition}
    `;
    const countResult = await pool.query(countQuery, [periodStart, periodEnd]);
    const totalOrders = parseInt(countResult.rows[0].total);

    // Calculate summary from all orders
    const summaryQuery = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(DISTINCT user_id) as total_users,
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(order_amount), 0) as total_order_amount
      FROM conversions c
      WHERE c.status = 'approved'
        AND c.order_time >= $1
        AND c.order_time <= $2
        ${affSidCondition}
    `;
    const summaryResult = await pool.query(summaryQuery, [periodStart, periodEnd]);
    const summary = summaryResult.rows[0];

    // Get paginated orders
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const query = `
      SELECT
        c.id,
        c.user_id,
        COALESCE(u.full_name, u.username, 'N/A') as user_name,
        COALESCE(u.email, 'N/A') as user_email,
        c.merchant_id,
        COALESCE(c.merchant_name, 'Unknown') as merchant_name,
        COALESCE(c.order_code, 'N/A') as order_code,
        COALESCE(c.order_amount, 0) as order_amount,
        COALESCE(c.commission, 0) as commission,
        COALESCE(c.cashback_amount, 0) as cashback,
        c.status as conversion_status,
        c.order_time,
        c.created_at,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM system_reconciliation_items sri
            WHERE sri.conversion_id = c.id
          ) THEN true
          ELSE false
        END as is_reconciled
      FROM conversions c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.status = 'approved'
        AND c.order_time >= $1
        AND c.order_time <= $2
        ${affSidCondition}
      ORDER BY c.order_time DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [periodStart, periodEnd, limitNum, offset]);
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
        c.order_code
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
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

module.exports = router;
 