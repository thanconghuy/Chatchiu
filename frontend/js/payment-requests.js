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

            // Load cancelled requests separately
            if (currentStatus === 'cancelled') {
                loadCancelledRequests();
            } else {
                loadPaymentRequests();
            }
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

    // Saved payment account selector
    document.getElementById('savedPaymentAccount')?.addEventListener('change', handlePaymentAccountSelect);
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

// Load cancelled payment requests
async function loadCancelledRequests() {
    try {
        showLoading(true);
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const offset = (currentPage - 1) * limit;

        const url = `${API_BASE_URL}/payment-requests/cancelled?limit=${limit}&offset=${offset}`;

        console.log('Loading cancelled requests from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            displayPaymentRequests(result.data, true); // Pass true to indicate cancelled
            updatePagination(result.data.length);
        } else {
            showToast(result.message || 'Không thể tải dữ liệu', 'error');
        }
    } catch (error) {
        console.error('Error loading cancelled requests:', error);
        showToast('Lỗi kết nối', 'error');
    } finally {
        showLoading(false);
    }
}

// Display payment requests (desktop table)
function displayPaymentRequests(requests, isCancelled = false) {
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
            <td>${isCancelled ? getCancelledBadge(req.cancelled_at) : getStatusBadge(req.status, req.resubmitted_at)}</td>
            <td>${req.bank_name}</td>
            <td>${req.bank_account_number}</td>
            <td>${formatDateTime(req.created_at)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    <button class="btn-sm btn-primary" data-action="view-request" data-id="${req.id}" title="Xem chi tiết">
                        <i class="fas fa-eye"></i> Xem
                    </button>
                    ${isCancelled ? `
                        <button class="btn-sm btn-success" data-action="resubmit-request" data-id="${req.id}" title="Gửi lại yêu cầu">
                            <i class="fas fa-redo"></i> Gửi lại
                        </button>
                    ` : req.status === 'pending' ? `
                        <button class="btn-sm btn-danger" data-action="cancel-request" data-id="${req.id}" title="Hủy yêu cầu">
                            <i class="fas fa-times"></i> Hủy
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    // Mobile cards
    cardsContainer.innerHTML = requests.map(req => `
        <div class="payment-card">
            <div class="payment-card-header">
                <div class="payment-card-amount">${formatCurrency(req.requested_amount)}</div>
                ${isCancelled ? getCancelledBadge(req.cancelled_at) : getStatusBadge(req.status, req.resubmitted_at)}
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
                ${req.resubmitted_at ? `
                <div class="payment-card-row">
                    <span class="payment-card-label">Đã gửi lại:</span>
                    <span class="payment-card-value">${formatDateTime(req.resubmitted_at)}</span>
                </div>
                ` : ''}
            </div>
            <div class="payment-card-actions">
                <button class="btn-view" data-action="view-request" data-id="${req.id}">
                    <i class="fas fa-eye"></i> Xem chi tiết
                </button>
                ${isCancelled ? `
                    <button class="btn-resubmit" data-action="resubmit-request" data-id="${req.id}">
                        <i class="fas fa-redo"></i> Gửi lại
                    </button>
                ` : req.status === 'pending' ? `
                    <button class="btn-cancel" data-action="cancel-request" data-id="${req.id}">
                        <i class="fas fa-times"></i> Hủy
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Get status badge HTML
function getStatusBadge(status, resubmittedAt = null) {
    // If resubmitted, show special badge
    if (resubmittedAt && status === 'pending') {
        return `<span class="status-badge status-resubmitted">Đã gửi lại <i class="fas fa-redo"></i></span>`;
    }

    const statusMap = {
        'pending': { text: 'Chờ duyệt', class: 'status-pending' },
        'confirmed': { text: 'Đã xác nhận', class: 'status-confirmed' },
        'paid': { text: 'Đã thanh toán', class: 'status-paid' },
        'rejected': { text: 'Từ chối', class: 'status-rejected' }
    };

    const info = statusMap[status] || { text: status, class: '' };
    return `<span class="status-badge ${info.class}">${info.text}</span>`;
}

// Get cancelled badge with relative time
function getCancelledBadge(cancelledAt) {
    const cancelledDate = new Date(cancelledAt);
    const now = new Date();
    const diffMs = now - cancelledDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let timeAgo = '';
    if (diffDays > 0) {
        timeAgo = `${diffDays} ngày trước`;
    } else if (diffHours > 0) {
        timeAgo = `${diffHours} giờ trước`;
    } else {
        timeAgo = 'Vừa xong';
    }

    return `<span class="status-badge status-cancelled">Đã hủy (${timeAgo})</span>`;
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

    // Load saved payment accounts when opening modal
    loadSavedPaymentAccounts();

    document.getElementById('createRequestModal').classList.add('show');
}

// Close create modal
function closeCreateModal() {
    document.getElementById('createRequestModal').classList.remove('show');
    document.getElementById('createRequestForm').reset();
    // Reset the saved payment account selector
    const selector = document.getElementById('savedPaymentAccount');
    if (selector) {
        selector.value = '';
    }
}

// Load saved payment accounts
async function loadSavedPaymentAccounts() {
    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/user/payment-accounts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success && result.data) {
            populatePaymentAccountSelector(result.data);
        } else {
            console.log('No saved payment accounts found');
        }
    } catch (error) {
        console.error('Error loading saved payment accounts:', error);
        // Non-critical error, don't show toast
    }
}

// Populate payment account selector
function populatePaymentAccountSelector(accounts) {
    const selector = document.getElementById('savedPaymentAccount');
    if (!selector) return;

    // Clear existing options except the first one
    selector.innerHTML = '<option value="">-- Nhập thông tin mới hoặc chọn tài khoản đã lưu --</option>';

    if (accounts.length === 0) {
        selector.innerHTML += '<option value="" disabled>Chưa có tài khoản đã lưu</option>';
        return;
    }

    // Add account options
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = JSON.stringify(account);

        // Format display text based on account type
        let displayText = '';
        const accountTypeIcons = {
            'bank': '🏦',
            'momo': '📱',
            'zalopay': '💳',
            'other': '💰'
        };

        const icon = accountTypeIcons[account.account_type] || '💳';
        const accountTypeName = {
            'bank': 'Ngân hàng',
            'momo': 'MoMo',
            'zalopay': 'ZaloPay',
            'other': 'Khác'
        }[account.account_type] || account.account_type;

        if (account.account_type === 'bank') {
            displayText = `${icon} ${account.bank_name} - ${account.account_number} (${account.account_holder_name})`;
        } else {
            displayText = `${icon} ${accountTypeName} - ${account.account_number} (${account.account_holder_name})`;
        }

        // Add default badge
        if (account.is_default) {
            displayText += ' ⭐ Mặc định';
        }

        option.textContent = displayText;
        selector.appendChild(option);
    });
}

// Handle payment account selection
function handlePaymentAccountSelect(e) {
    const selectedValue = e.target.value;

    if (!selectedValue) {
        // Clear form if no account selected
        return;
    }

    try {
        const account = JSON.parse(selectedValue);

        // Auto-fill form fields
        const form = document.getElementById('createRequestForm');

        if (account.account_type === 'bank') {
            form.bankName.value = account.bank_name || '';
            form.bankAccountNumber.value = account.account_number || '';
            form.bankAccountName.value = account.account_holder_name || '';
            form.bankBranch.value = account.bank_branch || '';
        } else {
            // For non-bank accounts (MoMo, ZaloPay, etc.)
            const accountTypeName = {
                'momo': 'MoMo',
                'zalopay': 'ZaloPay',
                'other': 'Khác'
            }[account.account_type] || account.account_type;

            form.bankName.value = accountTypeName;
            form.bankAccountNumber.value = account.account_number || '';
            form.bankAccountName.value = account.account_holder_name || '';
            form.bankBranch.value = account.bank_branch || '';
        }

        // Show success message
        showToast(`Đã điền thông tin từ tài khoản đã lưu`, 'success');

    } catch (error) {
        console.error('Error parsing selected account:', error);
        showToast('Lỗi khi tải thông tin tài khoản', 'error');
    }
}

// Handle create request
async function handleCreateRequest(e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    // Get payment account ID from selector
    const selectedAccountValue = document.getElementById('savedPaymentAccount')?.value;
    let paymentAccountId = null;
    let bankAccountNumber = formData.get('bankAccountNumber');
    let bankAccountName = formData.get('bankAccountName');

    if (selectedAccountValue) {
        try {
            const selectedAccount = JSON.parse(selectedAccountValue);
            paymentAccountId = selectedAccount.id;

            // Fetch decrypted data from API
            const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const response = await fetch(`${API_BASE_URL}/user/payment-accounts/${selectedAccount.id}/decrypt`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await response.json();
            if (result.success && result.data) {
                // Use decrypted data for payment request
                bankAccountNumber = result.data.account_number_decrypted || result.data.account_number;
                bankAccountName = result.data.account_holder_name_decrypted || result.data.account_holder_name;
                console.log('Using decrypted data:', { bankAccountNumber, bankAccountName });
            } else {
                showToast('Không thể lấy thông tin tài khoản', 'error');
                return;
            }
        } catch (error) {
            console.error('Error fetching decrypted account:', error);
            showToast('Lỗi khi lấy thông tin tài khoản', 'error');
            return;
        }
    }

    const data = {
        requestedAmount: parseFloat(formData.get('requestedAmount')),
        bankName: formData.get('bankName'),
        bankAccountNumber,
        bankAccountName,
        bankBranch: formData.get('bankBranch') || null,
        notes: formData.get('notes') || null,
        paymentAccountId: paymentAccountId
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

    console.log('📋 Payment Request Detail:', request);
    console.log('🔓 Decrypted Account Number:', request.bank_account_number_decrypted);
    console.log('🔓 Decrypted Account Name:', request.bank_account_name_decrypted);
    console.log('🔒 Masked Account Number:', request.bank_account_number);
    console.log('🔒 Masked Account Name:', request.bank_account_name);

    content.innerHTML = `
        <div style="display: grid; gap: 1rem;">
            <div style="padding-bottom: 1rem; border-bottom: 2px solid #f0f0f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                    <h3 style="margin: 0; font-size: 1.25rem;">Yêu cầu #${request.id.substring(0, 8)}</h3>
                    ${getStatusBadge(request.status)}
                </div>
            </div>

            <div style="display: grid; gap: 1rem;">
                <div>
                    <strong style="color: #666;"><i class="fas fa-money-bill-wave"></i> Số tiền yêu cầu:</strong>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #667eea; margin-top: 0.5rem;">
                        ${formatCurrency(request.requested_amount)}
                    </div>
                </div>

                <div>
                    <strong style="color: #666;"><i class="fas fa-university"></i> Thông tin ngân hàng:</strong>
                    <div style="margin-top: 0.75rem; padding: 1.25rem; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="margin-bottom: 0.75rem;">
                            <strong><i class="fas fa-building"></i> Ngân hàng:</strong> <span style="color: #333;">${request.bank_name}</span>
                        </div>
                        <div style="margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <div style="flex: 1;">
                                <strong><i class="fas fa-credit-card"></i> Số tài khoản:</strong>
                                <span style="color: #333; font-family: monospace; font-size: 1.05rem; font-weight: 600;">${request.bank_account_number_decrypted || request.bank_account_number}</span>
                            </div>
                            <button data-action="copy-to-clipboard" data-text="${request.bank_account_number_decrypted || request.bank_account_number}" data-message="Đã copy số tài khoản"
                                    style="padding: 0.4rem 0.75rem; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 0.25rem; transition: transform 0.2s;">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                        <div style="margin-bottom: 0.75rem;">
                            <strong><i class="fas fa-user"></i> Chủ tài khoản:</strong> <span style="color: #333; text-transform: uppercase; font-weight: 600;">${request.bank_account_name_decrypted || request.bank_account_name}</span>
                        </div>
                        ${request.bank_branch ? `
                            <div>
                                <strong><i class="fas fa-map-marker-alt"></i> Chi nhánh:</strong> <span style="color: #333;">${request.bank_branch}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                    <div style="padding: 0.75rem; background: #f8f9fa; border-radius: 8px;">
                        <strong style="color: #666; font-size: 0.9rem;"><i class="fas fa-calendar-plus"></i> Ngày tạo:</strong>
                        <div style="margin-top: 0.25rem; font-weight: 500;">${formatDateTime(request.created_at)}</div>
                    </div>
                    ${request.confirmed_at ? `
                        <div style="padding: 0.75rem; background: #d1ecf1; border-radius: 8px;">
                            <strong style="color: #0c5460; font-size: 0.9rem;"><i class="fas fa-check-circle"></i> Ngày xác nhận:</strong>
                            <div style="margin-top: 0.25rem; font-weight: 500; color: #0c5460;">${formatDateTime(request.confirmed_at)}</div>
                        </div>
                    ` : ''}
                    ${request.paid_at ? `
                        <div style="padding: 0.75rem; background: #d4edda; border-radius: 8px;">
                            <strong style="color: #155724; font-size: 0.9rem;"><i class="fas fa-money-check-alt"></i> Ngày thanh toán:</strong>
                            <div style="margin-top: 0.25rem; font-weight: 500; color: #155724;">${formatDateTime(request.paid_at)}</div>
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

            <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e0e0e0;">
                <button data-action="close-view-modal"
                        style="width: 100%; padding: 0.875rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <i class="fas fa-times-circle"></i> Đóng
                </button>
            </div>
        </div>
    `;
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewRequestModal').classList.remove('show');
}

// Copy to clipboard utility
function copyToClipboard(text, successMessage = 'Đã copy!') {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast(successMessage, 'success');
            })
            .catch(err => {
                console.error('Clipboard API failed:', err);
                fallbackCopyToClipboard(text, successMessage);
            });
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(text, successMessage);
    }
}

// Fallback copy method
function fallbackCopyToClipboard(text, successMessage) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast(successMessage, 'success');
        } else {
            showToast('Không thể copy. Vui lòng copy thủ công.', 'error');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showToast('Không thể copy. Vui lòng copy thủ công.', 'error');
    }

    document.body.removeChild(textArea);
}

// Custom confirm dialog
function showConfirm(message, title = 'Xác nhận') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');

        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.style.display = 'flex';

        function cleanup() {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
        }

        function handleOk() {
            cleanup();
            resolve(true);
        }

        function handleCancel() {
            cleanup();
            resolve(false);
        }

        function handleBackdrop(e) {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        }

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
    });
}

// Cancel request
async function cancelRequest(id) {
    const confirmed = await showConfirm('Bạn có chắc muốn hủy yêu cầu này?');
    if (!confirmed) {
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

// Resubmit a cancelled payment request
async function resubmitRequest(id) {
    const confirmed = await showConfirm('Bạn có chắc muốn gửi lại yêu cầu này?');
    if (!confirmed) {
        return;
    }

    try {
        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/payment-requests/${id}/resubmit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            showToast('Đã gửi lại yêu cầu thanh toán thành công!', 'success');
            // Switch back to "Tất cả" tab and reload
            currentStatus = '';
            const allTab = document.querySelector('.tab-btn[data-status=""]');
            if (allTab) {
                allTab.click();
            } else {
                loadPaymentRequests();
            }
            loadEligibility();
        } else {
            showToast(result.message || 'Không thể gửi lại yêu cầu', 'error');
        }
    } catch (error) {
        console.error('Error resubmitting request:', error);
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
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-slide-in`;

    // Add icon with circular background
    const icons = {
        'success': '✓',
        'error': '✕',
        'warning': '⚠',
        'info': 'ℹ'
    };

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'toast-icon';
    iconWrapper.textContent = icons[type] || 'ℹ';

    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'toast-message';
    messageWrapper.textContent = message;

    toast.appendChild(iconWrapper);
    toast.appendChild(messageWrapper);

    document.body.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('toast-slide-in');
        toast.classList.add('toast-slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============ CSP FIX: Event Delegation ============
document.addEventListener('click', (e) => {
    const element = e.target.closest('[data-action]');
    if (!element) return;

    // Prevent event bubbling and multiple triggers
    e.preventDefault();
    e.stopPropagation();

    const action = element.dataset.action;
    const text = element.dataset.text;
    const message = element.dataset.message;
    const id = element.dataset.id;

    switch (action) {
        case 'copy-to-clipboard':
            copyToClipboard(text, message);
            break;
        case 'close-view-modal':
            closeViewModal();
            break;
        case 'view-request':
            if (id) viewRequest(id);
            break;
        case 'cancel-request':
            if (id) cancelRequest(id);
            break;
        case 'resubmit-request':
            if (id) resubmitRequest(id);
            break;
    }
});

console.log('[payment-requests.js] CSP-compliant event delegation loaded');
