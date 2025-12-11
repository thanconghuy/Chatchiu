// Admin Payment Requests Management - v20251209
console.log('[Payment Requests] Script loaded - v20251209 - CSP compliant');
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3007/api'
    : '/api';

// Use CONFIG from config.js for consistent storage keys
const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
    TOKEN: 'cashback_token',
    USER: 'cashback_user'
};

let currentPage = 1;
let limit = 20;
let currentFilters = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
        window.location.href = '/admin';
        return;
    }

    // Check admin role
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
    if (!user.is_admin) {
        alert('Access denied - Admin only');
        window.location.href = '/';
        return;
    }

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    loadStats();
    loadPaymentRequests();
});

function setupEventListeners() {
    // Pagination
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadPaymentRequests();
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        currentPage++;
        loadPaymentRequests();
    });

    // Search and Reset buttons
    document.getElementById('searchBtn').addEventListener('click', loadPaymentRequests);
    document.getElementById('resetBtn').addEventListener('click', resetFilters);

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.modal;
            if (modalId) closeModal(modalId);
        });
    });

    document.querySelectorAll('.btn-cancel-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.modal;
            if (modalId) closeModal(modalId);
        });
    });

    // Forms
    document.getElementById('confirmForm').addEventListener('submit', handleConfirm);
    document.getElementById('rejectForm').addEventListener('submit', handleReject);
    document.getElementById('paidForm').addEventListener('submit', handlePaid);
}

// Load statistics
async function loadStats() {
    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
            displayStats(result.data);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Display statistics
function displayStats(stats) {
    document.getElementById('pendingCount').textContent = stats.pending_count;
    document.getElementById('pendingAmount').textContent = formatCurrency(stats.total_pending);

    document.getElementById('confirmedCount').textContent = stats.confirmed_count;
    document.getElementById('confirmedAmount').textContent = formatCurrency(stats.total_confirmed);

    document.getElementById('paidCount').textContent = stats.paid_count;
    document.getElementById('paidAmount').textContent = formatCurrency(stats.total_paid);

    document.getElementById('rejectedCount').textContent = stats.rejected_count;
    document.getElementById('rejectedAmount').textContent = '—';

    document.getElementById('cancelledCount').textContent = stats.cancelled_count || 0;
    document.getElementById('cancelledAmount').textContent = formatCurrency(stats.total_cancelled || 0);
}

// Load payment requests
async function loadPaymentRequests() {
    try {
        showLoading(true);
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const offset = (currentPage - 1) * limit;

        // Build query parameters
        const params = new URLSearchParams({
            limit: limit,
            offset: offset
        });

        // Add filters
        const status = document.getElementById('statusFilter').value;
        if (status) params.append('status', status);

        const fromDate = document.getElementById('fromDate').value;
        if (fromDate) params.append('fromDate', fromDate);

        const toDate = document.getElementById('toDate').value;
        if (toDate) params.append('toDate', toDate);

        const userFilter = document.getElementById('userFilter').value;
        if (userFilter) params.append('userFilter', userFilter);

        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/list?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
            displayPaymentRequests(result.data);
            updatePagination(result.data.length);
        } else {
            showToast(result.message || 'Không thể tải dữ liệu', 'error');
        }
    } catch (error) {
        console.error('Error loading payment requests:', error);
        showToast('Lỗi kết nối', 'error');
    } finally {
        showLoading(false);
    }
}

