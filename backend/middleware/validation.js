const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation Middleware
 * Centralized input validation using express-validator
 * Protects against XSS, SQL injection, and invalid data
 */

/**
 * Handle validation errors
 * Returns 400 with detailed error messages
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }

  next();
}

/**
 * Common validation rules
 */
const validators = {
  // Email validation
  email: body('email')
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),

  // Password validation
  password: body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain number'),

  // Username validation
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscore, and dash')
    .escape(),

  // Full name validation
  fullName: body('full_name')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Name too long')
    .escape(),

  // ID parameter validation (PostgreSQL UUID or integer)
  id: param('id')
    .trim()
    .matches(/^[0-9a-f-]+$/i).withMessage('Invalid ID format'),

  // Numeric ID validation
  numericId: param('id')
    .isInt({ min: 1 }).withMessage('ID must be a positive integer')
    .toInt(),

  // Date validation
  date: body('date')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .toDate(),

  // Amount validation (for cashback, payments)
  amount: body('amount')
    .isFloat({ min: 0 }).withMessage('Amount must be a positive number')
    .toFloat(),

  // Status validation
  status: body('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'paid', 'completed'])
    .withMessage('Invalid status value'),

  // Pagination
  page: query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),

  // Search query
  search: query('search')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Search query too long')
    .escape(),

  // Boolean fields
  boolean: (field) => body(field)
    .optional()
    .isBoolean().withMessage(`${field} must be true or false`)
    .toBoolean()
};

/**
 * Validation chains for common operations
 */
const validations = {
  // Auth validations
  register: [
    validators.email,
    validators.password,
    validators.username,
    validators.fullName,
    handleValidationErrors
  ],

  login: [
    body('email').trim().notEmpty().withMessage('Email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],

  // User validations
  updateProfile: [
    validators.fullName,
    body('phone')
      .optional()
      .trim()
      .matches(/^[0-9+\s()-]+$/).withMessage('Invalid phone number format')
      .isLength({ max: 20 }).withMessage('Phone number too long'),
    handleValidationErrors
  ],

  // Payment request validations
  createPaymentRequest: [
    validators.amount,
    body('payment_method')
      .trim()
      .isIn(['bank_transfer', 'momo', 'vnpay'])
      .withMessage('Invalid payment method'),
    body('bank_account_number')
      .optional()
      .trim()
      .matches(/^[0-9]+$/).withMessage('Bank account must contain only numbers')
      .isLength({ min: 8, max: 20 }).withMessage('Bank account must be 8-20 digits'),
    body('bank_name')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Bank name too long'),
    handleValidationErrors
  ],

  // Pagination
  pagination: [
    validators.page,
    validators.limit,
    handleValidationErrors
  ],

  // ID parameter
  idParam: [
    validators.id,
    handleValidationErrors
  ],

  numericIdParam: [
    validators.numericId,
    handleValidationErrors
  ]
};

/**
 * Sanitize output to prevent XSS
 * Use this before sending user-generated content to frontend
 */
function sanitizeOutput(obj) {
  if (!obj) return obj;

  if (typeof obj === 'string') {
    // Escape HTML entities
    return obj
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeOutput);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      sanitized[key] = sanitizeOutput(obj[key]);
    }
    return sanitized;
  }

  return obj;
}

module.exports = {
  validators,
  validations,
  handleValidationErrors,
  sanitizeOutput
};
