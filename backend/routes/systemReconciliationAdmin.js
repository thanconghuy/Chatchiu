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
const pool = require('../config/database');

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/system-reconciliation
 * List all system reconciliations with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const result = await SystemReconciliationService.listReconciliations({
      page: parseInt(page),
      limit: parseInt(limit),
      status
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
        SUM(reserved_amount) as total_reserved
      FROM system_reconciliations
    `;

    const statsResult = await pool.query(query);
    const stats = statsResult.rows[0];

    // Get balance stats
    const balanceStats = await BalanceManagementService.getTotalStats();

    res.json({
      success: true,
      data: {
        reconciliation_stats: stats,
        balance_stats: balanceStats
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
 * POST /api/admin/system-reconciliation/create
 * Create a new reconciliation period
 */
router.post('/create', async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month (1-12)'
      });
    }

    const reconciliation = await SystemReconciliationService.createReconciliation({
      month: parseInt(month),
      year: parseInt(year),
      createdBy: req.userId
    });

    res.json({
      success: true,
      message: `Kỳ đối soát tháng ${month}/${year} đã được tạo`,
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
    let whereConditions = ['system_reconciliation_id = $1'];

    if (userId) {
      whereConditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (isHighRisk !== undefined) {
      whereConditions.push(`is_high_risk = $${paramIndex++}`);
      params.push(isHighRisk === 'true');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_reconciliation_items
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
        u.email as user_email
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
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
      message: 'Kỳ đối soát đã được finalize. User balance đã được cập nhật.',
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
        details
      ) VALUES ($1, $2, $3, $4)
    `, [
      id,
      'api_sync',
      req.user?.userId || 'system',
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