// Display payment requests
function displayPaymentRequests(requests) {
    const tableBody = document.getElementById('requestsTable');

    if (requests.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem;">
                    Không có yêu cầu thanh toán nào
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = requests.map(req => `
        <tr>
            <td><code>${req.id.substring(0, 8)}</code></td>
            <td>
                <div style="font-weight: 600;">${req.user_name || 'N/A'}</div>
                <div style="font-size: 12px; color: #666;">${req.user_email || ''}</div>
            </td>
            <td><strong style="color: #667eea;">${formatCurrency(req.requested_amount)}</strong></td>
            <td>
                ${getStatusBadge(req.status, req.cancelled_at)}
                ${req.cancelled_at ? `<div style="font-size: 11px; color: #999; margin-top: 4px;">${formatDateTime(req.cancelled_at)}</div>` : ''}
            </td>
            <td>${req.bank_name}</td>
            <td>${req.bank_account_number}</td>
            <td>${formatDateTime(req.created_at)}</td>
            <td>
                <div class="action-dropdown" id="dropdown-${req.id}">
                    <button class="action-dropdown-btn" data-action="toggle-dropdown" data-id="${req.id}">
                        ⚙️ Thao tác <span style="font-size: 10px;">▼</span>
                    </button>
                    <div class="action-dropdown-menu">
                        <button class="action-dropdown-item view" data-action="view" data-id="${req.id}">
                            👁️ Xem
                        </button>
                        ${!req.cancelled_at && req.status === 'pending' ? `
                            <button class="action-dropdown-item approve" data-action="approve" data-id="${req.id}">
                                ✅ Duyệt
                            </button>
                            <button class="action-dropdown-item reject" data-action="reject" data-id="${req.id}">
                                ❌ Từ chối
                            </button>
                        ` : ''}
                        ${!req.cancelled_at && req.status === 'confirmed' ? `
                            <button class="action-dropdown-item paid" data-action="paid" data-id="${req.id}">
                                💰 Đã thanh toán
                            </button>
                        ` : ''}
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

// Get status badge
function getStatusBadge(status, cancelledAt = null) {
    const statusMap = {
        'pending': { text: 'Chờ duyệt', class: 'status-pending' },
        'confirmed': { text: 'Đã xác nhận', class: 'status-confirmed' },
        'paid': { text: 'Đã thanh toán', class: 'status-paid' },
        'rejected': { text: 'Từ chối', class: 'status-rejected' },
        'cancelled': { text: 'Đã hủy', class: 'status-cancelled' }
    };

    // If cancelled_at is set, show as cancelled regardless of status
    if (cancelledAt) {
        return `<span class="status-badge status-cancelled">Đã hủy</span>`;
    }

    const info = statusMap[status] || { text: status, class: '' };
    return `<span class="status-badge ${info.class}">${info.text}</span>`;
}

// Update pagination
function updatePagination(count) {
    document.getElementById('pageInfo').textContent = `Trang ${currentPage}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = count < limit;
}

// Show loading
function showLoading(show) {
    const tableBody = document.getElementById('requestsTable');
    if (show) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem;">
                    <div class="loading">Đang tải...</div>
                </td>
            </tr>
        `;
    }
}

// Reset filters
function resetFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    document.getElementById('userFilter').value = '';
    currentPage = 1;
    loadPaymentRequests();
}

// View request detail
async function viewRequest(id) {
    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
            console.log('Payment request detail:', result.data);
            displayRequestDetail(result.data);
            openModal('viewModal');
        } else {
            showToast(result.message || 'Không thể tải chi tiết', 'error');
        }
    } catch (error) {
        console.error('Error loading request detail:', error);
        showToast('Lỗi kết nối', 'error');
    }
}

// Display request detail
function displayRequestDetail(request) {
    const content = document.getElementById('detailContent');

    console.log('🔐 [ADMIN] Payment request detail:', request);
    console.log('🔓 Decrypted account number:', request.bank_account_number_decrypted);
    console.log('🔓 Decrypted account name:', request.bank_account_name_decrypted);
    console.log('🔒 Masked account number:', request.bank_account_number);
    console.log('🔒 Masked account name:', request.bank_account_name);

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <div class="info-label" style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">Trạng thái</div>
                <div>${getStatusBadge(request.status)}</div>
            </div>
            <div>
                <div class="info-label" style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">Số tiền yêu cầu</div>
                <div style="color: #667eea; font-weight: 700; font-size: 1.3em;">${formatCurrency(request.requested_amount)}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; font-size: 0.85rem; padding: 0.75rem; background: #f8f9fa; border-radius: 6px; margin-bottom: 1rem;">
            <div><strong>Ngày tạo:</strong> ${formatDateTime(request.created_at)}</div>
            ${request.confirmed_at ? `<div><strong>Ngày xác nhận:</strong> ${formatDateTime(request.confirmed_at)}</div>` : ''}
            ${request.paid_at ? `<div><strong>Ngày thanh toán:</strong> ${formatDateTime(request.paid_at)}</div>` : ''}
            ${request.rejected_at ? `<div><strong>Ngày từ chối:</strong> ${formatDateTime(request.rejected_at)}</div>` : ''}
            ${request.cancelled_at ? `<div><strong>Ngày hủy:</strong> ${formatDateTime(request.cancelled_at)}</div>` : ''}
            ${request.resubmitted_at ? `<div><strong>Ngày gửi lại:</strong> ${formatDateTime(request.resubmitted_at)}</div>` : ''}
        </div>

        <div style="margin-bottom: 1rem;">
            <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Thông tin User</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.85rem; color: #666;">Họ tên / Username</div>
                    <div style="font-weight: 600;">${request.full_name || 'N/A'} • ${request.username || 'N/A'}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: #666;">Email</div>
                    <div style="font-weight: 600;">${request.email || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 1rem;">
            <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Thông tin ngân hàng</h4>
            <div style="background: #f8f9fa; padding: 0.875rem; border-radius: 6px; border: 2px solid #667eea;">
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 0.85rem; color: #667eea; font-weight: 600;">Ngân hàng:</div>
                    <div style="font-size: 1em; font-weight: 600;">${request.bank_name}</div>
                </div>
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 0.85rem; color: #667eea; font-weight: 600;">Số tài khoản:</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <code style="font-size: 1.05em; background: white; padding: 0.4rem 0.7rem; border-radius: 4px; color: #000; font-weight: 700; letter-spacing: 0.5px;">
                            ${request.bank_account_number_decrypted || request.bank_account_number}
                        </code>
                        <button class="btn-copy-account" data-text="${request.bank_account_number_decrypted || request.bank_account_number}"
                                style="padding: 0.4rem 0.7rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; font-weight: 600;">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    ${request.last_decrypted_at ? `
                        <small style="color: #999; font-style: italic; margin-top: 4px; display: block; font-size: 0.75rem;">
                            <i class="fas fa-eye"></i> Xem lần cuối: ${formatDateTime(request.last_decrypted_at)} • Số lần: ${request.decrypt_count || 0}
                        </small>
                    ` : ''}
                </div>
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.85rem; color: #667eea; font-weight: 600;">Chủ tài khoản:</div>
                    <div style="font-size: 1em; text-transform: uppercase; font-weight: 700;">${request.bank_account_name_decrypted || request.bank_account_name}</div>
                </div>
                ${request.bank_branch ? `
                    <div>
                        <div style="font-size: 0.85rem; color: #667eea; font-weight: 600;">Chi nhánh:</div>
                        <div style="font-size: 0.95em;">${request.bank_branch}</div>
                    </div>
                ` : ''}
            </div>
        </div>

        ${request.transaction_reference ? `
            <div style="margin-top: 1rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Mã giao dịch</h4>
                <div class="info-item">
                    <code style="font-size: 0.95rem; color: #667eea; background: #f8f9fa; padding: 0.4rem 0.6rem; border-radius: 4px;">${request.transaction_reference}</code>
                </div>
            </div>
        ` : ''}

        ${request.items && request.items.length > 0 ? `
            <div style="margin-top: 1rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Các đơn hàng thanh toán (${request.items.length})</h4>
                <div class="items-list" style="max-height: 180px; overflow-y: auto;">
                    ${request.items.map(item => `
                        <div class="item-card" style="padding: 0.6rem; margin-bottom: 0.5rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.9em;">
                                <strong>${item.merchant_name}</strong>
                                <strong style="color: #667eea;">${formatCurrency(item.cashback_amount)}</strong>
                            </div>
                            <div style="font-size: 0.8em; color: #666;">
                                ${item.order_code} • ${item.period_label}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${request.notes ? `
            <div style="margin-top: 1rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Ghi chú của User</h4>
                <div style="background: #fff3cd; padding: 0.75rem; border-radius: 6px; border-left: 4px solid #ffc107; font-size: 0.9em;">
                    ${request.notes}
                </div>
            </div>
        ` : ''}

        ${request.admin_notes ? `
            <div style="margin-top: 1rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Ghi chú của Admin</h4>
                <div style="background: #d1ecf1; padding: 0.75rem; border-radius: 6px; border-left: 4px solid #17a2b8; font-size: 0.9em;">
                    ${request.admin_notes}
                </div>
            </div>
        ` : ''}

        ${request.cancellation_reason ? `
            <div style="margin-top: 1rem;">
                <h4 style="margin-bottom: 0.5rem; font-size: 1rem;">Lý do hủy</h4>
                <div style="background: #f8d7da; padding: 0.75rem; border-radius: 6px; border-left: 4px solid #dc3545; font-size: 0.9em;">
                    ${request.cancellation_reason}
                </div>
            </div>
        ` : ''}

        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e0e0e0;">
            <button class="btn-primary btn-close-view-modal" data-modal="viewModal" style="width: 100%;">
                Đóng
            </button>
        </div>
    `;
}

function getLogActionText(action) {
    const actions = {
        'created': 'Tạo yêu cầu',
        'status_changed': 'Thay đổi trạng thái',
        'cancelled': 'Hủy yêu cầu'
    };
    return actions[action] || action;
}

// Show confirm modal
function showConfirmModal(id) {
    document.getElementById('confirmRequestId').value = id;
    document.getElementById('confirmNotes').value = '';
    openModal('confirmModal');
}

// Handle confirm
async function handleConfirm(e) {
    e.preventDefault();

    const id = document.getElementById('confirmRequestId').value;
    const notes = document.getElementById('confirmNotes').value;

    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/${id}/confirm`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ adminNotes: notes })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Đã xác nhận yêu cầu thành công', 'success');
            closeModal('confirmModal');
            loadStats();
            loadPaymentRequests();
        } else {
            showToast(result.message || 'Không thể xác nhận', 'error');
        }
    } catch (error) {
        console.error('Error confirming request:', error);
        showToast('Lỗi kết nối', 'error');
    }
}

// Show reject modal
function showRejectModal(id) {
    document.getElementById('rejectRequestId').value = id;
    document.getElementById('rejectReason').value = '';
    openModal('rejectModal');
}

// Handle reject
async function handleReject(e) {
    e.preventDefault();

    const id = document.getElementById('rejectRequestId').value;
    const reason = document.getElementById('rejectReason').value;

    if (!reason.trim()) {
        showToast('Vui lòng nhập lý do từ chối', 'error');
        return;
    }

    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/${id}/reject`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rejectionReason: reason })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Đã từ chối yêu cầu', 'success');
            closeModal('rejectModal');
            loadStats();
            loadPaymentRequests();
        } else {
            showToast(result.message || 'Không thể từ chối', 'error');
        }
    } catch (error) {
        console.error('Error rejecting request:', error);
        showToast('Lỗi kết nối', 'error');
    }
}

