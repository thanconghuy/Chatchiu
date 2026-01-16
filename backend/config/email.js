/**
 * Email Configuration
 *
 * Constants cho email module:
 * - Subjects
 * - Template paths
 * - URLs
 * - Email types
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3007';

module.exports = {
  // Email sender
  FROM: process.env.SMTP_FROM || 'ChatChiu Cashback <noreply@chatchiu.com>',

  // Frontend URLs
  FRONTEND_URL,
  DASHBOARD_URL: `${FRONTEND_URL}/user/dashboard`,
  PAYMENT_HISTORY_URL: `${FRONTEND_URL}/user/payment-history`,
  CREATE_PAYMENT_URL: `${FRONTEND_URL}/user/payment-request`,
  SUPPORT_URL: `${FRONTEND_URL}/support`,
  SETTINGS_URL: `${FRONTEND_URL}/settings`,
  NOTIFICATION_SETTINGS_URL: `${FRONTEND_URL}/settings/notifications`,
  // Admin URLs
  ADMIN_PANEL_URL: `${FRONTEND_URL}/admin/payment-requests`,
  ADMIN_USER_PROFILE_URL: (userId) => `${FRONTEND_URL}/admin/users/${userId}`,

  // Email Types (for logging và stats)
  EMAIL_TYPES: {
    RECONCILIATION_FINALIZED: 'reconciliation_finalized',
    PAYMENT_REQUEST_CREATED_ADMIN: 'payment_request_created_admin', // NEW: Admin notification
    PAYMENT_CONFIRMED: 'payment_confirmed',
    PAYMENT_REJECTED: 'payment_rejected',
    PAYMENT_CANCELLED: 'payment_cancelled', // NEW: User cancellation
    PAYMENT_PAID: 'payment_paid'
  },

  // Subject Templates
  SUBJECTS: {
    /**
     * Subject cho reconciliation finalized
     * @param {string} periodLabel - e.g., "Tháng 11/2025"
     * @param {string} cashbackAmount - Formatted amount with currency
     */
    RECONCILIATION_FINALIZED: (periodLabel, cashbackAmount) =>
      `[ChatChiu] Bạn đã nhận ${cashbackAmount} từ kỳ đối soát ${periodLabel}`,

    /**
     * Subject cho payment confirmed
     * @param {string} amount - Formatted amount
     */
    PAYMENT_CONFIRMED: (amount) =>
      `[ChatChiu] Yêu cầu rút tiền ${amount} đã được xác nhận`,

    /**
     * Subject cho payment rejected
     * @param {string} amount - Formatted amount
     */
    PAYMENT_REJECTED: (amount) =>
      `[ChatChiu] Yêu cầu rút tiền ${amount} đã bị từ chối`,

    /**
     * Subject cho payment paid
     * @param {string} amount - Formatted amount
     */
    PAYMENT_PAID: (amount) =>
      `[ChatChiu] Đã chuyển tiền ${amount} vào tài khoản của bạn`
  },

  // Template Paths (relative to templates/email/)
  TEMPLATES: {
    RECONCILIATION_FINALIZED: 'reconciliation/finalized',
    PAYMENT_CONFIRMED: 'payment/confirmed',
    PAYMENT_REJECTED: 'payment/rejected',
    PAYMENT_PAID: 'payment/paid'
  },

  // Brand Colors
  COLORS: {
    PRIMARY: '#667eea',
    PRIMARY_DARK: '#764ba2',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    DANGER: '#ef4444',
    INFO: '#3b82f6',
    GRAY: '#6b7280'
  },

  // Email Icons (emoji or unicode)
  ICONS: {
    CHECKMARK: '✅',
    WARNING: '⚠️',
    CELEBRATION: '🎉',
    MONEY: '💰',
    CALENDAR: '📅',
    BANK: '🏦',
    INFO: 'ℹ️'
  },

  // Minimum payment amount
  MIN_PAYMENT_AMOUNT: 100000,

  // Contact Info
  SUPPORT_EMAIL: 'support@chatchiu.com',
  COMPANY_NAME: 'ChatChiu Cashback',
  COMPANY_TAGLINE: 'Tiết kiệm mỗi ngày với hoàn tiền tự động',

  // Legal
  COPYRIGHT_YEAR: new Date().getFullYear(),
  COPYRIGHT_TEXT: `© ${new Date().getFullYear()} ChatChiu Cashback. All rights reserved.`
};
