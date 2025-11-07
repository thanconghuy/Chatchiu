/**
 * Public API Routes
 * These routes don't require authentication
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * GET /api/public/recent-orders
 * Get recent approved orders for homepage display
 */
router.get('/recent-orders', async (req, res) => {
    try {
        // Get 50 most recent conversions (approved or pending)
        const query = `
            SELECT
                order_code,
                merchant_name as merchant,
                order_amount,
                COALESCE(cashback_amount, commission * 0.7) as cashback_amount,
                created_at,
                status
            FROM conversions
            WHERE status IN ('approved', 'pending')
            AND order_amount > 0
            ORDER BY created_at DESC
            LIMIT 50
        `;

        const result = await pool.query(query);

        res.json({
            success: true,
            orders: result.rows
        });
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent orders',
            error: error.message
        });
    }
});

module.exports = router;