// Show paid modal
function showPaidModal(id) {
    document.getElementById('paidRequestId').value = id;
    document.getElementById('transactionReference').value = '';
    document.getElementById('paidNotes').value = '';
    openModal('paidModal');
}

// Handle paid
async function handlePaid(e) {
    e.preventDefault();

    const id = document.getElementById('paidRequestId').value;
    const transactionReference = document.getElementById('transactionReference').value;
    const notes = document.getElementById('paidNotes').value;

    if (!transactionReference.trim()) {
        showToast('Vui lòng nhập mã giao dịch', 'error');
        return;
    }

    try {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/${id}/paid`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                transactionReference: transactionReference,
                adminNotes: notes
            })
        });

        const result = await response.json();
        if (result.success) {
            showToast('Đã đánh dấu thanh toán thành công', 'success');
            closeModal('paidModal');
            loadStats();
            loadPaymentRequests();
        } else {
            showToast(result.message || 'Không thể cập nhật', 'error');
        }
    } catch (error) {
        console.error('Error marking as paid:', error);
        showToast('Lỗi kết nối', 'error');
    }
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon mapping
    const icons = {
        'success': '✓',
        'error': '✕',
        'warning': '⚠',
        'info': 'ℹ'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || 'ℹ'}</div>
        <div class="toast-message">${message}</div>
    `;

    toast.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        left: auto !important;
        bottom: auto !important;
        width: auto !important;
        height: auto !important;
        padding: 0.75rem 1rem !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        z-index: 10001 !important;
        font-weight: 500;
        font-size: 0.875rem;
        max-width: 320px;
        min-width: 260px;
        word-wrap: break-word;
        display: flex !important;
        align-items: center;
        justify-content: flex-start !important;
        gap: 0.65rem;
        background: ${type === 'success' ? 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)' :
                     type === 'error' ? 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)' :
                     type === 'warning' ? 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)' :
                     'linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%)'};
        color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : type === 'warning' ? '#856404' : '#0c5460'};
        border-left: 5px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Dropdown toggle functions
