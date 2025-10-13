/**
 * Authentication Helper Functions
 */

/**
 * Save authentication data
 * @param {string} token
 * @param {Object} user
 */
function saveAuth(token, user) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
}

/**
 * Get stored token
 * @returns {string|null}
 */
function getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
}

/**
 * Get stored user
 * @returns {Object|null}
 */
function getUser() {
    const userStr = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * Check if user is logged in
 * @returns {boolean}
 */
function isLoggedIn() {
    return !!getToken();
}

/**
 * Logout user
 */
function logout() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
    window.location.href = 'login.html';
}

/**
 * Require authentication
 * Redirect to login if not logged in
 */
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Register new user
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
async function register(userData) {
    try {
        const response = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        if (response.success) {
            saveAuth(response.token, response.user);
        }

        return response;
    } catch (error) {
        throw error;
    }
}

/**
 * Login user
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>}
 */
async function login(email, password) {
    try {
        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.success) {
            saveAuth(response.token, response.user);
        }

        return response;
    } catch (error) {
        throw error;
    }
}

/**
 * Get current user info from API
 * @returns {Promise<Object>}
 */
async function getCurrentUser() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success) {
            // Update stored user data
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(response.user));
        }
        return response.user;
    } catch (error) {
        // If token is invalid, logout
        if (error.message.includes('token') || error.message.includes('Unauthorized')) {
            logout();
        }
        throw error;
    }
}
