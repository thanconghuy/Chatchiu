const db = require('../config/database');

class Conversion {
    /**
     * Create a new conversion record
     * @param {Object} conversionData
     * @returns {Promise<Object>}
     */
    static async create(conversionData) {
        const {
            userId = null,
            clickId = null,
            accesstradeId,
            merchantId = null,
            merchantName = null,
            orderCode = null,
            orderAmount = 0,
            commission = 0,
            cashbackAmount = 0,
            status = 'pending',
            affSid = null,
            utmSource = null,
            utmMedium = null,
            utmCampaign = null,
            utmContent = null,
            orderTime = null,
            approvalTime = null,
            // Reconciliation fields (from migration 001)
            isConfirmed = 0,
            confirmedTime = null,
            orderApproved = 0,
            orderPending = 0,
            orderReject = 0
        } = conversionData;

        const query = `
            INSERT INTO conversions (
                user_id, click_id, accesstrade_id, merchant_id, merchant_name,
                order_code, order_amount, commission, cashback_amount,
                status, aff_sid, utm_source, utm_medium, utm_campaign, utm_content,
                order_time, approval_time,
                is_confirmed, confirmed_time, order_approved, order_pending, order_reject
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING *
        `;

        const values = [
            userId,
            clickId,
            accesstradeId,
            merchantId,
            merchantName,
            orderCode,
            orderAmount,
            commission,
            cashbackAmount,
            status,
            affSid,
            utmSource,
            utmMedium,
            utmCampaign,
            utmContent,
            orderTime,
            approvalTime,
            isConfirmed,
            confirmedTime,
            orderApproved,
            orderPending,
            orderReject
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
                   cl.original_url,
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
                   cl.original_url
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
