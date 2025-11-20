// Payment Requests Page JavaScript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3007/api'
    : '/api';

let currentPage = 1;
let limit = 20;
let currentStatus = '';
let eligibilityData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    console.log('Token found:', !!token);

    if (!token) {
        console.log('No token, redirecting to login');
        window.location.href = '/login';
        return;
    }

    // Display user name
    const user = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER) || '{}');
    console.log('User:', user);
    document.getElementById('userName').textContent = user.full_name || user.email || 'User';

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    console.log('Loading eligibility and requests...');
    loadEligibility();
    loadPaymentRequests();
});

function setupEventListeners() {
    // Create request button
    document.getElementById('createRequestBtn').addEventListener('click', showCreateModal);

    // Tab buttons for status filter
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentStatus = e.target.dataset.status || '';
            currentPage = 1;
            loadPaymentRequests();
        });
    });

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

    document.getElementById('rowsPerPage').addEventListener('change', (e) => {
        limit = parseInt(e.target.value);
        currentPage = 1;
        loadPaymentRequests();
    });

    // Create request form
    document.getElementById('createRequestForm').addEventListener('submit', handleCreateRequest);
}

// Load user eligibility
async function loadEligibility() {
    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        console.log('Loading eligibility with token:', !!token);

        const response = await fetch(`${API_BASE_URL}/payment-requests/eligibility`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Eligibility response status:', response.status);
        const result = await response.json();
        console.log('Eligibility result:', result);

        if (result.success) {
            eligibilityData = result.data;
            displayEligibility(result.data);
        } else {
            console.error('Eligibility failed:', result.message);
            showToast(result.message || 'Không thể tải thông tin số dư', 'error');
        }
    } catch (error) {
        console.error('Error loading eligibility:', error);
        showToast('Không thể tải thông tin số dư', 'error');
    }
}

// Display eligibility info
function displayEligibility(data) {
    document.getElementById('availableBalance').textContent =
        formatCurrency(data.availableBalance);
    document.getElementById('totalCashback').textContent =
        formatCurrency(data.totalConfirmedCashback);
    document.getElementById('totalRequested').textContent =
        formatCurrency(data.totalRequested);

    const createBtn = document.getElementById('createRequestBtn');
    const reasonsDiv = document.getElementById('ineligibleReasons');
    const reasonsList = document.getElementById('ineligibleReasonsList');

    if (data.isEligible) {
        createBtn.disabled = false;
        reasonsDiv.style.display = 'none';
    } else {
        createBtn.disabled = true;
        reasonsDiv.style.display = 'block';
        reasonsList.innerHTML = data.reasons.map(r => `<li>${r}</li>`).join('');
    }

    // Update max amount in form
    document.getElementById('maxAmount').textContent =
        data.availableBalance.toLocaleString('vi-VN');
    document.getElementById('requestedAmount').max = data.availableBalance;
}

// Load payment requests
async function loadPaymentRequests() {
    try {
        showLoading(true);
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const offset = (currentPage - 1) * limit;

        let url = `${API_BASE_URL}/payment-requests?limit=${limit}&offset=${offset}`;
        if (currentStatus) {
            url += `&status=${currentStatus}`;
        }

        console.log('Loading payment requests from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Payment requests response status:', response.status);
        const result = await response.json();
        console.log('Payment requests result:', result);

        if (result.success) {
            displayPaymentRequests(result.data);
            updatePagination(result.data.length);
        } else {
            console.error('Payment requests failed:', result.message);
            showToast(result.message || 'Không thể tải dữ liệu', 'error');
        }
    } catch (error) {
        console.error('Error loading payment requests:', error);
        showToast('Lỗi kết nối', 'error');
    } finally {
        showLoading(false);
    }
}

