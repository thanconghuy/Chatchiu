/**
 * AccessTrade Orders Lookup - Admin
 * Tra cứu tất cả đơn hàng từ AccessTrade đã import vào database
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    await init();
})();

// State
let currentPage = 1;
let ITEMS_PER_PAGE = 50; // Changed to let for dynamic update
let currentFilters = {};
let totalRecords = 0;
let merchantsList = [];

// DOM Elements
const userName = document.getElementById('userName');
const searchKeyword = document.getElementById('searchKeyword');
const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterUser = document.getElementById('filterUser');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const ordersTableBody = document.getElementById('ordersTableBody');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const logoutBtn = document.getElementById('logoutBtn');
const rowsPerPageSelect = document.getElementById('rowsPerPage');

// Filter Dropdown Elements
const statusFilterBtn = document.getElementById('statusFilterBtn');
const statusFilterText = document.getElementById('statusFilterText');
const statusFilterMenu = document.getElementById('statusFilterMenu');

const confirmedFilterBtn = document.getElementById('confirmedFilterBtn');
const confirmedFilterText = document.getElementById('confirmedFilterText');
const confirmedFilterMenu = document.getElementById('confirmedFilterMenu');

const merchantFilterBtn = document.getElementById('merchantFilterBtn');
const merchantFilterText = document.getElementById('merchantFilterText');
const merchantFilterMenu = document.getElementById('merchantFilterMenu');
const merchantSearchInput = document.getElementById('merchantSearchInput');
const merchantOptions = document.getElementById('merchantOptions');

const utmSourceFilterBtn = document.getElementById('utmSourceFilterBtn');
const utmSourceFilterText = document.getElementById('utmSourceFilterText');
const utmSourceFilterMenu = document.getElementById('utmSourceFilterMenu');

// Stats elements - General
const statTotal = document.getElementById('statTotal');
const statTotalValue = document.getElementById('statTotalValue');
const statTotalCommission = document.getElementById('statTotalCommission');

// Stats elements - Order Status Breakdown
const statApproved = document.getElementById('statApproved');
const statApprovedAmount = document.getElementById('statApprovedAmount');
const statPending = document.getElementById('statPending');
const statPendingAmount = document.getElementById('statPendingAmount');
const statRejected = document.getElementById('statRejected');
const statRejectedAmount = document.getElementById('statRejectedAmount');

// Stats elements - Confirmed Status Breakdown
const statConfirmed = document.getElementById('statConfirmed');
const statConfirmedCommission = document.getElementById('statConfirmedCommission');
const statNotConfirmed = document.getElementById('statNotConfirmed');
const statNotConfirmedCommission = document.getElementById('statNotConfirmedCommission');

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

    // Set default date range (last 30 days)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);

    filterDateFrom.value = formatDateForPicker(lastMonth);
    filterDateTo.value = formatDateForPicker(today);

    await loadMerchants();
    setupEventListeners();
    setupFilterDropdowns();
    await loadOrders();
}

/**
 * Format date for date picker (YYYY-MM-DD)
 */
function formatDateForPicker(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            currentPage = 1;
            loadOrders();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetFilters();
        });
    }

    // Allow Enter key to search
    [searchKeyword, filterUser].forEach(input => {
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    currentPage = 1;
                    loadOrders();
                }
            });
        }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (statusFilterBtn && statusFilterMenu && !statusFilterBtn.contains(e.target)) {
            statusFilterMenu.classList.remove('show');
        }
        if (confirmedFilterBtn && confirmedFilterMenu && !confirmedFilterBtn.contains(e.target)) {
            confirmedFilterMenu.classList.remove('show');
        }
        if (merchantFilterBtn && merchantFilterMenu && !merchantFilterBtn.contains(e.target)) {
            merchantFilterMenu.classList.remove('show');
        }
        if (utmSourceFilterBtn && utmSourceFilterMenu && !utmSourceFilterBtn.contains(e.target)) {
            utmSourceFilterMenu.classList.remove('show');
        }
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadOrders();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            loadOrders();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    if (rowsPerPageSelect) {
        rowsPerPageSelect.addEventListener('change', () => {
            ITEMS_PER_PAGE = parseInt(rowsPerPageSelect.value);
            currentPage = 1; // Reset to first page
            loadOrders();
        });
    }
}

