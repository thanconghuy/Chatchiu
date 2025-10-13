/**
 * Admin Tools - Fetch and Import Data
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    init();
})();

// State
let fetchedConversions = null;
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

// Conversions
const convStartDate = document.getElementById('convStartDate');
const convEndDate = document.getElementById('convEndDate');
const fetchConversionsBtn = document.getElementById('fetchConversionsBtn');
const convResult = document.getElementById('convResult');
const convCount = document.getElementById('convCount');

// Manual Sync
const syncBtn = document.getElementById('syncBtn');
const syncResult = document.getElementById('syncResult');

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
    if (user && user.username) {
        userName.textContent = user.username;
    }

    // Set default dates (last 7 days)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    txEndDate.value = formatDateInput(today);
    txStartDate.value = formatDateInput(lastWeek);
    convEndDate.value = formatDateInput(today);
    convStartDate.value = formatDateInput(lastWeek);

    setupEventListeners();
}

/**
 * Format date for input field (DD/MM/YYYY)
 */
function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
}

/**
 * Parse date from DD/MM/YYYY format to Date object
 */
function parseDateInput(dateStr) {
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) {
        throw new Error('Invalid date format. Use dd/mm/yyyy');
    }
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Month is 0-indexed
    const year = parseInt(parts[2]);

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
        throw new Error('Invalid date format. Use dd/mm/yyyy');
    }

    return new Date(year, month, day);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    fetchTransactionsBtn.addEventListener('click', fetchTransactions);
    fetchConversionsBtn.addEventListener('click', fetchConversions);
    syncBtn.addEventListener('click', manualSync);
    importBtn.addEventListener('click', importData);

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
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
 * Fetch conversions from AccessTrade API
 */
async function fetchConversions() {
    try {
        fetchConversionsBtn.disabled = true;
        fetchConversionsBtn.textContent = 'Đang tải...';
        convResult.classList.add('empty');
        convResult.textContent = 'Đang tải dữ liệu...';

        const startDate = parseDateInput(convStartDate.value).toISOString();
        const endDate = parseDateInput(convEndDate.value).toISOString();

        const response = await apiRequest(`/admin/fetch-conversions?since=${startDate}&until=${endDate}`);

        if (response.success) {
            fetchedConversions = response.data;
            displayConversions(response.data);
            checkImportReady();
            showToast(`Loaded ${response.data.length} conversions`, 'success');
        }
    } catch (error) {
        console.error('Error fetching conversions:', error);
        convResult.classList.add('empty');
        convResult.innerHTML = `<span style="color: var(--danger);">Error: ${error.message}</span>`;
        showToast('Failed to fetch conversions', 'error');
    } finally {
        fetchConversionsBtn.disabled = false;
        fetchConversionsBtn.textContent = 'Lấy Conversions';
    }
}

/**
 * Display transactions
 */
function displayTransactions(transactions) {
    if (transactions.length === 0) {
        txResult.classList.add('empty');
        txResult.textContent = 'Không có transactions nào';
        txCount.textContent = '0';
        return;
    }

    txResult.classList.remove('empty');
    txResult.innerHTML = transactions.slice(0, 10).map(tx => `
        <div class="result-item">
            <strong>ID:</strong> ${tx._id}<br>
            <strong>Merchant:</strong> ${tx.merchant_name}<br>
            <strong>Amount:</strong> ${tx.billing ? formatCurrency(parseFloat(tx.billing)) : '0đ'}<br>
            <strong>Status:</strong> ${tx.status || 'N/A'}
        </div>
    `).join('');

    if (transactions.length > 10) {
        txResult.innerHTML += `<div style="text-align: center; padding: 8px; color: var(--gray-600);">... và ${transactions.length - 10} transactions nữa</div>`;
    }

    txCount.textContent = transactions.length;
}

/**
 * Display conversions
 */
function displayConversions(conversions) {
    if (conversions.length === 0) {
        convResult.classList.add('empty');
        convResult.textContent = 'Không có conversions nào';
        convCount.textContent = '0';
        return;
    }

    convResult.classList.remove('empty');
    convResult.innerHTML = conversions.slice(0, 10).map(conv => `
        <div class="result-item">
            <strong>ID:</strong> ${conv._id}<br>
            <strong>Merchant:</strong> ${conv.merchant_name || conv.merchant_id}<br>
            <strong>Commission:</strong> ${conv.commission ? formatCurrency(parseFloat(conv.commission)) : '0đ'}<br>
            <strong>Status:</strong> ${conv.status || 'N/A'}<br>
            <strong>aff_sid:</strong> ${conv.aff_sid || conv.sub_id || 'N/A'}
        </div>
    `).join('');

    if (conversions.length > 10) {
        convResult.innerHTML += `<div style="text-align: center; padding: 8px; color: var(--gray-600);">... và ${conversions.length - 10} conversions nữa</div>`;
    }

    convCount.textContent = conversions.length;
}

