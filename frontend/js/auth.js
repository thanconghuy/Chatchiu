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
    window.location.href = '/login';
}

/**
 * Require authentication
 * Redirect to login if not logged in
 */
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/login';
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

/**
 * Display user name in element
 * Format: "Full Name (username)" or fallback to username/email
 * @param {string} elementId - ID of element to display user name
 */
function displayUserName(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Element with ID '${elementId}' not found`);
        return;
    }

    const user = getUser();
    if (user) {
        // Format: "Full Name (username)"
        if (user.fullName && user.username) {
            element.textContent = `${user.fullName} (${user.username})`;
        }
        // Fallback to fullName only
        else if (user.fullName) {
            element.textContent = user.fullName;
        }
        // Fallback to username only
        else if (user.username) {
            element.textContent = user.username;
        }
        // Last resort: email
        else {
            element.textContent = user.email;
        }
    }
}

/**
 * Request password reset
 * @param {string} email
 * @returns {Promise<Object>}
 */
async function forgotPassword(email) {
    try {
        const response = await apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        return response;
    } catch (error) {
        throw error;
    }
}

/**
 * Reset password with token
 * @param {string} token
 * @param {string} password
 * @returns {Promise<Object>}
 */
async function resetPassword(token, password) {
    try {
        const response = await apiRequest('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });

        return response;
    } catch (error) {
        throw error;
    }
}
