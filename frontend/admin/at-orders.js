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
const ITEMS_PER_PAGE = 50;
let currentFilters = {};
let totalRecords = 0;
let totalPages = 1;

// DOM Elements
const userName = document.getElementById('userName');
const searchKeyword = document.getElementById('searchKeyword');
const filterStatus = document.getElementById('filterStatus');
const filterMerchant = document.getElementById('filterMerchant');
const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterUser = document.getElementById('filterUser');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const ordersTableBody = document.getElementById('ordersTableBody');
const firstBtn = document.getElementById('firstBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const lastBtn = document.getElementById('lastBtn');
const pageInfo = document.getElementById('pageInfo');
const recordsInfo = document.getElementById('recordsInfo');
const logoutBtn = document.getElementById('logoutBtn');

// Stats elements
const statTotal = document.getElementById('statTotal');
const statTotalValue = document.getElementById('statTotalValue');
const statTotalCommission = document.getElementById('statTotalCommission');

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
        userName.textContent = user.fullName || user.username || user.email;
    }

    // Set default date range (last 30 days)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);

    filterDateFrom.value = formatDateForPicker(lastMonth);
    filterDateTo.value = formatDateForPicker(today);

    setupEventListeners();
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
    // Debug: Check if buttons exist
    console.log('Setting up event listeners...');
    console.log('firstBtn:', firstBtn);
    console.log('lastBtn:', lastBtn);

    searchBtn.addEventListener('click', () => {
        currentPage = 1;
        loadOrders();
    });

    resetBtn.addEventListener('click', () => {
        searchKeyword.value = '';
        filterStatus.value = '';
        filterMerchant.value = '';
        filterUser.value = '';

        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30);
        filterDateFrom.value = formatDateForPicker(lastMonth);
        filterDateTo.value = formatDateForPicker(today);

        currentPage = 1;
        currentFilters = {};
        loadOrders();
    });

    // Allow Enter key to search
    [searchKeyword, filterMerchant, filterUser].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentPage = 1;
                loadOrders();
            }
        });
    });

    firstBtn.addEventListener('click', () => {
        console.log('First button clicked!');
        currentPage = 1;
        loadOrders();
    });

    prevBtn.addEventListener('click', () => {
        console.log('Prev button clicked!');
        if (currentPage > 1) {
            currentPage--;
            loadOrders();
        }
    });

    nextBtn.addEventListener('click', () => {
        console.log('Next button clicked!');
        if (currentPage < totalPages) {
            currentPage++;
            loadOrders();
        }
    });

    lastBtn.addEventListener('click', () => {
        console.log('Last button clicked! totalPages =', totalPages);
        currentPage = totalPages;
        loadOrders();
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

/**
 * Build filters from form
 */
function buildFilters() {
    const filters = {};

    if (searchKeyword.value.trim()) {
        filters.search = searchKeyword.value.trim();
    }

    if (filterStatus.value) {
        filters.status = filterStatus.value;
    }

    if (filterMerchant.value.trim()) {
        filters.merchant = filterMerchant.value.trim();
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
            totalPages = response.totalPages || 1;
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
            <td colspan="9">
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
                <td colspan="9">
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
        // Determine status display based on AccessTrade fields:
        // 1. order_reject = 1 → Huỷ
        // 2. is_confirmed = 1 → Đã duyệt (đã đối soát)
        // 3. order_pending != 0 → Chờ duyệt
        // 4. order_approved != 0 + order_pending = 0 → Tạm duyệt (đợi đối soát)

        let statusClass, statusText;

        if (order.status === 'rejected' || order.orderReject === 1) {
            statusClass = 'status-rejected';
            statusText = 'Huỷ';
        } else if (order.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Đã duyệt';
        } else if (order.status === 'pending') {
            // Check if temp approved
            const isTempApproved = order.orderApproved > 0 &&
                                   order.orderPending === 0 &&
                                   order.orderReject === 0;

            if (isTempApproved) {
                statusClass = 'status-temp-approved';
                statusText = 'Tạm duyệt (đợi đối soát)';
            } else {
                statusClass = 'status-pending';
                statusText = 'Chờ duyệt';
            }
        } else {
            // Fallback
            statusClass = 'status-pending';
            statusText = 'Pending';
        }

        // Format user info - show username and full name
        let userInfo = '-';
        if (order.userUsername) {
            const fullName = order.userFullName || '';
            userInfo = `
                <div style="font-weight: 600; font-size: 0.9rem;">${order.userUsername}</div>
                ${fullName ? `<div style="font-size: 0.8rem; color: var(--gray-600);">${fullName}</div>` : ''}
            `;
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
    statTotal.textContent = stats.total || totalRecords || 0;
    statTotalValue.textContent = formatCurrency(stats.totalOrderAmount || 0);
    statTotalCommission.textContent = formatCurrency(stats.totalCommission || 0);
    // Removed statTotalCashback as it's not accurate without click matching
}

/**
 * Update pagination
 */
function updatePagination() {
    // Update page info
    pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;

    // Calculate record range
    const startRecord = totalRecords > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0;
    const endRecord = Math.min(currentPage * ITEMS_PER_PAGE, totalRecords);

    // Update records info
    recordsInfo.textContent = totalRecords > 0
        ? `Hiển thị ${startRecord}-${endRecord} của ${totalRecords} kết quả`
        : 'Không có kết quả';

    // Update button states
    firstBtn.disabled = currentPage === 1;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
    lastBtn.disabled = currentPage >= totalPages;

    // Debug logging
    console.log('Pagination updated:', {
        currentPage,
        totalPages,
        totalRecords,
        firstBtn: { disabled: firstBtn.disabled },
        prevBtn: { disabled: prevBtn.disabled },
        nextBtn: { disabled: nextBtn.disabled },
        lastBtn: { disabled: lastBtn.disabled }
    });
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('vi-VN', {
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

    // Determine status display based on AccessTrade fields
    let statusClass, statusText;

    if (order.status === 'rejected' || order.orderReject === 1) {
        statusClass = 'status-rejected';
        statusText = 'Huỷ';
    } else if (order.status === 'approved') {
        statusClass = 'status-approved';
        statusText = 'Đã duyệt';
    } else if (order.status === 'pending') {
        // Check if temp approved
        const isTempApproved = order.orderApproved > 0 &&
                               order.orderPending === 0 &&
                               order.orderReject === 0;

        if (isTempApproved) {
            statusClass = 'status-temp-approved';
            statusText = 'Tạm duyệt (đợi đối soát)';
        } else {
            statusClass = 'status-pending';
            statusText = 'Chờ duyệt';
        }
    } else {
        // Fallback
        statusClass = 'status-pending';
        statusText = 'Pending';
    }

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
