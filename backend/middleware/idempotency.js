/**
 * Idempotency Middleware
 *
 * Validates idempotency keys in requests to prevent duplicate operations
 * Used for payment request creation to ensure no double charges
 *
 * Based on best practices from Stripe, PayPal, Adyen
 * Ref: https://stripe.com/docs/api/idempotent_requests
 */

const logger = require('../utils/logger');

/**
 * Validate UUID v4 format
 * @param {string} uuid
 * @returns {boolean}
 */
function isValidUUIDv4(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Middleware to validate idempotency key in request headers
 *
 * Usage:
 *   router.post('/payment-requests',
 *     authenticateToken,
 *     validateIdempotencyKey,
 *     async (req, res) => { ... }
 *   )
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function validateIdempotencyKey(req, res, next) {
  // Get idempotency key from header
  const key = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];

  // Check if key exists
  if (!key) {
    logger.warn('Missing idempotency key', {
      path: req.path,
      method: req.method,
      userId: req.userId
    });

    return res.status(400).json({
      success: false,
      message: 'Idempotency-Key header is required',
      code: 'MISSING_IDEMPOTENCY_KEY',
      error: {
        header: 'Idempotency-Key',
        expected: 'UUID v4 (e.g., 550e8400-e29b-41d4-a716-446655440000)',
        received: null
      }
    });
  }

  // Validate format (must be UUID v4)
  if (!isValidUUIDv4(key)) {
    logger.warn('Invalid idempotency key format', {
      path: req.path,
      method: req.method,
      userId: req.userId,
      idempotencyKey: key
    });

    return res.status(400).json({
      success: false,
      message: 'Idempotency-Key must be a valid UUID v4',
      code: 'INVALID_IDEMPOTENCY_KEY',
      error: {
        header: 'Idempotency-Key',
        expected: 'UUID v4 (e.g., 550e8400-e29b-41d4-a716-446655440000)',
        received: key,
        hint: 'Use crypto.randomUUID() in Node.js or uuid.v4() in browser'
      }
    });
  }

  // Attach to request object for use in route handler
  req.idempotencyKey = key;

  logger.info('Idempotency key validated', {
    path: req.path,
    userId: req.userId,
    idempotencyKey: key
  });

  next();
}

/**
 * Optional: Middleware to check if idempotency key was already used
 * (Can be implemented later if needed)
 *
 * This would query the database to see if the key exists
 * and return cached response if found
 */
async function checkIdempotencyCache(req, res, next) {
  // TODO: Implement caching layer
  // For now, we'll handle this in the service layer
  next();
}

module.exports = {
  validateIdempotencyKey,
  checkIdempotencyCache,
  isValidUUIDv4
};
