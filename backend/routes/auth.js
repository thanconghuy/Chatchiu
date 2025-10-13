const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, username } = req.body;

    // Validate required fields
    if (!email || !password || !fullName || !username) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, full name and username are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Validate username format (alphanumeric and underscore only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username can only contain letters, numbers and underscores'
      });
    }

    // Create user
    const user = await User.create(email, password, fullName, phone, username);

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        availableBalance: user.available_balance,
        pendingBalance: user.pending_balance,
        totalCashback: user.total_cashback,
        is_admin: user.is_admin || false
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.message === 'Email already exists' || error.message === 'Username already taken') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/login
 * Login user (accepts email or username)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username and password are required'
      });
    }

    // Find user by email or username with password
    const user = await User.findByEmailOrUsername(email, true);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
      });
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
      });
    }

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        availableBalance: user.available_balance,
        pendingBalance: user.pending_balance,
        totalCashback: user.total_cashback,
        is_admin: user.is_admin || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (protected route)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get fresh user data with stats
    const user = await User.findById(req.userId);
    const stats = await User.getStats(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
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
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info'
    });
  }
});

module.exports = router;
