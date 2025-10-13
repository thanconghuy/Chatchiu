/**
 * Admin Users Management
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    await init();
})();

// State
let currentPage = 0;
let currentSearch = '';
const ITEMS_PER_PAGE = 50;

// DOM Elements
const userName = document.getElementById('userName');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const usersTable = document.getElementById('usersTable');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const logoutBtn = document.getElementById('logoutBtn');

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success && response.user) {
            saveAuth(getToken(), response.user);
            if (!response.user.is_admin) {
                showToast('Access denied: Admin only', 'error');
                setTimeout(() => {
                    window.location.href = '../dashboard.html';
                }, 2000);
                return false;
            }
            return true;
        } else {
            throw new Error('Failed to verify admin status');
        }
    } catch (error) {
        console.error('Admin check error:', error);
        showToast('Access denied: Admin only', 'error');
        setTimeout(() => {
            window.location.href = '../dashboard.html';
        }, 2000);
        return false;
    }
}

/**
 * Initialize
 */
async function init() {
    const user = getUser();
    if (user && user.username) {
        userName.textContent = user.username;
    }

    await loadUsers();
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    searchBtn.addEventListener('click', () => {
        currentSearch = searchInput.value.trim();
        currentPage = 0;
        loadUsers();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentSearch = searchInput.value.trim();
            currentPage = 0;
            loadUsers();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            loadUsers();
        }
    });

    nextBtn.addEventListener('click', () => {
        currentPage++;
        loadUsers();
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

/**
 * Load users
 */
async function loadUsers() {
    try {
        usersTable.innerHTML = '<tr class="loading-state"><td colspan="9"><div class="loading">Loading...</div></td></tr>';

        const offset = currentPage * ITEMS_PER_PAGE;
        let url = `/admin/users?limit=${ITEMS_PER_PAGE}&offset=${offset}`;

        if (currentSearch) {
            url += `&search=${encodeURIComponent(currentSearch)}`;
        }

        const response = await apiRequest(url);

        if (response.success) {
            renderUsers(response.users);
            updatePagination(response.users.length);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        usersTable.innerHTML = `
            <tr class="error-state">
                <td colspan="9">
                    <div class="error">Failed to load users</div>
                </td>
            </tr>
        `;
    }
}

/**
 * Render users table
 */
function renderUsers(users) {
    if (users.length === 0) {
        usersTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="9">
                    <p>No users found</p>
                </td>
            </tr>
        `;
        return;
    }

    usersTable.innerHTML = users.map(user => {
        return `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>${user.fullName}</td>
                <td>${user.phone || '-'}</td>
                <td>${formatCurrency(user.availableBalance)}</td>
                <td>${formatCurrency(user.pendingBalance)}</td>
                <td>${user.totalClicks}</td>
                <td>${user.totalConversions}</td>
                <td>${formatDate(user.createdAt)}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Update pagination
 */
function updatePagination(itemCount) {
    pageInfo.textContent = `Page ${currentPage + 1}`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = itemCount < ITEMS_PER_PAGE;
}
