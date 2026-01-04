/**
 * Notification Settings Admin Panel
 * Manages cashback notification configuration and statistics
 */

const API_BASE = window.location.origin;
const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
    TOKEN: 'cashback_token',
    USER: 'cashback_user'
};
let authToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
let notificationChart, successRateChart;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    if (!authToken) {
        window.location.href = '/login';
        return;
    }

    loadSettings();
    loadRecentNotifications();
    loadStatistics();
    initEventListeners();

    // Load templates from server first
    await loadTemplatesFromServer();

    // Load first template on page load
    if (document.getElementById('templateSelect')) {
        loadTemplate();
    }

    // Add template editor event listeners
    initTemplateEditorListeners();
});

/**
 * Toggle test email form
 */
function toggleTestEmailForm() {
    const checkbox = document.getElementById('enableTestEmail');
    const form = document.getElementById('testEmailForm');
    const statusDiv = document.getElementById('testEmailStatus');

    if (checkbox.checked) {
        form.style.display = 'block';
        statusDiv.style.display = 'none';
    } else {
        form.style.display = 'none';
        statusDiv.style.display = 'none';
    }
}

/**
 * Send test email for current template
 */
async function sendTestEmailForTemplate() {
    const templateType = document.getElementById('templateSelect').value;
    const recipientEmail = document.getElementById('testEmailRecipient').value;
    const statusDiv = document.getElementById('testEmailStatus');

    // Validation
    if (!recipientEmail || !recipientEmail.trim()) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #ef4444; padding: 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-exclamation-circle" style="color: #ef4444; font-size: 1.2rem;"></i>
                <span style="color: #991b1b; font-weight: 600;">Vui lòng nhập email nhận</span>
            </div>
        `;
        return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #ef4444; padding: 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-exclamation-circle" style="color: #ef4444; font-size: 1.2rem;"></i>
                <span style="color: #991b1b; font-weight: 600;">Email không hợp lệ</span>
            </div>
        `;
        return;
    }

    try {
        // Show loading state
        const sendBtn = document.querySelector('[data-action="sendTestEmailForTemplate"]');
        const originalText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        sendBtn.disabled = true;

        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px solid #3b82f6; padding: 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-circle-notch fa-spin" style="color: #3b82f6; font-size: 1.2rem;"></i>
                <span style="color: #1e40af; font-weight: 600;">Đang gửi test email...</span>
            </div>
        `;

        // Send test email
        const response = await fetch(`${API_BASE}/api/notifications/admin/test-template`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                templateType: templateType,
                recipientEmail: recipientEmail
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể gửi test email');
        }

        // Show success message
        statusDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #d1fae5 100%); border: 2px solid #10b981; padding: 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981; font-size: 1.2rem;"></i>
                <span style="color: #065f46; font-weight: 600;">
                    Test email đã được gửi đến ${recipientEmail}! Vui lòng kiểm tra hộp thư.
                </span>
            </div>
        `;

        // Also show toast
        showAlert('success', 'Đã Gửi!',
                 `Test email đã được gửi đến ${recipientEmail}`,
                 'alertContainer', true);

        // Restore button
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;

    } catch (error) {
        console.error('Send test email error:', error);

        statusDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #ef4444; padding: 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-times-circle" style="color: #ef4444; font-size: 1.2rem;"></i>
                <span style="color: #991b1b; font-weight: 600;">
                    Lỗi: ${error.message}
                </span>
            </div>
        `;

        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);

        // Restore button
        const sendBtn = document.querySelector('[data-action="sendTestEmailForTemplate"]');
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi Test Email';
        sendBtn.disabled = false;
    }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Update labels when toggles change
    document.getElementById('reminderEnabled').addEventListener('change', (e) => {
        document.getElementById('reminderEnabledLabel').textContent = e.target.checked ? 'Đang bật' : 'Đã tắt';
    });

    document.getElementById('instantEnabled').addEventListener('change', (e) => {
        document.getElementById('instantEnabledLabel').textContent = e.target.checked ? 'Đang bật' : 'Đã tắt';
    });
}

/**
 * Load current settings from API
 */
async function loadSettings() {
    try {
        showAlert('info', 'Đang tải cấu hình...', '', 'alertContainer', false);

        const response = await fetch(`${API_BASE}/api/notifications/admin/settings`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể tải cấu hình');
        }

        const settings = data.data;

        // Update form fields
        document.getElementById('reminderEnabled').checked = settings.cashback_reminder_enabled === true || settings.cashback_reminder_enabled === 'true';
        document.getElementById('reminderFrequency').value = settings.cashback_reminder_frequency_days;
        document.getElementById('reminderTime').value = settings.cashback_reminder_time;
        document.getElementById('instantEnabled').checked = settings.cashback_instant_enabled === true || settings.cashback_instant_enabled === 'true';

        // Update toggle labels
        document.getElementById('reminderEnabledLabel').textContent =
            document.getElementById('reminderEnabled').checked ? 'Đang bật' : 'Đã tắt';
        document.getElementById('instantEnabledLabel').textContent =
            document.getElementById('instantEnabled').checked ? 'Đang bật' : 'Đã tắt';

        // Update stat cards
        document.getElementById('reminderStatus').textContent =
            document.getElementById('reminderEnabled').checked ? 'ĐANG BẬT' : 'ĐÃ TẮT';
        document.getElementById('frequencyDisplay').textContent = `${settings.cashback_reminder_frequency_days} ngày`;
        document.getElementById('timeDisplay').textContent = settings.cashback_reminder_time;
        document.getElementById('instantStatus').textContent =
            document.getElementById('instantEnabled').checked ? 'ĐANG BẬT' : 'ĐÃ TẮT';

        clearAlerts('alertContainer');
        showAlert('success', 'Đã tải cấu hình thành công!', '', 'alertContainer', true);

    } catch (error) {
        console.error('Load settings error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);
    }
}

/**
 * Save settings to API
 */
async function saveSettings() {
    try {
        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        saveBtn.disabled = true;

        const settings = {
            cashback_reminder_enabled: document.getElementById('reminderEnabled').checked,
            cashback_reminder_frequency_days: parseInt(document.getElementById('reminderFrequency').value),
            cashback_reminder_time: document.getElementById('reminderTime').value,
            cashback_instant_enabled: document.getElementById('instantEnabled').checked
        };

        // Validate
        if (settings.cashback_reminder_frequency_days < 1 || settings.cashback_reminder_frequency_days > 30) {
            throw new Error('Tần suất phải từ 1-30 ngày');
        }

        const response = await fetch(`${API_BASE}/api/notifications/admin/settings`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể lưu cấu hình');
        }

        // Update stat cards
        document.getElementById('reminderStatus').textContent =
            settings.cashback_reminder_enabled ? 'ĐANG BẬT' : 'ĐÃ TẮT';
        document.getElementById('frequencyDisplay').textContent = `${settings.cashback_reminder_frequency_days} ngày`;
        document.getElementById('timeDisplay').textContent = settings.cashback_reminder_time;
        document.getElementById('instantStatus').textContent =
            settings.cashback_instant_enabled ? 'ĐANG BẬT' : 'ĐÃ TẮT';

        showAlert('success', 'Lưu thành công!', 'Cấu hình đã được cập nhật. Cron jobs sẽ tự động reload.', 'alertContainer', true);

    } catch (error) {
        console.error('Save settings error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);
    } finally {
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu Cấu Hình';
        saveBtn.disabled = false;
    }
}

/**
 * Send test reminders manually
 */
async function sendTestReminders() {
    if (!confirm('Gửi test reminders ngay? Email sẽ được gửi đến các users đủ điều kiện.')) {
        return;
    }

    try {
        const testBtn = document.getElementById('testBtn');
        const originalText = testBtn.innerHTML;
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        testBtn.disabled = true;

        const response = await fetch(`${API_BASE}/api/notifications/admin/send-reminders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể gửi reminders');
        }

        const results = data.data;
        const message = `
            <strong>Kết quả:</strong><br>
            • Tổng: ${results.total} users<br>
            • Gửi thành công: ${results.sent}<br>
            • Bỏ qua: ${results.skipped}<br>
            • Lỗi: ${results.failed}
        `;

        showAlert('success', 'Gửi thành công!', message, 'alertContainer', false);

        // Reload recent notifications
        setTimeout(() => {
            loadRecentNotifications();
        }, 1000);

    } catch (error) {
        console.error('Send test error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);
    } finally {
        const testBtn = document.getElementById('testBtn');
        testBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Test Gửi Ngay';
        testBtn.disabled = false;
    }
}