function toggleDropdown(requestId) {
    const dropdown = document.getElementById(`dropdown-${requestId}`);
    const menu = dropdown.querySelector('.action-dropdown-menu');

    // Close all other dropdowns
    document.querySelectorAll('.action-dropdown.active').forEach(d => {
        if (d.id !== `dropdown-${requestId}`) {
            d.classList.remove('active');
        }
    });

    const isActive = dropdown.classList.toggle('active');

    // Position the dropdown menu using fixed positioning
    if (isActive && menu) {
        const button = dropdown.querySelector('.action-dropdown-btn');
        const rect = button.getBoundingClientRect();

        // Position below the button
        menu.style.top = `${rect.bottom + window.scrollY}px`;

        // Position to align with button, but check if it goes off screen
        const menuWidth = 160; // min-width from CSS
        let leftPosition = rect.left + window.scrollX;

        // If menu would go off right edge, align to right side of button
        if (leftPosition + menuWidth > window.innerWidth) {
            leftPosition = rect.right + window.scrollX - menuWidth;
        }

        menu.style.left = `${leftPosition}px`;
    }
}

function closeDropdown(requestId) {
    const dropdown = document.getElementById(`dropdown-${requestId}`);
    if (dropdown) {
        dropdown.classList.remove('active');
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.action-dropdown.active').forEach(d => {
            d.classList.remove('active');
        });
    }
});

// CSP-compliant event delegation for action buttons
document.addEventListener('click', (e) => {
    // Handle copy account button
    if (e.target.closest('.btn-copy-account')) {
        const btn = e.target.closest('.btn-copy-account');
        const text = btn.dataset.text;
        if (text) {
            copyToClipboard(text, 'Đã copy số tài khoản');
        }
        return;
    }

    // Handle close view modal button
    if (e.target.closest('.btn-close-view-modal')) {
        const btn = e.target.closest('.btn-close-view-modal');
        const modal = btn.dataset.modal;
        if (modal) {
            closeModal(modal);
        }
        return;
    }

    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!id) return;

    e.preventDefault();
    e.stopPropagation();

    switch (action) {
        case 'toggle-dropdown':
            toggleDropdown(id);
            break;
        case 'view':
            viewRequest(id);
            closeDropdown(id);
            break;
        case 'approve':
            showConfirmModal(id);
            closeDropdown(id);
            break;
        case 'reject':
            showRejectModal(id);
            closeDropdown(id);
            break;
        case 'paid':
            showPaidModal(id);
            closeDropdown(id);
            break;
    }
});

// Copy to clipboard function
function copyToClipboard(text, successMessage = 'Đã copy!') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Không thể copy', 'error');
    });
}
