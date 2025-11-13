/**
 * Admin Transactions Management
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    init();
})();

// State
let fetchedTransactions = null;

// DOM Elements
const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');

// Transactions
const txStartDate = document.getElementById('txStartDate');
const txEndDate = document.getElementById('txEndDate');
const fetchTransactionsBtn = document.getElementById('fetchTransactionsBtn');
const txResult = document.getElementById('txResult');
const txCount = document.getElementById('txCount');

// Import
const importBtn = document.getElementById('importBtn');
const importResult = document.getElementById('importResult');

/**
 * Check if user is admin
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
 * Initialize
 */
function init() {
    const user = getUser();
    if (user) {
        displayUserName('userName');
    }

    // Set default dates (last 7 days)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    txEndDate.value = formatDateForPicker(today);
    txStartDate.value = formatDateForPicker(lastWeek);

    setupEventListeners();
}

/**
 * Format date for date picker input (YYYY-MM-DD)
 */
function formatDateForPicker(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parse date from date picker (YYYY-MM-DD) to Date object
 */
function parseDateInput(dateStr) {
    if (!dateStr) {
        throw new Error('Date is required');
    }
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
    }
    return date;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    logoutBtn.addEventListener('click', logout);
    fetchTransactionsBtn.addEventListener('click', fetchTransactions);
    importBtn.addEventListener('click', importData);
}

/**
 * Fetch transactions from AccessTrade API
 */
async function fetchTransactions() {
    try {
        fetchTransactionsBtn.disabled = true;
        fetchTransactionsBtn.textContent = 'Đang tải...';
        txResult.classList.add('empty');
        txResult.textContent = 'Đang tải dữ liệu...';

        const startDate = parseDateInput(txStartDate.value).toISOString();
        const endDate = parseDateInput(txEndDate.value).toISOString();

        const response = await apiRequest(`/admin/fetch-transactions?since=${startDate}&until=${endDate}`);

        if (response.success) {
            fetchedTransactions = response.data;
            displayTransactions(response.data);
            checkImportReady();
            showToast(`Loaded ${response.data.length} transactions`, 'success');
        }
    } catch (error) {
        console.error('Error fetching transactions:', error);
        txResult.classList.add('empty');
        txResult.innerHTML = `<span style="color: var(--danger);">Error: ${error.message}</span>`;
        showToast('Failed to fetch transactions', 'error');
    } finally {
        fetchTransactionsBtn.disabled = false;
        fetchTransactionsBtn.textContent = 'Lấy Transactions';
    }
}

/**
 * Display transactions
 */
function displayTransactions(transactions) {
    txResult.classList.remove('empty');
    txCount.textContent = transactions.length;

    if (transactions.length === 0) {
        txResult.classList.add('empty');
        txResult.textContent = 'Không có transactions nào trong khoảng thời gian này';
        return;
    }

    // Create a simple list view
    const html = transactions.slice(0, 10).map(tx => {
        return `
            <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid var(--primary);">
                <div><strong>ID:</strong> ${tx._id}</div>
                <div><strong>Time:</strong> ${new Date(tx.time * 1000).toLocaleString('vi-VN')}</div>
                ${tx.type ? `<div><strong>Type:</strong> ${tx.type}</div>` : ''}
            </div>
        `;
    }).join('');

    const moreText = transactions.length > 10
        ? `<div style="text-align: center; margin-top: 12px; color: var(--gray-600);">... và ${transactions.length - 10} transactions khác</div>`
        : '';

    txResult.innerHTML = html + moreText;
}

/**
 * Check if import is ready
 */
function checkImportReady() {
    const hasData = fetchedTransactions && fetchedTransactions.length > 0;
    importBtn.disabled = !hasData;
}

/**
 * Import data to database
 */
async function importData() {
    if (!fetchedTransactions || fetchedTransactions.length === 0) {
        showToast('No data to import', 'error');
        return;
    }

    try {
        importBtn.disabled = true;
        importBtn.textContent = 'Đang import...';
        importResult.className = 'import-result';
        importResult.textContent = 'Processing...';

        const response = await apiRequest('/admin/import-transactions', 'POST', {
            transactions: fetchedTransactions
        });

        if (response.success) {
            const { result } = response;
            importResult.className = 'import-result success';
            importResult.innerHTML = `
                <h3>✅ Import Successful!</h3>
                <div style="margin-top: 12px;">
                    <div><strong>Total:</strong> ${result.total}</div>
                    <div><strong>New:</strong> ${result.created || result.new || 0}</div>
                    <div><strong>Duplicates:</strong> ${result.skipped || result.duplicates || 0}</div>
                    ${result.errors > 0 ? `<div><strong>Errors:</strong> ${result.errors}</div>` : ''}
                </div>
            `;
            showToast('Import completed successfully', 'success');

            // Reset state
            fetchedTransactions = null;
            checkImportReady();
        } else {
            throw new Error(response.message || 'Import failed');
        }
    } catch (error) {
        console.error('Import error:', error);
        importResult.className = 'import-result error';
        importResult.innerHTML = `
            <h3>❌ Import Failed</h3>
            <div style="margin-top: 12px;">${error.message}</div>
        `;
        showToast('Import failed', 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.textContent = '📥 Nạp Dữ Liệu Vào Database';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
