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
let ITEMS_PER_PAGE = 50; // Changed to let for dynamic update

// DOM Elements
const userName = document.getElementById('userName');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const usersTable = document.getElementById('usersTable');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const logoutBtn = document.getElementById('logoutBtn');
const rowsPerPageSelect = document.getElementById('rowsPerPage');

// Modal elements
const userDetailModal = document.getElementById('userDetailModal');
const closeUserDetailModal = document.getElementById('closeUserDetailModal');
const userClicksTable = document.getElementById('userClicksTable');

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
    if (user) {
        displayUserName('userName');
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

    if (rowsPerPageSelect) {
        rowsPerPageSelect.addEventListener('change', () => {
            ITEMS_PER_PAGE = parseInt(rowsPerPageSelect.value);
            currentPage = 0; // Reset to first page
            loadUsers();
        });
    }
}

/**
 * Load users
 */
async function loadUsers() {
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
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
        usersTable.innerHTML = skeletonRows;

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
                    <div style="padding: 60px 20px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 24px; display: block; color: var(--gray-400);">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="8.5" cy="7" r="4"></circle>
                            <path d="M20 8v6M23 11h-6"></path>
                        </svg>
                        <h3 style="font-size: 1.25rem; color: var(--gray-700); margin-bottom: 12px; font-weight: 600;">Không tìm thấy người dùng</h3>
                        <p style="font-size: 1rem; color: var(--gray-500);">Thử tìm kiếm với từ khóa khác</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    usersTable.innerHTML = users.map(user => {
        return `
            <tr onclick="openUserDetail('${user.id}')" style="cursor: pointer;" title="Click để xem chi tiết">
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
    // Show only page number
    pageInfo.textContent = currentPage + 1;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = itemCount < ITEMS_PER_PAGE;
}

/**
 * Open user detail modal
 */
async function openUserDetail(userId) {
    try {
        // Show modal immediately
        userDetailModal.style.display = 'flex';

        // Show loading state
        userClicksTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="6">
                    <div class="spinner"></div>
                    <p>Đang tải dữ liệu...</p>
                </td>
            </tr>
        `;

        // Load user details
        const response = await apiRequest(`/admin/users/${userId}`);

        if (response.success) {
            const { user, stats, clicks } = response;

            // Populate user info
            document.getElementById('detailUsername').textContent = user.username;
            document.getElementById('detailEmail').textContent = user.email;
            document.getElementById('detailFullName').textContent = user.fullName || '-';
            document.getElementById('detailPhone').textContent = user.phone || '-';
            document.getElementById('detailCreatedAt').textContent = formatDate(user.createdAt);

            // Populate stats
            document.getElementById('detailAvailableBalance').textContent = formatCurrency(user.availableBalance);
            document.getElementById('detailPendingBalance').textContent = formatCurrency(user.pendingBalance);
            document.getElementById('detailTotalClicks').textContent = stats.totalClicks;
            document.getElementById('detailTotalConversions').textContent = stats.totalConversions;

            // Render clicks
            renderUserClicks(clicks);
        }
    } catch (error) {
        console.error('Error loading user details:', error);
        showToast(error.message || 'Không thể tải thông tin người dùng', 'error');
        closeUserDetail();
    }
}

/**
 * Close user detail modal
 */
function closeUserDetail() {
    userDetailModal.style.display = 'none';
}

/**
 * Render user clicks in modal
 */
function renderUserClicks(clicks) {
    if (clicks.length === 0) {
        userClicksTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="6">
                    <p>Chưa có lượt click nào</p>
                </td>
            </tr>
        `;
        return;
    }

    userClicksTable.innerHTML = clicks.map(click => {
        // Determine status display based on AccessTrade fields (same logic as dashboard)
        let statusClass, statusText;

        if (!click.hasConversion) {
            // No conversion yet
            statusClass = '';
            statusText = 'Chưa mua';
        } else {
            // Has conversion - check detailed status
            if (click.orderReject === 1) {
                statusClass = 'status-rejected';
                statusText = 'Huỷ';
            } else if (click.conversionStatus === 'approved') {
                // status = 'approved' means approved and has cashback right
                statusClass = 'status-approved';
                statusText = 'Đã duyệt';
            } else {
                // Check if temp approved
                const isTempApproved = click.orderApproved > 0 &&
                                       click.orderPending === 0 &&
                                       click.orderReject === 0;

                if (isTempApproved) {
                    statusClass = 'status-temp-approved';
                    statusText = 'Tạm duyệt (đợi đối soát)';
                } else {
                    statusClass = 'status-pending';
                    statusText = 'Chờ duyệt';
                }
            }
        }

        // Create link button if affiliate URL exists
        const linkButton = click.affiliateUrl
            ? `<a href="${click.affiliateUrl}" target="_blank" class="link-btn" style="padding: 4px 12px; background: var(--primary); color: white; border-radius: 6px; text-decoration: none; font-size: 0.85rem;">🔗 Mở link</a>`
            : '<span class="link-none">-</span>';

        // Show cashback if conversion exists
        let cashbackDisplay = '-';
        if (click.hasConversion) {
            const amount = click.cashback || 0;
            cashbackDisplay = formatCurrency(amount);
        }

        return `
            <tr>
                <td>${click.merchantName}</td>
                <td>${click.clickType === 'button' ? '🎯 Tự do' : '🔗 Link SP'}</td>
                <td>${formatDate(click.clickedAt)}</td>
                <td>
                    ${statusClass ? `<span class="status-badge ${statusClass}">${statusText}</span>` : statusText}
                </td>
                <td>${cashbackDisplay}</td>
                <td>${linkButton}</td>
            </tr>
        `;
    }).join('');
}

// Modal event listeners
closeUserDetailModal.addEventListener('click', closeUserDetail);
userDetailModal.querySelector('.modal-overlay')?.addEventListener('click', closeUserDetail);

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && userDetailModal.style.display === 'flex') {
        closeUserDetail();
    }
});
