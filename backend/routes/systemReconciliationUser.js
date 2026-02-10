/**
 * System Reconciliation User Routes
 *
 * User-facing endpoints for viewing system balance and reconciliation history
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const BalanceManagementService = require('../services/systemReconciliation/BalanceManagementService');
const { pool } = require('../config/database');

/**
 * GET /api/user/system-reconciliation/balance
 * Get current user's system balance
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const balance = await BalanceManagementService.getUserBalance(userId);

    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Get user balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin số dư',
      error: error.message
    });
  }
});

/**
 * GET /api/user/system-reconciliation/reconciliations
 * Get user's reconciliation periods (grouped by period)
 */
router.get('/reconciliations', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, year } = req.query;
    const offset = (page - 1) * limit;

    console.log('[User Reconciliations] Request:', { userId, page, limit, offset, year });

    // Build year filter
    const yearFilter = year ? `AND EXTRACT(YEAR FROM sr.period_start) = $4` : '';
    const params = year
      ? [userId, limit, offset, parseInt(year)]
      : [userId, limit, offset];
    const countParams = year
      ? [userId, parseInt(year)]
      : [userId];

    // Get reconciliation periods for this user
    // Use system_conversions as primary source (covers both direct link and sri path)
    const reconciliationsQuery = `
      SELECT
        sr.id,
        sr.period_label,
        sr.period_start,
        sr.period_end,
        sr.reconciliation_date,
        sr.status,
        sr.created_at,
        sr.finalized_at,
        COUNT(sc.id) as item_count,
        COALESCE(SUM(sc.cashback_amount), 0) as total_cashback
      FROM system_reconciliations sr
      JOIN system_conversions sc ON sc.system_reconciliation_id = sr.id AND sc.user_id = $1
      ${yearFilter}
      GROUP BY sr.id, sr.period_label, sr.period_start, sr.period_end, sr.reconciliation_date, sr.status, sr.created_at, sr.finalized_at
      ORDER BY sr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT sr.id) as total
      FROM system_reconciliations sr
      JOIN system_conversions sc ON sc.system_reconciliation_id = sr.id AND sc.user_id = $1
      ${year ? `AND EXTRACT(YEAR FROM sr.period_start) = $2` : ''}
    `;

    const [reconciliationsResult, countResult] = await Promise.all([
      pool.query(reconciliationsQuery, params),
      pool.query(countQuery, countParams)
    ]);

    const reconciliations = reconciliationsResult.rows;
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    console.log('[User Reconciliations] Results:', { count: reconciliations.length, total, totalPages });

    res.json({
      success: true,
      data: {
        reconciliations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get reconciliations error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách kỳ đối soát',
      error: error.message
    });
  }
});

/**
 * GET /api/user/system-reconciliation/reconciliations/:id
 * Get details of a specific reconciliation period
 */
router.get('/reconciliations/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const reconciliationId = req.params.id;

    // Get reconciliation details
    const reconQuery = `
      SELECT
        sr.id,
        sr.period_label,
        sr.period_start,
        sr.period_end,
        sr.reconciliation_date,
        sr.status,
        sr.created_at,
        sr.finalized_at
      FROM system_reconciliations sr
      WHERE sr.id = $1
    `;

    const reconResult = await pool.query(reconQuery, [reconciliationId]);

    if (reconResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kỳ đối soát không tồn tại'
      });
    }

    const reconciliation = reconResult.rows[0];

    // Get items for this user in this reconciliation
    // Use system_conversions as primary source (covers both direct link and sri path)
    const itemsQuery = `
      SELECT
        sc.id,
        sc.id as conversion_id,
        sc.order_time,
        sc.cashback_amount,
        sc.merchant_name,
        sc.order_value,
        sc.commission as commission_amount,
        COALESCE(sri.conversion_status, sc.status) as conversion_status,
        COALESCE(sri.is_high_risk, false) as is_high_risk,
        COALESCE(sri.risk_score, 0) as risk_score,
        sc.order_code
      FROM system_conversions sc
      LEFT JOIN system_reconciliation_items sri ON sri.system_conversion_id = sc.id AND sri.user_id = $2
      WHERE sc.system_reconciliation_id = $1 AND sc.user_id = $2
      ORDER BY sc.order_time DESC
    `;

    const itemsResult = await pool.query(itemsQuery, [reconciliationId, userId]);

    res.json({
      success: true,
      data: {
        ...reconciliation,
        itemCount: itemsResult.rows.length,
        totalCashback: itemsResult.rows.reduce((sum, item) => sum + parseFloat(item.cashback_amount || 0), 0),
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Get reconciliation details error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy chi tiết kỳ đối soát',
      error: error.message
    });
  }
});

