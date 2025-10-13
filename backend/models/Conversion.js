const db = require('../config/database');

class Conversion {
    /**
     * Create a new conversion record
     * @param {Object} conversionData
     * @returns {Promise<Object>}
     */
    static async create(conversionData) {
        const {
            clickId,
            accesstradeId,
            merchantId,
            orderCode,
            orderAmount,
            commission,
            cashbackAmount,
            status = 'pending',
            orderTime,
            approvalTime = null
        } = conversionData;

        const query = `
            INSERT INTO conversions (
                click_id, accesstrade_id, merchant_id, order_code,
                order_amount, commission, cashback_amount, status,
                order_time, approval_time
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;

        const values = [
            clickId,
            accesstradeId,
            merchantId,
            orderCode,
            orderAmount,
            commission,
            cashbackAmount,
            status,
            orderTime,
            approvalTime
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find conversion by AccessTrade ID
     * @param {string} accesstradeId
     * @returns {Promise<Object|null>}
     */
    static async findByAccessTradeId(accesstradeId) {
        const query = `
            SELECT c.*,
                   m.name as merchant_name,
                   m.logo_url as merchant_logo,
                   cl.user_id,
                   cl.aff_sid
            FROM conversions c
            LEFT JOIN merchants m ON c.merchant_id = m.id
            LEFT JOIN clicks cl ON c.click_id = cl.id
            WHERE c.accesstrade_id = $1
        `;

        const result = await db.query(query, [accesstradeId]);
        return result.rows[0] || null;
    }

    /**
     * Update conversion status
     * @param {string} id - Conversion ID
     * @param {string} status - New status (pending, approved, rejected)
     * @param {Date} approvalTime - Approval/rejection time
     * @returns {Promise<Object>}
     */
    static async updateStatus(id, status, approvalTime = null) {
        const query = `
            UPDATE conversions
            SET status = $1,
                approval_time = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `;

        const result = await db.query(query, [status, approvalTime, id]);
        return result.rows[0];
    }

    /**
     * Get user conversions with optional status filter
     * @param {string} userId
     * @param {string|null} status - Filter by status (null = all)
     * @param {number} limit
     * @param {number} offset
     * @returns {Promise<Array>}
     */
    static async getUserConversions(userId, status = null, limit = 50, offset = 0) {
        let query = `
            SELECT c.*,
                   m.name as merchant_name,
                   m.logo_url as merchant_logo,
                   cl.click_type,
                   cl.product_url,
                   cl.clicked_at
            FROM conversions c
            INNER JOIN clicks cl ON c.click_id = cl.id
            INNER JOIN merchants m ON c.merchant_id = m.id
            WHERE cl.user_id = $1
        `;

        const values = [userId];

        if (status) {
            query += ` AND c.status = $2`;
            values.push(status);
        }

        query += ` ORDER BY c.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
        values.push(limit, offset);

        const result = await db.query(query, values);
        return result.rows;
    }

    /**
     * Get user statistics
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    static async getUserStats(userId) {
        const query = `
            SELECT
                COUNT(*) as total_conversions,
                COUNT(CASE WHEN c.status = 'approved' THEN 1 END) as approved_conversions,
                COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_conversions,
                COUNT(CASE WHEN c.status = 'rejected' THEN 1 END) as rejected_conversions,
                COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.cashback_amount ELSE 0 END), 0) as total_approved_cashback,
                COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.cashback_amount ELSE 0 END), 0) as total_pending_cashback,
                COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.order_amount ELSE 0 END), 0) as total_approved_order_value,
                COALESCE(SUM(c.order_amount), 0) as total_order_value
            FROM conversions c
            INNER JOIN clicks cl ON c.click_id = cl.id
            WHERE cl.user_id = $1
        `;

        const result = await db.query(query, [userId]);
        return result.rows[0];
    }

    /**
     * Get conversion by ID
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    static async findById(id) {
        const query = `
            SELECT c.*,
                   m.name as merchant_name,
                   m.logo_url as merchant_logo,
                   cl.user_id,
                   cl.aff_sid,
                   cl.click_type,
                   cl.product_url
            FROM conversions c
            LEFT JOIN merchants m ON c.merchant_id = m.id
            LEFT JOIN clicks cl ON c.click_id = cl.id
            WHERE c.id = $1
        `;

        const result = await db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Count user conversions by status
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    static async countByStatus(userId) {
        const query = `
            SELECT
                c.status,
                COUNT(*) as count
            FROM conversions c
            INNER JOIN clicks cl ON c.click_id = cl.id
            WHERE cl.user_id = $1
            GROUP BY c.status
        `;

        const result = await db.query(query, [userId]);

        // Format result as object
        const counts = {
            pending: 0,
            approved: 0,
            rejected: 0
        };

        result.rows.forEach(row => {
            counts[row.status] = parseInt(row.count);
        });

        return counts;
    }

    /**
     * Get recent conversions for user
     * @param {string} userId
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    static async getRecent(userId, limit = 10) {
        return this.getUserConversions(userId, null, limit, 0);
    }
}

module.exports = Conversion;
