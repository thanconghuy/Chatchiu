const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
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

module.exports = router;
