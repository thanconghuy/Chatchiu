// ========================================
// Cashback Stats Page - Admin
// ========================================

let currentPage = 0;
let currentLimit = 20;
let currentSortBy = 'cashback_desc';
let currentFromDate = '';
let currentToDate = '';
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

        const params = new URLSearchParams({
            from_date: currentFromDate,
            to_date: currentToDate,
            page: currentPage,
            limit: currentLimit,
            sort_by: currentSortBy
        });

        console.log('Fetching cashback stats with params:', Object.fromEntries(params));

        const API_URL = CONFIG.API_BASE_URL;
        const token = getAuthToken();

        if (!token) {
            throw new Error('No authentication token found. Please login again.');
        }

        const response = await fetch(`${API_URL}/admin/users/cashback-stats?${params}`, {
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
            renderStats(data.stats);
            renderSummaryCards(data.stats, data.pagination);
            updatePagination(data.pagination);
        } else {
            showToast(data.message || 'Không thể tải dữ liệu', 'error');
            renderStats([]);
            renderSummaryCards([]);
            // Still show pagination structure
            updatePagination({ currentPage: 0, totalPages: 1, totalUsers: 0, limit: currentLimit });
        }

    } catch (error) {
        console.error('Load cashback stats error:', error);
        showToast('Lỗi tải dữ liệu thống kê: ' + error.message, 'error');
        renderStats([]);
        renderSummaryCards([]);
        updatePagination({ currentPage: 0, totalPages: 1, totalUsers: 0, limit: currentLimit });
    } finally {
        showLoading(false);
    }
}

// ========================================
// Render Summary Cards
// ========================================
function renderSummaryCards(stats, pagination) {
    let totalUsers = 0;
    let totalOrders = 0;
    let totalOrderValue = 0;
    let totalCashback = 0;

    if (stats && stats.length > 0) {
        totalUsers = pagination ? pagination.totalUsers : stats.length;

        stats.forEach(stat => {
            totalOrders += stat.periodStats.totalOrders || 0;
            totalOrderValue += stat.periodStats.totalOrderValue || 0;
            totalCashback += stat.periodStats.totalCashbackEarned || 0;
        });
    }

    document.getElementById('totalUsersCount').textContent = totalUsers.toLocaleString('vi-VN');
    document.getElementById('totalOrdersCount').textContent = totalOrders.toLocaleString('vi-VN');
    document.getElementById('totalOrderValue').textContent = formatCurrency(totalOrderValue);
    document.getElementById('totalCashback').textContent = formatCurrency(totalCashback);
}

// ========================================
// Render Stats Table
// ========================================
function renderStats(stats) {
    const tbody = document.getElementById('statsTableBody');

    if (!stats || stats.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    Không có dữ liệu trong khoảng thời gian này
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = stats.map(stat => `
        <tr>
            <td><strong>${escapeHtml(stat.username)}</strong></td>
            <td>${escapeHtml(stat.email)}</td>
            <td>${escapeHtml(stat.fullName || '-')}</td>
            <td style="text-align: center;">
                <span style="font-weight: 600; color: #667eea;">${stat.periodStats.totalOrders}</span>
            </td>
            <td style="text-align: right; font-weight: 500;">
                ${formatCurrency(stat.periodStats.totalOrderValue)}
            </td>
            <td style="text-align: right; font-weight: 600; color: #10b981;">
                ${formatCurrency(stat.periodStats.totalCashbackEarned)}
            </td>
            <td style="text-align: center;">
                <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;"
                        onclick="showUserDetail('${stat.userId}', '${escapeHtml(stat.username)}')">
                    Xem chi tiết
                </button>
            </td>
        </tr>
    `).join('');
}

// ========================================
// Pagination
// ========================================
function updatePagination(pagination) {
    totalPages = pagination.totalPages;
    const currentPageNum = pagination.currentPage;

    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const paginationDiv = document.getElementById('pagination');

    // Always show pagination
    paginationDiv.style.display = 'flex';
    pageInfo.textContent = `Trang ${currentPageNum + 1}`;

    prevBtn.disabled = currentPageNum === 0;
    nextBtn.disabled = currentPageNum >= totalPages - 1;
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
                    <button class="btn-secondary" onclick="closeDetailModal()" style="padding: 10px 24px;">
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
                <td colspan="7" style="text-align: center; padding: 40px;">
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
