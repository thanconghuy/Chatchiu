// Check authentication
requireAuth();

// State
let currentPage = 1;
let currentLimit = 20;
let currentFilters = {
    period: 'month',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    search: ''
};

// Initialize pagination component
const paginator = new Pagination({
    containerId: 'paginationContainer',
    itemsPerPage: currentLimit,
    onPageChange: (page, itemsPerPage) => {
        currentPage = page;
        currentLimit = itemsPerPage;
        loadData();
    },
    pageSizeOptions: [10, 20, 50, 100]
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeYearFilter();
    setCurrentMonthYear();
    loadSummary();
    loadData();

    // Period filter change handler
    document.getElementById('periodFilter').addEventListener('change', handlePeriodChange);

    // Filter actions
    document.querySelector('[data-action="apply-filters"]')?.addEventListener('click', applyFilters);
    document.querySelector('[data-action="reset-filters"]')?.addEventListener('click', resetFilters);
    document.querySelector('[data-action="export-csv"]')?.addEventListener('click', exportCSV);

    // Modal close
    document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);
    document.getElementById('userDetailModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'userDetailModal') {
            closeModal();
        }
    });

    // Event delegation for view buttons
    document.getElementById('dataTableBody')?.addEventListener('click', (e) => {
        const button = e.target.closest('[data-action="view-detail"]');
        if (button) {
            const userId = button.dataset.userId;
            if (userId) {
                viewUserDetail(userId);
            }
        }
    });
});

/**
 * Initialize year filter dropdown
 */
