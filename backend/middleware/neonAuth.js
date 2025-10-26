const jwt = require('jsonwebtoken');
const axios = require('axios');

/**
 * Neon Auth Middleware using JWT Verification
 * Validates Neon Auth access tokens from Stack Auth
 */

// Cache JWKS for performance
let jwksCache = null;
let jwksCacheTime = null;
const JWKS_CACHE_DURATION = 3600000; // 1 hour

/**
 * Get JWKS from Neon Auth (Stack Auth) with caching
 * @returns {Promise} JWKS
 */
async function getJWKS() {
  const now = Date.now();

  // Return cached JWKS if still valid
  if (jwksCache && jwksCacheTime && (now - jwksCacheTime) < JWKS_CACHE_DURATION) {
    return jwksCache;
  }

  const projectId = process.env.NEON_AUTH_PROJECT_ID || process.env.STACK_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEON_AUTH_PROJECT_ID or STACK_PROJECT_ID not configured in environment');
  }

  try {
    const response = await axios.get(
      `https://api.stack-auth.com/api/v1/projects/${projectId}/.well-known/jwks.json`
    );

    jwksCache = response.data;
    jwksCacheTime = now;
    return jwksCache;
  } catch (error) {
    console.error('Failed to fetch JWKS:', error.message);
    throw new Error('Failed to fetch JWKS');
  }
}

/**
 * Convert JWK to PEM format for jsonwebtoken
 * Simple implementation for RSA keys
 */
function jwkToPem(jwk) {
  // For simplicity, use the public key directly
  // In production, consider using a library like jwk-to-pem
  return jwk;
}

/**
 * Middleware to verify Neon Auth JWT token
 * Validates token and adds user info to req.neonUser
 */
async function verifyNeonAuthToken(req, res, next) {
  try {
    // Get access token from header
    const accessToken = req.headers['x-stack-access-token'] ||
                       req.headers['authorization']?.replace('Bearer ', '');

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'No access token provided'
      });
    }

    // Decode token without verification first to get kid
    const decoded = jwt.decode(accessToken, { complete: true });

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }

    // Get JWKS
    const jwks = await getJWKS();
    const key = jwks.keys.find(k => k.kid === decoded.header.kid);

    if (!key) {
      return res.status(401).json({
        success: false,
        message: 'Token signing key not found'
      });
    }

    // For now, we'll use the API verification method instead
    // This is more reliable than manual JWKS verification
    return verifyNeonAuthAPI(req, res, next);

  } catch (error) {
    console.error('Neon Auth verification error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Alternative: Verify using REST API (slower but gets fresh user data)
 * Use this if you need up-to-date user information
 */
async function verifyNeonAuthAPI(req, res, next) {
  try {
    const accessToken = req.headers['x-stack-access-token'] ||
                       req.headers['authorization']?.replace('Bearer ', '');

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'No access token provided'
      });
    }

    const projectId = process.env.NEON_AUTH_PROJECT_ID || process.env.STACK_PROJECT_ID;
    const secretKey = process.env.NEON_AUTH_SECRET_KEY || process.env.STACK_SECRET_SERVER_KEY;

    if (!projectId || !secretKey) {
      throw new Error('Neon Auth project ID or secret key not configured');
    }

    // Make request to Neon Auth API
    const response = await axios.get('https://api.stack-auth.com/api/v1/users/me', {
      headers: {
        'x-stack-access-type': 'server',
        'x-stack-project-id': projectId,
        'x-stack-secret-server-key': secretKey,
        'x-stack-access-token': accessToken,
      }
    });

    if (response.status !== 200) {
      console.error('Neon Auth API error:', response.status, response.data);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const userData = response.data;

    // Add user info to request
    req.neonUser = {
      id: userData.id,
      email: userData.primary_email,
      displayName: userData.display_name,
      profileImageUrl: userData.profile_image_url,
      ...userData
    };

    // For backward compatibility
    req.userId = userData.id;

    next();
  } catch (error) {
    console.error('Neon Auth API verification error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication verification failed'
    });
  }
}

/**
 * Optional middleware: Verify token but don't fail if missing
 * Useful for routes that work for both authenticated and non-authenticated users
 */
async function optionalNeonAuth(req, res, next) {
  try {
    const accessToken = req.headers['x-stack-access-token'] ||
                       req.headers['authorization']?.replace('Bearer ', '');

    if (!accessToken) {
      // No token provided, continue without auth
      req.neonUser = null;
      req.userId = null;
      return next();
    }

    // Try to verify using API
    const projectId = process.env.NEON_AUTH_PROJECT_ID || process.env.STACK_PROJECT_ID;
    const secretKey = process.env.NEON_AUTH_SECRET_KEY || process.env.STACK_SECRET_SERVER_KEY;

    if (!projectId || !secretKey) {
      req.neonUser = null;
      req.userId = null;
      return next();
    }

    const response = await axios.get('https://api.stack-auth.com/api/v1/users/me', {
      headers: {
        'x-stack-access-type': 'server',
        'x-stack-project-id': projectId,
        'x-stack-secret-server-key': secretKey,
        'x-stack-access-token': accessToken,
      }
    });

    if (response.status === 200) {
      const userData = response.data;
      req.neonUser = {
        id: userData.id,
        email: userData.primary_email,
        displayName: userData.display_name,
        profileImageUrl: userData.profile_image_url,
        ...userData
      };
      req.userId = userData.id;
    } else {
      req.neonUser = null;
      req.userId = null;
    }

    next();
  } catch (error) {
    // Token invalid, continue without auth
    console.warn('Optional auth token invalid:', error.message);
    req.neonUser = null;
    req.userId = null;
    next();
  }
}

module.exports = {
  verifyNeonAuthToken,
  verifyNeonAuthAPI,
  optionalNeonAuth
};