/**
 * Load recent notifications with pagination
 */
let currentPage = 1;
const pageSize = 20;

async function loadRecentNotifications(page = 1) {
    try {
        currentPage = page;
        const offset = (page - 1) * pageSize;

        const response = await fetch(
            `${API_BASE}/api/notifications/admin/recent?limit=${pageSize}&offset=${offset}`,
            {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            }
        );

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể tải danh sách');
        }

        const tbody = document.getElementById('recentNotificationsBody');

        if (data.data.notifications.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: var(--gray-500);">
                        <i class="fas fa-inbox"></i> Chưa có email nào được gửi
                    </td>
                </tr>
            `;

            // Hide pagination if no data
            const paginationContainer = document.getElementById('notificationPagination');
            if (paginationContainer) {
                paginationContainer.style.display = 'none';
            }
            return;
        }

        tbody.innerHTML = data.data.notifications.map(n => `
            <tr>
                <td>${formatDateTime(n.email_sent_at)}</td>
                <td>
                    <div style="font-weight: 500;">${n.user_name || 'N/A'}</div>
                    <div style="font-size: 12px; color: var(--gray-500);">${n.email}</div>
                </td>
                <td>
                    <span class="badge ${getTypeBadgeClass(n.notification_type)}">
                        ${formatNotificationType(n.notification_type)}
                    </span>
                </td>
                <td style="font-weight: 500;">${formatCurrency(n.available_balance)}</td>
                <td>
                    <span class="badge ${getStatusBadgeClass(n.email_status)}">
                        ${formatStatus(n.email_status)}
                    </span>
                </td>
            </tr>
        `).join('');

        // Render pagination
        renderPagination(data.data.pagination);

    } catch (error) {
        console.error('Load notifications error:', error);
        const tbody = document.getElementById('recentNotificationsBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px; color: var(--danger-color);">
                    <i class="fas fa-exclamation-triangle"></i> ${error.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Render pagination controls
 */
function renderPagination(pagination) {
    const container = document.getElementById('notificationPagination');
    if (!container) return;

    if (pagination.totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const { currentPage, totalPages, total } = pagination;
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    let html = `
        <div class="pagination-info">
            Hiển thị ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, total)} của ${total}
        </div>
        <div class="pagination-buttons">
    `;

    // Previous button
    html += `
        <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}"
                onclick="loadRecentNotifications(${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    // First page
    if (startPage > 1) {
        html += `
            <button class="pagination-btn" onclick="loadRecentNotifications(1)">1</button>
            ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
        `;
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button class="pagination-btn ${i === currentPage ? 'active' : ''}"
                    onclick="loadRecentNotifications(${i})">
                ${i}
            </button>
        `;
    }

    // Last page
    if (endPage < totalPages) {
        html += `
            ${endPage < totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
            <button class="pagination-btn" onclick="loadRecentNotifications(${totalPages})">${totalPages}</button>
        `;
    }

    // Next button
    html += `
        <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}"
                onclick="loadRecentNotifications(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Clear old notification logs
 */
async function clearOldLogs(days = 90) {
    const confirmMsg = `Xóa tất cả notification logs cũ hơn ${days} ngày?\n\nHành động này không thể hoàn tác!`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/notifications/admin/cleanup`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                days: days,
                confirmDelete: true
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể xóa logs');
        }

        showAlert('success', 'Thành công!', data.message, 'alertContainer', true);

        // Reload notifications
        setTimeout(() => {
            loadRecentNotifications(1);
            loadStatistics();
        }, 1500);

    } catch (error) {
        console.error('Clear logs error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);
    }
}

/**
 * Clear all notification logs
 */
async function clearAllLogs() {
    const confirmMsg1 = 'XÓA TẤT CẢ notification logs?\n\nHành động này KHÔNG THỂ HOÀN TÁC!';

    if (!confirm(confirmMsg1)) {
        return;
    }

    const confirmMsg2 = 'Bạn CHẮC CHẮN muốn xóa TẤT CẢ logs?\n\nGõ "DELETE ALL" để xác nhận:';
    const userInput = prompt(confirmMsg2);

    if (userInput !== 'DELETE ALL') {
        showAlert('info', 'Đã hủy', 'Hành động xóa đã bị hủy', 'alertContainer', true);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/notifications/admin/clear-all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                confirmClearAll: 'DELETE_ALL_LOGS'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể xóa logs');
        }

        showAlert('success', 'Đã xóa!', data.message, 'alertContainer', true);

        // Reload notifications
        setTimeout(() => {
            loadRecentNotifications(1);
            loadStatistics();
        }, 1500);

    } catch (error) {
        console.error('Clear all logs error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);
    }
}

/**
 * Load statistics and render charts
 */
async function loadStatistics() {
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        console.log('📊 Loading statistics...', { startDate, endDate });

        const response = await fetch(
            `${API_BASE}/api/notifications/admin/stats?startDate=${startDate}&endDate=${endDate}`,
            {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            }
        );

        const data = await response.json();
        console.log('📊 Statistics API response:', data);

        if (!data.success) {
            throw new Error(data.message || 'Không thể tải thống kê');
        }

        console.log('📊 Statistics data:', data.data.statistics);

        if (!data.data.statistics || data.data.statistics.length === 0) {
            console.warn('⚠️ No statistics data found');
            // Hide charts if no data
            const chartsGrid = document.querySelector('.charts-grid');
            if (chartsGrid) {
                chartsGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--gray-500);">
                        <i class="fas fa-chart-line" style="font-size: 64px; margin-bottom: 16px; display: block;"></i>
                        <h3 style="margin-bottom: 8px;">Chưa Có Dữ Liệu Thống Kê</h3>
                        <p>Hệ thống chưa gửi email notification nào trong 30 ngày qua.</p>
                        <p style="margin-top: 12px; font-size: 0.9em;">
                            <i class="fas fa-info-circle"></i> Thử gửi test email hoặc đợi hệ thống gửi email tự động.
                        </p>
                    </div>
                `;
            }
            return;
        }

        renderCharts(data.data.statistics);

    } catch (error) {
        console.error('❌ Load statistics error:', error);
        // Show error message
        const chartsGrid = document.querySelector('.charts-grid');
        if (chartsGrid) {
            chartsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--danger-color);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 64px; margin-bottom: 16px; display: block;"></i>
                    <h3 style="margin-bottom: 8px;">Lỗi Tải Thống Kê</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

/**
 * Render charts
 */
function renderCharts(stats) {
    if (!stats || stats.length === 0) {
        console.warn('⚠️ No stats to render');
        return;
    }

    console.log('📈 Rendering charts with data:', stats);

    // Notification chart (line chart)
    const notificationCtx = document.getElementById('notificationChart');
    if (!notificationCtx) {
        console.error('❌ notificationChart canvas not found');
        return;
    }

    if (notificationChart) {
        notificationChart.destroy();
    }

    const labels = stats.map(s => formatNotificationType(s.notification_type));
    const totalData = stats.map(s => parseInt(s.total_sent) || 0);
    const successData = stats.map(s => parseInt(s.successful) || 0);

    console.log('📊 Chart data:', { labels, totalData, successData });

    notificationChart = new Chart(notificationCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tổng gửi',
                    data: totalData,
                    backgroundColor: 'rgba(102, 126, 234, 0.5)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Thành công',
                    data: successData,
                    backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y || 0;
                            const total = context.chart.data.datasets[0].data[context.dataIndex] || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 10 }
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 }
                    }
                }
            }
        }
    });

    // Render notification stats
    const totalSent = totalData.reduce((sum, val) => sum + val, 0);
    const totalSuccessful = successData.reduce((sum, val) => sum + val, 0);
    const totalFailed = totalSent - totalSuccessful;
    const successRate = totalSent > 0 ? ((totalSuccessful / totalSent) * 100).toFixed(1) : 0;

    const notificationStatsEl = document.getElementById('notificationStats');
    if (notificationStatsEl) {
        notificationStatsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Tổng Gửi</div>
                <div class="stat-value info">${totalSent}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Thành Công</div>
                <div class="stat-value success">${totalSuccessful}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Tỷ Lệ</div>
                <div class="stat-value">${successRate}%</div>
            </div>
        `;
    }

    // Success rate chart (pie chart)
    const successRateCtx = document.getElementById('successRateChart');
    if (!successRateCtx) {
        console.error('❌ successRateChart canvas not found');
        return;
    }

    if (successRateChart) {
        successRateChart.destroy();
    }

    const totalSuccess = stats.reduce((sum, s) => sum + (parseInt(s.successful) || 0), 0);
    const totalFailedChart = stats.reduce((sum, s) => sum + (parseInt(s.failed) || 0), 0);

    console.log('📊 Success rate data:', { totalSuccess, totalFailedChart });

    const totalAll = totalSuccess + totalFailedChart;
    const successPercentage = totalAll > 0 ? ((totalSuccess / totalAll) * 100).toFixed(1) : 0;
    const failedPercentage = totalAll > 0 ? ((totalFailedChart / totalAll) * 100).toFixed(1) : 0;

    successRateChart = new Chart(successRateCtx, {
        type: 'doughnut',
        data: {
            labels: ['Thành công', 'Thất bại'],
            datasets: [{
                data: [totalSuccess, totalFailedChart],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // Render success rate stats
    const successStatsEl = document.getElementById('successStats');
    if (successStatsEl) {
        successStatsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Thành Công</div>
                <div class="stat-value success">${totalSuccess} (${successPercentage}%)</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Thất Bại</div>
                <div class="stat-value danger">${totalFailedChart} (${failedPercentage}%)</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Tổng Cộng</div>
                <div class="stat-value info">${totalAll}</div>
            </div>
        `;
    }
}