function initializeYearFilter() {
    const yearFilter = document.getElementById('yearFilter');
    const currentYear = new Date().getFullYear();

    // Generate years from 2020 to current year + 1
    for (let year = currentYear + 1; year >= 2020; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Năm ${year}`;
        if (year === currentYear) {
            option.selected = true;
        }
        yearFilter.appendChild(option);
    }
}

/**
 * Set current month and year
 */
function setCurrentMonthYear() {
    const currentMonth = new Date().getMonth() + 1;
    document.getElementById('monthFilter').value = currentMonth;
}

/**
 * Handle period filter change
 */
function handlePeriodChange() {
    const period = document.getElementById('periodFilter').value;

    // Show/hide relevant filters
    document.getElementById('monthFilterGroup').style.display = period === 'month' ? 'block' : 'none';
    document.getElementById('quarterFilterGroup').style.display = period === 'quarter' ? 'block' : 'none';
    document.getElementById('startDateGroup').style.display = period === 'custom' ? 'block' : 'none';
    document.getElementById('endDateGroup').style.display = period === 'custom' ? 'block' : 'none';
}

/**
 * Load summary statistics
 */
async function loadSummary() {
    try {
        const params = new URLSearchParams({
            period: currentFilters.period,
            year: currentFilters.year
        });

        if (currentFilters.period === 'month' && currentFilters.month) {
            params.append('month', currentFilters.month);
        } else if (currentFilters.period === 'quarter' && currentFilters.quarter) {
            params.append('quarter', currentFilters.quarter);
        } else if (currentFilters.period === 'custom' && currentFilters.start_date && currentFilters.end_date) {
            params.append('start_date', currentFilters.start_date);
            params.append('end_date', currentFilters.end_date);
        }

        const result = await apiRequest(`/admin/payment-stats/summary?${params}`);

        if (result.success) {
            const data = result.data;

            document.getElementById('totalUsers').textContent = formatNumber(data.total_users);
            document.getElementById('totalAmount').textContent = formatCurrency(data.total_amount_paid);
            document.getElementById('totalRequests').textContent = formatNumber(data.total_requests);
            document.getElementById('avgPerUser').textContent = formatCurrency(data.avg_amount_per_user);
        }

    } catch (error) {
        console.error('Error loading summary:', error);
        showToast('Không thể tải thống kê tổng quan', 'error');
    }
}

/**
 * Load user data table
 */
async function loadData() {
    try {
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-spin"></i><div>Đang tải...</div></td></tr>';

        const params = new URLSearchParams({
            period: currentFilters.period,
            year: currentFilters.year,
            page: currentPage,
            limit: currentLimit
        });

        if (currentFilters.period === 'month' && currentFilters.month) {
            params.append('month', currentFilters.month);
        } else if (currentFilters.period === 'quarter' && currentFilters.quarter) {
            params.append('quarter', currentFilters.quarter);
        } else if (currentFilters.period === 'custom' && currentFilters.start_date && currentFilters.end_date) {
            params.append('start_date', currentFilters.start_date);
            params.append('end_date', currentFilters.end_date);
        }

        if (currentFilters.search) {
            params.append('search', currentFilters.search);
        }

        const result = await apiRequest(`/admin/payment-stats/users?${params}`);

        if (result.success) {
            renderDataTable(result.data);
            paginator.update(result.pagination.total, result.pagination.page);
        }

    } catch (error) {
        console.error('Error loading data:', error);
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>Lỗi khi tải dữ liệu</div></td></tr>';
        showToast('Không thể tải dữ liệu', 'error');
    }
}

/**
 * Render data table
 */
function renderDataTable(data) {
    const tbody = document.getElementById('dataTableBody');

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <div><strong>Chưa có dữ liệu</strong></div>
                    <small>Không có thanh toán nào trong kỳ này</small>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.full_name || '-')}</td>
            <td>${escapeHtml(row.phone || '-')}</td>
            <td class="text-right amount">${formatCurrency(row.total_paid)}</td>
            <td class="text-center">${formatNumber(row.total_requests)}</td>
            <td class="text-right">${formatCurrency(row.avg_per_request)}</td>
            <td class="text-center">${formatDate(row.first_payment_date)}</td>
            <td class="text-center">${formatDate(row.last_payment_date)}</td>
            <td class="text-center">
                <button class="view-btn" data-action="view-detail" data-user-id="${row.user_id}">
                    <i class="fas fa-eye"></i> Xem
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * View user detail
 */
async function viewUserDetail(userId) {
    try {
        const params = new URLSearchParams({
            period: currentFilters.period === 'custom' ? 'month' : currentFilters.period,
            year: currentFilters.year
        });

        const result = await apiRequest(`/admin/payment-stats/user/${userId}?${params}`);

        if (result.success) {
            renderUserDetailModal(result.data);
            document.getElementById('userDetailModal').style.display = 'block';
        }

    } catch (error) {
        console.error('Error loading user detail:', error);
        showToast('Không thể tải chi tiết user', 'error');
    }
}

/**
 * Render user detail modal
 */
function renderUserDetailModal(data) {
    const { user, summary, breakdown } = data;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="user-info">
            <div class="info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${escapeHtml(user.email)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Họ Tên</div>
                <div class="info-value">${escapeHtml(user.full_name || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Số Điện Thoại</div>
                <div class="info-value">${escapeHtml(user.phone || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Tổng Requests</div>
                <div class="info-value">${formatNumber(summary.total_requests)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Tổng Tiền</div>
                <div class="info-value amount">${formatCurrency(summary.total_paid)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Trung Bình/Request</div>
                <div class="info-value">${formatCurrency(summary.avg_per_request)}</div>
            </div>
        </div>

        <h3 style="margin: 24px 0 16px 0; font-size: 1rem; color: #374151;">
            <i class="fas fa-chart-line"></i> Chi Tiết Theo Kỳ
        </h3>

        <div class="table-container breakdown-table">
            <table class="table">
                <thead>
                    <tr>
                        <th>Kỳ</th>
                        <th class="text-center">Số Requests</th>
                        <th class="text-right">Tổng Tiền</th>
                        <th class="text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${breakdown.map(period => `
                        <tr>
                            <td>${formatPeriodDate(period.period_date, currentFilters.period)}</td>
                            <td class="text-center">${formatNumber(period.request_count)}</td>
                            <td class="text-right amount">${formatCurrency(period.total_amount)}</td>
                            <td class="text-center">
                                <button class="view-btn" data-action="view-requests" data-requests='${JSON.stringify(period.requests)}'>
                                    <i class="fas fa-list"></i> Chi tiết
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Add event listener for view requests buttons
    modalBody.querySelectorAll('[data-action="view-requests"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const requests = JSON.parse(e.target.closest('button').dataset.requests);
            showRequestsDetail(requests);
        });
    });
}

