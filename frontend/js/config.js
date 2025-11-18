/**
 * Frontend Configuration
 */

const CONFIG = {
    API_BASE_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3007/api'
        : `${window.location.origin}/api`,
    STORAGE_KEYS: {
        TOKEN: 'cashback_token',
        USER: 'cashback_user'
    }
};

/**
 * Neon Auth Configuration
 * Get these values from Neon Console: https://console.neon.tech
 * Go to your project > Auth tab > Enable Neon Auth > Configuration
 */
const NEON_AUTH_CONFIG = {
    projectId: 'f6ef2fe7-eda5-4448-87c3-5a94cc135ffc',
    publishableKey: 'pck_bqd32kv088hbce643cdgy4kg92j3ck6am4sqq732rr5a8',
};

// Make it globally available
window.NEON_AUTH_CONFIG = NEON_AUTH_CONFIG;

/**
 * Format currency in VND
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

/**
 * Format date - Always display in Vietnam timezone
 * @param {string} dateString - ISO date string from backend
 * @returns {string}
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    // Force Vietnam timezone regardless of client/server timezone
    return date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Show toast notification
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast toast-${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * API request helper
 * @param {string} endpoint
 * @param {Object} options
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

/**
 * Validate URL format
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get domain from URL
 * @param {string} url
 * @returns {string|null}
 */
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        return null;
    }
}
