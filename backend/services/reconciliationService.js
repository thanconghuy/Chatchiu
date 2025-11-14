const db = require('../config/database');
const Reconciliation = require('../models/Reconciliation');
const ReconciliationItem = require('../models/ReconciliationItem');
const logger = require('../utils/logger');

/**
 * Reconciliation Service
 * Business logic for cashback reconciliation periods
 */
class ReconciliationService {
  /**
   * Preview eligible conversions for reconciliation
   * Shows what will be included if reconciliation is created
   * @param {Object} params
   * @param {string|null} params.userId - User ID (null = all users)
   * @param {Date} params.periodStart
   * @param {Date} params.periodEnd
   * @param {string|null} params.utmSource - Filter by utm_source (null = all sources)
   * @returns {Promise<Object>}
   */
  async previewReconciliation(params) {
    const {
      userId = null,
      periodStart,
      periodEnd,
      utmSource = null
    } = params;

    try {
      logger.info('Previewing reconciliation', { userId, periodStart, periodEnd, utmSource });

      // Query eligible conversions
      // Note: We're looking for conversions that:
      // 1. is_confirmed = 1 (confirmed by AccessTrade)
      // 2. status = 'approved' (approved by admin)
      // 3. Within the time period (confirmed_time)
      // 4. Match utm_source filter (if provided)
      // 5. LEFT JOIN users allows reconciling orders without user_id (legacy data)
      let query = `
        SELECT
          c.id,
          c.user_id,
          c.click_id,
          c.order_code,
          c.merchant_name,
          c.order_amount,
          c.commission,
          c.cashback_amount,
          c.order_time,
          c.confirmed_time,
          c.status,
          c.is_confirmed,
          c.utm_source,
          c.utm_campaign,
          u.full_name as user_name,
          u.email as user_email,
          -- Check if already in reconciliation
          ri.reconciliation_id as existing_reconciliation_id,
          r.period_label as existing_period_label
        FROM conversions c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
        LEFT JOIN reconciliations r ON ri.reconciliation_id = r.id
        WHERE 1=1
          AND c.is_confirmed = 1
          AND c.status = 'approved'
          AND c.confirmed_time >= $1
          AND c.confirmed_time < $2
      `;

      const values = [periodStart, periodEnd];
      let paramCount = 2;

      // Filter by utm_source if specified
      if (utmSource) {
        paramCount++;
        query += ` AND c.utm_source = $${paramCount}`;
        values.push(utmSource);
      }

      // Filter by user if specified
      if (userId) {
        paramCount++;
        query += ` AND c.user_id = $${paramCount}`;
        values.push(userId);
      }

      query += ` ORDER BY c.confirmed_time DESC`;

      logger.info('Executing preview query', { query, values });

      const result = await db.query(query, values);
      const conversions = result.rows;

      logger.info('Query returned conversions', {
        count: conversions.length,
        sample: conversions.slice(0, 3).map(c => ({
          order_code: c.order_code,
          is_confirmed: c.is_confirmed,
          status: c.status,
          confirmed_time: c.confirmed_time,
          utm_source: c.utm_source
        }))
      });

      // Separate eligible vs already reconciled
      const eligible = conversions.filter(c => !c.existing_reconciliation_id);
      const alreadyReconciled = conversions.filter(c => c.existing_reconciliation_id);

      // Calculate statistics
      const stats = {
        eligible_count: eligible.length,
        eligible_total_cashback: eligible.reduce((sum, c) => sum + parseFloat(c.cashback_amount || 0), 0),
        eligible_total_order_amount: eligible.reduce((sum, c) => sum + parseFloat(c.order_amount || 0), 0),
        already_reconciled_count: alreadyReconciled.length,
        total_found: conversions.length
      };

      logger.success('Preview completed', stats);

      return {
        eligible,
        alreadyReconciled,
        stats
      };
    } catch (error) {
      logger.error('Failed to preview reconciliation', {
        error: error.message,
        params
      });
      throw error;
    }
  }

