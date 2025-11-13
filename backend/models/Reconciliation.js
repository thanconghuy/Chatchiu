const db = require('../config/database');

/**
 * Reconciliation Model
 * Manages reconciliation periods for cashback settlements
 * Corresponds to 'reconciliations' table (migration 002)
 */
class Reconciliation {
  /**
   * Create a new reconciliation period
   * @param {Object} data
   * @param {string|null} data.userId - User ID (null = all users)
   * @param {Date} data.periodStart
   * @param {Date} data.periodEnd
   * @param {string} data.periodLabel - e.g., "Tháng 11/2025"
   * @param {string} data.createdBy - Admin user ID
   * @param {string} data.notes
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const {
      userId = null,
      periodStart,
      periodEnd,
      periodLabel,
      createdBy,
      notes = null
    } = data;

    const query = `
      INSERT INTO reconciliations (
        user_id,
        period_start,
        period_end,
        period_label,
        status,
        version,
        is_latest,
        created_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      userId,
      periodStart,
      periodEnd,
      periodLabel,
      'draft', // Initial status
      1, // Initial version
      true, // Is latest version
      createdBy,
      notes
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Create a new version of existing reconciliation (re-run)
   * @param {string} parentReconciliationId
   * @param {string} createdBy - Admin user ID
   * @param {string} notes
   * @returns {Promise<Object>}
   */
  static async createVersion(parentReconciliationId, createdBy, notes = null) {
    // Get parent reconciliation
    const parent = await this.findById(parentReconciliationId);
    if (!parent) {
      throw new Error('Parent reconciliation not found');
    }

    const query = `
      INSERT INTO reconciliations (
        user_id,
        period_start,
        period_end,
        period_label,
        status,
        version,
        parent_reconciliation_id,
        is_latest,
        created_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      parent.user_id,
      parent.period_start,
      parent.period_end,
      parent.period_label,
      'draft', // New version starts as draft
      parent.version + 1, // Increment version
      parentReconciliationId,
      true, // New version is latest (trigger will update parent)
      createdBy,
      notes
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Find reconciliation by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const query = `
      SELECT r.*,
             u.full_name as user_name,
             u.email as user_email,
             admin.full_name as created_by_name
      FROM reconciliations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users admin ON r.created_by = admin.id
      WHERE r.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update reconciliation status
   * @param {string} id
   * @param {string} status - 'draft', 'confirmed', 'paid', 'cancelled'
   * @returns {Promise<Object>}
   */
  static async updateStatus(id, status) {
    const validStatuses = ['draft', 'confirmed', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Determine which timestamp to update based on status
    let timestampField = null;
    if (status === 'confirmed') timestampField = 'confirmed_at';
    else if (status === 'paid') timestampField = 'paid_at';
    else if (status === 'cancelled') timestampField = 'cancelled_at';

    const query = timestampField
      ? `
        UPDATE reconciliations
        SET status = $1,
            ${timestampField} = NOW()
        WHERE id = $2
        RETURNING *
      `
      : `
        UPDATE reconciliations
        SET status = $1
        WHERE id = $2
        RETURNING *
      `;

    const result = await db.query(query, [status, id]);
    return result.rows[0];
  }

  /**
   * Update notes
   * @param {string} id
   * @param {string} notes
   * @returns {Promise<Object>}
   */
  static async updateNotes(id, notes) {
    const query = `
      UPDATE reconciliations
      SET notes = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [notes, id]);
    return result.rows[0];
  }

  /**
   * Get all reconciliations with filters
   * @param {Object} filters
   * @param {string|null} filters.userId - Filter by user (null = all users)
   * @param {string|null} filters.status - Filter by status
   * @param {boolean} filters.latestOnly - Show only latest versions
   * @param {number} filters.limit
   * @param {number} filters.offset
   * @returns {Promise<Array>}
   */
  static async findAll(filters = {}) {
    const {
      userId = null,
      status = null,
      latestOnly = true,
      limit = 50,
      offset = 0
    } = filters;

    let query = `
      SELECT r.*,
             u.full_name as user_name,
             u.email as user_email,
             admin.full_name as created_by_name
      FROM reconciliations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users admin ON r.created_by = admin.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 0;

    // Filter by user_id
    if (userId !== null) {
      paramCount++;
      query += ` AND r.user_id = $${paramCount}`;
      values.push(userId);
    }

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      values.push(status);
    }

    // Filter latest versions only
    if (latestOnly) {
      query += ` AND r.is_latest = true`;
    }

    // Order and pagination
    query += ` ORDER BY r.created_at DESC`;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Get reconciliations for a specific user
   * @param {string} userId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findByUserId(userId, options = {}) {
    return this.findAll({
      userId,
      ...options
    });
  }

  /**
   * Get all versions of a reconciliation period
   * @param {string} reconciliationId - Can be any version in the chain
   * @returns {Promise<Array>}
   */
  static async getAllVersions(reconciliationId) {
    // First, find the root reconciliation (the one without parent_reconciliation_id)
    const query = `
      WITH RECURSIVE reconciliation_chain AS (
        -- Base case: Start from the given reconciliation
        SELECT id, parent_reconciliation_id, version
        FROM reconciliations
        WHERE id = $1

        UNION ALL

        -- Recursive case: Follow parent chain upwards
        SELECT r.id, r.parent_reconciliation_id, r.version
        FROM reconciliations r
        INNER JOIN reconciliation_chain rc ON r.id = rc.parent_reconciliation_id
      )
      SELECT r.*,
             u.full_name as user_name,
             admin.full_name as created_by_name
      FROM reconciliations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users admin ON r.created_by = admin.id
      WHERE r.id IN (
        -- Get the root
        SELECT id FROM reconciliation_chain WHERE parent_reconciliation_id IS NULL

        UNION

        -- Get all children of the root
        SELECT id FROM reconciliations
        WHERE parent_reconciliation_id = (
          SELECT id FROM reconciliation_chain WHERE parent_reconciliation_id IS NULL
        )
      )
      ORDER BY r.version ASC
    `;

    const result = await db.query(query, [reconciliationId]);
    return result.rows;
  }

  /**
   * Check if reconciliation period overlaps with existing ones
   * @param {string|null} userId
   * @param {Date} periodStart
   * @param {Date} periodEnd
   * @param {string|null} excludeId - Exclude this reconciliation from check
   * @returns {Promise<boolean>}
   */
  static async hasOverlap(userId, periodStart, periodEnd, excludeId = null) {
    let query = `
      SELECT COUNT(*) as count
      FROM reconciliations
      WHERE is_latest = true
        AND status NOT IN ('cancelled')
        AND (
          (period_start <= $1 AND period_end >= $1) OR
          (period_start <= $2 AND period_end >= $2) OR
          (period_start >= $1 AND period_end <= $2)
        )
    `;

    const values = [periodStart, periodEnd];
    let paramCount = 2;

    // Check for same user or null (all users)
    if (userId !== null) {
      paramCount++;
      query += ` AND (user_id = $${paramCount} OR user_id IS NULL)`;
      values.push(userId);
    } else {
      query += ` AND user_id IS NULL`;
    }

    // Exclude specific reconciliation (for updates)
    if (excludeId) {
      paramCount++;
      query += ` AND id != $${paramCount}`;
      values.push(excludeId);
    }

    const result = await db.query(query, values);
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Delete reconciliation (admin only)
   * Note: This will CASCADE delete reconciliation_items and logs
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  static async delete(id) {
    const query = `
      DELETE FROM reconciliations
      WHERE id = $1
      RETURNING id
    `;

    const result = await db.query(query, [id]);
    return result.rows.length > 0;
  }

  /**
   * Get reconciliation statistics summary
   * @returns {Promise<Object>}
   */
  static async getStatsSummary() {
    const query = `
      SELECT
        COUNT(*) as total_reconciliations,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COALESCE(SUM(total_cashback), 0) as total_cashback_all,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cashback ELSE 0 END), 0) as total_cashback_paid,
        COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total_cashback ELSE 0 END), 0) as total_cashback_confirmed
      FROM reconciliations
      WHERE is_latest = true
    `;

    const result = await db.query(query);
    return result.rows[0];
  }
}

module.exports = Reconciliation;
