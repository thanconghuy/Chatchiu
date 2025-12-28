const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const { authenticateToken } = require('../middleware/auth');
const reconciliationService = require('../services/reconciliationService');
const logger = require('../utils/logger');

/**
 * POST /api/reconciliation/preview
 * Preview eligible conversions for reconciliation
 * Body: { userId, periodStart, periodEnd, utmSource }
 */
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const { userId, periodStart, periodEnd, utmSource } = req.body;

    // Validate required fields
    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        message: 'periodStart and periodEnd are required'
      });
    }

    const preview = await reconciliationService.previewReconciliation({
      userId: userId || null,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      utmSource: utmSource ?? null  // Use nullish coalescing to allow null values
    });

    res.json({
      success: true,
      data: preview
    });
  } catch (error) {
    logger.error('Preview reconciliation failed', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/reconciliation/create
 * Create a new reconciliation period
 * Body: { userId, periodStart, periodEnd, periodLabel, notes, utmSource }
 */
router.post('/create', authenticateAdmin, async (req, res) => {
  try {
    const {
      userId,
      periodStart,
      periodEnd,
      periodLabel,
      notes,
      utmSource
    } = req.body;

    // Validate required fields
    if (!periodStart || !periodEnd || !periodLabel) {
      return res.status(400).json({
        success: false,
        message: 'periodStart, periodEnd, and periodLabel are required'
      });
    }

    const result = await reconciliationService.createReconciliation({
      userId: userId || null,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      periodLabel,
      createdBy: req.user.id, // Admin user from authenticateAdmin middleware
      notes: notes || null,
      utmSource: utmSource ?? null  // Use nullish coalescing to allow null values
    });

    res.status(201).json({
      success: true,
      message: 'Reconciliation created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Create reconciliation failed', {
      error: error.message,
      body: req.body,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/list
 * Get all reconciliations with filters
 * Query: ?userId=xxx&status=xxx&latestOnly=true&limit=50&offset=0
 */
router.get('/list', authenticateAdmin, async (req, res) => {
  try {
    const {
      userId,
      status,
      latestOnly,
      limit,
      offset
    } = req.query;

    const filters = {
      userId: userId || null,
      status: status || null,
      latestOnly: latestOnly !== 'false', // Default true
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    };

    const reconciliations = await reconciliationService.getAllReconciliations(filters);

    res.json({
      success: true,
      data: reconciliations,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: reconciliations.length
      }
    });
  } catch (error) {
    logger.error('Get reconciliation list failed', {
      error: error.message,
      query: req.query
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/:id
 * Get reconciliation details by ID
 */
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const details = await reconciliationService.getReconciliationDetails(id);

    res.json({
      success: true,
      data: details
    });
  } catch (error) {
    logger.error('Get reconciliation details failed', {
      error: error.message,
      reconciliationId: req.params.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/reconciliation/:id/status
 * Update reconciliation status
 * Body: { status: 'draft' | 'confirmed' | 'paid' | 'cancelled' }
 */
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required'
      });
    }

    const validStatuses = ['draft', 'confirmed', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updated = await reconciliationService.updateReconciliationStatus(
      id,
      status,
      req.user.id // Admin user ID
    );

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: updated
    });
  } catch (error) {
    logger.error('Update reconciliation status failed', {
      error: error.message,
      reconciliationId: req.params.id,
      status: req.body.status,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/reconciliation/:id/label
 * Update reconciliation period label (draft only)
 * Body: { label }
 */
router.patch('/:id/label', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'label is required'
      });
    }

    const updated = await reconciliationService.updatePeriodLabel(id, label);

    res.json({
      success: true,
      message: 'Cập nhật tên kỳ đối soát thành công',
      data: updated
    });
  } catch (error) {
    logger.error('Update reconciliation label failed', {
      error: error.message,
      reconciliationId: req.params.id,
      label: req.body.label,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/reconciliation/:id/rerun
 * Re-run reconciliation (create new version)
 * Body: { notes }
 */
router.post('/:id/rerun', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await reconciliationService.rerunReconciliation(
      id,
      req.user.id, // Admin user ID
      notes || null
    );

    res.status(201).json({
      success: true,
      message: 'Reconciliation re-run successfully',
      data: result
    });
  } catch (error) {
    logger.error('Re-run reconciliation failed', {
      error: error.message,
      reconciliationId: req.params.id,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/reconciliation/:id
 * Delete reconciliation (only draft status)
 */
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await reconciliationService.deleteReconciliation(id);

    res.json({
      success: true,
      message: 'Reconciliation deleted successfully'
    });
  } catch (error) {
    logger.error('Delete reconciliation failed', {
      error: error.message,
      reconciliationId: req.params.id,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/:id/export
 * Export reconciliation to CSV
 */
router.get('/:id/export', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const csvData = await reconciliationService.exportReconciliationToCSV(id);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${id}.csv"`);

    // Convert to CSV format
    if (csvData.length === 0) {
      return res.send('No data');
    }

    // CSV header row
    const headers = Object.keys(csvData[0]);
    const csvRows = [headers.join(',')];

    // Data rows
    csvData.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(','));
    });

    res.send(csvRows.join('\n'));
  } catch (error) {
    logger.error('Export reconciliation failed', {
      error: error.message,
      reconciliationId: req.params.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/stats/summary
 * Get overall reconciliation statistics
 */
router.get('/stats/summary', authenticateAdmin, async (req, res) => {
  try {
    const stats = await reconciliationService.getStatsSummary();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get reconciliation stats failed', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/user/eligibility
 * Check if user is eligible to view reconciliation page
 * Eligible if: total commission >= 50,000 OR has been reconciled before
 */
router.get('/user/eligibility', authenticateToken, async (req, res) => {
  try {
    const { pool } = require('../config/database');

    // Check if user has any reconciliation history
    const reconciliationQuery = `
      SELECT COUNT(*) as count
      FROM reconciliation_items ri
      JOIN reconciliations r ON ri.reconciliation_id = r.id
      WHERE ri.user_id = $1 AND r.status != 'cancelled'
    `;
    const reconciliationResult = await pool.query(reconciliationQuery, [req.userId]);
    const hasReconciliationHistory = parseInt(reconciliationResult.rows[0].count) > 0;

    // Check total approved commission
    const commissionQuery = `
      SELECT COALESCE(SUM(commission), 0) as total_commission
      FROM conversions
      WHERE user_id = $1 AND status = 'approved' AND is_confirmed = 1
    `;
    const commissionResult = await pool.query(commissionQuery, [req.userId]);
    const totalCommission = parseFloat(commissionResult.rows[0].total_commission);

    const isEligible = hasReconciliationHistory || totalCommission >= 50000;

    res.json({
      success: true,
      eligible: isEligible,
      reason: isEligible
        ? (hasReconciliationHistory ? 'has_history' : 'sufficient_commission')
        : 'insufficient_commission',
      totalCommission: totalCommission,
      minimumRequired: 50000
    });
  } catch (error) {
    logger.error('Check user reconciliation eligibility failed', {
      error: error.message,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/user/history
 * Get reconciliation history for logged-in user
 * Query: ?limit=50&offset=0
 */
router.get('/user/history', authenticateToken, async (req, res) => {
  try {
    const { limit, offset } = req.query;

    const filters = {
      userId: req.userId, // Only show reconciliations for this user
      status: 'confirmed', // Only show confirmed reconciliations (not draft)
      latestOnly: true, // Only show latest versions
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    };

    const reconciliations = await reconciliationService.getAllReconciliations(filters);

    res.json({
      success: true,
      data: reconciliations,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: reconciliations.length
      }
    });
  } catch (error) {
    logger.error('Get user reconciliation history failed', {
      error: error.message,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reconciliation/user/:id
 * Get reconciliation details for logged-in user
 */
router.get('/user/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const details = await reconciliationService.getReconciliationDetails(id);

    // Verify user has access to this reconciliation
    // Check if any items belong to this user
    const hasAccess = details.items.some(item => item.userId === req.userId);

    if (!hasAccess && details.userId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Filter items to only show user's own items
    const userItems = details.items.filter(item => item.userId === req.userId);

    res.json({
      success: true,
      data: {
        ...details,
        items: userItems,
        itemCount: userItems.length,
        totalCashback: userItems.reduce((sum, item) => sum + parseFloat(item.cashbackAmount || 0), 0)
      }
    });
  } catch (error) {
    logger.error('Get user reconciliation details failed', {
      error: error.message,
      reconciliationId: req.params.id,
      userId: req.userId
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