/**
 * Show requests detail
 */
function showRequestsDetail(requests) {
    const html = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 16px; padding: 16px; background: #f9fafb; border-radius: 8px;">
            <h4 style="margin: 0 0 12px 0; font-size: 0.875rem; color: #374151;">Chi Tiết Requests</h4>
            <table class="table">
                <thead>
                    <tr>
                        <th>Ngày</th>
                        <th class="text-right">Số Tiền</th>
                        <th>Ngân Hàng</th>
                        <th>Số TK</th>
                    </tr>
                </thead>
                <tbody>
                    ${requests.map(req => `
                        <tr>
                            <td>${formatDateTime(req.paid_at)}</td>
                            <td class="text-right amount">${formatCurrency(req.amount)}</td>
                            <td>${escapeHtml(req.bank_name || '-')}</td>
                            <td>${escapeHtml(req.account_number || '-')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Append to modal body
    const modalBody = document.getElementById('modalBody');
    const existingDetail = modalBody.querySelector('.requests-detail');
    if (existingDetail) {
        existingDetail.remove();
    }

    const div = document.createElement('div');
    div.className = 'requests-detail';
    div.innerHTML = html;
    modalBody.appendChild(div);
}

/**
 * Apply filters
 */
function applyFilters() {
    const period = document.getElementById('periodFilter').value;
    const year = document.getElementById('yearFilter').value;
    const month = document.getElementById('monthFilter').value;
    const quarter = document.getElementById('quarterFilter').value;
    const search = document.getElementById('searchFilter').value;
    const startDate = document.getElementById('startDateFilter').value;
    const endDate = document.getElementById('endDateFilter').value;

    currentFilters = {
        period,
        year,
        search
    };

    if (period === 'month') {
        currentFilters.month = month;
    } else if (period === 'quarter') {
        currentFilters.quarter = quarter;
    } else if (period === 'custom') {
        currentFilters.start_date = startDate;
        currentFilters.end_date = endDate;
    }

    currentPage = 1;
    loadSummary();
    loadData();
}

/**
 * Reset filters
 */
function resetFilters() {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    document.getElementById('periodFilter').value = 'month';
    document.getElementById('monthFilter').value = currentMonth;
    document.getElementById('yearFilter').value = currentYear;
    document.getElementById('searchFilter').value = '';
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';

    handlePeriodChange();

    currentFilters = {
        period: 'month',
        month: currentMonth,
        year: currentYear,
        search: ''
    };

    currentPage = 1;
    loadSummary();
    loadData();
}

/**
 * Export to CSV
 */
function exportCSV() {
    const params = new URLSearchParams({
        period: currentFilters.period,
        year: currentFilters.year
    });

    if (currentFilters.period === 'month' && currentFilters.month) {
        params.append('month', currentFilters.month);
    } else if (currentFilters.period === 'quarter' && currentFilters.quarter) {
        params.append('quarter', currentFilters.quarter);
    } else if (currentFilters.period === 'custom' && currentFilters.start_date && currentFilters.end_date) {
        params.append('start_date', currentFilters.start_date);
        params.append('end_date', currentFilters.end_date);
    }

    if (currentFilters.search) {
        params.append('search', currentFilters.search);
    }

    const token = localStorage.getItem('token');
    window.open(`/api/admin/payment-stats/export?${params}&token=${token}`, '_blank');

    showToast('Đang export CSV...', 'info');
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('userDetailModal').style.display = 'none';
}

/**
 * Utility Functions
 */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

function formatNumber(num) {
    if (!num && num !== 0) return '-';
    return new Intl.NumberFormat('vi-VN').format(num);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN');
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPeriodDate(dateString, period) {
    if (!dateString) return '-';
    const date = new Date(dateString);

    if (period === 'month') {
        return `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`;
    } else if (period === 'quarter') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Quý ${quarter}/${date.getFullYear()}`;
    } else {
        return `Năm ${date.getFullYear()}`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 600;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
