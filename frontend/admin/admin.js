/**
 * Admin Dashboard Logic
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    init();
})();

// DOM Elements
const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const syncBtn = document.getElementById('syncBtn');

// Stats elements
const totalUsers = document.getElementById('totalUsers');
const totalCommission = document.getElementById('totalCommission');
const totalCashbackPaid = document.getElementById('totalCashbackPaid');
const platformProfit = document.getElementById('platformProfit');
const approvedConversions = document.getElementById('approvedConversions');
const pendingConversions = document.getElementById('pendingConversions');
const rejectedConversions = document.getElementById('rejectedConversions');
const totalOrderValue = document.getElementById('totalOrderValue');
const totalUserBalance = document.getElementById('totalUserBalance');
const totalPendingBalance = document.getElementById('totalPendingBalance');
const totalClicks = document.getElementById('totalClicks');
const totalConversions = document.getElementById('totalConversions');
const conversionRate = document.getElementById('conversionRate');

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        // Get fresh user data from API to ensure is_admin is up to date
        const response = await apiRequest('/auth/me');

        if (response.success && response.user) {
            // Update localStorage with fresh data
            const currentUser = getUser();
            if (currentUser) {
                saveAuth(getToken(), response.user);
            }

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
 * Initialize dashboard
 */
async function init() {
    const user = getUser();
    if (user) {
        userName.textContent = user.fullName || user.username || user.email;
    }

    await loadStats();

    // Auto-refresh every 30 seconds
    setInterval(loadStats, 30000);
}

/**
 * Load admin statistics
 */
async function loadStats() {
    try {
        const response = await apiRequest('/admin/stats');

        if (response.success) {
            const stats = response.stats;

            // Update stats
            totalUsers.textContent = stats.totalUsers.toLocaleString();
            totalCommission.textContent = formatCurrency(stats.totalCommission);
            totalCashbackPaid.textContent = formatCurrency(stats.totalCashbackPaid);
            platformProfit.textContent = formatCurrency(stats.platformProfit);

            approvedConversions.textContent = stats.approvedConversions.toLocaleString();
            pendingConversions.textContent = stats.pendingConversions.toLocaleString();
            rejectedConversions.textContent = stats.rejectedConversions.toLocaleString();
            totalOrderValue.textContent = formatCurrency(stats.totalOrderValue);

            totalUserBalance.textContent = formatCurrency(stats.totalUserBalance);
            totalPendingBalance.textContent = formatCurrency(stats.totalPendingBalance);

            totalClicks.textContent = stats.totalClicks.toLocaleString();
            totalConversions.textContent = stats.totalConversions.toLocaleString();

            // Calculate conversion rate
            const rate = stats.totalClicks > 0
                ? ((stats.totalConversions / stats.totalClicks) * 100).toFixed(1)
                : '0.0';
            conversionRate.textContent = `${rate}%`;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        showToast('Failed to load statistics', 'error');
    }
}

/**
 * Trigger manual sync
 */
async function triggerSync() {
    try {
        syncBtn.style.opacity = '0.6';
        syncBtn.style.pointerEvents = 'none';

        const response = await apiRequest('/admin/sync-conversions', {
            method: 'POST'
        });

        if (response.success) {
            showToast('Sync started in background', 'success');

            // Reload stats after a few seconds
            setTimeout(loadStats, 5000);
        }
    } catch (error) {
        console.error('Error triggering sync:', error);
        showToast('Failed to trigger sync', 'error');
    } finally {
        setTimeout(() => {
            syncBtn.style.opacity = '1';
            syncBtn.style.pointerEvents = 'auto';
        }, 3000);
    }
}

// Event listeners
logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

if (syncBtn) {
    syncBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Trigger manual conversion sync from AccessTrade?')) {
            triggerSync();
        }
    });
}
