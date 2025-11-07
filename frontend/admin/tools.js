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
        userName.textContent = user.fullName || user.username || user.email;
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

    // Format status badge based on AccessTrade fields
    const getStatusBadge = (conv) => {
        // 4 trạng thái từ AccessTrade:
        // 1. order_reject = 1 → Huỷ
        // 2. is_confirmed = 1 → Đã duyệt (đã đối soát)
        // 3. order_pending != 0 → Chờ duyệt
        // 4. order_approved != 0 + order_pending = 0 → Tạm duyệt (đợi đối soát)

        let statusInfo;

        if (parseInt(conv.order_reject) === 1) {
            statusInfo = { text: 'Huỷ', color: '#ef4444', bg: '#fee2e2' };
        } else if (parseInt(conv.is_confirmed) === 1) {
            statusInfo = { text: 'Đã duyệt', color: '#10b981', bg: '#d1fae5' };
        } else if (parseInt(conv.order_pending) !== 0) {
            statusInfo = { text: 'Chờ duyệt', color: '#f59e0b', bg: '#fef3c7' };
        } else if (parseInt(conv.order_approved) !== 0 && parseInt(conv.order_pending) === 0) {
            statusInfo = { text: 'Tạm duyệt (đợi đối soát)', color: '#0c5460', bg: '#d1ecf1' };
        } else {
            statusInfo = { text: 'Chờ duyệt', color: '#f59e0b', bg: '#fef3c7' };
        }

        return `<span style="background: ${statusInfo.bg}; color: ${statusInfo.color}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${statusInfo.text}</span>`;
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
            showToast('No conversions found', 'info');
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
            showToast(`Sync completed: ${result.created} created, ${result.updated} updated`, 'success');
        } else {
            throw new Error(importResponse.message || 'Import failed');
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
        showToast('Failed to sync conversions: ' + error.message, 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Đồng Bộ Ngay';
    }
}

/**
 * Auto-Sync Configuration
 */

// DOM Elements for auto-sync
const autoSyncToggle = document.getElementById('autoSyncToggle');
const autoSyncToggleLabel = document.getElementById('autoSyncToggleLabel');
const autoSyncSchedule = document.getElementById('autoSyncSchedule');
const autoSyncDays = document.getElementById('autoSyncDays');
const autoSyncStatus = document.getElementById('autoSyncStatus');
const autoSyncLastRun = document.getElementById('autoSyncLastRun');
const autoSyncLastMessage = document.getElementById('autoSyncLastMessage');
const saveAutoSyncBtn = document.getElementById('saveAutoSyncBtn');
const testAutoSyncBtn = document.getElementById('testAutoSyncBtn');
const autoSyncResult = document.getElementById('autoSyncResult');

/**
 * Load auto-sync configuration
 */
async function loadAutoSyncConfig() {
    try {
        console.log('Loading auto-sync config...');
        const response = await apiRequest('/admin/auto-sync/config');
        console.log('Auto-sync config response:', response);

        if (response.success && response.config) {
            const config = response.config;
            console.log('Config loaded:', config);

            // Update UI with config
            autoSyncToggle.checked = config.enabled;
            autoSyncToggleLabel.textContent = config.enabled ? 'Bật' : 'Tắt';
            autoSyncSchedule.value = config.cron_schedule || '0 8 * * *';
            autoSyncDays.value = config.sync_days || 2;

            console.log('Toggle state:', autoSyncToggle.checked);
            console.log('Label text:', autoSyncToggleLabel.textContent);

            // Update status display
            updateAutoSyncStatus(config);
        } else {
            console.warn('No config found in response');
        }
    } catch (error) {
        console.error('Error loading auto-sync config:', error);
        showToast('Lỗi khi load cấu hình auto-sync', 'error');
    }
}

/**
 * Update auto-sync status display
 */
