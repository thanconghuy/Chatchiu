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
    // FIXED 2026-02-02: Sửa logic tính toán theo METRICS_DEFINITIONS.md
    const query = `
      SELECT
        u.id as user_id,
        u.email,
        u.username,
        u.full_name,

        -- FIXED: Tổng cashback = TẤT CẢ đơn hàng (pending + approved + rejected)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
        ), 0) as total_cashback,

        -- Cashback chờ duyệt (pending conversions)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'pending'
        ), 0) as pending_cashback,

        -- FIXED 2026-02-02: Đã duyệt = TẤT CẢ approved (để Tổng = Chờ Duyệt + Đã Duyệt + Đã Hủy)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
        ), 0) as approved_cashback,

        -- Cashback đã hủy (rejected conversions)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'rejected'
        ), 0) as rejected_cashback,

        -- Cashback đã thanh toán (từ payment_requests paid)
        COALESCE(usb.total_withdrawn, 0) as paid_cashback,

        -- Số dư khả dụng = total_earned - total_withdrawn - pending_reserved (GENERATED COLUMN)
        -- FIXED 2026-03-14: Dùng công thức đúng thay vì reconciled_unpaid - total_withdrawn
        -- Bug cũ: reconciled_unpaid tính từ payment_status IS NULL (loại bỏ conversions đã mark paid)
        -- nhưng total_withdrawn là số tiền thực tế rút từ payment_requests (2 nguồn khác nhau)
        -- Kết quả: double deduction → available = 0 dù user vẫn còn số dư
        GREATEST(0,
          COALESCE(usb.total_earned, 0) - COALESCE(usb.total_withdrawn, 0) - COALESCE(usb.pending_reserved, 0)
        ) as available_balance,

        -- Số dư đang chờ xử lý payment request
        COALESCE(usb.pending_reserved, 0) as pending_reserved,

        -- Cashback đã đối soát (reconciled) - có thể rút
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as reconciled_cashback

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
    // FIXED 2026-02-02: Tính total_cashback từ ALL approved conversions
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT u.id) as total_users,
        -- FIXED 2026-02-02: Tổng cashback = TẤT CẢ đơn hàng (pending + approved + rejected)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
        ), 0) as total_cashback_all,
        COALESCE(SUM(usb.total_withdrawn), 0) as total_paid_all,
        -- FIXED 2026-03-14: Tổng available = SUM(total_earned - total_withdrawn - pending_reserved)
        COALESCE(SUM(GREATEST(0,
          COALESCE(usb.total_earned, 0) - COALESCE(usb.total_withdrawn, 0) - COALESCE(usb.pending_reserved, 0)
        )), 0) as total_available_all,
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

    // FIXED 2026-02-02: Cập nhật theo METRICS_DEFINITIONS.md
    const query = `
      SELECT
        u.id as user_id,
        u.email,
        u.username,
        u.full_name,
        u.phone,

        -- FIXED 2026-02-02: Tổng cashback = TẤT CẢ đơn hàng (pending + approved + rejected)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
        ), 0) as total_cashback,
        COALESCE(usb.total_withdrawn, 0) as paid_cashback,
        COALESCE(usb.pending_reserved, 0) as pending_reserved,

        -- Số dư khả dụng từ GENERATED COLUMN
        GREATEST(0, COALESCE(usb.available_balance, 0)) as available_balance,

        -- Cashback đã đối soát (có thể rút)
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as reconciled_cashback,

        -- Conversion stats: Chờ duyệt
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

        -- FIXED 2026-02-02: Đã duyệt = TẤT CẢ approved
        (
          SELECT COUNT(*)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
        ) as approved_conversions_count,
        (
          SELECT COALESCE(SUM(cashback_amount), 0)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
        ) as approved_cashback,

        -- Đã hủy
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

        -- Đã thanh toán (conversion level)
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
