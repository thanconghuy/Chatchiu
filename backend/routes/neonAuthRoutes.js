const express = require('express');
const router = express.Router();
const { verifyNeonAuthToken } = require('../middleware/neonAuth');
const User = require('../models/User');
const { pool } = require('../config/database');

/**
 * POST /api/neon-auth/sync-user
 * Sync user from Neon Auth to local database
 * This endpoint is called after user logs in via Neon Auth
 */
router.post('/sync-user', verifyNeonAuthToken, async (req, res) => {
  try {
    const neonUser = req.neonUser;

    // Check if user exists in local database
    let user = await User.findByEmail(neonUser.email);

    if (!user) {
      // Create new user in local database
      // Note: Neon Auth handles authentication, we just store minimal data
      const query = `
        INSERT INTO users (
          email,
          full_name,
          username,
          neon_auth_id,
          password_hash
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, full_name, username, available_balance, pending_balance, total_cashback, created_at
      `;

      // Generate username from email if not provided
      const username = neonUser.email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);

      const result = await pool.query(query, [
        neonUser.email,
        neonUser.displayName || neonUser.email.split('@')[0],
        username,
        neonUser.id,
        'neon_auth' // Placeholder since Neon Auth handles authentication
      ]);

      user = result.rows[0];
    } else {
      // Update neon_auth_id if not set
      if (!user.neon_auth_id) {
        await pool.query(
          'UPDATE users SET neon_auth_id = $1 WHERE id = $2',
          [neonUser.id, user.id]
        );
        user.neon_auth_id = neonUser.id;
      }
    }

    // Get user stats
    const stats = await User.getStats(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        neonAuthId: neonUser.id,
        email: user.email,
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        availableBalance: parseFloat(user.available_balance),
        pendingBalance: parseFloat(user.pending_balance),
        totalCashback: parseFloat(user.total_cashback),
        is_admin: user.is_admin || false,
        stats: {
          totalClicks: parseInt(stats.total_clicks),
          totalConversions: parseInt(stats.total_conversions),
          approvedConversions: parseInt(stats.approved_conversions),
          pendingConversions: parseInt(stats.pending_conversions)
        }
      }
    });
  } catch (error) {
    console.error('Sync user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync user'
    });
  }
});

/**
 * GET /api/neon-auth/me
 * Get current user info (protected route)
 */
router.get('/me', verifyNeonAuthToken, async (req, res) => {
  try {
    const neonUser = req.neonUser;

    // Find user in local database by neon_auth_id or email
    const query = `
      SELECT id, email, full_name, username, phone, available_balance, pending_balance, total_cashback, is_admin, created_at
      FROM users
      WHERE neon_auth_id = $1 OR email = $2
    `;
    const result = await pool.query(query, [neonUser.id, neonUser.email]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found in local database. Please sync first.'
      });
    }

    const user = result.rows[0];
    const stats = await User.getStats(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        neonAuthId: neonUser.id,
        email: user.email,
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        availableBalance: parseFloat(user.available_balance),
        pendingBalance: parseFloat(user.pending_balance),
        totalCashback: parseFloat(user.total_cashback),
        is_admin: user.is_admin || false,
        profileImageUrl: neonUser.profileImageUrl,
        stats: {
          totalClicks: parseInt(stats.total_clicks),
          totalConversions: parseInt(stats.total_conversions),
          approvedConversions: parseInt(stats.approved_conversions),
          pendingConversions: parseInt(stats.pending_conversions)
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info'
    });
  }
});

/**
 * POST /api/neon-auth/update-profile
 * Update user profile (phone, etc.)
 */
router.post('/update-profile', verifyNeonAuthToken, async (req, res) => {
  try {
    const neonUser = req.neonUser;
    const { phone, fullName } = req.body;

    // Find user
    const findQuery = `
      SELECT id FROM users WHERE neon_auth_id = $1 OR email = $2
    `;
    const findResult = await pool.query(findQuery, [neonUser.id, neonUser.email]);

    if (findResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userId = findResult.rows[0].id;

    // Update user
    const updateQuery = `
      UPDATE users
      SET phone = $1, full_name = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, email, full_name, username, phone, available_balance, pending_balance, total_cashback
    `;

    const updateResult = await pool.query(updateQuery, [
      phone || null,
      fullName || neonUser.displayName,
      userId
    ]);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

module.exports = router;
