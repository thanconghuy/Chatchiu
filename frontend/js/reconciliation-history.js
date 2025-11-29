// Reconciliation History Page
let currentPage = 0;
const itemsPerPage = 50;
let totalReconciliations = 0;

// Helper function to make API calls with authentication
async function apiCall(url, options = {}) {
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };

    const response = await fetch(`${CONFIG.API_BASE_URL}${url}`, mergedOptions);

    if (response.status === 401) {
        // Unauthorized - redirect to login
        window.location.href = '/login';
        return null;
    }

    return response.json();
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Format datetime
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Get status badge HTML
function getStatusBadge(status) {
    const statusMap = {
        'draft': { label: 'Chờ duyệt', class: 'status-pending', icon: '🕐' },
        'finalized': { label: 'Đã duyệt', class: 'status-approved', icon: '✅' },
        'confirmed': { label: 'Đã duyệt', class: 'status-approved', icon: '✅' },
        'paid': { label: 'Đã thanh toán', class: 'status-approved', icon: '💰' },
        'cancelled': { label: 'Đã hủy', class: 'status-rejected', icon: '❌' }
    };

    const statusInfo = statusMap[status] || { label: status, class: 'status-pending', icon: '❓' };
    return `<span class="status-badge ${statusInfo.class}">${statusInfo.icon} ${statusInfo.label}</span>`;
}

// Load reconciliations
async function loadReconciliations() {
    try {
        const page = currentPage + 1; // API uses 1-based pagination
        const response = await apiCall(`/user/system-reconciliation/reconciliations?page=${page}&limit=${itemsPerPage}`);

        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to load reconciliations');
        }

        const reconciliations = response.data.reconciliations;
        const pagination = response.data.pagination;
        totalReconciliations = pagination?.total || 0;

        displayReconciliations(reconciliations);
        updatePagination();

    } catch (error) {
        console.error('Error loading reconciliations:', error);
        showToast('Không thể tải danh sách đối soát', 'error');
        showEmptyState();
    }
}

// Display reconciliations in table
function displayReconciliations(reconciliations) {
    const tableBody = document.getElementById('reconciliationTable');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');

    if (reconciliations.length === 0) {
        showEmptyState();
        return;
    }

    // Hide empty state, show table
    emptyState.style.display = 'none';
    tableBody.innerHTML = '';
    pagination.style.display = 'flex';

    reconciliations.forEach(rec => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${rec.period_label || 'N/A'}</strong></td>
            <td>${formatDate(rec.period_start)} - ${formatDate(rec.period_end)}</td>
            <td>${rec.item_count || 0}</td>
            <td><strong style="color: #10b981;">${formatCurrency(rec.total_cashback || 0)}</strong></td>
            <td>${getStatusBadge(rec.status)}</td>
            <td>${formatDate(rec.created_at)}</td>
            <td>
                <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.875rem;" onclick="viewDetails('${rec.id}')">
                    👁️ Chi tiết
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Show empty state
function showEmptyState() {
    const tableBody = document.getElementById('reconciliationTable');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');

    tableBody.innerHTML = '';
    emptyState.style.display = 'block';
    pagination.style.display = 'none';
}

// Update pagination controls
function updatePagination() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');

    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = (currentPage + 1) * itemsPerPage >= totalReconciliations;
    pageInfo.textContent = `Trang ${currentPage + 1}`;
}

// View reconciliation details
async function viewDetails(reconciliationId) {
    const modal = document.getElementById('detailsModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');

    modal.style.display = 'block';
    modalBody.innerHTML = '<div class="loading">Đang tải...</div>';

    try {
        const response = await apiCall(`/user/system-reconciliation/reconciliations/${reconciliationId}`);

        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to load details');
        }

        const details = response.data;
        modalTitle.textContent = `Chi tiết: ${details.period_label || 'Kỳ đối soát'}`;

        // Build details HTML
        let html = `
            <div style="margin-bottom: 24px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
                    <div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Số đơn hàng</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #1f2937;">${details.itemCount || 0}</div>
                    </div>
                    <div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #10b981;">
                        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Tổng cashback</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">${formatCurrency(details.totalCashback || 0)}</div>
                    </div>
                    <div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Trạng thái</div>
                        <div style="margin-top: 8px;">${getStatusBadge(details.status)}</div>
                    </div>
                </div>

                <div style="padding: 16px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #92400e; font-size: 0.875rem;">
                        <strong>📅 Khoảng thời gian xác nhận thanh toán:</strong> ${formatDate(details.period_start)} - ${formatDate(details.period_end)}
                    </p>
                </div>
            </div>
        `;

        // Items table
        if (details.items && details.items.length > 0) {
            html += `
                <h4 style="margin: 0 0 16px 0; color: #1f2937;">Danh sách đơn hàng (${details.items.length})</h4>
                <div style="overflow-x: auto; max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead style="background: #f9fafb; position: sticky; top: 0; z-index: 1;">
                            <tr>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Merchant</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Mã đơn</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Giá trị đơn</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Cashback</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Ngày đặt hàng</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Ngày thanh toán</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            details.items.forEach((item, index) => {
                const bgColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';
                html += `
                    <tr style="background: ${bgColor};">
                        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.merchant_name || 'N/A'}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;"><code style="font-size: 0.8rem;">${item.order_code || item.conversion_id || 'N/A'}</code></td>
                        <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatCurrency(item.order_value || 0)}</td>
                        <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;"><strong style="color: #10b981;">${formatCurrency(item.cashback_amount || 0)}</strong></td>
                        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDate(item.order_time)}</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDate(item.approval_time)}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Notes if any
        if (details.notes) {
            html += `
                <div style="margin-top: 20px; padding: 16px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px;">
                    <strong style="color: #1e40af;">📝 Ghi chú:</strong>
                    <p style="margin: 8px 0 0 0; color: #1f2937;">${details.notes}</p>
                </div>
            `;
        }

        modalBody.innerHTML = html;

    } catch (error) {
        console.error('Error loading details:', error);
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <p>Không thể tải chi tiết kỳ đối soát</p>
            </div>
        `;
        showToast('Không thể tải chi tiết', 'error');
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('detailsModal');
    modal.style.display = 'none';
}

// Pagination handlers
document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        loadReconciliations();
    }
});

document.getElementById('nextBtn')?.addEventListener('click', () => {
    if ((currentPage + 1) * itemsPerPage < totalReconciliations) {
        currentPage++;
        loadReconciliations();
    }
});

// Close modal handlers
document.getElementById('closeModal')?.addEventListener('click', closeModal);
document.getElementById('detailsModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') || e.target.id === 'detailsModal') {
        closeModal();
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    loadReconciliations();
});
