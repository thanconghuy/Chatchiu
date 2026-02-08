// ========================================
// Cashback Stats Page - Admin
// ========================================

let currentPage = 0;
let currentLimit = 20;
let currentSortBy = 'cashback_desc';
let currentFromDate = '';
let currentToDate = '';
let currentSearch = '';
let totalPages = 1;

// ========================================
// Helper Functions
// ========================================
function getAuthToken() {
    return localStorage.getItem('cashback_token') ||
           localStorage.getItem('adminToken') ||
           localStorage.getItem('token');
}

// ========================================
// Initialize Page
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Set default date range (last 30 days)
    setDefaultDateRange();

    // Load initial data
    await loadCashbackStats();

    // Event Listeners
    document.getElementById('timeRangeSelect')?.addEventListener('change', handleTimeRangeChange);
    document.getElementById('applyFilterBtn')?.addEventListener('click', handleApplyFilter);
    document.getElementById('limitSelect')?.addEventListener('change', handleLimitChange);
    document.getElementById('sortBy')?.addEventListener('change', handleSortChange);
    document.getElementById('prevBtn')?.addEventListener('click', handlePrevPage);
    document.getElementById('nextBtn')?.addEventListener('click', handleNextPage);
    document.getElementById('closeModal')?.addEventListener('click', closeDetailModal);

    // Search input - Enter key to search
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleApplyFilter();
        }
    });

    // Close modal when clicking overlay
    document.getElementById('detailModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'detailModal' || e.target.classList.contains('modal-overlay')) {
            closeDetailModal();
        }
    });
});

// ========================================
// Date Range Helpers
// ========================================
function setDefaultDateRange() {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    currentFromDate = fromDate.toISOString().split('T')[0];
    currentToDate = toDate.toISOString().split('T')[0];

    updateDateInputs();
}

function updateDateInputs() {
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    if (fromDateInput) fromDateInput.value = currentFromDate;
    if (toDateInput) toDateInput.value = currentToDate;
}

function handleTimeRangeChange(e) {
    const value = e.target.value;

    const now = new Date();
    let fromDate, toDate;

    switch(value) {
        case '30days':
            toDate = new Date();
            fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 30);
            break;

        case 'thismonth':
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;

        case 'lastmonth':
            fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            toDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case '90days':
            toDate = new Date();
            fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 90);
            break;

        case 'custom':
            return; // Don't auto-apply for custom - user will use Áp dụng button
    }

    if (fromDate && toDate) {
        currentFromDate = fromDate.toISOString().split('T')[0];
        currentToDate = toDate.toISOString().split('T')[0];
        updateDateInputs();
        currentPage = 0;
        loadCashbackStats();
    }
}

// ========================================
// Event Handlers
// ========================================
async function handleApplyFilter() {
    const timeRangeSelect = document.getElementById('timeRangeSelect').value;

    if (timeRangeSelect === 'custom') {
        const fromDateInput = document.getElementById('fromDate').value;
        const toDateInput = document.getElementById('toDate').value;

        if (!fromDateInput || !toDateInput) {
            showToast('Vui lòng chọn khoảng thời gian', 'error');
            return;
        }

        if (new Date(fromDateInput) > new Date(toDateInput)) {
            showToast('Ngày bắt đầu phải trước ngày kết thúc', 'error');
            return;
        }

        currentFromDate = fromDateInput;
        currentToDate = toDateInput;
    }

    // Get search value
    currentSearch = document.getElementById('searchInput')?.value?.trim() || '';

    currentPage = 0;
    await loadCashbackStats();
}

async function handleLimitChange(e) {
    currentLimit = parseInt(e.target.value);
    currentPage = 0;
    await loadCashbackStats();
}

async function handleSortChange(e) {
    currentSortBy = e.target.value;
    currentPage = 0;
    await loadCashbackStats();
}

async function handlePrevPage() {
    if (currentPage > 0) {
        currentPage--;
        await loadCashbackStats();
    }
}

async function handleNextPage() {
    if (currentPage < totalPages - 1) {
        currentPage++;
        await loadCashbackStats();
    }
}