  /**
   * Create a new reconciliation period
   * @param {Object} params
   * @param {string|null} params.userId - User ID (null = all users)
   * @param {Date} params.periodStart
   * @param {Date} params.periodEnd
   * @param {string} params.periodLabel - e.g., "Tháng 11/2025"
   * @param {string} params.createdBy - Admin user ID
   * @param {string} params.notes
   * @param {string|null} params.utmSource - Filter by utm_source (null = all sources)
   * @returns {Promise<Object>}
   */
  async createReconciliation(params) {
    const {
      userId = null,
      periodStart,
      periodEnd,
      periodLabel,
      createdBy,
      notes = null,
      utmSource = null
    } = params;

    try {
      logger.info('Creating reconciliation', { userId, periodStart, periodEnd, periodLabel });

      // Check for overlapping periods
      const hasOverlap = await Reconciliation.hasOverlap(userId, periodStart, periodEnd);
      if (hasOverlap) {
        throw new Error('Reconciliation period overlaps with existing period');
      }

      // Get eligible conversions (same query as preview)
      const preview = await this.previewReconciliation({ userId, periodStart, periodEnd, utmSource });

      if (preview.eligible.length === 0) {
        throw new Error('No eligible conversions found for this period');
      }

      // Start transaction
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // Create reconciliation record
        const reconciliationData = {
          userId,
          periodStart,
          periodEnd,
          periodLabel,
          createdBy,
          notes
        };

        const reconciliationQuery = `
          INSERT INTO reconciliations (
            user_id, period_start, period_end, period_label,
            status, version, is_latest, created_by, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;

        const reconciliationValues = [
          userId,
          periodStart,
          periodEnd,
          periodLabel,
          'draft',
          1,
          true,
          createdBy,
          notes
        ];

        const recResult = await client.query(reconciliationQuery, reconciliationValues);
        const reconciliation = recResult.rows[0];

        logger.info('Created reconciliation record', { reconciliationId: reconciliation.id });

        // Prepare items for bulk insert
        const items = preview.eligible.map(conv => ({
          reconciliationId: reconciliation.id,
          conversionId: conv.id,
          userId: conv.user_id,
          clickId: conv.click_id,
          orderCode: conv.order_code,
          merchantName: conv.merchant_name,
          orderAmount: conv.order_amount,
          commission: conv.commission,
          cashbackAmount: conv.cashback_amount,
          orderTime: conv.order_time,
          confirmedTime: conv.confirmed_time
        }));

        // Bulk insert items
        const insertedItems = await ReconciliationItem.bulkCreate(items);

        logger.success('Created reconciliation items', { count: insertedItems.length });

        await client.query('COMMIT');

        // Return full reconciliation with items
        const fullReconciliation = await Reconciliation.findById(reconciliation.id);
        const itemsList = await ReconciliationItem.findByReconciliationId(reconciliation.id);

        return {
          reconciliation: fullReconciliation,
          items: itemsList,
          stats: {
            total_orders: insertedItems.length,
            total_order_amount: fullReconciliation.total_order_amount,
            total_cashback: fullReconciliation.total_cashback
          }
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create reconciliation', {
        error: error.message,
        stack: error.stack,
        params
      });
      throw error;
    }
  }

  /**
   * Get reconciliation details
   * @param {string} reconciliationId
   * @returns {Promise<Object>}
   */
  async getReconciliationDetails(reconciliationId) {
    try {
      const reconciliation = await Reconciliation.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      const items = await ReconciliationItem.findByReconciliationId(reconciliationId);
      const stats = await ReconciliationItem.getStats(reconciliationId);
      const userStats = await ReconciliationItem.getUserStats(reconciliationId);

      return {
        reconciliation,
        items,
        stats,
        userStats
      };
    } catch (error) {
      logger.error('Failed to get reconciliation details', {
        reconciliationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update reconciliation status
   * @param {string} reconciliationId
   * @param {string} newStatus - 'draft', 'confirmed', 'paid', 'cancelled'
   * @param {string} performedBy - Admin user ID
   * @returns {Promise<Object>}
   */
  async updateReconciliationStatus(reconciliationId, newStatus, performedBy) {
    try {
      logger.info('Updating reconciliation status', { reconciliationId, newStatus, performedBy });

      // Validate status transition
      const reconciliation = await Reconciliation.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      const currentStatus = reconciliation.status;

      // Status workflow validation
      const validTransitions = {
        'draft': ['confirmed', 'cancelled'],
        'confirmed': ['paid', 'cancelled'],
        'paid': [], // Final state
        'cancelled': [] // Final state
      };

      if (!validTransitions[currentStatus].includes(newStatus)) {
        throw new Error(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
      }

      // Update status (trigger will log the action)
      const updated = await Reconciliation.updateStatus(reconciliationId, newStatus);

      logger.success('Updated reconciliation status', {
        reconciliationId,
        oldStatus: currentStatus,
        newStatus
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update reconciliation status', {
        reconciliationId,
        newStatus,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Re-run reconciliation (create new version)
   * @param {string} parentReconciliationId
   * @param {string} createdBy - Admin user ID
   * @param {string} notes
   * @returns {Promise<Object>}
   */
  async rerunReconciliation(parentReconciliationId, createdBy, notes = null) {
    try {
      logger.info('Re-running reconciliation', { parentReconciliationId, createdBy });

      // Get parent reconciliation
      const parent = await Reconciliation.findById(parentReconciliationId);
      if (!parent) {
        throw new Error('Parent reconciliation not found');
      }

      // Create new version with same parameters
      const newReconciliation = await this.createReconciliation({
        userId: parent.user_id,
        periodStart: parent.period_start,
        periodEnd: parent.period_end,
        periodLabel: parent.period_label,
        createdBy,
        notes: notes || `Re-run của ${parent.period_label} (v${parent.version})`
      });

      // Update new reconciliation's parent_reconciliation_id and version
      const updateQuery = `
        UPDATE reconciliations
        SET
          parent_reconciliation_id = $1,
          version = $2
        WHERE id = $3
        RETURNING *
      `;

      const result = await db.query(updateQuery, [
        parentReconciliationId,
        parent.version + 1,
        newReconciliation.reconciliation.id
      ]);

      logger.success('Re-run reconciliation completed', {
        parentId: parentReconciliationId,
        newId: newReconciliation.reconciliation.id,
        version: parent.version + 1
      });

      return {
        ...newReconciliation,
        reconciliation: result.rows[0]
      };
    } catch (error) {
      logger.error('Failed to re-run reconciliation', {
        parentReconciliationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all reconciliations with filters (admin)
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getAllReconciliations(filters = {}) {
    try {
      const reconciliations = await Reconciliation.findAll(filters);
      return reconciliations;
    } catch (error) {
      logger.error('Failed to get all reconciliations', {
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's reconciliations (user view)
   * @param {string} userId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getUserReconciliations(userId, options = {}) {
    try {
      const reconciliations = await Reconciliation.findByUserId(userId, {
        latestOnly: true,
        status: 'confirmed', // Only show confirmed reconciliations to users
        ...options
      });

      // Add item count and stats for each reconciliation
      const enriched = await Promise.all(
        reconciliations.map(async (rec) => {
          const itemCount = await ReconciliationItem.countByReconciliationId(rec.id);
          return {
            ...rec,
            item_count: itemCount
          };
        })
      );

      return enriched;
    } catch (error) {
      logger.error('Failed to get user reconciliations', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's items in a specific reconciliation period
   * @param {string} reconciliationId
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getUserReconciliationItems(reconciliationId, userId) {
    try {
      // Verify reconciliation exists and belongs to user or is confirmed
      const reconciliation = await Reconciliation.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      // Users can only view their own reconciliations or confirmed ones
      if (reconciliation.user_id !== userId && reconciliation.status !== 'confirmed') {
        throw new Error('Access denied');
      }

      const items = await ReconciliationItem.findByReconciliationAndUser(reconciliationId, userId);
      return items;
    } catch (error) {
      logger.error('Failed to get user reconciliation items', {
        reconciliationId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get reconciliation statistics summary
   * @returns {Promise<Object>}
   */
  async getStatsSummary() {
    try {
      const stats = await Reconciliation.getStatsSummary();
      return stats;
    } catch (error) {
      logger.error('Failed to get stats summary', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete reconciliation (admin only, only draft status)
   * @param {string} reconciliationId
   * @returns {Promise<boolean>}
   */
  async deleteReconciliation(reconciliationId) {
    try {
      const reconciliation = await Reconciliation.findById(reconciliationId);
      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      if (reconciliation.status !== 'draft') {
        throw new Error('Only draft reconciliations can be deleted');
      }

      const deleted = await Reconciliation.delete(reconciliationId);

      logger.success('Deleted reconciliation', { reconciliationId });

      return deleted;
    } catch (error) {
      logger.error('Failed to delete reconciliation', {
        reconciliationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export reconciliation to CSV
   * @param {string} reconciliationId
   * @returns {Promise<Array>}
   */
  async exportReconciliationToCSV(reconciliationId) {
    try {
      const csvData = await ReconciliationItem.exportToCSV(reconciliationId);
      return csvData;
    } catch (error) {
      logger.error('Failed to export reconciliation', {
        reconciliationId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new ReconciliationService();
