        // Check authentication
        requireAuth();

        // Auth token
        const token = getToken();

        // Initialize
        document.addEventListener('DOMContentLoaded', async () => {
            displayUserName('userName');

            // Setup event delegation
            setupEventListeners();

            // Load all settings in parallel
            await Promise.all([
                loadSettings(),
                loadPaymentSettings(),
                loadCronJobsStatus()
            ]);

            console.log('✅ All settings loaded successfully');
        });

        // Setup event listeners
        function setupEventListeners() {
            // Event delegation for all buttons
            document.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                // Save buttons
                if (target.classList.contains('btn-save')) {
                    if (target.dataset.action === 'saveRetrySchedule') saveRetrySchedule();
                    else if (target.dataset.action === 'saveApiToken') saveApiToken();
                    else if (target.dataset.action === 'saveApiUrl') saveApiUrl();
                    else if (target.dataset.action === 'saveCommissionSplit') saveCommissionSplit();
                    else if (target.dataset.action === 'saveSyncSchedule') saveSyncSchedule();
                    return;
                }

                // Save days button
                if (target.classList.contains('btn-primary') && target.dataset.action === 'saveSyncDays') {
                    saveSyncDays();
                    return;
                }

                // Secondary buttons (close/cancel)
                if (target.classList.contains('btn-secondary')) {
                    // View sync details
                    if (target.dataset.sessionId) {
                        viewSyncDetails(target.dataset.sessionId);
                        return;
                    }
                    // Close modal
                    if (target.dataset.action === 'closeEditModal') {
                        closeEditModal();
                        return;
                    }
                }

                // Close modal X button
                if (target.dataset.action === 'closeModal') {
                    const modal = target.closest('.modal');
                    if (modal) modal.remove();
                    return;
                }
            });
        }

        // Load all settings
        async function loadSettings() {
            try {
                const response = await apiRequest('/admin/settings');

                if (response.success) {
                    const settings = response.settings;

                    // Update UI
                    updateAutoCronStatus(settings.AUTO_CRON_ENABLED);
                    updateApiModeStatus(settings.USE_ACCESSTRADE_API);

                    document.getElementById('retryScheduleValue').textContent = settings.RETRY_CRON_SCHEDULE || 'Not set';
                    document.getElementById('apiUrlValue').textContent = settings.ACCESSTRADE_API_URL;
                    document.getElementById('commissionSplitValue').textContent = (parseFloat(settings.COMMISSION_SPLIT) * 100) + '%';

                    // Set toggle states
                    document.getElementById('autoCronToggle').checked = settings.AUTO_CRON_ENABLED === 'true';
                    document.getElementById('apiModeToggle').checked = settings.USE_ACCESSTRADE_API === 'true';
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                showToast('Không thể tải cấu hình', 'error');
            }
        }

        // Update auto cron status
        function updateAutoCronStatus(enabled) {
            const statusEl = document.getElementById('autoCronStatus');
            const isEnabled = enabled === 'true';
            statusEl.innerHTML = `<span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}">${isEnabled ? 'Enabled' : 'Disabled'}</span>`;
        }

        // Update API mode status
        function updateApiModeStatus(enabled) {
            const statusEl = document.getElementById('apiModeStatus');
            const isEnabled = enabled === 'true';
            statusEl.innerHTML = `<span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}">${isEnabled ? 'API Mode' : 'DIY Mode'}</span>`;
        }

        // ============ CRON JOBS FUNCTIONS ============

        // Load Cron Jobs Status
        async function loadCronJobsStatus() {
            console.log('🔄 Loading cron jobs status...');

            try {
                const response = await apiRequest('/admin/cron/status');
                console.log('Cron status response:', response);

                if (!response || !response.success) {
                    throw new Error(response?.message || 'Failed to load cron status');
                }

                const status = response.data; // Backend returns data field, not status
                console.log('Cron status data:', status);

                // Update toggle
                document.getElementById('autoCronToggle').checked = status.autoCronEnabled;

                // Update status badge
                updateAutoCronStatus(status.autoCronEnabled ? 'true' : 'false');

                // Update info text
                const infoText = status.isInitialized
                    ? `Đã khởi tạo • ${status.jobsCount} jobs đang chạy`
                    : 'Chưa được khởi tạo';
                document.getElementById('cronJobsInfo').textContent = infoText;

                // Update jobs list
                const jobsList = document.getElementById('cronJobsList');
                if (status.jobsCount > 0) {
                    jobsList.innerHTML = `
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: white; border-bottom: 2px solid var(--gray-300);">
                                    <th style="padding: 8px; text-align: left; font-size: 0.85rem;">Job Name</th>
                                    <th style="padding: 8px; text-align: left; font-size: 0.85rem;">Lịch Trình</th>
                                    <th style="padding: 8px; text-align: center; font-size: 0.85rem;">Trạng Thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${status.jobs.map(job => `
                                    <tr style="border-bottom: 1px solid var(--gray-200);">
                                        <td style="padding: 8px; font-size: 0.9rem;">${formatJobName(job.name)}</td>
                                        <td style="padding: 8px; font-size: 0.85rem; font-family: monospace;">${job.schedule}</td>
                                        <td style="padding: 8px; text-align: center;">
                                            <span style="background: #C6F6D5; color: #22543D; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                                                Running
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                    console.log('✅ Cron jobs list rendered successfully');
                } else {
                    jobsList.innerHTML = `
                        <div style="text-align: center; color: var(--gray-500); padding: 20px;">
                            ⚠️ Không có cron jobs nào đang chạy. Hãy bật "Auto Cron Jobs" ở trên.
                        </div>
                    `;
                    console.log('ℹ️ No cron jobs running');
                }
            } catch (error) {
                console.error('❌ Error loading cron jobs status:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });

                document.getElementById('cronJobsList').innerHTML = `
                    <div style="text-align: center; color: var(--error); padding: 20px;">
                        ❌ Không thể tải trạng thái cron jobs<br>
                        <small style="color: var(--gray-600); margin-top: 8px; display: block;">
                            ${error.message}
                        </small>
                    </div>
                `;
            }
        }

        // Format job name to Vietnamese
        function formatJobName(name) {
            const names = {
                'retry-unmatched': '🔄 Retry Unmatched Clicks',
                'cleanup-expired': '🗑️ Cleanup Expired Clicks',
                'expiring-alert': '⏰ Alert Expiring Clicks',
                'cleanup-activity-logs': '🗑️ Cleanup Activity Logs'
            };
            return names[name] || name;
        }

        // Reload Cron Jobs (restart all jobs without restarting server)
        async function reloadCronJobs() {
            const btn = document.getElementById('reloadCronBtn');
            const originalHtml = btn.innerHTML;

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reloading...';

                const response = await apiRequest('/admin/settings/cron-reload', {
                    method: 'POST'
                });

                if (response.success) {
                    showToast('✅ Cron jobs đã được reload thành công!', 'success');

                    // Reload status after a short delay
                    setTimeout(() => {
                        loadCronJobsStatus();
                    }, 1000);
                } else {
                    showToast(response.message || 'Reload thất bại', 'error');
                }
            } catch (error) {
                console.error('Error reloading cron jobs:', error);
                showToast('❌ Không thể reload cron jobs', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }

        // Toggle auto cron
        document.getElementById('autoCronToggle')?.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            try {
                const response = await apiRequest('/admin/settings/auto-cron', {
                    method: 'POST',
                    body: JSON.stringify({ enabled })
                });

                if (response.success) {
                    updateAutoCronStatus(enabled.toString());
                    showToast(enabled ? '✅ Đã BẬT Auto Cron Jobs' : '⚠️ Đã TẮT Auto Cron Jobs', 'success');

                    // Reload cron jobs status after toggle
                    setTimeout(() => {
                        loadCronJobsStatus();
                    }, 1000);
                } else {
                    e.target.checked = !enabled;
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                e.target.checked = !enabled;
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        });

        // Toggle API mode
        document.getElementById('apiModeToggle')?.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            try {
                const response = await apiRequest('/admin/settings/api-mode', {
                    method: 'POST',
                    body: JSON.stringify({ enabled })
                });

                if (response.success) {
                    updateApiModeStatus(enabled.toString());
                    showToast('Cập nhật thành công. Server cần restart để áp dụng.', 'success');
                } else {
                    e.target.checked = !enabled;
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                e.target.checked = !enabled;
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        });

        // Edit retry schedule
        function editRetrySchedule() {
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            modalTitle.textContent = 'Chỉnh Sửa Lịch Retry';
            modalBody.innerHTML = `
                <div class="form-group">
                    <label for="retrySchedule">Cron Expression</label>
                    <input type="text" id="retrySchedule" placeholder="0 */6 * * *" value="${document.getElementById('retryScheduleValue').textContent}">
                    <small style="color: var(--gray-600); display: block; margin-top: 8px;">
                        Ví dụ: "0 */6 * * *" = mỗi 6 giờ
                    </small>
                </div>
                <button class="btn-save" data-action="saveRetrySchedule">Lưu</button>
                <button class="btn-secondary" data-action="closeEditModal" style="margin-left: 10px;">Hủy</button>
            `;

            document.getElementById('editModal').classList.add('show');
        }

        // Save retry schedule
        async function saveRetrySchedule() {
            const schedule = document.getElementById('retrySchedule').value;

            try {
                const response = await apiRequest('/admin/settings/retry-schedule', {
                    method: 'POST',
                    body: JSON.stringify({ schedule })
                });

                if (response.success) {
                    document.getElementById('retryScheduleValue').textContent = schedule;
                    showToast('Cập nhật thành công', 'success');
                    closeEditModal();
                } else {
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        }

        // Edit API token
        function editApiToken() {
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            modalTitle.textContent = 'Chỉnh Sửa API Token';
            modalBody.innerHTML = `
                <div class="alert-box warning">
                    <p>⚠️ Token này rất quan trọng. Không chia sẻ với người khác.</p>
                </div>
                <div class="form-group">
                    <label for="apiToken">AccessTrade API Token</label>
                    <textarea id="apiToken" placeholder="Nhập API token..." rows="3"></textarea>
                </div>
                <button class="btn-save" data-action="saveApiToken">Lưu</button>
                <button class="btn-secondary" data-action="closeEditModal" style="margin-left: 10px;">Hủy</button>
            `;

            document.getElementById('editModal').classList.add('show');
        }

        // Save API token
        async function saveApiToken() {
            const token = document.getElementById('apiToken').value.trim();

            if (!token) {
                showToast('Vui lòng nhập API token', 'error');
                return;
            }

            try {
                const response = await apiRequest('/admin/settings/api-token', {
                    method: 'POST',
                    body: JSON.stringify({ token })
                });

                if (response.success) {
                    document.getElementById('apiTokenValue').textContent = '••••••••••';
                    showToast('Cập nhật thành công', 'success');
                    closeEditModal();
                } else {
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        }

        // Test AccessTrade API
        async function testAccessTradeAPI() {
            try {
                showToast('Đang test API...', 'info');

                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/settings/test-api`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    }
                });

                const data = await response.json();

                if (data.success) {
                    showToast(`✅ API hoạt động bình thường! Tìm thấy ${data.data?.merchants || 0} merchants`, 'success');
                } else {
                    showToast('❌ API test failed: ' + data.message, 'error');
                }
            } catch (error) {
                console.error('Test API error:', error);
                showToast('❌ Không thể kết nối API: ' + error.message, 'error');
            }
        }

        // Edit API URL
        function editApiUrl() {
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            modalTitle.textContent = 'Chỉnh Sửa API URL';
            modalBody.innerHTML = `
                <div class="form-group">
                    <label for="apiUrl">AccessTrade API URL</label>
                    <input type="text" id="apiUrl" value="${document.getElementById('apiUrlValue').textContent}">
                </div>
                <button class="btn-save" data-action="saveApiUrl">Lưu</button>
                <button class="btn-secondary" data-action="closeEditModal" style="margin-left: 10px;">Hủy</button>
            `;

            document.getElementById('editModal').classList.add('show');
        }

        // Save API URL
        async function saveApiUrl() {
            const url = document.getElementById('apiUrl').value.trim();

            try {
                const response = await apiRequest('/admin/settings/api-url', {
                    method: 'POST',
                    body: JSON.stringify({ url })
                });

                if (response.success) {
                    document.getElementById('apiUrlValue').textContent = url;
                    showToast('Cập nhật thành công', 'success');
                    closeEditModal();
                } else {
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        }

        // Edit commission split
        function editCommissionSplit() {
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            const currentValue = parseFloat(document.getElementById('commissionSplitValue').textContent);

            modalTitle.textContent = 'Chỉnh Sửa Tỷ Lệ Chia Hoa Hồng';
            modalBody.innerHTML = `
                <div class="form-group">
                    <label for="commissionSplit">Phần trăm cho User (%)</label>
                    <input type="number" id="commissionSplit" min="0" max="100" step="1" value="${currentValue}">
                    <small style="color: var(--gray-600); display: block; margin-top: 8px;">
                        Phần còn lại sẽ là của platform. VD: 70% = user nhận 70%, platform nhận 30%
                    </small>
                </div>
                <button class="btn-save" data-action="saveCommissionSplit">Lưu</button>
                <button class="btn-secondary" data-action="closeEditModal" style="margin-left: 10px;">Hủy</button>
            `;

            document.getElementById('editModal').classList.add('show');
        }

        // Save commission split
        async function saveCommissionSplit() {
            const percent = parseFloat(document.getElementById('commissionSplit').value);

            if (percent < 0 || percent > 100) {
                showToast('Giá trị phải từ 0-100%', 'error');
                return;
            }

            const split = percent / 100;

            try {
                const response = await apiRequest('/admin/settings/commission-split', {
                    method: 'POST',
                    body: JSON.stringify({ split })
                });

                if (response.success) {
                    document.getElementById('commissionSplitValue').textContent = percent + '%';
                    showToast('Cập nhật thành công', 'success');
                    closeEditModal();
                } else {
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        }

        // Close edit modal
        function closeEditModal() {
            const modal = document.getElementById('editModal');
            modal.classList.remove('show');
            modal.style.display = 'none'; // Also reset inline style if set
        }

        // ============ PAYMENT SETTINGS FUNCTIONS ============

        // Load payment settings from new API
        async function loadPaymentSettings() {
            try {
                const response = await apiRequest('/system-settings/category/payment');

                if (response.success && response.data) {
                    response.data.forEach(setting => {
                        switch(setting.key) {
                            case 'min_withdrawal_amount':
                                document.getElementById('minWithdrawalValue').textContent =
                                    parseInt(setting.value).toLocaleString('vi-VN') + ' VNĐ';
                                break;
                            case 'max_withdrawal_amount':
                                document.getElementById('maxWithdrawalValue').textContent =
                                    parseInt(setting.value).toLocaleString('vi-VN') + ' VNĐ';
                                break;
                            case 'withdrawal_processing_days':
                                document.getElementById('processingDaysValue').textContent =
                                    setting.value + ' ngày';
                                break;
                        }
                    });
                }
            } catch (error) {
                console.error('Error loading payment settings:', error);
                document.getElementById('minWithdrawalValue').textContent = 'Error';
                document.getElementById('maxWithdrawalValue').textContent = 'Error';
                document.getElementById('processingDaysValue').textContent = 'Error';
            }
        }

        // Edit min withdrawal amount
        async function editMinWithdrawal() {
            const currentValue = await getSetting('min_withdrawal_amount');
            const newValue = prompt('Nhập hạn mức rút tiền tối thiểu (VNĐ):', currentValue);

            if (newValue !== null && !isNaN(newValue) && parseInt(newValue) > 0) {
                const reason = prompt('Lý do thay đổi (tùy chọn):', 'Điều chỉnh hạn mức theo yêu cầu');
                await updateSetting('min_withdrawal_amount', parseInt(newValue), reason);
                await loadPaymentSettings();
            }
        }

        // Edit max withdrawal amount
        async function editMaxWithdrawal() {
            const currentValue = await getSetting('max_withdrawal_amount');
            const newValue = prompt('Nhập hạn mức rút tiền tối đa (VNĐ):', currentValue);

            if (newValue !== null && !isNaN(newValue) && parseInt(newValue) > 0) {
                const reason = prompt('Lý do thay đổi (tùy chọn):', 'Điều chỉnh hạn mức theo yêu cầu');
                await updateSetting('max_withdrawal_amount', parseInt(newValue), reason);
                await loadPaymentSettings();
            }
        }

        // Edit processing days
        async function editProcessingDays() {
            const currentValue = await getSetting('withdrawal_processing_days');
            const newValue = prompt('Nhập số ngày xử lý thanh toán:', currentValue);

            if (newValue !== null && !isNaN(newValue) && parseInt(newValue) > 0) {
                const reason = prompt('Lý do thay đổi (tùy chọn):', 'Điều chỉnh thời gian xử lý');
                await updateSetting('withdrawal_processing_days', parseInt(newValue), reason);
                await loadPaymentSettings();
            }
        }

        // Get setting value
        async function getSetting(key) {
            try {
                const response = await apiRequest(`/system-settings/${key}`);
                return response.success ? response.data.value : null;
            } catch (error) {
                console.error('Error getting setting:', error);
                return null;
            }
        }

        // Update setting
        async function updateSetting(key, value, reason) {
            try {
                const response = await apiRequest(`/system-settings/${key}`, {
                    method: 'PUT',
                    body: JSON.stringify({ value, reason })
                });

                if (response.success) {
                    showToast('Cập nhật thành công!', 'success');
                } else {
                    showToast(response.message || 'Cập nhật thất bại', 'error');
                }
            } catch (error) {
                console.error('Error updating setting:', error);
                showToast('Không thể cập nhật cấu hình', 'error');
            }
        }

        // ============ AUTO-SYNC FUNCTIONS ============

        // Load Auto-Sync configuration
        async function loadAutoSyncConfig() {
            try {
                const response = await apiRequest('/admin/auto-sync/config');

                if (response.success && response.data) {
                    const config = response.data;

                    // Update toggle
                    document.getElementById('autoSyncToggle').checked = config.enabled;
                    document.getElementById('autoSyncEnabledValue').textContent =
                        config.enabled ? 'Đang BẬT ✅' : 'Đang TẮT ❌';

                    // Update schedule
                    const scheduleText = formatCronSchedule(config.cron_schedule);
                    document.getElementById('syncScheduleValue').textContent = scheduleText;

                    // Update sync days
                    document.getElementById('syncDaysValue').textContent = config.sync_days + ' ngày';

                    // Update statistics
                    if (config.last_run_at) {
                        document.getElementById('lastRunTime').textContent = formatDateTime(config.last_run_at);

                        // Status badge
                        let statusHtml = '';
                        if (config.last_run_status === 'success') {
                            statusHtml = '<span style="color: #4CAF50;">✅ Thành công</span>';
                        } else if (config.last_run_status === 'error') {
                            statusHtml = '<span style="color: #f44336;">❌ Lỗi</span>';
                        } else if (config.last_run_status === 'running') {
                            statusHtml = '<span style="color: #FF9800;">⏳ Đang chạy...</span>';
                        } else {
                            statusHtml = '-';
                        }
                        document.getElementById('lastRunStatus').innerHTML = statusHtml;

                        // Format message to Vietnamese
                        const message = config.last_run_message || '-';
                        let formattedMessage = message;

                        // Parse different message formats
                        // Format 1: "Đã import X conversions, Y trùng lặp"
                        const importMatch = message.match(/import (\d+) conversions?, (\d+) trùng lặp/i);

                        // Format 2: "Synced X conversions successfully"
                        const syncMatch = message.match(/Synced (\d+) conversions/i);
                        const duplicatesMatch = message.match(/(\d+) duplicates/i);

                        if (importMatch) {
                            // Already in Vietnamese format
                            formattedMessage = message;
                        } else if (syncMatch) {
                            const imported = syncMatch[1];
                            const duplicates = duplicatesMatch ? duplicatesMatch[1] : 0;
                            formattedMessage = `Đã import ${imported} conversions, ${duplicates} trùng lặp`;
                        } else if (message.includes('successfully')) {
                            formattedMessage = 'Đồng bộ thành công';
                        } else if (message.includes('No conversions')) {
                            formattedMessage = 'Đã import 0 conversions, 0 trùng lặp';
                        }

                        document.getElementById('lastRunMessage').textContent = formattedMessage;
                    } else {
                        document.getElementById('lastRunTime').textContent = 'Chưa chạy lần nào';
                        document.getElementById('lastRunStatus').textContent = '-';
                        document.getElementById('lastRunMessage').textContent = '-';
                    }
                }
            } catch (error) {
                console.error('Error loading auto-sync config:', error);
                showToast('Không thể tải cấu hình auto-sync', 'error');
            }
        }

        // Format cron schedule to human-readable text
        function formatCronSchedule(cron) {
            const schedules = {
                '0 */6 * * *': 'Mỗi 6 giờ',
                '0 */4 * * *': 'Mỗi 4 giờ',
                '0 */3 * * *': 'Mỗi 3 giờ',
                '0 */2 * * *': 'Mỗi 2 giờ',
                '*/30 * * * *': 'Mỗi 30 phút',
                '0 8,14,20 * * *': '3 lần/ngày (8h, 14h, 20h)',
                '0 0 * * *': 'Mỗi ngày lúc 00:00',
                '0 8 * * *': 'Mỗi ngày lúc 08:00'
            };

            // If not in presets, return with "Custom: " prefix
            return schedules[cron] || `⚙️ Tùy Chỉnh: ${cron}`;
        }

        // Format datetime to hh:mm - dd/mm/yyyy
        function formatDateTime(dateStr) {
            const date = new Date(dateStr);

            // Get hours, minutes
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            // Get day, month, year
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();

            return `${hours}:${minutes} - ${day}/${month}/${year}`;
        }

        // Toggle Auto-Sync
        async function toggleAutoSync() {
            const enabled = document.getElementById('autoSyncToggle').checked;

            try {
                const response = await apiRequest('/admin/auto-sync/config', {
                    method: 'POST',
                    body: JSON.stringify({ enabled })
                });

                if (response.success) {
                    showToast(enabled ? 'Đã BẬT Auto-Sync' : 'Đã TẮT Auto-Sync', 'success');
                    await loadAutoSyncConfig();
                } else {
                    throw new Error(response.message);
                }
            } catch (error) {
                console.error('Error toggling auto-sync:', error);
                showToast('Lỗi: ' + error.message, 'error');
                // Revert toggle
                document.getElementById('autoSyncToggle').checked = !enabled;
            }
        }

        // Edit Sync Schedule
        async function editSyncSchedule() {
            // Get current schedule first
            const response = await apiRequest('/admin/auto-sync/config');
            const currentSchedule = response.success ? response.data.cron_schedule : '0 */6 * * *';

            const scheduleOptions = [
                { value: '*/30 * * * *', label: 'Mỗi 30 phút' },
                { value: '0 */2 * * *', label: 'Mỗi 2 giờ' },
                { value: '0 */3 * * *', label: 'Mỗi 3 giờ' },
                { value: '0 */4 * * *', label: 'Mỗi 4 giờ' },
                { value: '0 */6 * * *', label: 'Mỗi 6 giờ (Khuyến nghị)' },
                { value: '0 8,14,20 * * *', label: '3 lần/ngày (8h, 14h, 20h)' },
                { value: '0 0 * * *', label: 'Mỗi ngày lúc 00:00' },
                { value: '0 8 * * *', label: 'Mỗi ngày lúc 08:00' },
                { value: 'custom', label: '⚙️ Tùy Chỉnh (Manual)' }
            ];

            let optionsHtml = scheduleOptions.map(opt =>
                `<option value="${opt.value}">${opt.label}</option>`
            ).join('');

            const modalBody = `
                <div class="form-group">
                    <label>Chọn Lịch Trình:</label>
                    <select id="scheduleSelect" class="form-control" onchange="toggleCustomSchedule()">
                        ${optionsHtml}
                    </select>
                </div>

                <!-- Custom Cron Expression Input -->
                <div class="form-group" id="customScheduleGroup" style="display: none;">
                    <label>Cron Expression (Manual):</label>
                    <input type="text"
                           id="customScheduleInput"
                           class="form-control"
                           placeholder="Ví dụ: 0 */6 * * *"
                           value="${currentSchedule}">
                    <small style="color: var(--gray-600); display: block; margin-top: 8px;">
                        📖 Format: minute hour day month weekday<br>
                        Ví dụ:<br>
                        • <code>*/30 * * * *</code> - Mỗi 30 phút<br>
                        • <code>0 */6 * * *</code> - Mỗi 6 giờ<br>
                        • <code>0 8,14,20 * * *</code> - 3 lần/ngày (8h, 14h, 20h)<br>
                        • <code>0 0 * * *</code> - Mỗi ngày lúc 00:00
                    </small>
                </div>

                <div style="margin-top: 8px; padding: 12px; background: #E3F2FD; border-radius: 6px; border-left: 4px solid #2196F3;">
                    <small style="color: #1976D2;">
                        💡 <strong>Khuyến nghị:</strong> Mỗi 6 giờ để cân bằng giữa tốc độ và tải hệ thống
                    </small>
                </div>

                <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn-secondary" data-action="closeEditModal">Hủy</button>
                    <button class="btn-save" data-action="saveSyncSchedule">Lưu</button>
                </div>
            `;

            document.getElementById('modalTitle').textContent = 'Chỉnh Sửa Lịch Trình Sync';
            document.getElementById('modalBody').innerHTML = modalBody;
            document.getElementById('editModal').classList.add('show');

            // Set current value
            const selectElement = document.getElementById('scheduleSelect');
            const matchedOption = scheduleOptions.find(opt => opt.value === currentSchedule);

            if (matchedOption && matchedOption.value !== 'custom') {
                selectElement.value = currentSchedule;
            } else {
                // If current schedule doesn't match any preset, select "custom"
                selectElement.value = 'custom';
                toggleCustomSchedule();
            }
        }

        // Toggle custom schedule input visibility
        function toggleCustomSchedule() {
            const selectValue = document.getElementById('scheduleSelect').value;
            const customGroup = document.getElementById('customScheduleGroup');

            if (selectValue === 'custom') {
                customGroup.style.display = 'block';
            } else {
                customGroup.style.display = 'none';
            }
        }

        // Save Sync Schedule
        async function saveSyncSchedule() {
            const selectValue = document.getElementById('scheduleSelect').value;
            let schedule;

            if (selectValue === 'custom') {
                // Use custom input
                schedule = document.getElementById('customScheduleInput').value.trim();

                // Basic validation
                if (!schedule) {
                    showToast('Vui lòng nhập cron expression', 'error');
                    return;
                }

                // Check if it looks like a valid cron (has at least 5 parts)
                const parts = schedule.split(' ');
                if (parts.length < 5) {
                    showToast('Cron expression không hợp lệ. Phải có ít nhất 5 phần (minute hour day month weekday)', 'error');
                    return;
                }
            } else {
                // Use preset value
                schedule = selectValue;
            }

            try {
                const response = await apiRequest('/admin/auto-sync/config', {
                    method: 'POST',
                    body: JSON.stringify({ cron_schedule: schedule })
                });

                if (response.success) {
                    showToast('Đã cập nhật lịch trình sync', 'success');
                    closeEditModal();
                    await loadAutoSyncConfig();
                } else {
                    throw new Error(response.message);
                }
            } catch (error) {
                console.error('Error saving schedule:', error);
                showToast('Lỗi: ' + error.message, 'error');
            }
        }

        // Edit Sync Days
        async function editSyncDays() {
            const modalBody = `
                <div class="form-group">
                    <label>Số Ngày Quét Ngược:</label>
                    <input type="number" id="syncDaysInput" class="form-control"
                           min="1" max="7" value="3"
                           placeholder="Nhập số ngày (1-7)">
                    <small style="color: var(--gray-600); display: block; margin-top: 8px;">
                        💡 Khuyến nghị: 2-3 ngày để không miss đơn hàng nhưng không tốn quá nhiều API calls
                    </small>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" data-action="closeEditModal">Hủy</button>
                    <button class="btn-primary" data-action="saveSyncDays">Lưu</button>
                </div>
            `;

            document.getElementById('modalTitle').textContent = 'Chỉnh Sửa Số Ngày Quét Ngược';
            document.getElementById('modalBody').innerHTML = modalBody;
            document.getElementById('editModal').classList.add('show');

            // Set current value
            const response = await apiRequest('/admin/auto-sync/config');
            if (response.success) {
                document.getElementById('syncDaysInput').value = response.data.sync_days;
            }
        }

        // Save Sync Days
        async function saveSyncDays() {
            const days = parseInt(document.getElementById('syncDaysInput').value);

            if (days < 1 || days > 7) {
                showToast('Số ngày phải từ 1 đến 7', 'error');
                return;
            }

            try {
                const response = await apiRequest('/admin/auto-sync/config', {
                    method: 'POST',
                    body: JSON.stringify({ sync_days: days })
                });

                if (response.success) {
                    showToast('Đã cập nhật số ngày quét ngược', 'success');
                    closeEditModal();
                    await loadAutoSyncConfig();
                } else {
                    throw new Error(response.message);
                }
            } catch (error) {
                console.error('Error saving sync days:', error);
                showToast('Lỗi: ' + error.message, 'error');
            }
        }

        // Run Manual Sync
        async function runManualSync() {
            const btn = document.getElementById('manualSyncBtn');
            const originalHtml = btn.innerHTML;

            if (confirm('Bạn có chắc muốn chạy sync ngay bây giờ? Quá trình này có thể mất vài phút.')) {
                try {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang sync...';

                    const response = await apiRequest('/admin/auto-sync/run', {
                        method: 'POST'
                    });

                    if (response.success) {
                        const result = response.data;
                        showToast(`✅ Sync thành công! Import: ${result.imported}, Duplicates: ${result.duplicates}`, 'success');
                        await loadAutoSyncConfig();
                        // PHASE 4: Reload sync history after manual sync
                        await loadSyncHistory();
                    } else {
                        throw new Error(response.message);
                    }
                } catch (error) {
                    console.error('Error running manual sync:', error);
                    showToast('Lỗi sync: ' + error.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }
        }

        // Load Auto-Sync config on page load
        window.addEventListener('load', () => {
            loadAutoSyncConfig();
        });

        // ============ PHASE 4: SYNC HISTORY FUNCTIONS ============

        /**
         * Load sync history and display in table
         */
        async function loadSyncHistory() {
            try {
                const tbody = document.getElementById('syncHistoryTableBody');

                // Check if element exists
                if (!tbody) {
                    console.warn('syncHistoryTableBody element not found');
                    return;
                }

                // Debug: Check token
                const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
                console.log('Loading sync history, token exists:', !!token);

                const response = await apiRequest('/admin/auto-sync/history?limit=20');
                console.log('Sync history response:', response);

                if (!response.success) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: red;">Lỗi: ' + (response.message || 'Không thể tải lịch sử') + '</td></tr>';
                    return;
                }

                const history = response.data || [];

                if (history.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Chưa có lịch sử sync</td></tr>';
                    return;
                }

                tbody.innerHTML = history.map(session => {
                    const startedAt = new Date(session.sync_started_at);
                    const duration = session.sync_completed_at
                        ? Math.round((new Date(session.sync_completed_at) - startedAt) / 1000)
                        : '-';

                    return `
                        <tr>
                            <td>
                                <div>${formatDateTime(startedAt)}</div>
                                <small style="color: var(--text-secondary);">
                                    ${duration !== '-' ? `${duration}s` : 'Running...'}
                                </small>
                            </td>
                            <td>
                                <span class="badge ${getSyncTypeBadgeClass(session.sync_type)}">
                                    ${getSyncTypeLabel(session.sync_type)}
                                </span>
                            </td>
                            <td>
                                <span class="badge ${getStatusBadgeClass(session.sync_status)}">
                                    ${getStatusLabel(session.sync_status)}
                                </span>
                            </td>
                            <td>${session.total_fetched || 0}</td>
                            <td style="color: var(--success-color);">${session.total_created || 0}</td>
                            <td style="color: var(--warning-color);">${session.total_updated || 0}</td>
                            <td style="color: var(--text-secondary);">${session.total_skipped || 0}</td>
                            <td style="color: var(--error-color);">${session.total_errors || 0}</td>
                            <td>
                                <button class="btn-secondary" data-session-id="${session.id}" style="padding: 4px 8px; font-size: 12px;">
                                    Chi tiết
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');

                // Also load stats
                await loadSyncStats();

            } catch (error) {
                console.error('Error loading sync history:', error);
                const tbody = document.getElementById('syncHistoryTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px; color: red;">Lỗi: ' + error.message + '</td></tr>';
                }
                showToast('Lỗi tải lịch sử sync: ' + error.message, 'error');
            }
        }

        /**
         * Load sync statistics (last 30 days)
         */
        async function loadSyncStats() {
            try {
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);

                const response = await apiRequest(
                    `/admin/auto-sync/stats?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
                );

                if (!response.success) {
                    throw new Error(response.message || 'Failed to load stats');
                }

                const stats = response.data || {};

                document.getElementById('statsTotal').textContent = stats.totalSessions || 0;
                document.getElementById('statsSuccess').textContent = stats.successfulSessions || 0;
                document.getElementById('statsFailed').textContent = stats.failedSessions || 0;
                document.getElementById('statsCreated').textContent = stats.totalCreated || 0;
                document.getElementById('statsUpdated').textContent = stats.totalUpdated || 0;

            } catch (error) {
                console.error('Error loading sync stats:', error);
                // Don't show error toast for stats as it's secondary info
            }
        }

        /**
         * View detailed changes for a sync session
         */
        async function viewSyncDetails(sessionId) {
            try {
                const response = await apiRequest(`/admin/auto-sync/history/${sessionId}/changes?limit=100`);

                if (!response.success) {
                    throw new Error(response.message || 'Failed to load changes');
                }

                const changes = response.data || [];

                // Create modal to display changes
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;';

                modal.innerHTML = `
                    <div style="background: white; padding: 24px; border-radius: 12px; max-width: 900px; max-height: 80vh; overflow: auto; width: 90%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2>Chi Tiết Sync Session</h2>
                            <button data-action="closeModal" style="border: none; background: none; font-size: 24px; cursor: pointer;">&times;</button>
                        </div>

                        ${changes.length === 0 ?
                            '<p style="text-align: center; padding: 40px;">Không có thay đổi nào</p>' :
                            `<table class="data-table" style="width: 100%;">
                                <thead>
                                    <tr>
                                        <th>Mã Đơn</th>
                                        <th>Loại Thay Đổi</th>
                                        <th>Trạng Thái</th>
                                        <th>Balance</th>
                                        <th>Lý Do</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${changes.map(change => `
                                        <tr>
                                            <td>${change.order_code || '-'}</td>
                                            <td>
                                                <span class="badge ${getChangeTypeBadgeClass(change.change_type)}">
                                                    ${getChangeTypeLabel(change.change_type)}
                                                </span>
                                            </td>
                                            <td>
                                                ${change.old_status && change.new_status ?
                                                    `${change.old_status} → ${change.new_status}` :
                                                    '-'
                                                }
                                            </td>
                                            <td>
                                                ${change.balance_change ?
                                                    `${formatCurrency(change.balance_change)} (${change.balance_operation})` :
                                                    '-'
                                                }
                                            </td>
                                            <td>${change.reason || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>`
                        }
                    </div>
                `;

                document.body.appendChild(modal);

            } catch (error) {
                console.error('Error loading sync details:', error);
                showToast('Lỗi tải chi tiết: ' + error.message, 'error');
            }
        }

        /**
         * Helper functions for formatting
         */
        function formatDateTime(date) {
            return new Date(date).toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function formatCurrency(amount) {
            return new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
            }).format(amount);
        }

        function getSyncTypeBadgeClass(type) {
            const classes = {
                'auto': 'badge-info',
                'manual': 'badge-primary',
                'status_sync': 'badge-warning'
            };
            return classes[type] || 'badge-secondary';
        }

        function getSyncTypeLabel(type) {
            const labels = {
                'auto': 'Tự động',
                'manual': 'Thủ công',
                'status_sync': 'Sync trạng thái'
            };
            return labels[type] || type;
        }

        function getStatusBadgeClass(status) {
            const classes = {
                'completed': 'badge-success',
                'failed': 'badge-danger',
                'running': 'badge-warning'
            };
            return classes[status] || 'badge-secondary';
        }

        function getStatusLabel(status) {
            const labels = {
                'completed': 'Hoàn thành',
                'failed': 'Thất bại',
                'running': 'Đang chạy'
            };
            return labels[status] || status;
        }

        function getChangeTypeBadgeClass(type) {
            const classes = {
                'status_change': 'badge-warning',
                'reconciliation_update': 'badge-info',
                'created': 'badge-success',
                'skipped': 'badge-secondary'
            };
            return classes[type] || 'badge-secondary';
        }

        function getChangeTypeLabel(type) {
            const labels = {
                'status_change': 'Đổi trạng thái',
                'reconciliation_update': 'Cập nhật đối soát',
                'created': 'Tạo mới',
                'skipped': 'Bỏ qua'
            };
            return labels[type] || type;
        }

        // PHASE 4: Real-time sync status updates
        let syncHistoryRefreshInterval = null;

        // Auto-load sync history when switching to auto-sync tab
        const originalSwitchTab = switchTab;
        window.switchTabWithHistory = function(tabName) {
            originalSwitchTab(tabName);
            if (tabName === 'autosync') {
                loadSyncHistory();
                startSyncHistoryAutoRefresh();
            } else {
                stopSyncHistoryAutoRefresh();
            }
        };

        /**
         * Start auto-refresh for sync history (every 10 seconds)
         * Only refreshes if there's a running sync session
         */
        function startSyncHistoryAutoRefresh() {
            // Clear any existing interval
            stopSyncHistoryAutoRefresh();

            // Set up new interval
            syncHistoryRefreshInterval = setInterval(async () => {
                try {
                    // Check if there's any running sync
                    const response = await apiRequest('/admin/auto-sync/history?limit=5');
                    if (response.success && response.data) {
                        const hasRunningSyncs = response.data.some(session => session.sync_status === 'running');

                        // Only refresh if there are running syncs
                        if (hasRunningSyncs) {
                            await loadSyncHistory();
                        }
                    }
                } catch (error) {
                    console.error('Error in auto-refresh:', error);
                }
            }, 10000); // 10 seconds
        }

        /**
         * Stop auto-refresh
         */
        function stopSyncHistoryAutoRefresh() {
            if (syncHistoryRefreshInterval) {
                clearInterval(syncHistoryRefreshInterval);
                syncHistoryRefreshInterval = null;
            }
        }

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            stopSyncHistoryAutoRefresh();
        });

        // ============ TAB SWITCHING FUNCTION ============

        /**
         * Switch between settings tabs
         * @param {string} tabName - The tab to switch to (cron, api, system, payment, autosync, ai)
         */
        function switchTab(tabName) {
            // Remove active class from all tabs and content
            const allTabs = document.querySelectorAll('.tab-button');
            const allContents = document.querySelectorAll('.settings-tab-content');

            allTabs.forEach(tab => tab.classList.remove('active'));
            allContents.forEach(content => content.classList.remove('active'));

            // Add active class to selected tab and content
            const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
            const selectedContent = document.getElementById(`tab-${tabName}`);

            if (selectedTab && selectedContent) {
                selectedTab.classList.add('active');
                selectedContent.classList.add('active');

                // Save active tab to localStorage for persistence
                localStorage.setItem('settings_active_tab', tabName);
            }
        }

        // Restore last active tab on page load
        window.addEventListener('DOMContentLoaded', () => {
            const lastActiveTab = localStorage.getItem('settings_active_tab');
            if (lastActiveTab) {
                // Use switchTabWithHistory for autosync tab to trigger data loading
                if (lastActiveTab === 'autosync') {
                    switchTabWithHistory(lastActiveTab);
                } else {
                    switchTab(lastActiveTab);
                }
            }
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
