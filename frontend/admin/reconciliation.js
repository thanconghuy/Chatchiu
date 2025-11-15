// Reconciliation Management JavaScript
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3007' : '';

let previewData = null;
let currentReconciliationId = null;

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh'
    });
}

// Format datetime
function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh'
    });
}

// Get auth token
function getAuthToken() {
    // Try multiple keys for backward compatibility
    return localStorage.getItem('cashback_token') ||
           localStorage.getItem('adminToken') ||
           localStorage.getItem('token');
}

// Check authentication
function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Check admin access
async function checkAdminAccess() {
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to verify admin access');
        }

        const data = await response.json();

        if (data.success && data.user) {
            if (!data.user.is_admin) {
                alert('Access denied: Admin only');
                window.location.href = '/dashboard';
                return false;
            }
            return true;
        } else {
            throw new Error('Invalid response');
        }
    } catch (error) {
        console.error('Admin check error:', error);
        alert('Failed to verify admin access. Please login again.');
        window.location.href = '/login';
        return false;
    }
}

// API call helper
async function apiCall(endpoint, options = {}) {
    const token = getAuthToken();
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    });

    if (response.status === 401) {
        alert('Session expired. Please login again.');
        window.location.href = '/login';
        return null;
    }

    return response;
}

// Preview reconciliation
async function previewReconciliation() {
    const periodStart = document.getElementById('periodStart').value;
    const periodEnd = document.getElementById('periodEnd').value;
    const utmSource = document.getElementById('utmSource').value;

    if (!periodStart || !periodEnd) {
        alert('Vui lòng chọn từ ngày và đến ngày');
        return;
    }

    // Validate dates
    if (new Date(periodStart) > new Date(periodEnd)) {
        alert('Từ ngày phải nhỏ hơn đến ngày');
        return;
    }

    // Use "all" for Tất cả option, otherwise use selected value or default to null
    const finalUtmSource = utmSource === 'all' ? null : (utmSource || null);

    try {
        document.getElementById('previewBtn').disabled = true;
        document.getElementById('previewBtn').textContent = '⏳ Đang preview...';

        const response = await apiCall('/api/reconciliation/preview', {
            method: 'POST',
            body: JSON.stringify({
                userId: null, // All users
                periodStart,
                periodEnd,
                utmSource: finalUtmSource
            })
        });

        const result = await response.json();

        if (result.success) {
            previewData = result.data;
            displayPreviewResults(result.data);

            // Show create button if has eligible orders
            if (result.data.stats.eligible_count > 0) {
                document.getElementById('createBtn').style.display = 'inline-block';
            } else {
                document.getElementById('createBtn').style.display = 'none';
                alert('Không có đơn hàng nào đủ điều kiện cho kỳ này');
            }
        } else {
            alert('Xem trước thất bại: ' + result.message);
        }
    } catch (error) {
        console.error('Preview error:', error);
        alert('Lỗi khi xem trước: ' + error.message);
    } finally {
        document.getElementById('previewBtn').disabled = false;
        document.getElementById('previewBtn').textContent = '🔍 Xem trước';
    }
}

// Display preview results
function displayPreviewResults(data) {
    const previewSection = document.getElementById('previewSection');
    const previewStats = document.getElementById('previewStats');
    const previewDetailsSection = document.getElementById('previewDetailsSection');
    const previewOrdersTableBody = document.getElementById('previewOrdersTableBody');

    const stats = data.stats;

    previewStats.innerHTML = `
        <div class="preview-stat">
            <div class="preview-stat-label">Đơn hàng đủ điều kiện</div>
            <div class="preview-stat-value">${stats.eligible_count}</div>
        </div>
        <div class="preview-stat">
            <div class="preview-stat-label">Tổng tiền hoàn</div>
            <div class="preview-stat-value">${formatCurrency(stats.eligible_total_cashback)}</div>
        </div>
        <div class="preview-stat">
            <div class="preview-stat-label">Tổng giá trị đơn</div>
            <div class="preview-stat-value">${formatCurrency(stats.eligible_total_order_amount)}</div>
        </div>
        <div class="preview-stat">
            <div class="preview-stat-label">Đã đối soát trước đó</div>
            <div class="preview-stat-value">${stats.already_reconciled_count}</div>
        </div>
    `;

    // Display eligible orders details
    if (data.eligible && data.eligible.length > 0) {
        previewDetailsSection.style.display = 'block';
        previewOrdersTableBody.innerHTML = data.eligible.map(order => `
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px;">
                    <div style="font-weight: 500; color: #1f2937;">${order.user_name || '-'}</div>
                    <div style="font-size: 0.75rem; color: #6b7280;">${order.user_email || '-'}</div>
                </td>
                <td style="padding: 12px; color: #374151;">${order.merchant_name || '-'}</td>
                <td style="padding: 12px; font-family: monospace; color: #6b7280;">${order.order_code || '-'}</td>
                <td style="padding: 12px; text-align: right; font-weight: 500; color: #6366f1;">${formatCurrency(order.order_amount)}</td>
                <td style="padding: 12px; text-align: right; font-weight: 500; color: #8b5cf6;">${formatCurrency(order.commission)}</td>
                <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">${formatCurrency(order.cashback_amount)}</td>
                <td style="padding: 12px;">
                    <span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">${order.utm_source || '-'}</span>
                </td>
                <td style="padding: 12px; color: #6b7280; font-size: 0.8rem;">
                    <div style="font-weight: 500; color: #374151;">${formatDateTime(order.order_time)}</div>
                </td>
                <td style="padding: 12px; color: #6b7280; font-size: 0.8rem;">
                    <div style="font-weight: 500; color: #059669;">${formatDateTime(order.confirmed_time)}</div>
                </td>
            </tr>
        `).join('');
    } else {
        previewDetailsSection.style.display = 'none';
    }

    previewSection.style.display = 'block';
}

