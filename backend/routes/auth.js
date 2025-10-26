const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const passport = require('../config/passport'); // Google OAuth enabled
const nodemailer = require('nodemailer');

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, username } = req.body;

    console.log('📝 Registration attempt:', { email, username, fullName });

    // Validate required fields
    if (!email || !password || !fullName || !username) {
      console.log('❌ Missing required fields');
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

    console.log('✅ Validation passed, creating user...');

    // Create user
    const user = await User.create(email, password, fullName, phone, username);

    console.log('✅ User created successfully:', user.id);

    // Generate token
    const token = generateToken(user);

    console.log('✅ Token generated, sending response');

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
    console.error('❌ Registration error:', error.message);
    console.error('Full error:', error);

    // Check for database connection timeout
    if (error.message && error.message.includes('Connection terminated')) {
      return res.status(503).json({
        success: false,
        message: 'Database connection timeout. Please try again.'
      });
    }

    if (error.message === 'Email already exists' || error.message === 'Username already taken') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed: ' + (error.message || 'Unknown error')
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

/**
 * GET /api/auth/google
 * Initiate Google OAuth login
 */
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

/**
 * GET /api/auth/google/callback
 * Google OAuth callback handler
 */
router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login?error=google_auth_failed'
  }),
  (req, res) => {
    try {
      // Generate JWT token
      const token = generateToken(req.user);

      // Redirect to frontend with token
      res.redirect(`/login?token=${token}&google_login=success`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect('/login?error=token_generation_failed');
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Generate reset token
    const resetToken = await User.createResetToken(email);

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@cashback.com',
      to: email,
      subject: 'Reset Password - Cashback System',
      html: `
        <h2>Reset Your Password</h2>
        <p>You requested to reset your password. Click the link below to reset:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    res.json({
      success: true,
      message: 'Password reset email sent. Please check your inbox.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);

    if (error.message === 'User not found') {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Reset password
    await User.resetPassword(token, password);

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);

    if (error.message === 'Invalid or expired reset token') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

module.exports = router;
