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

// Update Pending Orders
const updatePendingBtn = document.getElementById('updatePendingBtn');
const updatePendingResult = document.getElementById('updatePendingResult');
const updateLimit = document.getElementById('updateLimit');
const updateOlderThanDays = document.getElementById('updateOlderThanDays');

// Sync Conversion Status
const syncStatusBtn = document.getElementById('syncStatusBtn');
const syncStatusResult = document.getElementById('syncStatusResult');
const syncStartDate = document.getElementById('syncStartDate');
const syncEndDate = document.getElementById('syncEndDate');

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success && response.user) {
            saveAuth(getToken(), response.user);
            if (!response.user.is_admin) {
                showToast('Truy cập bị từ chối: Chỉ dành cho Admin', 'error');
                setTimeout(() => {
                    window.location.href = '../dashboard.html';
                }, 2000);
                return false;
            }
            return true;
        } else {
            throw new Error('Không thể xác thực quyền admin');
        }
    } catch (error) {
        console.error('Admin check error:', error);
        showToast('Truy cập bị từ chối: Chỉ dành cho Admin', 'error');
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

    // Set dates for conversions (this page only has conversions)
    if (convEndDate) convEndDate.value = formatDateForPicker(today);
    if (convStartDate) convStartDate.value = formatDateForPicker(lastWeek);

    // Set dates for sync status
    if (syncEndDate) syncEndDate.value = formatDateForPicker(today);
    if (syncStartDate) syncStartDate.value = formatDateForPicker(lastWeek);

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

    if (updatePendingBtn) {
        updatePendingBtn.addEventListener('click', updatePendingOrders);
        console.log('✓ Update pending orders button listener attached');
    }

    if (syncStatusBtn) {
        syncStatusBtn.addEventListener('click', syncConversionStatus);
        console.log('✓ Sync conversion status button listener attached');
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
 * @param {Date} startDate - Optional start date, defaults to date picker value
 * @param {Date} endDate - Optional end date, defaults to date picker value
 */
async function fetchConversions(startDate = null, endDate = null) {
    try {
        // Use provided dates or get from date pickers
        if (!startDate || !endDate) {
            // Validate inputs
            if (!convStartDate.value || !convEndDate.value) {
                showToast('Vui lòng nhập ngày bắt đầu và kết thúc', 'error');
                return;
            }
            startDate = parseDateInput(convStartDate.value);
            endDate = parseDateInput(convEndDate.value);
        }

        fetchConversionsBtn.disabled = true;
        fetchConversionsBtn.textContent = 'Đang tải...';

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
                importFetchedConversionsBtn.style.display = 'inline-block';
                console.log('✓ Import button shown - data available:', response.data.length);
            } else {
                importFetchedConversionsBtn.style.display = 'none';
                console.log('ℹ Import button hidden - no data');
            }

            showToast(`Đã tải ${response.data.length} đơn hàng`, 'success');
        } else {
            throw new Error(response.message || 'Không thể lấy dữ liệu conversions');
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

    // Format order status badge (pending/approved/rejected)
    // AccessTrade API uses order_approved, order_pending, order_reject instead of status
    const getStatusBadge = (conv) => {
        // Determine status from order counters
        let status = '0'; // Default: Đang xử lý

        if (conv.order_approved && parseInt(conv.order_approved) > 0) {
            status = '1'; // Đã duyệt
        } else if (conv.order_reject && parseInt(conv.order_reject) > 0) {
            status = '2'; // Hủy
        } else if (conv.order_pending && parseInt(conv.order_pending) > 0) {
            status = '0'; // Đang xử lý
        }

        const statusMap = {
            '0': { text: 'Đang xử lý', color: '#f59e0b', bg: '#fef3c7' },
            '1': { text: 'Đã duyệt', color: '#10b981', bg: '#d1fae5' },
            '2': { text: 'Hủy', color: '#ef4444', bg: '#fee2e2' }
        };
        const s = statusMap[status] || { text: 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
        return `<span style="background: ${s.bg}; color: ${s.color}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${s.text}</span>`;
    };

    // Format reconciliation status badge (is_confirmed)
    const getReconciliationBadge = (isConfirmed) => {
        const status = parseInt(isConfirmed ?? 0);
        if (status === 1) {
            return `<span style="background: #d1fae5; color: #10b981; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Đã đối soát</span>`;
        } else {
            return `<span style="background: #fef3c7; color: #f59e0b; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Chưa đối soát</span>`;
        }
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
            <td style="padding: 10px 8px; text-align: center;">${getStatusBadge(conv)}</td>
            <td style="padding: 10px 8px; text-align: center;">${getReconciliationBadge(conv.is_confirmed)}</td>
            <td style="padding: 10px 8px; font-size: 0.8rem;">${formatDateTime(conv.click_time)}</td>
            <td style="padding: 10px 8px; font-size: 0.8rem;">${formatDateTime(conv.sales_time)}</td>
            <td style="padding: 10px 8px;">${conv.utm_source || '-'}</td>
        </tr>
    `).join('');

    tableContainer.style.display = 'block';
    convCount.textContent = conversions.length;
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

            showToast(`Import thành công! Tạo mới: ${result.created}, Cập nhật: ${result.updated}, Bỏ qua: ${result.skipped}`, 'success');

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
            throw new Error(response.message || 'Import thất bại');
        }
    } catch (error) {
        console.error('Error importing conversions:', error);
        showToast('Import thất bại: ' + error.message, 'error');
    } finally {
        importFetchedConversionsBtn.disabled = false;
        importFetchedConversionsBtn.textContent = '📥 Import vào Database';
    }
}

/**
 * Manual sync conversions from AccessTrade (fetch + import for last 7 days)
 */
async function manualSync() {
    if (!confirm('Đồng bộ conversions từ AccessTrade API (7 ngày gần nhất)?\n\nHệ thống sẽ:\n- Lấy conversions từ 7 ngày gần nhất\n- Tự động import vào database\n- Match với clicks để tìm user')) {
        return;
    }

    try {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Đang đồng bộ...';
        syncResult.className = 'import-result';
        syncResult.style.display = 'block';
        syncResult.textContent = 'Đang lấy dữ liệu từ AccessTrade...';

        // Calculate dates for last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        // Fetch conversions from AccessTrade
        const fetchResponse = await apiRequest(`/admin/fetch-conversions?since=${encodeURIComponent(startDate.toISOString())}&until=${encodeURIComponent(endDate.toISOString())}`);

        if (!fetchResponse.success || !fetchResponse.data || fetchResponse.data.length === 0) {
            syncResult.className = 'import-result error';
            syncResult.innerHTML = `
                <h3>⚠️ Không Có Dữ Liệu</h3>
                <div style="margin-top: 12px;">
                    Không tìm thấy conversions nào trong 7 ngày gần nhất
                </div>
            `;
            showToast('Không tìm thấy đơn hàng', 'info');
            return;
        }

        syncResult.textContent = `Đang import ${fetchResponse.data.length} conversions...`;

        // Import to database
        const importResponse = await apiRequest('/admin/import-conversions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversions: fetchResponse.data
            })
        });

        if (importResponse.success) {
            const { result } = importResponse;

            syncResult.className = 'import-result success';
            syncResult.innerHTML = `
                <h3>✅ Đồng Bộ Thành Công</h3>
                <div style="margin-top: 12px;">
                    <strong>📊 Kết quả:</strong><br>
                    • Tổng conversions: ${result.total}<br>
                    • Tạo mới: <span style="color: #10b981;">${result.created}</span><br>
                    • Cập nhật: <span style="color: #3b82f6;">${result.updated}</span><br>
                    • Bỏ qua: <span style="color: #6b7280;">${result.skipped}</span><br>
                    • Lỗi: <span style="color: #ef4444;">${result.errors}</span>
                </div>
                <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 0.9rem;">
                    💡 <strong>Lưu ý:</strong> Chuyển sang tab <strong>Dữ liệu đơn AT</strong> để xem chi tiết
                </div>
            `;
            showToast(`Đồng bộ hoàn tất: Tạo mới ${result.created}, Cập nhật ${result.updated}`, 'success');
        } else {
            throw new Error(importResponse.message || 'Import thất bại');
        }
    } catch (error) {
        console.error('Manual sync error:', error);
        syncResult.className = 'import-result error';
        syncResult.innerHTML = `
            <h3>❌ Đồng Bộ Thất Bại</h3>
            <div style="margin-top: 12px;">
                ${error.message || 'Đã xảy ra lỗi không xác định'}
            </div>
        `;
        showToast('Đồng bộ conversions thất bại: ' + error.message, 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Đồng Bộ Ngay';
    }
}

/**
 * Update pending orders from AccessTrade
 */
async function updatePendingOrders() {
    const limit = parseInt(updateLimit.value) || 50;
    const olderThanDays = parseInt(updateOlderThanDays.value) || 1;

    if (!confirm(`Cập nhật status cho ${limit} đơn pending cũ hơn ${olderThanDays} ngày?\n\nLưu ý:\n- Rate limit: 10 requests/phút\n- Thời gian ước tính: ~${Math.ceil(limit / 10)} phút\n- Tự động cập nhật balance khi status thay đổi`)) {
        return;
    }

    // Initialize progress bar
    const progressBar = new ProgressBar('updatePendingResult');

    try {
        updatePendingBtn.disabled = true;
        updatePendingBtn.textContent = '⏳ Đang cập nhật...';
        progressBar.showLoading('Đang quét và cập nhật đơn pending...');

        const response = await apiRequest('/admin/update-pending-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                limit: limit,
                olderThanDays: olderThanDays
            })
        });

        if (response.success) {
            const { results } = response;

            const successContent = `
                <div style="margin-top: 12px;">
                    <strong>📊 Kết quả:</strong><br>
                    • Tổng đơn đã kiểm tra: ${results.total}<br>
                    • Đã cập nhật status: <span style="color: #10b981; font-weight: 700;">${results.updated}</span><br>
                    • Không thay đổi: <span style="color: #6b7280;">${results.unchanged}</span><br>
                    • Lỗi: <span style="color: #ef4444;">${results.errors}</span>
                </div>
                ${results.details && results.details.length > 0 ? `
                    <div style="margin-top: 16px;">
                        <strong>Chi tiết cập nhật:</strong>
                        <div style="max-height: 300px; overflow-y: auto; margin-top: 8px;">
                            ${results.details.filter(d => d.status === 'updated').slice(0, 20).map(detail => `
                                <div class="result-item" style="border-left-color: #10b981;">
                                    <strong>✓ ${detail.orderId}:</strong>
                                    <span style="color: #f59e0b;">${detail.oldStatus}</span> →
                                    <span style="color: #10b981;">${detail.newStatus}</span>
                                    ${detail.cashbackAmount ? ` (${formatCurrency(detail.cashbackAmount)})` : ''}
                                </div>
                            `).join('')}
                            ${results.details.filter(d => d.status === 'updated').length > 20 ?
                                `<div style="text-align: center; padding: 8px;">... và ${results.details.filter(d => d.status === 'updated').length - 20} đơn nữa</div>` : ''}
                        </div>
                    </div>
                ` : ''}
                <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 0.9rem;">
                    💡 <strong>Lưu ý:</strong> User balance đã được tự động cập nhật cho các đơn approved
                </div>
            `;

            progressBar.showSuccess('Cập Nhật Thành Công', successContent);
            showToast(`Đã cập nhật ${results.updated} đơn hàng thành công`, 'success');
        } else {
            throw new Error(response.message || 'Cập nhật thất bại');
        }
    } catch (error) {
        console.error('Update pending orders error:', error);
        progressBar.showError('Cập Nhật Thất Bại', error.message || 'Đã xảy ra lỗi không xác định');
        showToast('Cập nhật đơn pending thất bại: ' + error.message, 'error');
    } finally {
        updatePendingBtn.disabled = false;
        updatePendingBtn.textContent = '⏰ Cập Nhật Đơn Pending';
    }
}

/**
 * Sync Conversion Status from AccessTrade API
 */
async function syncConversionStatus() {
    // Initialize progress bar
    const progressBar = new ProgressBar('syncStatusResult');

    try {
        // Validate dates
        if (!syncStartDate.value || !syncEndDate.value) {
            showToast('Vui lòng chọn khoảng thời gian', 'error');
            return;
        }

        // Disable button and show loading progress
        syncStatusBtn.disabled = true;
        syncStatusBtn.textContent = '⏳ Đang đồng bộ...';
        progressBar.showLoading('Đang đồng bộ trạng thái từ AccessTrade API...');

        const response = await apiRequest('/admin/sync-conversion-status', {
            method: 'POST',
            body: JSON.stringify({
                startDate: syncStartDate.value,
                endDate: syncEndDate.value
            })
        });

        if (response.success) {
            const { results } = response;

            // Format dates for display
            const startDateFormatted = new Date(syncStartDate.value).toLocaleDateString('vi-VN');
            const endDateFormatted = new Date(syncEndDate.value).toLocaleDateString('vi-VN');

            const successContent = `
                <div style="margin-top: 12px; padding: 12px; background: #dbeafe; border-radius: 6px;">
                    <strong>📅 Khoảng thời gian:</strong> ${startDateFormatted} - ${endDateFormatted}<br>
                    <strong>✅ Đã đồng bộ thành công:</strong> <span style="color: #10b981; font-weight: 700; font-size: 1.1rem;">${results.updated} đơn hàng</span>
                </div>
                <div style="margin-top: 12px;">
                    <strong>📊 Chi tiết xử lý:</strong><br>
                    • Tổng đơn từ AT API: ${results.total}<br>
                    • Đã cập nhật: <span style="color: #10b981; font-weight: 700;">${results.updated}</span><br>
                    • Bỏ qua (không thay đổi): <span style="color: #6b7280;">${results.skipped}</span><br>
                    • Lỗi: <span style="color: #ef4444;">${results.errors}</span>
                </div>
                ${results.details && results.details.filter(d => d.status === 'updated').length > 0 ? `
                    <div style="margin-top: 16px;">
                        <strong>Chi tiết cập nhật:</strong>
                        <div style="max-height: 300px; overflow-y: auto; margin-top: 8px;">
                            ${results.details.filter(d => d.status === 'updated').slice(0, 10).map(detail => `
                                <div class="result-item" style="border-left-color: #10b981;">
                                    <strong>✓ Order ${detail.order_id}:</strong><br>
                                    ${Object.keys(detail.changes).map(key => {
                                        const oldVal = detail.old_values[key];
                                        const newVal = detail.changes[key];
                                        return `<span style="font-size: 0.85rem; color: #6b7280;">
                                            ${key}: <span style="color: #f59e0b;">${oldVal}</span> →
                                            <span style="color: #10b981;">${newVal}</span>
                                        </span>`;
                                    }).join('<br>')}
                                </div>
                            `).join('')}
                            ${results.details.filter(d => d.status === 'updated').length > 10 ?
                                `<div style="text-align: center; padding: 8px; color: #6b7280;">... và ${results.details.filter(d => d.status === 'updated').length - 10} đơn nữa</div>` : ''}
                        </div>
                    </div>
                ` : ''}
                <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 0.9rem;">
                    💡 <strong>Lưu ý:</strong> Dữ liệu đã được cập nhật theo trạng thái mới nhất từ AccessTrade
                </div>
            `;

            // Show success with progress bar component
            progressBar.showSuccess('Đồng Bộ Thành Công', successContent);
            showToast(`Đã đồng bộ ${results.updated} đơn hàng`, 'success');
        } else {
            throw new Error(response.message || 'Sync failed');
        }
    } catch (error) {
        console.error('Sync conversion status error:', error);
        progressBar.showError('Đồng Bộ Thất Bại', error.message || 'Unknown error occurred');
        showToast('Đồng bộ thất bại: ' + error.message, 'error');
    } finally {
        syncStatusBtn.disabled = false;
        syncStatusBtn.textContent = '🔄 Đồng Bộ Trạng Thái';
    }
}

// Initialization happens in the async block at the top