// Display payment requests (desktop table)
function displayPaymentRequests(requests) {
    const tableBody = document.getElementById('paymentRequestsTable');
    const cardsContainer = document.getElementById('paymentRequestsCards');

    if (requests.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem;">
                    Chưa có yêu cầu thanh toán nào
                </td>
            </tr>
        `;
        cardsContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                Chưa có yêu cầu thanh toán nào
            </div>
        `;
        return;
    }

    // Desktop table
    tableBody.innerHTML = requests.map(req => `
        <tr>
            <td><code>${req.id.substring(0, 8)}</code></td>
            <td><strong>${formatCurrency(req.requested_amount)}</strong></td>
            <td>${getStatusBadge(req.status)}</td>
            <td>${req.bank_name}</td>
            <td>${req.bank_account_number}</td>
            <td>${formatDateTime(req.created_at)}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="viewRequest('${req.id}')">
                    Xem
                </button>
                ${req.status === 'pending' ? `
                    <button class="btn-sm btn-danger" onclick="cancelRequest('${req.id}')">
                        Hủy
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');

    // Mobile cards
    cardsContainer.innerHTML = requests.map(req => `
        <div class="payment-card">
            <div class="payment-card-header">
                <div class="payment-card-amount">${formatCurrency(req.requested_amount)}</div>
                ${getStatusBadge(req.status)}
            </div>
            <div class="payment-card-body">
                <div class="payment-card-row">
                    <span class="payment-card-label">Ngân hàng:</span>
                    <span class="payment-card-value">${req.bank_name}</span>
                </div>
                <div class="payment-card-row">
                    <span class="payment-card-label">STK:</span>
                    <span class="payment-card-value">${req.bank_account_number}</span>
                </div>
                <div class="payment-card-row">
                    <span class="payment-card-label">Ngày tạo:</span>
                    <span class="payment-card-value">${formatDateTime(req.created_at)}</span>
                </div>
            </div>
            <div class="payment-card-actions">
                <button class="btn-view" onclick="viewRequest('${req.id}')">
                    Xem chi tiết
                </button>
                ${req.status === 'pending' ? `
                    <button class="btn-cancel" onclick="cancelRequest('${req.id}')">
                        Hủy
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Get status badge HTML
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

// Show/hide loading
function showLoading(show) {
    const tableBody = document.getElementById('paymentRequestsTable');
    const cardsContainer = document.getElementById('paymentRequestsCards');

    if (show) {
        tableBody.innerHTML = `
            <tr class="loading-state">
                <td colspan="7"><div class="loading">Đang tải...</div></td>
            </tr>
        `;
        cardsContainer.innerHTML = '<div class="loading">Đang tải...</div>';
    }
}

// Show create modal
function showCreateModal() {
    if (!eligibilityData || !eligibilityData.isEligible) {
        showToast('Bạn chưa đủ điều kiện tạo yêu cầu thanh toán', 'warning');
        return;
    }

    document.getElementById('createRequestModal').classList.add('show');
}

// Close create modal
function closeCreateModal() {
    document.getElementById('createRequestModal').classList.remove('show');
    document.getElementById('createRequestForm').reset();
}

// Handle create request
async function handleCreateRequest(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        requestedAmount: parseFloat(formData.get('requestedAmount')),
        bankName: formData.get('bankName'),
        bankAccountNumber: formData.get('bankAccountNumber'),
        bankAccountName: formData.get('bankAccountName'),
        bankBranch: formData.get('bankBranch') || null,
        notes: formData.get('notes') || null
    };

    // Validate
    if (data.requestedAmount < 100000) {
        showToast('Số tiền tối thiểu là 100,000 VNĐ', 'error');
        return;
    }

    if (eligibilityData && data.requestedAmount > eligibilityData.availableBalance) {
        showToast('Số tiền yêu cầu vượt quá số dư khả dụng', 'error');
        return;
    }

    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast('Tạo yêu cầu thanh toán thành công!', 'success');
            closeCreateModal();
            loadEligibility();
            loadPaymentRequests();
        } else {
            showToast(result.message || 'Không thể tạo yêu cầu', 'error');
        }
    } catch (error) {
        console.error('Error creating request:', error);
        showToast('Lỗi kết nối', 'error');
    }
}

