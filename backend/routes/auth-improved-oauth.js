const express = require('express');
const router = express.Router();
const passport = require('../config/passport-improved');
const { generateToken } = require('../middleware/auth');
const PendingOAuthLink = require('../models/PendingOAuthLink');
const User = require('../models/User');
const logger = require('../utils/logger');

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
 * Google OAuth callback handler with improved account linking
 */
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', {
      session: false,
      failureRedirect: '/login?error=google_auth_failed'
    }, async (err, user, info) => {
      try {
        // Check for account linking requirement
        if (err && err.message === 'ACCOUNT_LINKING_REQUIRED') {
          logger.info('Redirecting to account linking confirmation', {
            email: err.email
          });

          // Redirect to confirmation page
          return res.redirect(
            `/login/link-account?token=${err.token}&email=${encodeURIComponent(err.email)}&provider=google`
          );
        }

        // Check for other errors
        if (err) {
          logger.error('OAuth callback error', { error: err.message });
          return res.redirect('/login?error=oauth_error');
        }

        if (!user) {
          logger.warn('OAuth callback: no user returned');
          return res.redirect('/login?error=auth_failed');
        }

        // Success - Generate JWT token
        const token = generateToken(user);

        logger.success('OAuth login successful', {
          userId: user.id,
          email: user.email
        });

        // Use POST method to send token (more secure than URL param)
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Đăng nhập thành công</title>
            <style>
              body { font-family: Arial; text-align: center; padding: 50px; }
              .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
                         border-radius: 50%; width: 40px; height: 40px;
                         animation: spin 1s linear infinite; margin: 20px auto; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <h2>✅ Đăng nhập Google thành công!</h2>
            <div class="spinner"></div>
            <p>Đang chuyển hướng...</p>
            <form id="loginForm" method="POST" action="/login/callback">
              <input type="hidden" name="token" value="${token}">
              <input type="hidden" name="provider" value="google">
            </form>
            <script>
              setTimeout(() => {
                document.getElementById('loginForm').submit();
              }, 1000);
            </script>
          </body>
          </html>
        `);

      } catch (error) {
        logger.error('OAuth callback handler error', { error: error.message });
        res.redirect('/login?error=callback_error');
      }
    })(req, res, next);
  }
);

/**
 * POST /api/auth/oauth/confirm-link
 * Confirm OAuth account linking
 */
router.post('/oauth/confirm-link', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Missing confirmation token'
      });
    }

    // Find pending link
    const pendingLink = await PendingOAuthLink.findByToken(token);

    if (!pendingLink) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired confirmation link'
      });
    }

    // Get user
    const user = await User.findById(pendingLink.user_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user has password, verify it
    if (user.password_hash && password) {
      const isValid = await User.verifyPassword(user.id, password);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password'
        });
      }
    }

    // Link OAuth account
    const profileData = JSON.parse(pendingLink.profile_data);

    if (pendingLink.provider === 'google') {
      await User.updateGoogleId(
        user.id,
        pendingLink.provider_id,
        profileData.profilePicture
      );
    }

    // Delete pending link
    await PendingOAuthLink.delete(token);

    // Generate token
    const jwtToken = generateToken(user);

    logger.success('OAuth account linked successfully', {
      userId: user.id,
      provider: pendingLink.provider
    });

    res.json({
      success: true,
      message: 'Account linked successfully',
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name
      }
    });

  } catch (error) {
    logger.error('Confirm OAuth link error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to link account'
    });
  }
});

/**
 * POST /api/auth/oauth/cancel-link
 * Cancel pending OAuth link
 */
router.post('/oauth/cancel-link', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Missing token'
      });
    }

    await PendingOAuthLink.delete(token);

    res.json({
      success: true,
      message: 'Link request cancelled'
    });

  } catch (error) {
    logger.error('Cancel OAuth link error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel link'
    });
  }
});

module.exports = router;
