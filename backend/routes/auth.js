const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const passport = require('../config/passport'); // Google OAuth enabled
const nodemailer = require('nodemailer');
const { rateLimiters } = require('../middleware/rateLimiter');

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
 * Rate limited: 3 requests per hour per IP
 */
router.post('/forgot-password', rateLimiters.forgotPassword, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Generate reset token first
    const resetToken = await User.createResetToken(email);
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3007'}/reset-password?token=${resetToken}`;

    // Check if SMTP is configured
    const smtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS;

    if (!smtpConfigured) {
      // Development mode: Log reset link to console instead of sending email
      console.log('\n' + '='.repeat(80));
      console.log('📧 PASSWORD RESET REQUEST (Development Mode - No SMTP Configured)');
      console.log('='.repeat(80));
      console.log(`Email: ${email}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log(`Token: ${resetToken}`);
      console.log(`Expires: 1 hour from now`);
      console.log('='.repeat(80) + '\n');
      console.log('💡 To enable email sending, configure SMTP in .env file');
      console.log('📖 See docs/SMTP-SETUP.md for instructions\n');

      return res.json({
        success: true,
        message: 'Password reset link generated (Development Mode)',
        devInfo: process.env.NODE_ENV === 'development' ? {
          resetUrl: resetUrl,
          note: 'SMTP not configured. Check server console for reset link.'
        } : undefined
      });
    }

    // Production mode: Send email via SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // Connection timeout
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    // Verify SMTP connection
    try {
      await transporter.verify();
    } catch (smtpError) {
      console.error('❌ SMTP connection failed:', smtpError.message);
      return res.status(503).json({
        success: false,
        message: 'Email service is temporarily unavailable. Please try again later.'
      });
    }

    // Send email with better error handling
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@cashback.com',
        to: email,
        subject: 'Reset Password - ChatChiu Cashback',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔐 Đặt lại mật khẩu</h1>
              </div>
              <div class="content">
                <p>Xin chào,</p>
                <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản ChatChiu Cashback của mình.</p>
                <p>Nhấp vào nút bên dưới để tạo mật khẩu mới:</p>
                <p style="text-align: center;">
                  <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
                </p>
                <p>Hoặc copy link này vào trình duyệt:</p>
                <p style="background: white; padding: 10px; border-radius: 5px; word-break: break-all;">
                  ${resetUrl}
                </p>
                <p><strong>⏰ Link này sẽ hết hạn sau 1 giờ.</strong></p>
                <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Mật khẩu của bạn vẫn an toàn.</p>
              </div>
              <div class="footer">
                <p>© 2025 ChatChiu Cashback. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError.message);
      // Token already created, but email failed - clean up token
      // Note: Consider adding a cleanup method if needed
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again.'
      });
    }

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