// Toggle preview details table
function togglePreviewDetails() {
    const table = document.getElementById('previewDetailsTable');
    const icon = document.getElementById('togglePreviewDetailsIcon');
    if (table.style.display === 'none') {
        table.style.display = 'block';
        icon.textContent = '▼';
    } else {
        table.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Create reconciliation
async function createReconciliation() {
    const periodStart = document.getElementById('periodStart').value;
    const periodEnd = document.getElementById('periodEnd').value;
    const periodLabel = document.getElementById('periodLabel').value;
    const notes = document.getElementById('notes').value;
    const utmSource = document.getElementById('utmSource').value;
    const finalUtmSource = utmSource === 'all' ? null : (utmSource || null);

    if (!periodStart || !periodEnd || !periodLabel) {
        alert('Vui lòng điền đầy đủ thông tin (từ ngày, đến ngày, nhãn kỳ)');
        return;
    }

    if (!previewData || previewData.stats.eligible_count === 0) {
        alert('Vui lòng preview trước khi tạo');
        return;
    }

    const confirmed = confirm(
        `Bạn chắc chắn muốn tạo kỳ đối soát "${periodLabel}" với ${previewData.stats.eligible_count} đơn hàng?`
    );

    if (!confirmed) return;

    try {
        document.getElementById('createBtn').disabled = true;
        document.getElementById('createBtn').textContent = '⏳ Đang tạo...';

        const response = await apiCall('/api/reconciliation/create', {
            method: 'POST',
            body: JSON.stringify({
                userId: null,
                periodStart,
                periodEnd,
                periodLabel,
                notes: notes || null,
                utmSource: finalUtmSource
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Tạo kỳ đối soát thành công!');

            // Reset form
            document.getElementById('periodStart').value = '';
            document.getElementById('periodEnd').value = '';
            document.getElementById('periodLabel').value = '';
            document.getElementById('notes').value = '';
            document.getElementById('previewSection').style.display = 'none';
            document.getElementById('createBtn').style.display = 'none';
            previewData = null;

            // Reload list
            await loadReconciliations();
        } else {
            alert('Tạo thất bại: ' + result.message);
        }
    } catch (error) {
        console.error('Create error:', error);
        alert('Lỗi khi tạo: ' + error.message);
    } finally {
        document.getElementById('createBtn').disabled = false;
        document.getElementById('createBtn').textContent = '✅ Tạo Kỳ Đối Soát';
    }
}

// Load reconciliations list
async function loadReconciliations() {
    try {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reconciliationTable').style.display = 'none';

        const response = await apiCall('/api/reconciliation/list?latestOnly=true&limit=100');
        const result = await response.json();

        document.getElementById('loadingState').style.display = 'none';

        if (result.success && result.data.length > 0) {
            displayReconciliationsList(result.data);
            document.getElementById('reconciliationTable').style.display = 'table';
        } else {
            document.getElementById('emptyState').style.display = 'block';
        }
    } catch (error) {
        console.error('Load reconciliations error:', error);
        document.getElementById('loadingState').style.display = 'none';
        alert('Lỗi khi tải danh sách: ' + error.message);
    }
}

// Display reconciliations list
function displayReconciliationsList(reconciliations) {
    const tbody = document.getElementById('reconciliationTableBody');

    tbody.innerHTML = reconciliations.map(rec => `
        <tr>
            <td><strong>${rec.period_label || '-'}</strong></td>
            <td>${formatDate(rec.period_start)} - ${formatDate(rec.period_end)}</td>
            <td>${rec.total_orders || 0}</td>
            <td><strong>${formatCurrency(rec.total_cashback || 0)}</strong></td>
            <td>
                <span class="status-badge status-${rec.status}">
                    ${getStatusLabel(rec.status)}
                </span>
            </td>
            <td>v${rec.version || 1}</td>
            <td>${formatDateTime(rec.created_at)}</td>
            <td>
                <button class="btn-secondary" onclick="viewDetails('${rec.id}')" style="padding: 6px 12px; font-size: 12px;">
                    👁️ Xem
                </button>
                ${rec.status === 'draft' ? `
                    <button class="btn-success" onclick="updateStatus('${rec.id}', 'confirmed')" style="padding: 6px 12px; font-size: 12px;">
                        ✅ Xác nhận
                    </button>
                ` : ''}
                ${rec.status === 'confirmed' ? `
                    <button class="btn-warning" onclick="updateStatus('${rec.id}', 'paid')" style="padding: 6px 12px; font-size: 12px;">
                        💰 Đã thanh toán
                    </button>
                ` : ''}
                ${rec.status === 'draft' ? `
                    <button class="btn-danger" onclick="deleteReconciliation('${rec.id}')" style="padding: 6px 12px; font-size: 12px;">
                        🗑️ Xóa
                    </button>
                ` : ''}
                ${rec.status !== 'draft' ? `
                    <button class="btn-secondary" onclick="rerunReconciliation('${rec.id}')" style="padding: 6px 12px; font-size: 12px;">
                        🔄 Re-run
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// Get status label
function getStatusLabel(status) {
    const labels = {
        'draft': 'Nháp',
        'confirmed': 'Đã xác nhận',
        'paid': 'Đã thanh toán',
        'cancelled': 'Đã hủy'
    };
    return labels[status] || status;
}

// View details
async function viewDetails(reconciliationId) {
    currentReconciliationId = reconciliationId;
    const modal = document.getElementById('detailsModal');
    const modalBody = document.getElementById('modalBody');

    modal.style.display = 'block';
    modalBody.innerHTML = '<div class="loading">⏳ Đang tải...</div>';

    try {
        const response = await apiCall(`/api/reconciliation/${reconciliationId}`);
        const result = await response.json();

        if (result.success) {
            displayReconciliationDetails(result.data);
            document.getElementById('exportCsvBtn').style.display = 'inline-block';
        } else {
            modalBody.innerHTML = `<div style="color: red;">Lỗi: ${result.message}</div>`;
        }
    } catch (error) {
        console.error('View details error:', error);
        modalBody.innerHTML = `<div style="color: red;">Lỗi: ${error.message}</div>`;
    }
}

// Display reconciliation details
function displayReconciliationDetails(data) {
    const { reconciliation, items, stats } = data;
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0;">📋 ${reconciliation.period_label}</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                <div><strong>Từ ngày:</strong> ${formatDate(reconciliation.period_start)}</div>
                <div><strong>Đến ngày:</strong> ${formatDate(reconciliation.period_end)}</div>
                <div><strong>Status:</strong> <span class="status-badge status-${reconciliation.status}">${getStatusLabel(reconciliation.status)}</span></div>
                <div><strong>Version:</strong> v${reconciliation.version}</div>
                <div><strong>Tạo bởi:</strong> ${reconciliation.created_by_name || '-'}</div>
                <div><strong>Ngày tạo:</strong> ${formatDateTime(reconciliation.created_at)}</div>
            </div>
            ${reconciliation.notes ? `<div style="padding: 10px; background: #f5f5f5; border-radius: 4px;"><strong>Ghi chú:</strong> ${reconciliation.notes}</div>` : ''}
        </div>

        <div style="margin-bottom: 20px;">
            <h4>📊 Thống Kê</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div style="padding: 15px; background: #e8f5e9; border-radius: 6px; text-align: center;">
                    <div style="font-size: 12px; color: #666;">Tổng đơn hàng</div>
                    <div style="font-size: 24px; font-weight: 600;">${stats.total_items || 0}</div>
                </div>
                <div style="padding: 15px; background: #e3f2fd; border-radius: 6px; text-align: center;">
                    <div style="font-size: 12px; color: #666;">Số users</div>
                    <div style="font-size: 24px; font-weight: 600;">${stats.unique_users || 0}</div>
                </div>
                <div style="padding: 15px; background: #f3e5f5; border-radius: 6px; text-align: center;">
                    <div style="font-size: 12px; color: #666;">Tổng cashback</div>
                    <div style="font-size: 20px; font-weight: 600;">${formatCurrency(stats.total_cashback || 0)}</div>
                </div>
            </div>
        </div>

        <div>
            <h4>📦 Chi Tiết Đơn Hàng (${items.length} items)</h4>
            <div style="max-height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: #f5f5f5;">
                        <tr>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Order Code</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Merchant</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">User</th>
                            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Order Amount</th>
                            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Cashback</th>
                            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Thời gian xác nhận</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.order_code || '-'}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.merchant_name || '-'}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.user_name || '-'}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.order_amount || 0)}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;"><strong>${formatCurrency(item.cashback_amount || 0)}</strong></td>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatDateTime(item.confirmed_time)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Update status
async function updateStatus(reconciliationId, newStatus) {
    const statusLabels = {
        'confirmed': 'xác nhận',
        'paid': 'đánh dấu đã thanh toán',
        'cancelled': 'hủy'
    };

    const confirmed = confirm(`Bạn chắc chắn muốn ${statusLabels[newStatus]} kỳ đối soát này?`);
    if (!confirmed) return;

    try {
        const response = await apiCall(`/api/reconciliation/${reconciliationId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Cập nhật status thành công!');
            await loadReconciliations();
        } else {
            alert('Cập nhật thất bại: ' + result.message);
        }
    } catch (error) {
        console.error('Update status error:', error);
        alert('Lỗi khi cập nhật: ' + error.message);
    }
}

// Delete reconciliation
async function deleteReconciliation(reconciliationId) {
    const confirmed = confirm('Bạn chắc chắn muốn xóa kỳ đối soát này? (Chỉ có thể xóa draft)');
    if (!confirmed) return;

    try {
        const response = await apiCall(`/api/reconciliation/${reconciliationId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Xóa thành công!');
            await loadReconciliations();
        } else {
            alert('Xóa thất bại: ' + result.message);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Lỗi khi xóa: ' + error.message);
    }
}

// Re-run reconciliation
async function rerunReconciliation(reconciliationId) {
    const notes = prompt('Nhập lý do re-run (optional):');
    if (notes === null) return; // User cancelled

    try {
        const response = await apiCall(`/api/reconciliation/${reconciliationId}/rerun`, {
            method: 'POST',
            body: JSON.stringify({ notes: notes || null })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Re-run thành công! Version mới đã được tạo.');
            await loadReconciliations();
        } else {
            alert('Re-run thất bại: ' + result.message);
        }
    } catch (error) {
        console.error('Re-run error:', error);
        alert('Lỗi khi re-run: ' + error.message);
    }
}

// Export CSV
function exportCsv() {
    if (!currentReconciliationId) return;

    const token = getAuthToken();
    const url = `${API_BASE}/api/reconciliation/${currentReconciliationId}/export`;

    window.open(url + `?token=${token}`, '_blank');
}

// Close modal
function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
    currentReconciliationId = null;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    // Check admin access
    const isAdmin = await checkAdminAccess();
    if (!isAdmin) return;

    // Display user's full name
    displayUserName('userName');

    // Set default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    document.getElementById('periodStart').value = firstDay.toISOString().split('T')[0];
    document.getElementById('periodEnd').value = lastDay.toISOString().split('T')[0];

    // Auto-generate period label
    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    document.getElementById('periodLabel').value = `${monthNames[now.getMonth()]}/${now.getFullYear()}`;

    // Event listeners
    document.getElementById('previewBtn').addEventListener('click', previewReconciliation);
    document.getElementById('createBtn').addEventListener('click', createReconciliation);
    document.getElementById('closeDetailsModal').addEventListener('click', closeModal);
    document.getElementById('closeDetailsBtn').addEventListener('click', closeModal);
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

    // Close modal when clicking outside
    window.onclick = function(event) {
        const modal = document.getElementById('detailsModal');
        if (event.target == modal) {
            closeModal();
        }
    };

    // Display user name
    displayUserName('userName');

    // Load reconciliations
    await loadReconciliations();

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('cashback_token');
        localStorage.removeItem('cashback_user');
        localStorage.removeItem('token');
        localStorage.removeItem('adminToken');
        window.location.href = '/login';
    });

    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
});
