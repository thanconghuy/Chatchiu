/**
 * Admin Conversions Management
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
let currentStatus = '';
const ITEMS_PER_PAGE = 50;

// DOM Elements
const userName = document.getElementById('userName');
const statusFilter = document.getElementById('statusFilter');
const conversionsTable = document.getElementById('conversionsTable');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const logoutBtn = document.getElementById('logoutBtn');
const syncBtn = document.getElementById('syncBtn');

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

    await loadConversions();
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    statusFilter.addEventListener('change', () => {
        currentStatus = statusFilter.value;
        currentPage = 0;
        loadConversions();
    });

    prevBtn.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            loadConversions();
        }
    });

    nextBtn.addEventListener('click', () => {
        currentPage++;
        loadConversions();
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    syncBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Trigger manual conversion sync from AccessTrade?')) {
            await triggerSync();
        }
    });
}

/**
 * Load conversions
 */
async function loadConversions() {
    try {
        conversionsTable.innerHTML = '<tr class="loading-state"><td colspan="9"><div class="loading">Loading...</div></td></tr>';

        const offset = currentPage * ITEMS_PER_PAGE;
        let url = `/admin/conversions?limit=${ITEMS_PER_PAGE}&offset=${offset}`;

        if (currentStatus) {
            url += `&status=${currentStatus}`;
        }

        const response = await apiRequest(url);

        if (response.success) {
            renderConversions(response.conversions);
            updatePagination(response.conversions.length);
        }
    } catch (error) {
        console.error('Error loading conversions:', error);
        conversionsTable.innerHTML = `
            <tr class="error-state">
                <td colspan="9">
                    <div class="error">Failed to load conversions</div>
                </td>
            </tr>
        `;
    }
}

/**
 * Render conversions table
 */
function renderConversions(conversions) {
    if (conversions.length === 0) {
        conversionsTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="9">
                    <p>No conversions found</p>
                </td>
            </tr>
        `;
        return;
    }

    conversionsTable.innerHTML = conversions.map(conv => {
        const statusClass = conv.status === 'approved' ? 'status-approved' :
                           conv.status === 'pending' ? 'status-pending' :
                           'status-rejected';
        const statusText = conv.status === 'approved' ? 'Approved' :
                          conv.status === 'pending' ? 'Pending' : 'Rejected';

        let actions = '-';
        if (conv.status === 'pending') {
            actions = `
                <button class="action-btn btn-approve" onclick="approveConversion('${conv.id}')">
                    ✓ Approve
                </button>
                <button class="action-btn btn-reject" onclick="rejectConversion('${conv.id}')">
                    ✗ Reject
                </button>
            `;
        }

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${conv.username}</div>
                    <div style="font-size: 0.85rem; color: #666;">${conv.email}</div>
                </td>
                <td>
                    <div class="merchant-cell">
                        ${conv.merchantLogo ? `<img src="${conv.merchantLogo}" alt="${conv.merchantName}" class="merchant-mini-logo">` : ''}
                        <span>${conv.merchantName}</span>
                    </div>
                </td>
                <td>${conv.orderCode || '-'}</td>
                <td>${formatCurrency(conv.orderAmount)}</td>
                <td>${formatCurrency(conv.commission)}</td>
                <td class="highlight">${formatCurrency(conv.cashbackAmount)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(conv.orderTime)}</td>
                <td style="white-space: nowrap;">${actions}</td>
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

/**
 * Approve conversion
 */
async function approveConversion(conversionId) {
    if (!confirm('Approve this conversion?')) return;

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'approved' })
        });

        if (response.success) {
            showToast('Conversion approved successfully', 'success');
            await loadConversions();
        }
    } catch (error) {
        console.error('Error approving conversion:', error);
        showToast(error.message || 'Failed to approve conversion', 'error');
    }
}

/**
 * Reject conversion
 */
async function rejectConversion(conversionId) {
    if (!confirm('Reject this conversion? This action cannot be undone.')) return;

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'rejected' })
        });

        if (response.success) {
            showToast('Conversion rejected', 'success');
            await loadConversions();
        }
    } catch (error) {
        console.error('Error rejecting conversion:', error);
        showToast(error.message || 'Failed to reject conversion', 'error');
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
            setTimeout(loadConversions, 5000);
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

// Make functions globally accessible for onclick handlers
window.approveConversion = approveConversion;
window.rejectConversion = rejectConversion;
