/**
 * Rate Limiter Middleware
 * Prevents abuse by limiting request frequency per IP
 */

const rateStore = new Map();

/**
 * Clean up expired entries every 10 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateStore.entries()) {
    if (now > data.resetTime) {
      rateStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Create rate limiter middleware
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {string} options.message - Error message when limit exceeded
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 60 * 1000, // 1 hour default
    maxRequests = 3,
    message = 'Too many requests. Please try again later.'
  } = options;

  return (req, res, next) => {
    // Get client identifier (IP address)
    const identifier = req.ip || req.connection.remoteAddress;
    const key = `${req.path}:${identifier}`;
    const now = Date.now();

    // Get or create rate limit data
    let limitData = rateStore.get(key);

    if (!limitData || now > limitData.resetTime) {
      // First request or window expired, reset counter
      limitData = {
        count: 1,
        resetTime: now + windowMs,
        firstRequestTime: now
      };
      rateStore.set(key, limitData);
      return next();
    }

    // Increment counter
    limitData.count++;

    if (limitData.count > maxRequests) {
      // Rate limit exceeded
      const resetIn = Math.ceil((limitData.resetTime - now) / 1000 / 60); // minutes

      return res.status(429).json({
        success: false,
        message: message,
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: resetIn,
        details: `You can try again in ${resetIn} minute(s).`
      });
    }

    // Request allowed
    next();
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
const rateLimiters = {
  // Strict rate limit for password reset (3 requests per hour)
  forgotPassword: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    message: 'Too many password reset requests. Please try again later.'
  }),

  // Moderate rate limit for login attempts (10 per 15 minutes)
  login: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: 'Too many login attempts. Please try again later.'
  }),

  // Lenient rate limit for registration (5 per hour)
  register: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    message: 'Too many registration attempts. Please try again later.'
  }),

  // API rate limit (100 requests per 15 minutes)
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'API rate limit exceeded. Please slow down your requests.'
  })
};

module.exports = {
  createRateLimiter,
  rateLimiters
};
