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

// DOM Elements
const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');

// Conversions
const convStartDate = document.getElementById('convStartDate');
const convEndDate = document.getElementById('convEndDate');
const fetchConversionsBtn = document.getElementById('fetchConversionsBtn');
const convCount = document.getElementById('convCount');
const importFetchedConversionsBtn = document.getElementById('importFetchedConversionsBtn');

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

    // Set dates for conversions (this page only has conversions)
    if (convEndDate) convEndDate.value = formatDateForPicker(today);
    if (convStartDate) convStartDate.value = formatDateForPicker(lastWeek);

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
    if (fetchConversionsBtn) {
        fetchConversionsBtn.addEventListener('click', fetchConversions);
        console.log('✓ Fetch conversions button listener attached');
    }

    if (importFetchedConversionsBtn) {
        importFetchedConversionsBtn.addEventListener('click', importFetchedConversions);
        console.log('✓ Import fetched conversions button listener attached');
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', manualSync);
        console.log('✓ Manual sync button listener attached');
    }

    if (importBtn) {
        importBtn.addEventListener('click', importData);
        console.log('✓ Import button listener attached');
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
        console.log('✓ Logout button listener attached');
    }
}


/**
 * Fetch conversions from AccessTrade API
 */
async function fetchConversions() {
    try {
        // Validate inputs
        if (!convStartDate.value || !convEndDate.value) {
            showToast('Vui lòng nhập ngày bắt đầu và kết thúc', 'error');
            return;
        }

        fetchConversionsBtn.disabled = true;
        fetchConversionsBtn.textContent = 'Đang tải...';

        const startDate = parseDateInput(convStartDate.value);
        const endDate = parseDateInput(convEndDate.value);

        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);

        console.log('Fetching conversions:', {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

        const response = await apiRequest(`/admin/fetch-conversions?since=${encodeURIComponent(startDate.toISOString())}&until=${encodeURIComponent(endDate.toISOString())}`);

        console.log('Fetch conversions response:', response);

        if (response.success) {
            fetchedConversions = response.data;
            displayConversions(response.data);

            // Show import button if we have data
            if (response.data && response.data.length > 0) {
                importFetchedConversionsBtn.style.display = 'block';
            } else {
                importFetchedConversionsBtn.style.display = 'none';
            }

            showToast(`Loaded ${response.data.length} conversions`, 'success');
        } else {
            throw new Error(response.message || 'Failed to fetch conversions');
        }
    } catch (error) {
        console.error('Error fetching conversions:', error);

        const tableContainer = document.getElementById('conversionsTableContainer');
        if (tableContainer) {
            tableContainer.style.display = 'none';
        }

        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        fetchConversionsBtn.disabled = false;
        fetchConversionsBtn.textContent = 'Lấy Conversions';
    }
}


/**
 * Display conversions in table
 */
function displayConversions(conversions) {
    const tableContainer = document.getElementById('conversionsTableContainer');
    const tableBody = document.getElementById('conversionsTableBody');

    if (conversions.length === 0) {
        tableContainer.style.display = 'none';
        convCount.textContent = '0';
        return;
    }

    // Format status badge
    const getStatusBadge = (status) => {
        const statusMap = {
            '0': { text: 'Pending', color: '#f59e0b', bg: '#fef3c7' },
            '1': { text: 'Approved', color: '#10b981', bg: '#d1fae5' },
            '2': { text: 'Rejected', color: '#ef4444', bg: '#fee2e2' }
        };
        const s = statusMap[status] || { text: 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
        return `<span style="background: ${s.bg}; color: ${s.color}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${s.text}</span>`;
    };

    // Format date
    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    // Render table rows
    tableBody.innerHTML = conversions.map(conv => `
        <tr style="border-bottom: 1px solid #f1f1f1;">
            <td style="padding: 10px 8px;">${conv.order_id || conv._id || '-'}</td>
            <td style="padding: 10px 8px;">${conv.merchant || '-'}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600;">${conv.billing ? formatCurrency(parseFloat(conv.billing)) : '-'}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #10b981;">${conv.pub_commission ? formatCurrency(parseFloat(conv.pub_commission)) : '-'}</td>
            <td style="padding: 10px 8px; text-align: center;">${getStatusBadge(conv.is_confirmed)}</td>
            <td style="padding: 10px 8px; font-size: 0.8rem;">${formatDateTime(conv.click_time)}</td>
            <td style="padding: 10px 8px; font-size: 0.8rem;">${formatDateTime(conv.sales_time)}</td>
            <td style="padding: 10px 8px;">${conv.utm_source || '-'}</td>
        </tr>
    `).join('');

    tableContainer.style.display = 'block';
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
 * Import fetched conversions to database
 */
async function importFetchedConversions() {
    if (!fetchedConversions || fetchedConversions.length === 0) {
        showToast('Không có data để import', 'error');
        return;
    }

    if (!confirm(`Import ${fetchedConversions.length} conversions vào database?\n\nHệ thống sẽ:\n- Lọc trùng theo accesstrade_id\n- Match với clicks để tìm user\n- Tính cashback và cập nhật balance`)) {
        return;
    }

    try {
        importFetchedConversionsBtn.disabled = true;
        importFetchedConversionsBtn.textContent = '⏳ Đang import...';

        console.log('Importing conversions:', fetchedConversions.length);

        const response = await apiRequest('/admin/import-conversions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversions: fetchedConversions
            })
        });

        console.log('Import response:', response);

        if (response.success) {
            const result = response.result;

            showToast(`Import thành công! Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`, 'success');

            // Clear and hide button
            fetchedConversions = null;
            importFetchedConversionsBtn.style.display = 'none';

            // Refresh conversions display
            const tableContainer = document.getElementById('conversionsTableContainer');
            if (tableContainer) {
                tableContainer.style.display = 'none';
            }
            convCount.textContent = '0';
        } else {
            throw new Error(response.message || 'Import failed');
        }
    } catch (error) {
        console.error('Error importing conversions:', error);
        showToast('Failed to import conversions: ' + error.message, 'error');
    } finally {
        importFetchedConversionsBtn.disabled = false;
        importFetchedConversionsBtn.textContent = '📥 Import vào Database';
    }
}

/**
 * Import data to database (old function for manual import section)
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
            headers: {
                'Content-Type': 'application/json'
            },
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
        } else {
            throw new Error(response.message || 'Import failed');
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
