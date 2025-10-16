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
    console.log('Setting up event listeners...');

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentStatus = statusFilter.value;
            currentPage = 0;
            loadConversions();
        });
        console.log('✓ Status filter listener attached');
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                loadConversions();
            }
        });
        console.log('✓ Prev button listener attached');
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            loadConversions();
        });
        console.log('✓ Next button listener attached');
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
        console.log('✓ Logout button listener attached');
    }

    if (syncBtn) {
        console.log('✓ Sync button found:', syncBtn);
        syncBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔍 Check button clicked!');
            if (confirm('Kiểm tra và match conversions với clicks trong database?')) {
                await triggerSync();
            }
        });
        console.log('✓ Sync button listener attached');
    } else {
        console.error('❌ Sync button NOT FOUND!');
    }
}

/**
 * Load conversions
 */
async function loadConversions() {
    try {
        // Show skeleton rows
        const skeletonRows = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
        conversionsTable.innerHTML = skeletonRows;

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
                    <div style="padding: 60px 20px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 24px; display: block; color: var(--gray-400);">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <h3 style="font-size: 1.25rem; color: var(--gray-700); margin-bottom: 12px; font-weight: 600;">Không tìm thấy conversions</h3>
                        <p style="font-size: 1rem; color: var(--gray-500);">Chưa có dữ liệu conversion nào</p>
                    </div>
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'approved' })
        });

        if (response.success) {
            showToast('Conversion approved successfully', 'success');
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to approve conversion');
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'rejected' })
        });

        if (response.success) {
            showToast('Conversion rejected', 'success');
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to reject conversion');
        }
    } catch (error) {
        console.error('Error rejecting conversion:', error);
        showToast(error.message || 'Failed to reject conversion', 'error');
    }
}

/**
 * Trigger check conversions (match with clicks)
 */
async function triggerSync() {
    try {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Đang kiểm tra...';

        console.log('Triggering check conversions...');

        const response = await apiRequest('/admin/check-conversions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Check response:', response);

        if (response.success) {
            const { results } = response;
            showToast(`Kiểm tra hoàn tất! Matched: ${results.matched}, Skipped: ${results.skipped}, Errors: ${results.errors}`, 'success');
            // Reload conversions after check
            await loadConversions();
        } else {
            throw new Error(response.message || 'Check failed');
        }
    } catch (error) {
        console.error('Error triggering check:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔍 Kiểm tra chuyển đổi';
    }
}

// Make functions globally accessible for onclick handlers
window.approveConversion = approveConversion;
window.rejectConversion = rejectConversion;