function updateAutoSyncStatus(config) {
    // Update status badge
    if (config.last_run_status === 'running') {
        autoSyncStatus.className = 'status-badge running';
        autoSyncStatus.textContent = 'Đang chạy...';
    } else if (config.last_run_status === 'success') {
        autoSyncStatus.className = 'status-badge success';
        autoSyncStatus.textContent = 'Thành công';
    } else if (config.last_run_status === 'error') {
        autoSyncStatus.className = 'status-badge error';
        autoSyncStatus.textContent = 'Lỗi';
    } else {
        autoSyncStatus.className = 'status-badge idle';
        autoSyncStatus.textContent = 'Chưa chạy';
    }

    // Update last run time
    if (config.last_run_at) {
        const lastRun = new Date(config.last_run_at);
        autoSyncLastRun.textContent = lastRun.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else {
        autoSyncLastRun.textContent = 'Chưa có';
    }

    // Update last message
    if (config.last_run_message) {
        autoSyncLastMessage.textContent = config.last_run_message;
        autoSyncLastMessage.style.display = 'block';
    } else {
        autoSyncLastMessage.style.display = 'none';
    }
}

/**
 * Save auto-sync configuration
 */
async function saveAutoSyncConfig() {
    try {
        const config = {
            enabled: autoSyncToggle.checked,
            cron_schedule: autoSyncSchedule.value.trim(),
            sync_days: parseInt(autoSyncDays.value) || 2
        };

        // Validate cron schedule
        if (!config.cron_schedule) {
            showToast('Vui lòng nhập lịch chạy (cron schedule)', 'error');
            return;
        }

        // Validate sync days
        if (config.sync_days < 1 || config.sync_days > 7) {
            showToast('Số ngày đồng bộ phải từ 1 đến 7', 'error');
            return;
        }

        saveAutoSyncBtn.disabled = true;
        saveAutoSyncBtn.textContent = '⏳ Đang lưu...';

        const response = await apiRequest('/admin/auto-sync/config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (response.success) {
            showToast('Lưu cấu hình thành công!', 'success');

            // Reload config to update UI
            await loadAutoSyncConfig();
        } else {
            throw new Error(response.message || 'Failed to save config');
        }
    } catch (error) {
        console.error('Error saving auto-sync config:', error);
        showToast('Lỗi khi lưu cấu hình: ' + error.message, 'error');
    } finally {
        saveAutoSyncBtn.disabled = false;
        saveAutoSyncBtn.textContent = '💾 Lưu Cấu Hình';
    }
}

/**
 * Test auto-sync now
 */
async function testAutoSync() {
    try {
        const syncDays = parseInt(autoSyncDays.value) || 2;

        if (!confirm(`Chạy test đồng bộ ngay bây giờ?\n\nSẽ đồng bộ ${syncDays} ngày gần nhất từ AccessTrade.`)) {
            return;
        }

        testAutoSyncBtn.disabled = true;
        testAutoSyncBtn.textContent = '⏳ Đang test...';
        autoSyncResult.className = 'import-result';
        autoSyncResult.style.display = 'block';
        autoSyncResult.textContent = 'Đang chạy test sync...';

        const response = await apiRequest('/admin/auto-sync/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sync_days: syncDays
            })
        });

        if (response.success) {
            const result = response.result;

            autoSyncResult.className = 'import-result success';
            autoSyncResult.innerHTML = `
                <h3>✅ Test Thành Công</h3>
                <div style="margin-top: 12px;">
                    <strong>📊 Kết quả:</strong><br>
                    • Tổng conversions: ${result.total}<br>
                    • Tạo mới: <span style="color: #10b981;">${result.created}</span><br>
                    • Cập nhật: <span style="color: #3b82f6;">${result.updated}</span><br>
                    • Bỏ qua: <span style="color: #6b7280;">${result.skipped}</span><br>
                    • Lỗi: <span style="color: #ef4444;">${result.errors}</span>
                </div>
            `;
            showToast('Test sync completed successfully!', 'success');

            // Reload config to update status
            await loadAutoSyncConfig();
        } else {
            throw new Error(response.message || 'Test sync failed');
        }
    } catch (error) {
        console.error('Error testing auto-sync:', error);
        autoSyncResult.className = 'import-result error';
        autoSyncResult.innerHTML = `
            <h3>❌ Test Thất Bại</h3>
            <div style="margin-top: 12px;">
                ${error.message || 'Unknown error occurred'}
            </div>
        `;
        showToast('Failed to test auto-sync: ' + error.message, 'error');
    } finally {
        testAutoSyncBtn.disabled = false;
        testAutoSyncBtn.textContent = '🧪 Test Ngay';
    }
}

// Add event listeners for auto-sync in setupEventListeners()
const originalSetupEventListeners = setupEventListeners;
setupEventListeners = function() {
    originalSetupEventListeners();

    // Auto-sync toggle
    if (autoSyncToggle) {
        autoSyncToggle.addEventListener('change', () => {
            autoSyncToggleLabel.textContent = autoSyncToggle.checked ? 'Bật' : 'Tắt';
        });
    }

    // Save config button
    if (saveAutoSyncBtn) {
        saveAutoSyncBtn.addEventListener('click', saveAutoSyncConfig);
        console.log('✓ Save auto-sync config button listener attached');
    }

    // Test sync button
    if (testAutoSyncBtn) {
        testAutoSyncBtn.addEventListener('click', testAutoSync);
        console.log('✓ Test auto-sync button listener attached');
    }
};

// Load auto-sync config when page loads
const originalInit = init;
init = function() {
    originalInit();
    loadAutoSyncConfig();
};

// Initialization happens in the async block at the top