/**
 * Check if import button should be enabled
 */
function checkImportReady() {
    if (fetchedConversions && fetchedConversions.length > 0) {
        importBtn.disabled = false;
    } else {
        importBtn.disabled = true;
    }
}

/**
 * Import data to database
 */
async function importData() {
    if (!fetchedConversions || fetchedConversions.length === 0) {
        showToast('Vui lòng lấy conversions trước', 'error');
        return;
    }

    if (!confirm(`Bạn muốn import ${fetchedConversions.length} conversions vào database?\n\nHệ thống sẽ tự động:\n- Lọc trùng theo accesstrade_id\n- Match với clicks để tìm user\n- Tính cashback và cập nhật balance`)) {
        return;
    }

    try {
        importBtn.disabled = true;
        importBtn.textContent = '⏳ Đang import...';
        importResult.className = 'import-result';
        importResult.textContent = '';

        const response = await apiRequest('/admin/import-conversions', {
            method: 'POST',
            body: JSON.stringify({
                conversions: fetchedConversions
            })
        });

        if (response.success) {
            const result = response.result;

            importResult.className = 'import-result success';
            importResult.innerHTML = `
                <h3>✅ Import Thành Công!</h3>
                <div style="margin-top: 12px;">
                    <strong>Tổng:</strong> ${result.total}<br>
                    <strong>Đã tạo mới:</strong> ${result.created} conversions<br>
                    <strong>Đã cập nhật:</strong> ${result.updated} conversions<br>
                    <strong>Bỏ qua (trùng):</strong> ${result.skipped} conversions<br>
                    <strong>Lỗi:</strong> ${result.errors} conversions
                </div>
                ${result.details && result.details.length > 0 ? `
                    <div style="margin-top: 16px;">
                        <strong>Chi tiết:</strong>
                        <div style="max-height: 200px; overflow-y: auto; margin-top: 8px;">
                            ${result.details.slice(0, 20).map(detail => `
                                <div class="result-item ${detail.status}">
                                    <strong>${detail.status === 'created' ? '✓ Mới' : detail.status === 'skipped' ? '⊘ Trùng' : '✗ Lỗi'}:</strong>
                                    Order ${detail.orderId} ${detail.reason ? `(${detail.reason})` : ''}
                                </div>
                            `).join('')}
                            ${result.details.length > 20 ? `<div style="text-align: center; padding: 8px;">... và ${result.details.length - 20} items nữa</div>` : ''}
                        </div>
                    </div>
                ` : ''}
            `;

            showToast('Import completed successfully!', 'success');

            // Clear fetched data
            fetchedConversions = null;
            checkImportReady();
        }
    } catch (error) {
        console.error('Error importing data:', error);
        importResult.className = 'import-result error';
        importResult.innerHTML = `
            <h3>❌ Import Thất Bại</h3>
            <div style="margin-top: 12px;">
                ${error.message || 'Unknown error occurred'}
            </div>
        `;
        showToast('Failed to import data', 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.textContent = '📥 Nạp Dữ Liệu Vào Database';
    }
}

/**
 * Manual sync conversions from AccessTrade
 */
async function manualSync() {
    if (!confirm('Đồng bộ conversions từ AccessTrade API (7 ngày gần nhất)?')) {
        return;
    }

    try {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Đang đồng bộ...';
        syncResult.className = 'import-result';
        syncResult.textContent = '';

        const response = await apiRequest('/admin/sync-conversions', {
            method: 'POST'
        });

        if (response.success) {
            const { results } = response;

            syncResult.className = 'import-result success';
            syncResult.innerHTML = `
                <h3>✅ Đồng Bộ Thành Công</h3>
                <div style="margin-top: 12px;">
                    <strong>📊 Kết quả:</strong><br>
                    • Tổng conversions: ${results.total}<br>
                    • Tạo mới: <span style="color: #10b981;">${results.created}</span><br>
                    • Cập nhật: <span style="color: #3b82f6;">${results.updated}</span><br>
                    • Bỏ qua: <span style="color: #6b7280;">${results.skipped}</span><br>
                    • Lỗi: <span style="color: #ef4444;">${results.errors}</span>
                </div>
                <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 0.9rem;">
                    💡 <strong>Lưu ý:</strong> Chuyển sang tab Conversions để xem chi tiết
                </div>
            `;
            showToast(`Sync completed: ${results.created} created, ${results.updated} updated`, 'success');
        } else {
            throw new Error(response.message || 'Sync failed');
        }
    } catch (error) {
        console.error('Manual sync error:', error);
        syncResult.className = 'import-result error';
        syncResult.innerHTML = `
            <h3>❌ Đồng Bộ Thất Bại</h3>
            <div style="margin-top: 12px;">
                ${error.message || 'Unknown error occurred'}
            </div>
        `;
        showToast('Failed to sync conversions', 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Đồng Bộ Ngay';
    }
}

// Initialization happens in the async block at the top