/**
 * Load merchants from conversions
 */
async function loadMerchants() {
    try {
        const response = await apiRequest('/admin/conversions/merchants');
        if (response.success && response.merchants) {
            merchantsList = response.merchants;
            renderMerchantOptions(merchantsList);
        }
    } catch (error) {
        console.error('Error loading merchants:', error);
    }
}

/**
 * Render merchant options
 */
function renderMerchantOptions(merchants) {
    const html = `
        <div class="filter-option selected" data-value="">Tất cả</div>
        ${merchants.map(m => `
            <div class="filter-option" data-value="${m}">${m}</div>
        `).join('')}
    `;
    merchantOptions.innerHTML = html;
}

/**
 * Setup filter dropdowns
 */
function setupFilterDropdowns() {
    // Status filter dropdown
    statusFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        statusFilterMenu.classList.toggle('show');
        confirmedFilterMenu.classList.remove('show');
        merchantFilterMenu.classList.remove('show');
        utmSourceFilterMenu.classList.remove('show');
    });

    statusFilterMenu.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            currentFilters.status = value;
            statusFilterText.textContent = option.textContent;

            // Update selected state
            statusFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            statusFilterMenu.classList.remove('show');
            currentPage = 1;
            loadOrders();
        });
    });

    // Confirmed filter dropdown
    confirmedFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmedFilterMenu.classList.toggle('show');
        statusFilterMenu.classList.remove('show');
        merchantFilterMenu.classList.remove('show');
        utmSourceFilterMenu.classList.remove('show');
    });

    confirmedFilterMenu.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            currentFilters.isConfirmed = value;
            confirmedFilterText.textContent = option.textContent;

            // Update selected state
            confirmedFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            confirmedFilterMenu.classList.remove('show');
            currentPage = 1;
            loadOrders();
        });
    });

    // Merchant filter dropdown
    merchantFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        merchantFilterMenu.classList.toggle('show');
        statusFilterMenu.classList.remove('show');
        confirmedFilterMenu.classList.remove('show');
        utmSourceFilterMenu.classList.remove('show');
    });

    // Merchant search
    merchantSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredMerchants = merchantsList.filter(m =>
            m.toLowerCase().includes(searchTerm)
        );
        renderMerchantOptions(filteredMerchants);
        setupMerchantOptions(); // Re-attach event listeners
    });

    merchantSearchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    setupMerchantOptions();

    // UTM Source filter dropdown
    utmSourceFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        utmSourceFilterMenu.classList.toggle('show');
        statusFilterMenu.classList.remove('show');
        confirmedFilterMenu.classList.remove('show');
        merchantFilterMenu.classList.remove('show');
    });

    utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            currentFilters.utmSource = value;
            utmSourceFilterText.textContent = option.textContent;

            // Update selected state
            utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            utmSourceFilterMenu.classList.remove('show');
            currentPage = 1;
            loadOrders();
        });
    });
}

/**
 * Setup merchant options event listeners
 */
function setupMerchantOptions() {
    merchantOptions.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            currentFilters.merchant = value;
            merchantFilterText.textContent = option.textContent;

            // Update selected state
            merchantOptions.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            merchantFilterMenu.classList.remove('show');
            currentPage = 1;
            loadOrders();
        });
    });
}

/**
 * Reset all filters
 */
function resetFilters() {
    searchKeyword.value = '';
    filterUser.value = '';

    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    filterDateFrom.value = formatDateForPicker(lastMonth);
    filterDateTo.value = formatDateForPicker(today);

    currentPage = 1;
    currentFilters = {};

    // Reset filter dropdowns UI
    statusFilterText.textContent = 'Tất cả';
    statusFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
    statusFilterMenu.querySelector('[data-value=""]').classList.add('selected');

    confirmedFilterText.textContent = 'Tất cả';
    confirmedFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
    confirmedFilterMenu.querySelector('[data-value=""]').classList.add('selected');

    merchantFilterText.textContent = 'Tất cả';
    merchantSearchInput.value = '';
    renderMerchantOptions(merchantsList);
    setupMerchantOptions();
    merchantOptions.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
    merchantOptions.querySelector('[data-value=""]').classList.add('selected');

    utmSourceFilterText.textContent = 'Tất cả';
    utmSourceFilterMenu.querySelectorAll('.filter-option').forEach(o => o.classList.remove('selected'));
    utmSourceFilterMenu.querySelector('[data-value=""]').classList.add('selected');

    loadOrders();
}

