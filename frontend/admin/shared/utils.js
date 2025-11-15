/**
 * Shared Utility Functions for Admin Modules
 *
 * Usage: Include this file in all admin pages
 * <script src="shared/utils.js"></script>
 */

/**
 * Format date for display
 */
function formatDate(dateString, includeTime = false) {
    if (!dateString) return '-';

    const date = new Date(dateString);

    if (includeTime) {
        return date.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return date.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
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
 * Format currency (VND)
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0₫';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

/**
 * Format number with thousand separator
 */
function formatNumber(number) {
    if (number === null || number === undefined) return '0';
    return new Intl.NumberFormat('vi-VN').format(number);
}

/**
 * Get default date range (last N days)
 */
function getDefaultDateRange(days = 30) {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - days);

    return {
        from: formatDateForPicker(pastDate),
        to: formatDateForPicker(today)
    };
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Show loading skeleton in table
 */
function showTableSkeleton(tableBody, columnCount, rowCount = 5) {
    const skeletonRows = Array(rowCount).fill(0).map(() => {
        const cells = Array(columnCount).fill(0).map(() =>
            '<td><div class="skeleton skeleton-text"></div></td>'
        ).join('');
        return `<tr class="skeleton-row">${cells}</tr>`;
    }).join('');

    tableBody.innerHTML = skeletonRows;
}

/**
 * Show empty state in table
 */
function showTableEmpty(tableBody, columnCount, message = 'Không có dữ liệu') {
    tableBody.innerHTML = `
        <tr class="empty-state">
            <td colspan="${columnCount}">
                <div style="padding: 60px 20px; text-align: center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 24px; display: block; color: var(--gray-400);">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 style="font-size: 1.25rem; color: var(--gray-700); margin-bottom: 12px; font-weight: 600;">${message}</h3>
                    <p style="font-size: 1rem; color: var(--gray-500);">Thử điều chỉnh bộ lọc hoặc thời gian</p>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Show error state in table
 */
function showTableError(tableBody, columnCount, errorMessage = 'Lỗi tải dữ liệu') {
    tableBody.innerHTML = `
        <tr class="error-state">
            <td colspan="${columnCount}">
                <div style="padding: 60px 20px; text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">❌</div>
                    <h3 style="font-size: 1.25rem; color: var(--danger); margin-bottom: 12px; font-weight: 600;">${errorMessage}</h3>
                    <button onclick="window.location.reload()" class="btn btn-primary">
                        🔄 Tải lại trang
                    </button>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const statusClass = window.ADMIN_CONSTANTS.ORDER_STATUS_CLASS[status] || 'status-pending';
    const statusText = window.ADMIN_CONSTANTS.ORDER_STATUS_TEXT[status] || status;
    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

/**
 * Confirm dialog
 */
function confirmAction(message, title = 'Xác nhận') {
    return confirm(`${title}\n\n${message}`);
}

/**
 * Setup pagination controls
 */
function setupPagination(options) {
    const {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage,
        onPageChange,
        onPageSizeChange
    } = options;

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    const rowsPerPageSelect = document.getElementById('rowsPerPage');

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) onPageChange(currentPage - 1);
        };
    }

    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) onPageChange(currentPage + 1);
        };
    }

    if (pageInfo) {
        pageInfo.textContent = totalItems > 0
            ? `Trang ${currentPage}/${totalPages} (${totalItems} mục)`
            : 'Không có dữ liệu';
    }

    if (rowsPerPageSelect && onPageSizeChange) {
        rowsPerPageSelect.value = itemsPerPage;
        rowsPerPageSelect.onchange = (e) => {
            onPageSizeChange(parseInt(e.target.value));
        };
    }
}

/**
 * Check admin access
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
 * Initialize admin page common setup
 */
async function initAdminPage() {
    // Check auth
    requireAuth();

    // Check admin access
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return false;

    // Display user info
    displayUserName('userName');

    // Setup logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    return true;
}