/**
 * Utility Functions
 */

function formatDateTime(datetime) {
    if (!datetime) return 'N/A';
    const date = new Date(datetime);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    if (!amount) return '0 VND';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

function formatNotificationType(type) {
    const types = {
        'instant': 'Instant',
        'periodic': 'Reminder',
        'urgent': 'Urgent'
    };
    return types[type] || type;
}

function formatStatus(status) {
    const statuses = {
        'sent': 'Đã gửi',
        'failed': 'Thất bại',
        'pending': 'Chờ gửi'
    };
    return statuses[status] || status;
}

function getTypeBadgeClass(type) {
    const classes = {
        'instant': 'badge-success',
        'periodic': 'badge-info',
        'urgent': 'badge-warning'
    };
    return classes[type] || 'badge-info';
}

function getStatusBadgeClass(status) {
    const classes = {
        'sent': 'badge-success',
        'failed': 'badge-danger',
        'pending': 'badge-warning'
    };
    return classes[status] || 'badge-info';
}

function showAlert(type, title, message, containerId, autoHide = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const icons = {
        'success': 'fa-check-circle',
        'danger': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <div class="alert-content">
            <div class="alert-title">${title}</div>
            ${message ? `<div>${message}</div>` : ''}
        </div>
    `;

    container.appendChild(alert);

    if (autoHide) {
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
}

function clearAlerts(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Email Template Management Functions
 */

// Template definitions - will be loaded from server
let EMAIL_TEMPLATES = {};

/**
 * Load templates from server
 */
async function loadTemplatesFromServer() {
    try {
        console.log('🔄 Loading templates from:', `${API_BASE}/api/notifications/admin/templates`);

        const response = await fetch(`${API_BASE}/api/notifications/admin/templates`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (!data.success) {
            throw new Error(data.message || 'Không thể tải templates');
        }

        EMAIL_TEMPLATES = data.data;
        console.log('✅ Loaded email templates from server:', EMAIL_TEMPLATES);
        console.log('📊 Template count:', Object.keys(EMAIL_TEMPLATES).length);

        // Show success message if templates loaded
        if (Object.keys(EMAIL_TEMPLATES).length > 0) {
            showAlert('success', 'Thành công',
                     `Đã tải ${Object.keys(EMAIL_TEMPLATES).length} email templates`,
                     'alertContainer', true);
        }

    } catch (error) {
        console.error('❌ Load templates error:', error);
        showAlert('danger', 'Lỗi!',
                 `Không thể tải email templates: ${error.message}`,
                 'alertContainer', false);
    }
}

/**
 * Get sample data based on template type
 */
function getSampleDataForTemplate(templateType) {
    if (templateType === 'instant' || templateType === 'reminder' || templateType === 'urgent') {
        // Cashback notification templates
        return {
            userName: 'Nguyễn Văn A',
            amount: '250,000₫',
            totalAvailable: '1,500,000₫',
            merchant: 'Shopee',
            createRequestUrl: 'https://chatchiu.online/payment-requests',
            unsubscribeUrl: 'https://chatchiu.online/unsubscribe?token=xxx'
        };
    } else if (templateType.startsWith('payment_')) {
        // Payment request templates
        return {
            userName: 'Nguyễn Văn A',
            paymentId: 'PR-2026-001',
            amount: '1,500,000₫',
            bankAccount: 'ACB - 1234567890 - Nguyễn Văn A',
            approvedDate: '04/01/2026',
            paidDate: '04/01/2026',
            transactionId: 'TXN-2026-ABC123',
            reason: 'Thông tin tài khoản ngân hàng không hợp lệ'
        };
    } else if (templateType === 'reconciliation_finalized') {
        // Reconciliation template
        return {
            userName: 'Nguyễn Văn A',
            reconciliationId: 'REC-2026-Q1',
            period: 'Q1/2026 (01/01/2026 - 31/03/2026)',
            totalAmount: '15,750,000₫',
            finalizedDate: '04/01/2026',
            totalOrders: '127',
            totalPayments: '45'
        };
    }
    return {};
}

/**
 * Get available variables for template type
 */
function getVariablesForTemplate(templateType) {
    if (templateType === 'instant' || templateType === 'reminder' || templateType === 'urgent') {
        return [
            { code: '{{userName}}', description: 'Tên người dùng' },
            { code: '{{amount}}', description: 'Số tiền cashback (VND)' },
            { code: '{{totalAvailable}}', description: 'Tổng số dư khả dụng' },
            { code: '{{merchant}}', description: 'Tên merchant (Shopee, Lazada, ...)' },
            { code: '{{createRequestUrl}}', description: 'Link tạo yêu cầu rút tiền' },
            { code: '{{unsubscribeUrl}}', description: 'Link hủy đăng ký' }
        ];
    } else if (templateType.startsWith('payment_')) {
        return [
            { code: '{{userName}}', description: 'Tên người dùng' },
            { code: '{{paymentId}}', description: 'Mã yêu cầu thanh toán (PR-xxxx)' },
            { code: '{{amount}}', description: 'Số tiền thanh toán (VND)' },
            { code: '{{bankAccount}}', description: 'Thông tin tài khoản ngân hàng' },
            { code: '{{approvedDate}}', description: 'Ngày duyệt yêu cầu' },
            { code: '{{paidDate}}', description: 'Ngày chuyển tiền' },
            { code: '{{transactionId}}', description: 'Mã giao dịch chuyển tiền' },
            { code: '{{reason}}', description: 'Lý do từ chối (nếu có)' }
        ];
    } else if (templateType === 'reconciliation_finalized') {
        return [
            { code: '{{userName}}', description: 'Tên người dùng' },
            { code: '{{reconciliationId}}', description: 'Mã đối soát (REC-xxxx)' },
            { code: '{{period}}', description: 'Kỳ đối soát (VD: Q1/2026)' },
            { code: '{{totalAmount}}', description: 'Tổng số tiền đối soát' },
            { code: '{{finalizedDate}}', description: 'Ngày hoàn thành đối soát' },
            { code: '{{totalOrders}}', description: 'Tổng số đơn hàng' },
            { code: '{{totalPayments}}', description: 'Tổng số yêu cầu thanh toán' }
        ];
    }
    return [];
}

/**
 * Load and display template preview
 */
function loadTemplate() {
    const templateType = document.getElementById('templateSelect').value;

    console.log('Loading template:', templateType);
    console.log('Available templates:', Object.keys(EMAIL_TEMPLATES));

    const template = EMAIL_TEMPLATES[templateType];

    if (!template) {
        console.error('Template not found:', templateType);
        console.error('EMAIL_TEMPLATES:', EMAIL_TEMPLATES);

        // Show error message in preview
        document.getElementById('templatePreview').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p style="font-weight: bold;">Template "${templateType}" chưa được tải từ server</p>
                <p style="font-size: 0.9rem; color: #6b7280;">Vui lòng kiểm tra console hoặc reload trang</p>
            </div>
        `;
        return;
    }

    // Update subject
    document.getElementById('templateSubject').value = template.subject;

    // Get sample data for this template type
    const sampleData = getSampleDataForTemplate(templateType);

    // Update preview with sample data
    let previewContent = template.content;
    Object.keys(sampleData).forEach(key => {
        previewContent = previewContent.replace(new RegExp(`{{${key}}}`, 'g'), sampleData[key]);
    });

    document.getElementById('templatePreview').innerHTML = previewContent;

    // Update variables list
    updateVariablesList(templateType);
}

/**
 * Update variables list display
 */
function updateVariablesList(templateType) {
    const variablesList = document.querySelector('.variables-list');
    if (!variablesList) return;

    const variables = getVariablesForTemplate(templateType);

    variablesList.innerHTML = variables.map(v => `
        <div class="variable-item">
            <code>${v.code}</code>
            <span>${v.description}</span>
        </div>
    `).join('');
}

/**
 * Open test email modal
 */
function openTestEmailModal() {
    // Pre-select current template
    const currentTemplate = document.getElementById('templateSelect').value;
    document.getElementById('testEmailTemplate').value = currentTemplate;

    // Clear previous recipient
    document.getElementById('testEmailRecipient').value = '';

    // Show modal
    document.getElementById('testEmailModal').style.display = 'flex';
}

/**
 * Close test email modal
 */
function closeTestEmailModal() {
    document.getElementById('testEmailModal').style.display = 'none';
}

/**
 * Send test email with form data
 */
async function sendTestEmail() {
    const templateType = document.getElementById('testEmailTemplate').value;
    const recipientEmail = document.getElementById('testEmailRecipient').value.trim();

    // Validate email
    if (!recipientEmail) {
        showAlert('alertContainer', 'warning', 'Thiếu Thông Tin', 'Vui lòng nhập địa chỉ email nhận test.');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
        showAlert('alertContainer', 'warning', 'Email Không Hợp Lệ', 'Vui lòng nhập địa chỉ email đúng định dạng.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/notifications/admin/test-template`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                templateType,
                recipientEmail
            })
        });

        const data = await response.json();

        if (data.success) {
            // Show success alert first
            showAlert('success', 'Test Email Đã Gửi!',
                     `Email test đã được gửi thành công đến <strong>${recipientEmail}</strong>.<br>` +
                     `Template: <strong>${templateType}</strong><br>` +
                     `Vui lòng kiểm tra hộp thư của bạn.`,
                     'alertContainer');

            // Close modal after a short delay to let user see the success message
            setTimeout(() => {
                closeTestEmailModal();
            }, 500);
        } else {
            throw new Error(data.message || 'Failed to send test email');
        }
    } catch (error) {
        console.error('Send test email error:', error);
        showAlert('danger', 'Lỗi Gửi Email',
                 `Không thể gửi test email: ${error.message}`,
                 'alertContainer');
    }
}

