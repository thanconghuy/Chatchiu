const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

/**
 * Authenticate JWT Token Middleware
 * Verifies JWT token from Authorization header
 * Attaches user info to req.user
 */
async function authenticateToken(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Generate JWT token
 * @param {Object} user
 * @returns {string} JWT token
 */
function generateToken(user) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Optional auth middleware
 * Attaches user if token is valid, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    // Token invalid but that's OK for optional auth
    next();
  }
}

module.exports = {
  authenticateToken,
  generateToken,
  optionalAuth
};
