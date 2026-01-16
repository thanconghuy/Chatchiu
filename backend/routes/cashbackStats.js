/**
 * Cashback Statistics Routes
 * Module thống kê cashback theo user
 *
 * Endpoint: /api/cashback-stats
 * Auth: Admin only
 */

const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * GET /api/cashback-stats
 * Lấy danh sách thống kê cashback của tất cả users
 *
 * Response format:
 * {
 *   success: true,
 *   data: [
 *     {
 *       user_id, email, username, full_name,
 *       total_cashback,         // Tổng cashback (total_earned)
 *       pending_cashback,       // Cashback chờ duyệt (conversions pending)
 *       approved_cashback,      // Cashback đã duyệt (conversions approved but not paid)
 *       paid_cashback,          // Cashback đã thanh toán (total_withdrawn)
 *       available_balance       // Số dư còn lại (available_balance)
 *     }
 *   ]
 * }
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { search, sortBy = 'total_cashback', sortOrder = 'DESC', limit = 50, offset = 0 } = req.query;

    // Build WHERE clause for search
    let whereClause = '';
    const queryParams = [];

    if (search) {
      whereClause = `
        WHERE (
          u.email ILIKE $1 OR
          u.username ILIKE $1 OR
          u.full_name ILIKE $1
        )
      `;
      queryParams.push(`%${search}%`);
    }

    // Main query
    const query = `
      SELECT
        u.id as user_id,
        u.email,
        u.username,
        u.full_name,

        -- Tổng cashback (từ user_system_balance)
        COALESCE(usb.total_earned, 0) as total_cashback,

        -- Cashback chờ duyệt (pending conversions)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'pending'
        ), 0) as pending_cashback,

        -- Cashback đã duyệt nhưng chưa thanh toán (approved conversions)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        ), 0) as approved_cashback,

        -- Cashback đã hủy (rejected conversions)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'rejected'
        ), 0) as rejected_cashback,

        -- Cashback đã thanh toán
        COALESCE(usb.total_withdrawn, 0) as paid_cashback,

        -- Số dư còn lại (available_balance - auto computed)
        COALESCE(usb.available_balance, 0) as available_balance,

        -- Số dư đang chờ xử lý payment request
        COALESCE(usb.pending_reserved, 0) as pending_reserved

      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}, u.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      ${whereClause}
    `;

    const countParams = search ? [`%${search}%`] : [];
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Calculate summary statistics
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT u.id) as total_users,
        COALESCE(SUM(usb.total_earned), 0) as total_cashback_all,
        COALESCE(SUM(usb.total_withdrawn), 0) as total_paid_all,
        COALESCE(SUM(usb.available_balance), 0) as total_available_all,
        COALESCE(SUM(usb.pending_reserved), 0) as total_pending_reserved_all
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      ${whereClause}
    `;

    const summaryResult = await db.query(summaryQuery, countParams);
    const summary = summaryResult.rows[0];

    logger.info('Get cashback stats success', {
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
      resultCount: result.rows.length,
      total
    });

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: parseInt(offset) + result.rows.length < total
      },
      summary: {
        total_users: parseInt(summary.total_users),
        total_cashback_all: parseFloat(summary.total_cashback_all),
        total_paid_all: parseFloat(summary.total_paid_all),
        total_available_all: parseFloat(summary.total_available_all),
        total_pending_reserved_all: parseFloat(summary.total_pending_reserved_all)
      }
    });

  } catch (error) {
    logger.error('Get cashback stats failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê cashback',
      error: error.message
    });
  }
});

/**
 * GET /api/cashback-stats/:userId
 * Lấy chi tiết thống kê cashback của một user
 */
router.get('/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const query = `
      SELECT
        u.id as user_id,
        u.email,
        u.username,
        u.full_name,
        u.phone,

        -- Balance info
        COALESCE(usb.total_earned, 0) as total_cashback,
        COALESCE(usb.total_withdrawn, 0) as paid_cashback,
        COALESCE(usb.available_balance, 0) as available_balance,
        COALESCE(usb.pending_reserved, 0) as pending_reserved,

        -- Conversion stats
        (
          SELECT COUNT(*)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'pending'
        ) as pending_conversions_count,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'pending'
        ) as pending_cashback,

        (
          SELECT COUNT(*)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'approved' AND (payment_status IS NULL OR payment_status = 'unpaid')
        ) as approved_conversions_count,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'approved' AND (payment_status IS NULL OR payment_status = 'unpaid')
        ) as approved_cashback,

        (
          SELECT COUNT(*)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'rejected'
        ) as rejected_conversions_count,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE user_id = u.id AND status = 'rejected'
        ) as rejected_cashback,

        (
          SELECT COUNT(*)
          FROM system_conversions
          WHERE user_id = u.id AND payment_status = 'paid'
        ) as paid_conversions_count,

        -- Payment request stats
        (
          SELECT COUNT(*)
          FROM payment_requests
          WHERE user_id = u.id
        ) as total_payment_requests,
        (
          SELECT COUNT(*)
          FROM payment_requests
          WHERE user_id = u.id AND status = 'paid'
        ) as paid_payment_requests

      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE u.id = $1
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user'
      });
    }

    logger.info('Get user cashback stats success', {
      userId
    });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Get user cashback stats failed', {
      error: error.message,
      userId: req.params.userId
    });

    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê cashback của user',
      error: error.message
    });
  }
});

module.exports = router;
