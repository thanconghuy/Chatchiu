/**
 * Neon Auth Helper Functions
 * Wrapper functions to work with Neon Auth (Stack Auth)
 */

/**
 * Check if user is logged in with Neon Auth
 * @returns {boolean}
 */
function isNeonAuthLoggedIn() {
    const token = localStorage.getItem('neon_auth_token');
    const user = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return !!(token && user);
}

/**
 * Get Neon Auth token
 * @returns {string|null}
 */
function getNeonAuthToken() {
    return localStorage.getItem('neon_auth_token');
}

/**
 * Get current user from Neon Auth backend
 * @returns {Promise<Object>}
 */
async function getNeonAuthUser() {
    try {
        const token = getNeonAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${CONFIG.API_BASE_URL}/neon-auth/me`, {
            headers: {
                'x-stack-access-token': token
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        const data = await response.json();

        // Update local storage
        if (data.success && data.user) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(data.user));
        }

        return data.user;
    } catch (error) {
        console.error('Get Neon Auth user error:', error);
        throw error;
    }
}

/**
 * Logout from Neon Auth
 */
async function logoutNeonAuth() {
    try {
        // Clear local storage
        localStorage.removeItem('neon_auth_token');
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);

        // Redirect to login
        window.location.href = '/login-neon';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

/**
 * Update user profile
 * @param {Object} profileData - { phone, fullName }
 * @returns {Promise<Object>}
 */
async function updateNeonAuthProfile(profileData) {
    try {
        const token = getNeonAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${CONFIG.API_BASE_URL}/neon-auth/update-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-stack-access-token': token
            },
            body: JSON.stringify(profileData)
        });

        if (!response.ok) {
            throw new Error('Failed to update profile');
        }

        const data = await response.json();

        // Update local storage
        if (data.success && data.user) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(data.user));
        }

        return data;
    } catch (error) {
        console.error('Update profile error:', error);
        throw error;
    }
}

/**
 * Require Neon Auth authentication
 * Redirect to login if not authenticated
 */
function requireNeonAuth() {
    if (!isNeonAuthLoggedIn()) {
        window.location.href = '/login-neon';
        return false;
    }
    return true;
}

/**
 * Make authenticated API request with Neon Auth token
 * @param {string} endpoint
 * @param {Object} options
 * @returns {Promise<any>}
 */
async function neonAuthApiRequest(endpoint, options = {}) {
    const token = getNeonAuthToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['x-stack-access-token'] = token;
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
        console.error('Neon Auth API Request Error:', error);

        // If unauthorized, logout
        if (error.message.includes('token') || error.message.includes('Unauthorized')) {
            logoutNeonAuth();
        }

        throw error;
    }
}
