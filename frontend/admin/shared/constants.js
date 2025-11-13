/**
 * Shared Constants for Admin Modules
 *
 * Usage: Include this file before module-specific JS
 * <script src="shared/constants.js"></script>
 *
 * NOTE: All navigation URLs use clean paths without .html extension
 * Backend automatically serves correct HTML files and redirects .html URLs
 */

// API Endpoints
const API_ENDPOINTS = {
    // Auth
    AUTH_ME: '/auth/me',
    LOGOUT: '/auth/logout',

    // Admin
    ADMIN_STATS: '/admin/stats',
    ADMIN_USERS: '/admin/users',
    ADMIN_USER: (id) => `/admin/user/${id}`,
    ADMIN_CONVERSIONS: '/admin/conversions',
    ADMIN_CONVERSION: (id) => `/admin/conversion/${id}`,
    ADMIN_CONVERSION_STATUS: (id) => `/admin/conversion/${id}/status`,
    ADMIN_AT_ORDERS: '/admin/at-orders',
    ADMIN_MERCHANTS: '/admin/merchants',
    ADMIN_MERCHANTS_FROM_CONVERSIONS: '/admin/conversions/merchants',
    ADMIN_TOOLS_CHECK_PENDING: '/admin/tools/check-pending-orders',

    // Reconciliation
    RECONCILIATION_LIST: '/admin/reconciliation',
    RECONCILIATION_CREATE: '/admin/reconciliation/create',
    RECONCILIATION_DETAIL: (id) => `/admin/reconciliation/${id}`,
};

// Status Constants
const ORDER_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

const ORDER_STATUS_TEXT = {
    pending: 'Đang xử lý',
    approved: 'Đã duyệt',
    rejected: 'Đã hủy'
};

const ORDER_STATUS_CLASS = {
    pending: 'status-pending',
    approved: 'status-approved',
    rejected: 'status-rejected'
};

// Pagination
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Date Formats
const DATE_FORMAT = {
    DISPLAY: 'DD/MM/YYYY',
    DISPLAY_TIME: 'DD/MM/YYYY HH:mm',
    API: 'YYYY-MM-DD',
    PICKER: 'yyyy-MM-dd'
};

// Default date ranges
const DEFAULT_DATE_RANGE_DAYS = 30;

// Toast durations (ms)
const TOAST_DURATION = {
    SUCCESS: 3000,
    ERROR: 5000,
    INFO: 3000
};

// Export for use in modules
if (typeof window !== 'undefined') {
    window.ADMIN_CONSTANTS = {
        API_ENDPOINTS,
        ORDER_STATUS,
        ORDER_STATUS_TEXT,
        ORDER_STATUS_CLASS,
        DEFAULT_PAGE_SIZE,
        PAGE_SIZE_OPTIONS,
        DATE_FORMAT,
        DEFAULT_DATE_RANGE_DAYS,
        TOAST_DURATION
    };
}
