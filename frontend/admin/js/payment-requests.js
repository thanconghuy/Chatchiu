// Admin Payment Requests Management
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3007/api'
    : '/api';

let currentPage = 1;
let limit = 20;
let currentFilters = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/admin';
        return;
    }

    // Check admin role
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
        alert('Access denied');
        window.location.href = '/dashboard';
        return;
    }

    document.getElementById('adminName').textContent = user.full_name || user.email || 'Admin';

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

    // Forms
    document.getElementById('confirmForm').addEventListener('submit', handleConfirm);
    document.getElementById('rejectForm').addEventListener('submit', handleReject);
    document.getElementById('paidForm').addEventListener('submit', handlePaid);
}

// Load statistics
async function loadStats() {
    try {
        const token = localStorage.getItem('token');
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
}

// Load payment requests
async function loadPaymentRequests() {
    try {
        showLoading(true);
        const token = localStorage.getItem('token');
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

        const userId = document.getElementById('userIdFilter').value;
        if (userId) params.append('userId', userId);

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
            <td>${getStatusBadge(req.status)}</td>
            <td>${req.bank_name}</td>
            <td>${req.bank_account_number}</td>
            <td>${formatDateTime(req.created_at)}</td>
            <td>
                <button class="action-btn btn-view" onclick="viewRequest('${req.id}')">
                    👁️ Xem
                </button>
                ${req.status === 'pending' ? `
                    <button class="action-btn btn-confirm" onclick="showConfirmModal('${req.id}')">
                        ✅ Duyệt
                    </button>
                    <button class="action-btn btn-reject" onclick="showRejectModal('${req.id}')">
                        ❌ Từ chối
                    </button>
                ` : ''}
                ${req.status === 'confirmed' ? `
                    <button class="action-btn btn-paid" onclick="showPaidModal('${req.id}')">
                        💰 Đã thanh toán
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// Get status badge
function getStatusBadge(status) {
    const statusMap = {
        'pending': { text: 'Chờ duyệt', class: 'status-pending' },
        'confirmed': { text: 'Đã xác nhận', class: 'status-confirmed' },
        'paid': { text: 'Đã thanh toán', class: 'status-paid' },
        'rejected': { text: 'Từ chối', class: 'status-rejected' }
    };

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
    document.getElementById('userIdFilter').value = '';
    currentPage = 1;
    loadPaymentRequests();
}

// View request detail
async function viewRequest(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/payment-requests/admin/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
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

    content.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Mã yêu cầu</div>
                <div class="info-value">${request.id.substring(0, 8)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Trạng thái</div>
                <div class="info-value">${getStatusBadge(request.status)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Số tiền yêu cầu</div>
                <div class="info-value" style="color: #667eea;">${formatCurrency(request.requested_amount)}</div>
            </div>
        </div>

        <div style="margin-top: 1.5rem;">
            <h4>Thông tin User</h4>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Họ tên</div>
                    <div class="info-value">${request.user_name || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Email</div>
                    <div class="info-value">${request.user_email || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Điện thoại</div>
                    <div class="info-value">${request.user_phone || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div style="margin-top: 1.5rem;">
            <h4>Thông tin ngân hàng</h4>
            <div class="info-item">
                <div style="margin-bottom: 8px;">
                    <strong>Ngân hàng:</strong> ${request.bank_name}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Số tài khoản:</strong> ${request.bank_account_number}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Chủ tài khoản:</strong> ${request.bank_account_name}
                </div>
                ${request.bank_branch ? `
                    <div>
                        <strong>Chi nhánh:</strong> ${request.bank_branch}
                    </div>
                ` : ''}
            </div>
        </div>

        ${request.transaction_reference ? `
            <div style="margin-top: 1.5rem;">
                <h4>Mã giao dịch</h4>
                <div class="info-item">
                    <code style="font-size: 16px; color: #667eea;">${request.transaction_reference}</code>
                </div>
            </div>
        ` : ''}

        ${request.items && request.items.length > 0 ? `
            <div style="margin-top: 1.5rem;">
                <h4>Các đơn hàng thanh toán (${request.items.length})</h4>
                <div class="items-list">
                    ${request.items.map(item => `
                        <div class="item-card">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <strong>${item.merchant_name}</strong>
                                <strong style="color: #667eea;">${formatCurrency(item.cashback_amount)}</strong>
                            </div>
                            <div style="font-size: 13px; color: #666;">
                                ${item.order_code} • ${item.period_label}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${request.logs && request.logs.length > 0 ? `
            <div style="margin-top: 1.5rem;">
                <h4>Lịch sử thay đổi</h4>
                <div class="logs-timeline">
                    ${request.logs.map(log => `
                        <div class="log-item">
                            <div class="log-time">${formatDateTime(log.created_at)}</div>
                            <div class="log-action">${getLogActionText(log.action)} (${log.old_status || 'N/A'} → ${log.new_status || 'N/A'})</div>
                            ${log.performed_by_name ? `<div style="font-size: 12px; color: #999;">Bởi: ${log.performed_by_name}</div>` : ''}
                            ${log.notes ? `<div class="log-notes">${log.notes}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <div style="margin-top: 2rem; padding-top: 1rem; border-top: 2px solid #f0f0f0;">
            <button class="btn-primary" onclick="closeModal('viewModal')" style="width: 100%;">
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
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
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
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#fff3cd'};
        color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#856404'};
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