/**
 * GET /api/user/system-reconciliation/history
 * Get user's reconciliation history (items that affected their balance)
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get reconciliation items for this user
    const itemsQuery = `
      SELECT
        sri.id,
        sri.created_at,
        sri.reconciled_at,
        sr.period_label,
        sr.period_start,
        sr.period_end,
        sr.reconciliation_date,
        sr.status as reconciliation_status,
        COALESCE(sri.conversion_id, sri.system_conversion_id) as conversion_id,
        sri.order_id,
        sri.cashback_amount,
        sri.conversion_status,
        sri.is_high_risk,
        sri.risk_score,
        sri.api_reconciled,
        COALESCE(sc.merchant_name, c.merchant_name, sri.merchant_name) as merchant_name,
        COALESCE(sc.order_time, c.order_time, sri.order_time) as order_time,
        COALESCE(sc.approval_time, c.approval_time) as approval_time
      FROM system_reconciliation_items sri
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sri.user_id = $1
      ORDER BY sri.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_reconciliation_items
      WHERE user_id = $1
    `;

    const [itemsResult, countResult] = await Promise.all([
      pool.query(itemsQuery, [userId, limit, offset]),
      pool.query(countQuery, [userId])
    ]);

    const items = itemsResult.rows;
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get reconciliation history error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy lịch sử đối soát',
      error: error.message
    });
  }
});

/**
 * GET /api/user/system-reconciliation/transactions
 * Get user's balance transaction history (all balance changes)
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    let typeFilter = '';
    const queryParams = [userId, limit, offset];

    if (type) {
      typeFilter = 'AND transaction_type = $4';
      queryParams.push(type);
    }

    // Get balance transaction logs
    const transactionsQuery = `
      SELECT
        id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reserved_before,
        reserved_after,
        pending_before,
        pending_after,
        description,
        created_at
      FROM user_balance_transactions
      WHERE user_id = $1
      ${typeFilter}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_balance_transactions
      WHERE user_id = $1
      ${typeFilter}
    `;

    const countParams = type ? [userId, type] : [userId];

    const [transactionsResult, countResult] = await Promise.all([
      pool.query(transactionsQuery, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const transactions = transactionsResult.rows;
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get balance transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy lịch sử giao dịch',
      error: error.message
    });
  }
});

/**
 * GET /api/user/system-reconciliation/summary
 * Get user's reconciliation summary statistics
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const summaryQuery = `
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN conversion_status = 'approved' THEN 1 END) as approved_items,
        COUNT(CASE WHEN conversion_status = 'pending' THEN 1 END) as pending_items,
        COUNT(CASE WHEN conversion_status = 'rejected' THEN 1 END) as rejected_items,
        COUNT(CASE WHEN is_high_risk = TRUE THEN 1 END) as high_risk_items,
        COUNT(CASE WHEN api_reconciled = TRUE THEN 1 END) as api_confirmed_items,
        SUM(cashback_amount) as total_cashback,
        SUM(CASE WHEN conversion_status = 'approved' THEN cashback_amount ELSE 0 END) as approved_cashback,
        SUM(CASE WHEN is_high_risk = TRUE THEN cashback_amount ELSE 0 END) as high_risk_cashback
      FROM system_reconciliation_items
      WHERE user_id = $1
    `;

    const result = await pool.query(summaryQuery, [userId]);
    const summary = result.rows[0];

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get reconciliation summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy thống kê đối soát',
      error: error.message
    });
  }
});

module.exports = router;
