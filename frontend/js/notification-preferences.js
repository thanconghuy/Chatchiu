/**
 * User Notification Preferences
 * Allows users to manage their email notification settings
 */

const API_BASE = window.location.origin;
let authToken = localStorage.getItem('token');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!authToken) {
        window.location.href = '/login.html';
        return;
    }

    loadPreferences();
    initEventListeners();
});

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Update labels when toggles change
    document.getElementById('instantEmail').addEventListener('change', (e) => {
        document.getElementById('instantEmailLabel').textContent = e.target.checked ? 'Đang bật' : 'Đã tắt';
    });

    document.getElementById('reminderEmail').addEventListener('change', (e) => {
        document.getElementById('reminderEmailLabel').textContent = e.target.checked ? 'Đang bật' : 'Đã tắt';

        // Show/hide frequency control
        const frequencyControl = document.getElementById('frequencyControl');
        if (e.target.checked) {
            frequencyControl.style.display = 'block';
        } else {
            frequencyControl.style.display = 'none';
        }
    });

    document.getElementById('urgentEmail').addEventListener('change', (e) => {
        document.getElementById('urgentEmailLabel').textContent = e.target.checked ? 'Đang bật' : 'Đã tắt';
    });
}

/**
 * Load current preferences from API
 */
async function loadPreferences() {
    try {
        const response = await fetch(`${API_BASE}/api/notifications/preferences`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể tải cấu hình');
        }

        const prefs = data.data;

        // Update form fields
        document.getElementById('instantEmail').checked = prefs.cashback_instant_email !== false;
        document.getElementById('reminderEmail').checked = prefs.cashback_reminder_email !== false;
        document.getElementById('urgentEmail').checked = prefs.cashback_urgent_email !== false;
        document.getElementById('reminderFrequency').value = prefs.reminder_frequency_days || 7;

        // Update toggle labels
        document.getElementById('instantEmailLabel').textContent =
            document.getElementById('instantEmail').checked ? 'Đang bật' : 'Đã tắt';
        document.getElementById('reminderEmailLabel').textContent =
            document.getElementById('reminderEmail').checked ? 'Đang bật' : 'Đã tắt';
        document.getElementById('urgentEmailLabel').textContent =
            document.getElementById('urgentEmail').checked ? 'Đang bật' : 'Đã tắt';

        // Show/hide frequency control
        const frequencyControl = document.getElementById('frequencyControl');
        frequencyControl.style.display = document.getElementById('reminderEmail').checked ? 'block' : 'none';

        showAlert('success', 'Đã tải cấu hình thành công!', '', true);

    } catch (error) {
        console.error('Load preferences error:', error);
        showAlert('danger', 'Lỗi!', error.message, false);
    }
}

/**
 * Save preferences to API
 */
async function savePreferences() {
    try {
        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        saveBtn.disabled = true;

        const preferences = {
            cashback_instant_email: document.getElementById('instantEmail').checked,
            cashback_reminder_email: document.getElementById('reminderEmail').checked,
            cashback_urgent_email: document.getElementById('urgentEmail').checked,
            reminder_frequency_days: parseInt(document.getElementById('reminderFrequency').value)
        };

        // Validate
        if (preferences.reminder_frequency_days < 1 || preferences.reminder_frequency_days > 30) {
            throw new Error('Tần suất phải từ 1-30 ngày');
        }

        const response = await fetch(`${API_BASE}/api/notifications/preferences`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferences)
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Không thể lưu cấu hình');
        }

        showAlert('success', 'Lưu thành công!', 'Cấu hình thông báo của bạn đã được cập nhật.', true);

        // Scroll to top to show alert
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error) {
        console.error('Save preferences error:', error);
        showAlert('danger', 'Lỗi!', error.message, false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu Cấu Hình';
        saveBtn.disabled = false;
    }
}

/**
 * Show alert message
 */
function showAlert(type, title, message, autoHide = true) {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const icons = {
        'success': 'fa-check-circle',
        'danger': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };

    // Clear existing alerts
    container.innerHTML = '';

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