/**
 * Initialize template editor event listeners
 */
function initTemplateEditorListeners() {
    // Template select change
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.addEventListener('change', loadTemplate);
    }

    // Open editor button
    const openEditorBtn = document.querySelector('[data-action="openTemplateEditor"]');
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', openTemplateEditor);
    }

    // Test email checkbox toggle
    const testEmailCheckbox = document.getElementById('enableTestEmail');
    if (testEmailCheckbox) {
        testEmailCheckbox.addEventListener('change', toggleTestEmailForm);
    }

    // Send test email for current template
    const sendTestBtnInline = document.querySelector('[data-action="sendTestEmailForTemplate"]');
    if (sendTestBtnInline) {
        sendTestBtnInline.addEventListener('click', sendTestEmailForTemplate);
    }

    // Template editor modal close button
    const modalCloseBtn = document.querySelector('[data-action="closeTemplateEditor"]');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeTemplateEditor);
    }

    // Save template button
    const saveBtn = document.querySelector('[data-action="saveTemplateChanges"]');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTemplateChanges);
    }

    // Close template editor modal on backdrop click
    const modal = document.getElementById('templateEditorModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTemplateEditor();
            }
        });
    }

    // Test email modal - close button
    const testModalCloseBtn = document.querySelector('[data-action="closeTestEmailModal"]');
    if (testModalCloseBtn) {
        testModalCloseBtn.addEventListener('click', closeTestEmailModal);
    }

    // Test email modal - send button
    const sendTestBtnModal = document.querySelector('[data-action="sendTestEmailSubmit"]');
    if (sendTestBtnModal) {
        sendTestBtnModal.addEventListener('click', sendTestEmail);
    }

    // Close test email modal on backdrop click
    const testModal = document.getElementById('testEmailModal');
    if (testModal) {
        testModal.addEventListener('click', (e) => {
            if (e.target === testModal) {
                closeTestEmailModal();
            }
        });
    }
}