// View request detail
async function viewRequest(id) {
    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            displayRequestDetail(result.data);
            document.getElementById('viewRequestModal').classList.add('show');
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
    const content = document.getElementById('requestDetailContent');

    content.innerHTML = `
        <div style="display: grid; gap: 1rem;">
            <div style="padding-bottom: 1rem; border-bottom: 2px solid #f0f0f0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;">Yêu cầu #${request.id.substring(0, 8)}</h3>
                    ${getStatusBadge(request.status)}
                </div>
            </div>

            <div style="display: grid; gap: 0.75rem;">
                <div>
                    <strong style="color: #666;">Số tiền yêu cầu:</strong>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #667eea; margin-top: 0.25rem;">
                        ${formatCurrency(request.requested_amount)}
                    </div>
                </div>

                <div>
                    <strong style="color: #666;">Thông tin ngân hàng:</strong>
                    <div style="margin-top: 0.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                        <div style="margin-bottom: 0.5rem;">
                            <strong>Ngân hàng:</strong> ${request.bank_name}
                        </div>
                        <div style="margin-bottom: 0.5rem;">
                            <strong>Số tài khoản:</strong> ${request.bank_account_number}
                        </div>
                        <div style="margin-bottom: 0.5rem;">
                            <strong>Chủ tài khoản:</strong> ${request.bank_account_name}
                        </div>
                        ${request.bank_branch ? `
                            <div>
                                <strong>Chi nhánh:</strong> ${request.bank_branch}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <strong style="color: #666;">Ngày tạo:</strong>
                        <div>${formatDateTime(request.created_at)}</div>
                    </div>
                    ${request.confirmed_at ? `
                        <div>
                            <strong style="color: #666;">Ngày xác nhận:</strong>
                            <div>${formatDateTime(request.confirmed_at)}</div>
                        </div>
                    ` : ''}
                    ${request.paid_at ? `
                        <div>
                            <strong style="color: #666;">Ngày thanh toán:</strong>
                            <div>${formatDateTime(request.paid_at)}</div>
                        </div>
                    ` : ''}
                </div>

                ${request.transaction_reference ? `
                    <div>
                        <strong style="color: #666;">Mã giao dịch:</strong>
                        <div style="padding: 0.5rem; background: #e7f3ff; border-radius: 6px; margin-top: 0.25rem;">
                            <code>${request.transaction_reference}</code>
                        </div>
                    </div>
                ` : ''}

                ${request.admin_notes ? `
                    <div>
                        <strong style="color: #666;">Ghi chú từ admin:</strong>
                        <div style="padding: 1rem; background: #fff3cd; border-radius: 8px; margin-top: 0.5rem;">
                            ${request.admin_notes}
                        </div>
                    </div>
                ` : ''}

                ${request.notes ? `
                    <div>
                        <strong style="color: #666;">Ghi chú của bạn:</strong>
                        <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; margin-top: 0.5rem;">
                            ${request.notes}
                        </div>
                    </div>
                ` : ''}

                ${request.items && request.items.length > 0 ? `
                    <div>
                        <strong style="color: #666;">Các đơn hàng được thanh toán (${request.items.length}):</strong>
                        <div style="margin-top: 0.5rem; max-height: 300px; overflow-y: auto;">
                            ${request.items.map(item => `
                                <div style="padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 0.5rem;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <strong>${item.merchant_name}</strong>
                                        <strong style="color: #667eea;">${formatCurrency(item.cashback_amount)}</strong>
                                    </div>
                                    <div style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">
                                        ${item.order_code} • ${item.period_label}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e0e0e0;">
                <button class="btn-primary" onclick="closeViewModal()" style="width: 100%;">
                    Đóng
                </button>
            </div>
        </div>
    `;
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewRequestModal').classList.remove('show');
}

// Cancel request
async function cancelRequest(id) {
    if (!confirm('Bạn có chắc muốn hủy yêu cầu này?')) {
        return;
    }

    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            showToast('Đã hủy yêu cầu thành công', 'success');
            loadEligibility();
            loadPaymentRequests();
        } else {
            showToast(result.message || 'Không thể hủy yêu cầu', 'error');
        }
    } catch (error) {
        console.error('Error canceling request:', error);
        showToast('Lỗi kết nối', 'error');
    }
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
    // Simple toast notification
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
