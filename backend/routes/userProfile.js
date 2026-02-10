/**
 * User Profile Routes
 * Handles user profile viewing, updating, and password changes
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcrypt');

/**
 * GET /api/user/profile
 * Get current user's full profile with stats
 */
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { pool } = require('../config/database');

        // Get user data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user stats
        const stats = await User.getStats(userId);

        // Tính toán số dư từ nguồn chính thức duy nhất: user_system_balance + system_conversions
        const balanceQuery = `
            SELECT
                -- Từ user_system_balance (nguồn chính thức)
                COALESCE(usb.total_earned, 0) as total_earned,
                COALESCE(usb.total_withdrawn, 0) as total_withdrawn,
                COALESCE(usb.pending_reserved, 0) as pending_reserved,
                COALESCE(usb.available_balance, 0) as available_balance,
                -- Tính pending cashback: đơn approved chưa đối soát
                COALESCE((
                    SELECT SUM(cashback_amount)
                    FROM system_conversions
                    WHERE user_id = $1
                      AND status = 'pending'
                ), 0) as pending_cashback,
                -- Tổng cashback toàn bộ (approved + pending)
                COALESCE((
                    SELECT SUM(cashback_amount)
                    FROM system_conversions
                    WHERE user_id = $1
                      AND status IN ('approved', 'pending')
                ), 0) as total_cashback
            FROM user_system_balance usb
            WHERE usb.user_id = $1
        `;
        const balanceResult = await pool.query(balanceQuery, [userId]);
        const balance = balanceResult.rows[0] || {
            available_balance: 0,
            pending_cashback: 0,
            total_cashback: 0,
            total_earned: 0,
            total_withdrawn: 0,
            pending_reserved: 0
        };

        const totalAvailableBalance = parseFloat(balance.available_balance);
        const totalPendingBalance = parseFloat(balance.pending_cashback);
        const totalCashback = parseFloat(balance.total_cashback);

        // Build profile response
        const profile = {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            username: user.username,
            phone: user.phone,
            profilePicture: user.profile_picture,
            googleId: user.google_id,
            oauthProvider: user.oauth_provider,
            emailVerified: user.email_verified,
            isAdmin: user.is_admin || false,
            // Số dư từ user_system_balance + system_conversions (nguồn chính thức duy nhất)
            availableBalance: totalAvailableBalance,
            pendingBalance: totalPendingBalance,
            totalCashback: totalCashback,
            // Chi tiết cho debugging
            balanceDetail: {
                total_earned: parseFloat(balance.total_earned),
                total_withdrawn: parseFloat(balance.total_withdrawn),
                pending_reserved: parseFloat(balance.pending_reserved)
            },
            // Include stats
            totalOrders: stats.totalOrders || 0,
            totalCommission: parseFloat(stats.totalCommission) || 0,
            completedOrders: stats.completedOrders || 0,
            pendingOrders: stats.pendingOrders || 0,
            createdAt: user.created_at
        };

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
});

/**
 * PUT /api/user/profile
 * Update user profile (fullName and phone only)
 */
router.put('/profile',
    authenticateToken,
    [
        body('fullName')
            .trim()
            .notEmpty().withMessage('Họ và tên không được để trống')
            .isLength({ min: 2, max: 255 }).withMessage('Họ và tên phải từ 2-255 ký tự'),
        body('phone')
            .optional({ nullable: true, checkFalsy: true })
            .trim()
            .matches(/^[0-9]{10,11}$/).withMessage('Số điện thoại phải có 10-11 chữ số')
    ],
    async (req, res) => {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        try {
            const userId = req.user.id;
            const { fullName, phone } = req.body;

            // Update user profile
            const result = await User.update(userId, {
                full_name: fullName,
                phone: phone || null
            });

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.json({
                success: true,
                message: 'Profile updated successfully',
                profile: {
                    fullName,
                    phone
                }
            });
        } catch (error) {
            console.error('Error updating user profile:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update profile'
            });
        }
    }
);

/**
 * POST /api/user/change-password
 * Change password (only for non-OAuth users)
 */
router.post('/change-password',
    authenticateToken,
    [
        body('currentPassword')
            .notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
        body('newPassword')
            .notEmpty().withMessage('Vui lòng nhập mật khẩu mới')
            .isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
    ],
    async (req, res) => {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        try {
            const userId = req.user.id;
            const { currentPassword, newPassword } = req.body;

            // Get user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if user is OAuth user
            if (user.oauth_provider) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể đổi mật khẩu cho tài khoản OAuth'
                });
            }

            // Check if user has password hash
            if (!user.password_hash) {
                return res.status(400).json({
                    success: false,
                    message: 'Tài khoản không có mật khẩu'
                });
            }

            // Verify current password
            const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Mật khẩu hiện tại không đúng'
                });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Update password
            await User.update(userId, {
                password_hash: hashedPassword
            });

            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Error changing password:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to change password'
            });
        }
    }
);

module.exports = router;