/**
 * Build filters from form
 */
function buildFilters() {
    const filters = {};

    if (searchKeyword.value.trim()) {
        filters.search = searchKeyword.value.trim();
    }

    if (currentFilters.status) {
        filters.status = currentFilters.status;
    }

    if (currentFilters.isConfirmed !== undefined && currentFilters.isConfirmed !== '') {
        filters.isConfirmed = currentFilters.isConfirmed;
    }

    if (currentFilters.merchant) {
        filters.merchant = currentFilters.merchant;
    }

    if (currentFilters.utmSource) {
        filters.utmSource = currentFilters.utmSource;
    }

    if (filterUser.value.trim()) {
        filters.user = filterUser.value.trim();
    }

    if (filterDateFrom.value) {
        filters.dateFrom = filterDateFrom.value;
    }

    if (filterDateTo.value) {
        filters.dateTo = filterDateTo.value;
    }

    return filters;
}

/**
 * Load orders from API
 */
async function loadOrders() {
    try {
        showLoading();

        currentFilters = buildFilters();

        // Build query string
        const params = new URLSearchParams({
            page: currentPage,
            limit: ITEMS_PER_PAGE,
            ...currentFilters
        });

        console.log('Loading orders with params:', params.toString());

        const response = await apiRequest(`/admin/at-orders?${params.toString()}`);

        if (response.success) {
            totalRecords = response.total || 0;
            renderOrders(response.orders || []);
            updateStats(response.stats || {});
            updatePagination();
        } else {
            throw new Error(response.message || 'Failed to load orders');
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        showError('Lỗi khi tải dữ liệu: ' + error.message);
        showToast('Lỗi khi tải dữ liệu', 'error');
    }
}

/**
 * Show loading state with skeleton rows
 */
function showLoading() {
    const skeletonRows = Array(5).fill(0).map(() => `
        <tr class="skeleton-row">
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-badge"></div></td>
            <td><div class="skeleton skeleton-badge"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
            <td><div class="skeleton skeleton-text"></div></td>
        </tr>
    `).join('');

    ordersTableBody.innerHTML = skeletonRows;
}

/**
 * Show error state
 */
function showError(message) {
    ordersTableBody.innerHTML = `
        <tr class="empty-state">
            <td colspan="10">
                <div style="color: var(--danger);">❌ ${message}</div>
            </td>
        </tr>
    `;
}

/**
 * Render orders table
 */
function renderOrders(orders) {
    if (orders.length === 0) {
        ordersTableBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="10">
                    <div style="padding: 60px 20px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 24px; display: block; color: var(--gray-400);">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                            <line x1="10" y1="11" x2="10" y2="11" stroke-width="3"></line>
                        </svg>
                        <h3 style="font-size: 1.25rem; color: var(--gray-700); margin-bottom: 12px; font-weight: 600;">Không tìm thấy đơn hàng</h3>
                        <p style="font-size: 1rem; color: var(--gray-500); margin-bottom: 8px;">Chưa có dữ liệu trong khoảng thời gian này</p>
                        <p style="font-size: 0.9rem; color: var(--gray-400);">Thử thay đổi bộ lọc hoặc khoảng thời gian khác</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    ordersTableBody.innerHTML = orders.map(order => {
        // Trạng thái đơn hàng (status)
        const statusClass = order.status === 'approved' ? 'status-approved' :
                           order.status === 'pending' ? 'status-pending' :
                           'status-rejected';
        const statusText = order.status === 'approved' ? 'Đã duyệt' :
                          order.status === 'pending' ? 'Đang xử lý' : 'Hủy';

        // Trạng thái đối soát (is_confirmed)
        // Use ?? (nullish coalescing) to handle 0 correctly
        const isConfirmed = order.isConfirmed ?? order.is_confirmed ?? 0;
        const confirmedClass = isConfirmed === 1 ? 'status-approved' : 'status-pending';
        const confirmedText = isConfirmed === 1 ? 'Đã đối soát' : 'Chưa đối soát';

        // Format user info
        let userInfo = '-';
        if (order.userEmail) {
            userInfo = `<div style="font-size: 0.85rem;">${order.userEmail}</div>`;
        } else if (order.userId) {
            userInfo = `<div style="font-size: 0.85rem; color: var(--gray-500);">ID: ${order.userId.substring(0, 8)}...</div>`;
        }

        // Debug log
        console.log('Order data:', {
            orderCode: order.orderCode,
            orderAmount: order.orderAmount,
            commission: order.commission,
            cashbackAmount: order.cashbackAmount
        });

        return `
            <tr style="cursor: pointer;" onclick="viewOrderDetail('${order.id}')" title="Click để xem chi tiết">
                <td>
                    <div style="font-weight: 600;">${order.orderCode || order.accesstradeId || '-'}</div>
                    ${order.accesstradeId ? `<div style="font-size: 0.8rem; color: var(--gray-500);">AT: ${order.accesstradeId}</div>` : ''}
                </td>
                <td>
                    <div>${order.merchantName || '-'}</div>
                </td>
                <td>${userInfo}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(order.orderAmount || 0)}</td>
                <td style="text-align: right; font-weight: 600; color: var(--primary);">${formatCurrency(order.commission || 0)}</td>
                <td style="text-align: right; font-weight: 600; color: var(--success);">${formatCurrency(order.cashbackAmount || 0)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td><span class="status-badge ${confirmedClass}">${confirmedText}</span></td>
                <td>
                    <div style="font-size: 0.85rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${order.affSid || '-'}">${order.affSid || '-'}</div>
                </td>
                <td>
                    <div style="font-size: 0.85rem;">${order.orderTime ? formatDate(order.orderTime) : '-'}</div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Update statistics
 */
function updateStats(stats) {
    // General stats
    statTotal.textContent = stats.total || totalRecords || 0;
    statTotalValue.textContent = formatCurrency(stats.totalOrderAmount || 0);
    statTotalCommission.textContent = formatCurrency(stats.totalCommission || 0);

    // Status breakdown
    if (stats.statusBreakdown) {
        const approved = stats.statusBreakdown.approved || { count: 0, amount: 0 };
        const pending = stats.statusBreakdown.pending || { count: 0, amount: 0 };
        const rejected = stats.statusBreakdown.rejected || { count: 0, amount: 0 };

        statApproved.textContent = approved.count;
        statApprovedAmount.textContent = formatCurrency(approved.amount);

        statPending.textContent = pending.count;
        statPendingAmount.textContent = formatCurrency(pending.amount);

        statRejected.textContent = rejected.count;
        statRejectedAmount.textContent = formatCurrency(rejected.amount);
    }

    // Confirmed status breakdown
    if (stats.confirmedBreakdown) {
        const confirmed = stats.confirmedBreakdown.confirmed || { count: 0, commission: 0 };
        const notConfirmed = stats.confirmedBreakdown.notConfirmed || { count: 0, commission: 0 };

        statConfirmed.textContent = confirmed.count;
        statConfirmedCommission.textContent = formatCurrency(confirmed.commission) + ' hoa hồng';

        statNotConfirmed.textContent = notConfirmed.count;
        statNotConfirmedCommission.textContent = formatCurrency(notConfirmed.commission) + ' hoa hồng';
    }
}

/**
 * Update pagination
 */
function updatePagination() {
    const totalPages = Math.ceil(totalRecords / ITEMS_PER_PAGE);

    // Show only page number
    pageInfo.textContent = currentPage;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}

/**
 * View order detail
 */
async function viewOrderDetail(orderId) {
    try {
        console.log('Loading order detail:', orderId);
        showToast('Đang tải chi tiết...', 'info');

        const response = await apiRequest(`/admin/at-order/${orderId}`);

        if (response.success) {
            showOrderDetailModal(response.order);
        } else {
            throw new Error(response.message || 'Failed to load order detail');
        }
    } catch (error) {
        console.error('Error loading order detail:', error);
        showToast('Lỗi khi tải chi tiết: ' + error.message, 'error');
    }
}

/**
 * Show order detail modal
 */
function showOrderDetailModal(order) {
    const modal = document.getElementById('orderDetailModal');
    if (!modal) {
        console.error('Modal not found');
        return;
    }

    // Populate modal content
    document.getElementById('detailOrderCode').textContent = order.orderCode || order.accesstradeId || '-';
    document.getElementById('detailAccesstradeId').textContent = order.accesstradeId || '-';
    document.getElementById('detailMerchant').textContent = order.merchantName || '-';
    document.getElementById('detailOrderAmount').textContent = formatCurrency(order.orderAmount || 0);
    document.getElementById('detailCommission').textContent = formatCurrency(order.commission || 0);
    document.getElementById('detailCashback').textContent = formatCurrency(order.cashbackAmount || 0);

    const statusClass = order.status === 'approved' ? 'status-approved' :
                       order.status === 'pending' ? 'status-pending' : 'status-rejected';
    const statusText = order.status === 'approved' ? 'Đã duyệt' :
                      order.status === 'pending' ? 'Đang xử lý' : 'Hủy';
    document.getElementById('detailStatus').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    document.getElementById('detailAffSid').textContent = order.affSid || '-';
    document.getElementById('detailOrderTime').textContent = order.orderTime ? formatDate(order.orderTime) : '-';
    document.getElementById('detailApprovalTime').textContent = order.approvalTime ? formatDate(order.approvalTime) : '-';
    document.getElementById('detailCreatedAt').textContent = order.createdAt ? formatDate(order.createdAt) : '-';

    // User info
    if (order.userEmail) {
        document.getElementById('detailUserInfo').innerHTML = `
            <div><strong>Email:</strong> ${order.userEmail}</div>
            <div><strong>Username:</strong> ${order.userUsername || '-'}</div>
            <div><strong>Full Name:</strong> ${order.userFullName || '-'}</div>
        `;
    } else if (order.userId) {
        document.getElementById('detailUserInfo').innerHTML = `
            <div><strong>User ID:</strong> ${order.userId}</div>
            <div style="color: var(--gray-500);">Chưa match với user</div>
        `;
    } else {
        document.getElementById('detailUserInfo').innerHTML = `<div style="color: var(--gray-500);">Không có thông tin user</div>`;
    }

    // UTM info
    const hasUtm = order.utmSource || order.utmMedium || order.utmCampaign || order.utmContent;
    if (hasUtm) {
        document.getElementById('detailUtmInfo').innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${order.utmSource ? `<div><strong>UTM Source:</strong> ${order.utmSource}</div>` : ''}
                ${order.utmMedium ? `<div><strong>UTM Medium:</strong> ${order.utmMedium}</div>` : ''}
                ${order.utmCampaign ? `<div><strong>UTM Campaign:</strong> ${order.utmCampaign}</div>` : ''}
                ${order.utmContent ? `<div><strong>UTM Content:</strong> ${order.utmContent}</div>` : ''}
            </div>
        `;
    } else {
        document.getElementById('detailUtmInfo').innerHTML = `<div style="color: var(--gray-500);">Không có UTM parameters</div>`;
    }

    // Click info
    if (order.clickId) {
        document.getElementById('detailClickInfo').innerHTML = `
            <div><strong>Click ID:</strong> ${order.clickId}</div>
            <div style="font-size: 0.9rem; color: var(--gray-600);">Đơn hàng này đã được match với click tracking</div>
        `;
    } else {
        document.getElementById('detailClickInfo').innerHTML = `<div style="color: var(--gray-500);">Chưa match với click</div>`;
    }

    // Show modal with flex display for centering
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
}

/**
 * Close order detail modal
 */
function closeOrderDetailModal() {
    const modal = document.getElementById('orderDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Make functions globally accessible
window.viewOrderDetail = viewOrderDetail;
window.closeOrderDetailModal = closeOrderDetailModal;

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('orderDetailModal');
    if (e.target === modal) {
        closeOrderDetailModal();
    }
});

// Initialize on load
console.log('AT Orders page loaded');
