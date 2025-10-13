/**
 * Frontend Configuration
 */

const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    STORAGE_KEYS: {
        TOKEN: 'cashback_token',
        USER: 'cashback_user'
    }
};

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
 * Format date
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
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