// ========================================
// API Call
// ========================================
async function loadCashbackStats() {
    try {
        showLoading(true);

        // Map old sort format to new API format
        let sortBy = 'total_cashback';
        let sortOrder = 'DESC';

        switch(currentSortBy) {
            case 'cashback_desc':
                sortBy = 'total_cashback';
                sortOrder = 'DESC';
                break;
            case 'cashback_asc':
                sortBy = 'total_cashback';
                sortOrder = 'ASC';
                break;
            case 'available_desc':
                sortBy = 'available_balance';
                sortOrder = 'DESC';
                break;
            case 'available_asc':
                sortBy = 'available_balance';
                sortOrder = 'ASC';
                break;
            case 'paid_desc':
                sortBy = 'paid_cashback';
                sortOrder = 'DESC';
                break;
            case 'paid_asc':
                sortBy = 'paid_cashback';
                sortOrder = 'ASC';
                break;
        }

        const params = new URLSearchParams({
            sortBy: sortBy,
            sortOrder: sortOrder,
            limit: currentLimit,
            offset: currentPage * currentLimit
        });

        // Add search param if provided
        if (currentSearch) {
            params.append('search', currentSearch);
        }

        console.log('Fetching cashback stats with params:', Object.fromEntries(params));

        const API_URL = CONFIG.API_BASE_URL;
        const token = getAuthToken();

        if (!token) {
            throw new Error('No authentication token found. Please login again.');
        }

        // NEW ENDPOINT: /api/admin/cashback-stats
        const response = await fetch(`${API_URL}/admin/cashback-stats?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`Failed to fetch cashback stats: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received data:', data);

        if (data.success) {
            renderStats(data.data);
            renderSummaryCards(data.summary);
            updatePagination(data.pagination);
        } else {
            showToast(data.message || 'Không thể tải dữ liệu', 'error');
            renderStats([]);
            renderSummaryCards({
                total_users: 0,
                total_cashback_all: 0,
                total_paid_all: 0,
                total_available_all: 0
            });
            updatePagination({ offset: 0, limit: currentLimit, total: 0, hasMore: false });
        }

    } catch (error) {
        console.error('Load cashback stats error:', error);
        showToast('Lỗi tải dữ liệu thống kê: ' + error.message, 'error');
        renderStats([]);
        renderSummaryCards({
            total_users: 0,
            total_cashback_all: 0,
            total_paid_all: 0,
            total_available_all: 0
        });
        updatePagination({ offset: 0, limit: currentLimit, total: 0, hasMore: false });
    } finally {
        showLoading(false);
    }
}

// loadSummaryStats() - REMOVED
// Summary is now included in main API response

// ========================================
// Render Summary Cards
// ========================================
function renderSummaryCards(summary) {
    // NEW API format: { total_users, total_cashback_all, total_paid_all, total_available_all, total_pending_reserved_all }
    const totalUsers = summary.total_users || 0;
    const totalCashback = summary.total_cashback_all || 0;
    const totalPaid = summary.total_paid_all || 0;
    const totalAvailable = summary.total_available_all || 0;

    // Update summary cards with new data
    const totalUsersEl = document.getElementById('totalUsersCount');
    const totalCashbackEl = document.getElementById('totalCashback');
    const totalPaidEl = document.getElementById('totalOrdersCount') || document.getElementById('totalPaid');
    const totalAvailableEl = document.getElementById('totalOrderValue') || document.getElementById('totalAvailable');

    if (totalUsersEl) totalUsersEl.textContent = totalUsers.toLocaleString('vi-VN');
    if (totalCashbackEl) totalCashbackEl.textContent = formatCurrency(totalCashback);
    if (totalPaidEl) totalPaidEl.textContent = formatCurrency(totalPaid);
    if (totalAvailableEl) totalAvailableEl.textContent = formatCurrency(totalAvailable);
}

// ========================================
// Render Stats Table
// ========================================
function renderStats(stats) {
    const tbody = document.getElementById('statsTableBody');

    if (!stats || stats.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
                    Không có dữ liệu
                </td>
            </tr>
        `;
        return;
    }

    // NEW API format:
    // { user_id, email, username, full_name, total_cashback, pending_cashback, approved_cashback, rejected_cashback, paid_cashback, available_balance }
    tbody.innerHTML = stats.map((stat, index) => `
        <tr>
            <td style="text-align: center;">${(currentPage * currentLimit) + index + 1}</td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <strong>${escapeHtml(stat.email)}</strong>
                    <small style="color: #666;">${escapeHtml(stat.username || stat.full_name || '-')}</small>
                </div>
            </td>
            <td style="text-align: right; font-weight: 600; color: #667eea;">
                ${formatCurrency(stat.total_cashback)}
            </td>
            <td style="text-align: right; font-weight: 500; color: #f59e0b;">
                ${formatCurrency(stat.pending_cashback)}
            </td>
            <td style="text-align: right; font-weight: 500; color: #10b981;">
                ${formatCurrency(stat.approved_cashback)}
            </td>
            <td style="text-align: right; font-weight: 500; color: #ef4444;">
                ${formatCurrency(stat.rejected_cashback || 0)}
            </td>
            <td style="text-align: right; font-weight: 600; color: #3b82f6;">
                ${formatCurrency(stat.paid_cashback)}
            </td>
            <td style="text-align: right; font-weight: 600; color: ${stat.available_balance > 0 ? '#10b981' : '#6b7280'};">
                ${formatCurrency(stat.available_balance)}
            </td>
            <td style="text-align: center;">
                <div class="action-menu">
                    <button class="action-btn" data-action="toggle-menu" data-user-id="${stat.user_id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="action-dropdown" id="menu-${stat.user_id}">
                        <div class="action-dropdown-item" data-action="view-detail" data-user-id="${stat.user_id}">
                            <i class="fas fa-eye"></i> Xem chi tiết
                        </div>
                        <div class="action-dropdown-item" data-action="view-history" data-user-id="${stat.user_id}">
                            <i class="fas fa-history"></i> Lịch sử giao dịch
                        </div>
                        <div class="action-dropdown-item" data-action="send-reminder" data-user-id="${stat.user_id}">
                            <i class="fas fa-envelope"></i> Gửi nhắc nhở
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');

    // Add event listeners for action buttons
    addActionMenuListeners();
}

// ========================================
// Pagination
// ========================================
function updatePagination(pagination) {
    // NEW API format: { offset, limit, total, hasMore }
    const total = pagination.total || 0;
    const offset = pagination.offset || 0;
    const limit = pagination.limit || currentLimit;
    const hasMore = pagination.hasMore || false;

    totalPages = Math.ceil(total / limit);
    currentPage = Math.floor(offset / limit);

    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const paginationDiv = document.getElementById('pagination');

    if (paginationDiv) {
        paginationDiv.style.display = 'flex';
    }

    if (pageInfo) {
        pageInfo.textContent = `Trang ${currentPage + 1} / ${totalPages || 1} (Tổng: ${total} users)`;
    }

    if (prevBtn) {
        prevBtn.disabled = currentPage === 0;
    }

    if (nextBtn) {
        nextBtn.disabled = !hasMore || currentPage >= totalPages - 1;
    }
}

// ========================================
// Detail Modal
// ========================================
async function showUserDetail(userId, username) {
    try {
        // Find user in current stats data (already loaded)
        const params = new URLSearchParams({
            from_date: currentFromDate,
            to_date: currentToDate,
            page: 0,
            limit: 1000 // Get all to find this user
        });

        const API_URL = CONFIG.API_BASE_URL;
        const token = getAuthToken();

        const response = await fetch(`${API_URL}/admin/users/cashback-stats?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        const user = data.stats.find(s => s.userId === userId);

        if (!user) {
            showToast('Không tìm thấy thông tin user', 'error');
            return;
        }

        const modalContent = document.getElementById('modalContent');
        modalContent.innerHTML = `
            <div style="padding: 20px;">
                <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">👤 ${escapeHtml(username)}</h3>
                    <p style="margin: 0; color: #666; font-size: 0.95rem;">
                        📧 ${escapeHtml(user.email)}
                        ${user.fullName ? `<br/>📝 ${escapeHtml(user.fullName)}` : ''}
                    </p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div style="padding: 16px; background: #f0fdf4; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; color: #059669; font-size: 0.85rem; font-weight: 600;">Số dư khả dụng</p>
                        <h3 style="margin: 0; color: #047857; font-size: 1.3rem;">${formatCurrency(user.availableBalance)}</h3>
                    </div>
                    <div style="padding: 16px; background: #fef3c7; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; color: #d97706; font-size: 0.85rem; font-weight: 600;">Số dư chờ duyệt</p>
                        <h3 style="margin: 0; color: #b45309; font-size: 1.3rem;">${formatCurrency(user.pendingBalance)}</h3>
                    </div>
                </div>

                <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white; margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; font-size: 1rem; opacity: 0.9;">📊 Thống kê khoảng ${formatDate(currentFromDate)} - ${formatDate(currentToDate)}</h4>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;">
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">✅ Đã duyệt</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.periodStats.approvedOrders} đơn - ${formatCurrency(user.periodStats.approvedCashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">⏳ Chờ duyệt</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.periodStats.pendingOrders} đơn - ${formatCurrency(user.periodStats.pendingCashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">❌ Đã hủy</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.periodStats.rejectedOrders} đơn</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">📦 Tổng đơn</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.periodStats.totalOrders} đơn</p>
                        </div>
                    </div>

                    <div style="padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.95rem;">💰 Tổng cashback:</span>
                            <span style="font-size: 1.2rem; font-weight: 700;">${formatCurrency(user.periodStats.totalCashbackEarned)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="font-size: 0.95rem;">🛒 Tổng giá trị:</span>
                            <span style="font-size: 1.2rem; font-weight: 700;">${formatCurrency(user.periodStats.totalOrderValue)}</span>
                        </div>
                    </div>
                </div>

                <div style="text-align: center;">
                    <button class="btn-secondary" data-action="close-detail-modal" style="padding: 10px 24px;">
                        Đóng
                    </button>
                </div>
            </div>
        `;

        const modal = document.getElementById('detailModal');
        modal.classList.add('show');

    } catch (error) {
        console.error('Show user detail error:', error);
        showToast('Lỗi tải chi tiết user', 'error');
    }
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    modal.classList.remove('show');
}

// ========================================
// Utility Functions
// ========================================
function showLoading(show) {
    const tbody = document.getElementById('statsTableBody');
    if (show) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 16px; color: #666;">Đang tải dữ liệu...</p>
                </td>
            </tr>
        `;
    }
}

function formatCurrency(amount) {
    if (!amount || amount === 0) return '0đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast show';

    if (type === 'error') {
        toast.style.background = '#ef4444';
    } else if (type === 'success') {
        toast.style.background = '#10b981';
    } else {
        toast.style.background = '#667eea';
    }

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ============ CSP FIX: Event Delegation ============
document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');

    // Close all dropdowns when clicking outside
    if (!button || button.dataset.action !== 'toggle-menu') {
        document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }

    if (!button) return;

    const action = button.dataset.action;
    const userId = button.dataset.userId;

    switch (action) {
        case 'toggle-menu':
            toggleActionMenu(userId);
            break;
        case 'view-detail':
            viewUserDetail(userId);
            break;
        case 'view-history':
            viewTransactionHistory(userId);
            break;
        case 'send-reminder':
            sendReminder(userId);
            break;
        case 'show-user-detail':
            showUserDetail(userId, button.dataset.username);
            break;
        case 'close-detail-modal':
            closeDetailModal();
            break;
    }
});

// ========================================
// Action Menu Functions
// ========================================
function toggleActionMenu(userId) {
    const dropdown = document.getElementById(`menu-${userId}`);
    if (!dropdown) return;

    // Close all other dropdowns
    document.querySelectorAll('.action-dropdown.show').forEach(d => {
        if (d.id !== `menu-${userId}`) {
            d.classList.remove('show');
        }
    });

    dropdown.classList.toggle('show');
}

async function viewUserDetail(userId) {
    try {
        const API_URL = CONFIG.API_BASE_URL;
        const token = getAuthToken();

        // Call the new API endpoint
        const response = await fetch(`${API_URL}/admin/cashback-stats/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user details');
        }

        const result = await response.json();

        if (!result.success) {
            showToast('Không tìm thấy thông tin user', 'error');
            return;
        }

        const user = result.data;

        // Render modal
        const modalContent = document.getElementById('modalContent');
        modalContent.innerHTML = `
            <div style="padding: 20px;">
                <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">👤 ${escapeHtml(user.username || user.email)}</h3>
                    <p style="margin: 0; color: #666; font-size: 0.95rem;">
                        📧 ${escapeHtml(user.email)}
                        ${user.full_name ? `<br/>📝 ${escapeHtml(user.full_name)}` : ''}
                        ${user.phone ? `<br/>📱 ${escapeHtml(user.phone)}` : ''}
                    </p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div style="padding: 16px; background: #f0fdf4; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; color: #059669; font-size: 0.85rem; font-weight: 600;">Số dư khả dụng</p>
                        <h3 style="margin: 0; color: #047857; font-size: 1.3rem;">${formatCurrency(user.available_balance)}</h3>
                    </div>
                    <div style="padding: 16px; background: #fef3c7; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; color: #d97706; font-size: 0.85rem; font-weight: 600;">Đang chờ xử lý</p>
                        <h3 style="margin: 0; color: #b45309; font-size: 1.3rem;">${formatCurrency(user.pending_reserved)}</h3>
                    </div>
                </div>

                <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white; margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; font-size: 1rem; opacity: 0.9;">📊 Tổng quan Cashback</h4>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;">
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">💰 Tổng Cashback</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${formatCurrency(user.total_cashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">✅ Đã Thanh Toán</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${formatCurrency(user.paid_cashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">⏳ Chờ Duyệt</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.pending_conversions_count || 0} đơn - ${formatCurrency(user.pending_cashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">✔️ Đã Duyệt</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.approved_conversions_count || 0} đơn - ${formatCurrency(user.approved_cashback)}</p>
                        </div>
                        <div>
                            <p style="margin: 0 0 4px 0; opacity: 0.8; font-size: 0.85rem;">❌ Đã Hủy</p>
                            <p style="margin: 0; font-size: 1.1rem; font-weight: 600;">${user.rejected_conversions_count || 0} đơn - ${formatCurrency(user.rejected_cashback || 0)}</p>
                        </div>
                    </div>

                    <div style="padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.95rem;">💳 Đơn đã thanh toán:</span>
                            <span style="font-size: 1.2rem; font-weight: 700;">${user.paid_conversions_count || 0} đơn</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="font-size: 0.95rem;">📝 Yêu cầu thanh toán:</span>
                            <span style="font-size: 1.2rem; font-weight: 700;">${user.paid_payment_requests || 0} / ${user.total_payment_requests || 0}</span>
                        </div>
                    </div>
                </div>

                <div style="text-align: center;">
                    <button class="btn-secondary" data-action="close-detail-modal" style="padding: 10px 24px;">
                        Đóng
                    </button>
                </div>
            </div>
        `;

        const modal = document.getElementById('detailModal');
        modal.classList.add('show');

    } catch (error) {
        console.error('View user detail error:', error);
        showToast('Lỗi tải chi tiết user', 'error');
    }
}

function viewTransactionHistory(userId) {
    console.log('View transaction history for user:', userId);
    showToast('Tính năng đang phát triển', 'info');
    // TODO: Implement view transaction history
}

function sendReminder(userId) {
    console.log('Send reminder to user:', userId);
    showToast('Tính năng đang phát triển', 'info');
    // TODO: Implement send reminder email
}

function addActionMenuListeners() {
    // Event listeners are handled by event delegation above
    console.log('Action menu listeners ready');
}

console.log('[cashback-stats.js] CSP-compliant');
