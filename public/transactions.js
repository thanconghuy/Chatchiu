// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// DOM Elements
const fetchTransactionsBtn = document.getElementById('fetchTransactionsBtn');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const statusFilter = document.getElementById('statusFilter');
const transactionsTableBody = document.getElementById('transactionsTableBody');
const totalTransactionsEl = document.getElementById('totalTransactions');
const totalCommissionEl = document.getElementById('totalCommission');
const approvedCountEl = document.getElementById('approvedCount');
const holdCountEl = document.getElementById('holdCount');

// Initialize date inputs with default values (last 30 days)
function initializeDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    endDateInput.valueAsDate = today;
    startDateInput.valueAsDate = thirtyDaysAgo;
}

// Format number as currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show loading state
function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const loader = button.querySelector('.loader');

    if (isLoading) {
        button.disabled = true;
        loader.style.display = 'inline-block';
        btnText.textContent = 'Loading...';
    } else {
        button.disabled = false;
        loader.style.display = 'none';
        btnText.textContent = 'Lấy giao dịch';
    }
}

// Get status badge HTML
function getStatusBadge(status) {
    // Status: 0 = hold, 1 = approved, 2 = rejected
    const statusMap = {
        '0': { class: 'status-pending', text: 'Hold' },
        '1': { class: 'status-approved', text: 'Approved' },
        '2': { class: 'status-rejected', text: 'Rejected' }
    };

    const statusStr = String(status);
    const statusInfo = statusMap[statusStr] || { class: 'status-pending', text: status || 'N/A' };
    return `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

// Store transactions data globally for modal
let transactionsData = [];

// Update stats
function updateStats(transactions) {
    let totalTransactions = 0;
    let totalCommission = 0;
    let approvedCount = 0;
    let holdCount = 0;

    if (transactions && transactions.length > 0) {
        totalTransactions = transactions.length;

        transactions.forEach(txn => {
            const commission = parseFloat(txn.commission?.amount || txn.commission || 0);
            totalCommission += commission;

            const status = String(txn.status);
            if (status === '1') {
                approvedCount++;
            } else if (status === '0') {
                holdCount++;
            }
        });
    }

    totalTransactionsEl.textContent = totalTransactions;
    totalCommissionEl.textContent = formatCurrency(totalCommission);
    approvedCountEl.textContent = approvedCount;
    holdCountEl.textContent = holdCount;
}

// Render transactions table
function renderTransactions(transactions) {
    // Store data globally
    transactionsData = transactions || [];

    if (!transactions || transactions.length === 0) {
        transactionsTableBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">
                    <div class="empty-message">
                        <p>📋 Không có dữ liệu</p>
                        <p class="empty-sub">Không tìm thấy giao dịch trong khoảng thời gian này</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const rows = transactions.map((txn, index) => {
        const transactionId = txn.transaction_id || 'N/A';
        const merchant = txn.merchant?.name || txn.merchant_name || 'N/A';
        const transactionTime = txn.transaction_time || 'N/A';
        const clickTime = txn.click_time || 'N/A';
        const commission = parseFloat(txn.commission?.amount || txn.commission || 0);
        const status = txn.status;
        const utmSource = txn.utm_source || 'N/A';

        return `
            <tr data-index="${index}">
                <td>${transactionId}</td>
                <td>${merchant}</td>
                <td>${formatDate(transactionTime)}</td>
                <td>${formatDate(clickTime)}</td>
                <td>${formatCurrency(commission)}</td>
                <td>${getStatusBadge(status)}</td>
                <td>${utmSource}</td>
                <td>
                    <button class="btn-detail" onclick="showTransactionDetail(${index}); event.stopPropagation();">
                        👁️ Xem
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    transactionsTableBody.innerHTML = rows;
}

// Fetch Transactions
async function fetchTransactions() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const status = statusFilter.value;

    if (!startDate || !endDate) {
        alert('Vui lòng chọn ngày bắt đầu và kết thúc');
        return;
    }

    setButtonLoading(fetchTransactionsBtn, true);

    try {
        let url = `${API_BASE_URL}/transactions?start_date=${startDate}&end_date=${endDate}`;
        if (status) {
            url += `&status=${status}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            let transactions = data.data?.data || data.data?.transactions || data.data || [];

            if (!Array.isArray(transactions) && typeof transactions === 'object') {
                transactions = transactions.data || transactions.results || [];
            }

            updateStats(transactions);
            renderTransactions(transactions);

            console.log('Transactions loaded:', transactions.length);
        } else {
            alert(`Lỗi: ${data.message}`);
            updateStats([]);
            renderTransactions([]);
        }
    } catch (error) {
        alert(`Lỗi: ${error.message}`);
        updateStats([]);
        renderTransactions([]);
    } finally {
        setButtonLoading(fetchTransactionsBtn, false);
    }
}

// Modal functionality
const modal = document.getElementById('transactionModal');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close');

// Show transaction detail in modal
function showTransactionDetail(index) {
    const txn = transactionsData[index];
    if (!txn) return;

    const detailHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Transaction ID</div>
                <div class="detail-value">${txn.transaction_id || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Status</div>
                <div class="detail-value">${getStatusBadge(txn.status)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Merchant</div>
                <div class="detail-value">${txn.merchant?.name || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Commission</div>
                <div class="detail-value">${formatCurrency(parseFloat(txn.commission?.amount || 0))}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Transaction Time</div>
                <div class="detail-value">${formatDate(txn.transaction_time)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Click Time</div>
                <div class="detail-value">${formatDate(txn.click_time)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Confirmed</div>
                <div class="detail-value">${txn.is_confirmed ? 'Yes' : 'No'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Device</div>
                <div class="detail-value">${txn.device || 'N/A'}</div>
            </div>
        </div>

        <div class="detail-section">
            <h3>UTM Parameters</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">UTM Source</div>
                    <div class="detail-value">${txn.utm_source || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Medium</div>
                    <div class="detail-value">${txn.utm_medium || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Campaign</div>
                    <div class="detail-value">${txn.utm_campaign || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Content</div>
                    <div class="detail-value">${txn.utm_content || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Product Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Product Name</div>
                    <div class="detail-value">${txn.product_name || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Product Price</div>
                    <div class="detail-value">${formatCurrency(parseFloat(txn.product_price || 0))}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Quantity</div>
                    <div class="detail-value">${txn.quantity || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Additional Info</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Campaign ID</div>
                    <div class="detail-value">${txn.campaign_id || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Publisher ID</div>
                    <div class="detail-value">${txn.publisher_id || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">IP Address</div>
                    <div class="detail-value">${txn.ip || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">User Agent</div>
                    <div class="detail-value" style="word-break: break-all; font-size: 0.85rem;">${txn.user_agent || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Raw Data (JSON)</h3>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem;">${JSON.stringify(txn, null, 2)}</pre>
        </div>
    `;

    modalBody.innerHTML = detailHTML;
    modal.classList.add('show');
}

// Close modal
closeBtn.onclick = function() {
    modal.classList.remove('show');
}

// Close when clicking outside
window.onclick = function(event) {
    if (event.target == modal) {
        modal.classList.remove('show');
    }
}

// Close with ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && modal.classList.contains('show')) {
        modal.classList.remove('show');
    }
});

// Event Listeners
fetchTransactionsBtn.addEventListener('click', fetchTransactions);

// Allow Enter key to trigger fetch
startDateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchTransactions();
});

endDateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchTransactions();
});

// Initialize
initializeDates();
console.log('Transactions page initialized');
console.log('API Base URL:', API_BASE_URL);