/**
 * Open template editor modal
 */
function openTemplateEditor() {
    const templateType = document.getElementById('templateSelect').value;
    const template = EMAIL_TEMPLATES[templateType];

    if (!template) return;

    // Populate editor fields
    document.getElementById('editorTemplateType').value = templateType;
    document.getElementById('editorSubject').value = template.subject;
    document.getElementById('editorContent').value = template.content.trim();

    // Show modal
    document.getElementById('templateEditorModal').style.display = 'flex';
}

/**
 * Close template editor modal
 */
function closeTemplateEditor() {
    document.getElementById('templateEditorModal').style.display = 'none';
}

/**
 * Save template changes
 */
async function saveTemplateChanges() {
    const templateType = document.getElementById('editorTemplateType').value;
    const newSubject = document.getElementById('editorSubject').value;
    const newContent = document.getElementById('editorContent').value;

    if (!newSubject || !newContent) {
        showAlert('warning', 'Cảnh Báo', 'Subject và Content không được để trống!', 'alertContainer', false);
        return;
    }

    try {
        // Show loading state
        const saveBtn = document.querySelector('[data-action="saveTemplateChanges"]');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        saveBtn.disabled = true;

        // Save to server
        const response = await fetch(`${API_BASE}/api/notifications/admin/templates/${templateType}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subject: newSubject,
                content: newContent
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể lưu template');
        }

        // Update template in memory
        EMAIL_TEMPLATES[templateType].subject = newSubject;
        EMAIL_TEMPLATES[templateType].content = newContent;

        // Update preview
        loadTemplate();

        // Close modal
        closeTemplateEditor();

        // Show success message
        showAlert('success', 'Đã Lưu!',
                  'Template đã được lưu vào database thành công. Thay đổi sẽ được áp dụng cho email tiếp theo.',
                  'alertContainer', true);

        // Restore button
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;

    } catch (error) {
        console.error('Save template error:', error);
        showAlert('danger', 'Lỗi!', error.message, 'alertContainer', false);

        // Restore button
        const saveBtn = document.querySelector('[data-action="saveTemplateChanges"]');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu Thay Đổi';
        saveBtn.disabled = false;
    }
}
