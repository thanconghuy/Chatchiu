/**
 * Admin Conversions Management
 */

// Check authentication
requireAuth();

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    await init();
})();

// State
let currentPage = 0;
let currentStatus = '';
let itemsPerPage = 20; // Default items per page

// DOM Elements
const userName = document.getElementById('userName');
const statusFilter = document.getElementById('statusFilter');
const conversionsTable = document.getElementById('conversionsTable');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const rowsPerPageSelect = document.getElementById('rowsPerPage');
const logoutBtn = document.getElementById('logoutBtn');
const syncBtn = document.getElementById('syncBtn');

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
async function init() {
    const user = getUser();
    if (user) {
        userName.textContent = user.fullName || user.username || user.email;
    }

    await loadConversions();
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    console.log('Setting up event listeners...');

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentStatus = statusFilter.value;
            currentPage = 0;
            loadConversions();
        });
        console.log('✓ Status filter listener attached');
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                loadConversions();
            }
        });
        console.log('✓ Prev button listener attached');
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            loadConversions();
        });
        console.log('✓ Next button listener attached');
    }

    if (rowsPerPageSelect) {
        rowsPerPageSelect.addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 0; // Reset to first page
            loadConversions();
        });
        console.log('✓ Rows per page listener attached');
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
        console.log('✓ Logout button listener attached');
    }

    if (syncBtn) {
        console.log('✓ Sync button found:', syncBtn);
        syncBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔍 Check button clicked!');
            if (confirm('Kiểm tra và match conversions với clicks trong database?')) {
                await triggerSync();
            }
        });
        console.log('✓ Sync button listener attached');
    } else {
        console.error('❌ Sync button NOT FOUND!');
    }
}

/**
 * Load conversions
 */
async function loadConversions() {
    try {
        // Show skeleton rows
        const skeletonRows = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
        conversionsTable.innerHTML = skeletonRows;

        const offset = currentPage * itemsPerPage;
        let url = `/admin/conversions?limit=${itemsPerPage}&offset=${offset}`;

        if (currentStatus) {
            url += `&status=${currentStatus}`;
        }

        const response = await apiRequest(url);

        if (response.success) {
            renderConversions(response.conversions);
            updatePagination(response.conversions.length);
        }
    } catch (error) {
        console.error('Error loading conversions:', error);
        conversionsTable.innerHTML = `
            <tr class="error-state">
                <td colspan="10">
                    <div class="error">Failed to load conversions</div>
                </td>
            </tr>
        `;
    }
}

/**
 * Render conversions table
 */
function renderConversions(conversions) {
    if (conversions.length === 0) {
        conversionsTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="10">
                    <div style="padding: 60px 20px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 24px; display: block; color: var(--gray-400);">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <h3 style="font-size: 1.25rem; color: var(--gray-700); margin-bottom: 12px; font-weight: 600;">Không tìm thấy conversions</h3>
                        <p style="font-size: 1rem; color: var(--gray-500);">Chưa có dữ liệu conversion nào</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    conversionsTable.innerHTML = conversions.map(conv => {
        const statusClass = conv.status === 'approved' ? 'status-approved' :
                           conv.status === 'pending' ? 'status-pending' :
                           'status-rejected';
        const statusText = conv.status === 'approved' ? 'Đã duyệt' :
                          conv.status === 'pending' ? 'Đang xử lý' : 'Đã hủy';

        // Reconciliation status badge
        const reconciliationClass = conv.isConfirmed ? 'status-approved' : 'status-pending';
        const reconciliationText = conv.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát';

        // Actions dropdown - always show for all statuses
        actions = `
            <div class="action-dropdown">
                <button class="action-dropdown-btn" onclick="toggleActionMenu(event)">
                    ⋮
                </button>
                <div class="action-dropdown-menu">
                    <button class="action-item action-view" onclick="viewConversionDetails('${conv.id}'); event.stopPropagation();">
                        <span class="action-icon">👁</span>
                        <span>Xem chi tiết</span>
                    </button>
                    <button class="action-item action-check-at" onclick="checkATOrderStatus('${conv.id}'); event.stopPropagation();">
                        <span class="action-icon">🔍</span>
                        <span>Kiểm tra trạng thái AT</span>
                    </button>
                    ${conv.status === 'pending' ? `
                        <button class="action-item action-approve" onclick="approveConversion('${conv.id}'); event.stopPropagation();">
                            <span class="action-icon">✓</span>
                            <span>Duyệt đơn</span>
                        </button>
                        <button class="action-item action-reject" onclick="rejectConversion('${conv.id}'); event.stopPropagation();">
                            <span class="action-icon">✗</span>
                            <span>Từ chối</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        return `
            <tr class="conversion-row" data-conversion-id="${conv.id}" style="cursor: pointer;">
                <td>
                    <div style="font-weight: 600;">${conv.username}</div>
                    <div style="font-size: 0.85rem; color: #666;">${conv.email}</div>
                </td>
                <td>
                    <div class="merchant-cell">
                        ${conv.merchantLogo ? `<img src="${conv.merchantLogo}" alt="${conv.merchantName}" class="merchant-mini-logo">` : ''}
                        <span>${conv.merchantName}</span>
                    </div>
                </td>
                <td>${conv.orderCode || '-'}</td>
                <td>${formatCurrency(conv.orderAmount)}</td>
                <td>${formatCurrency(conv.commission)}</td>
                <td class="highlight">${formatCurrency(conv.cashbackAmount)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td><span class="status-badge ${reconciliationClass}">${reconciliationText}</span></td>
                <td>${formatDate(conv.orderTime)}</td>
                <td style="white-space: nowrap;">${actions}</td>
            </tr>
        `;
    }).join('');

    // Add click event listeners to rows
    setTimeout(() => {
        const rows = document.querySelectorAll('.conversion-row');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking on action buttons or dropdown
                if (e.target.closest('.action-dropdown') || e.target.closest('.action-dropdown-btn') || e.target.closest('.action-dropdown-menu')) {
                    return;
                }
                const conversionId = row.getAttribute('data-conversion-id');
                viewConversionDetails(conversionId);
            });
        });
    }, 0);
}

/**
 * Update pagination
 */
function updatePagination(itemCount) {
    pageInfo.textContent = `Trang ${currentPage + 1}`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = itemCount < itemsPerPage;
}

/**
 * Approve conversion
 */
async function approveConversion(conversionId) {
    if (!confirm('Approve this conversion?')) return;

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'approved' })
        });

        if (response.success) {
            showToast('Conversion approved successfully', 'success');
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to approve conversion');
        }
    } catch (error) {
        console.error('Error approving conversion:', error);
        showToast(error.message || 'Failed to approve conversion', 'error');
    }
}

/**
 * Reject conversion
 */
async function rejectConversion(conversionId) {
    if (!confirm('Reject this conversion? This action cannot be undone.')) return;

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'rejected' })
        });

        if (response.success) {
            showToast('Conversion rejected', 'success');
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to reject conversion');
        }
    } catch (error) {
        console.error('Error rejecting conversion:', error);
        showToast(error.message || 'Failed to reject conversion', 'error');
    }
}

/**
 * Check order status on AccessTrade
 */
async function checkATOrderStatus(conversionId) {
    try {
        // Show loading toast
        showToast('Đang kiểm tra trạng thái trên AccessTrade...', 'info');

        const response = await apiRequest(`/admin/conversion/${conversionId}/check-at-status`);

        if (response.success) {
            const { hasDifference, current, accessTrade, differences } = response;

            if (hasDifference) {
                // Show comparison modal
                showATComparisonModal(conversionId, current, accessTrade, differences);
            } else {
                // No difference, show info message
                const statusMap = {
                    'pending': 'Đang xử lý',
                    'approved': 'Đã duyệt',
                    'rejected': 'Đã hủy'
                };
                const confirmedText = current.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát';
                showToast(`Trạng thái giống nhau: ${statusMap[current.status]} - ${confirmedText}`, 'info');
            }
        } else {
            throw new Error(response.message || 'Failed to check order status');
        }
    } catch (error) {
        console.error('Error checking AT order status:', error);
        showToast(error.message || 'Lỗi khi kiểm tra trạng thái trên AccessTrade', 'error');
    }
}

/**
 * Show comparison modal between current and AccessTrade status
 */
function showATComparisonModal(conversionId, current, accessTrade, differences) {
    const statusMap = {
        'pending': 'Đang xử lý',
        'approved': 'Đã duyệt',
        'rejected': 'Đã hủy'
    };

    const getStatusColor = (status) => {
        return status === 'approved' ? '#10b981' : status === 'pending' ? '#f59e0b' : '#ef4444';
    };

    const getConfirmedColor = (confirmed) => {
        return confirmed ? '#10b981' : '#f59e0b';
    };

    let changesHTML = '';

    if (differences.status) {
        changesHTML += `
            <div style="margin-bottom: 16px; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <strong>⚠️ Trạng thái đơn hàng:</strong><br>
                <span style="color: ${getStatusColor(differences.status.old)}; font-weight: 600;">${statusMap[differences.status.old]}</span>
                →
                <span style="color: ${getStatusColor(differences.status.new)}; font-weight: 600;">${statusMap[differences.status.new]}</span>
            </div>
        `;
    }

    if (differences.isConfirmed) {
        changesHTML += `
            <div style="margin-bottom: 16px; padding: 12px; background: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 4px;">
                <strong>📋 Trạng thái đối soát:</strong><br>
                <span style="color: ${getConfirmedColor(differences.isConfirmed.old)}; font-weight: 600;">${differences.isConfirmed.old ? 'Đã đối soát' : 'Chưa đối soát'}</span>
                →
                <span style="color: ${getConfirmedColor(differences.isConfirmed.new)}; font-weight: 600;">${differences.isConfirmed.new ? 'Đã đối soát' : 'Chưa đối soát'}</span>
            </div>
        `;
    }

    const modalContent = `
        <div class="detail-modal-overlay" onclick="closeATComparisonModal()">
            <div class="detail-modal" onclick="event.stopPropagation()" style="max-width: 700px;">
                <div class="detail-modal-header">
                    <h2>🔍 So Sánh Trạng Thái</h2>
                    <button class="close-btn" onclick="closeATComparisonModal()">✕</button>
                </div>
                <div class="detail-modal-body">
                    <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
                        <strong style="color: #991b1b;">⚠️ Phát hiện sự khác biệt!</strong>
                        <p style="margin: 8px 0 0 0; color: #7f1d1d;">Trạng thái trên AccessTrade khác với database hiện tại.</p>
                    </div>

                    ${changesHTML}

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px;">
                        <div style="padding: 16px; background: #f9fafb; border-radius: 8px; border: 2px solid #e5e7eb;">
                            <h3 style="margin: 0 0 12px 0; color: #6b7280; font-size: 0.9rem;">📁 DATABASE HIỆN TẠI</h3>
                            <div style="font-size: 0.9rem;">
                                <div style="margin-bottom: 8px;">
                                    <strong>Trạng thái:</strong>
                                    <span style="color: ${getStatusColor(current.status)}; font-weight: 600;">${statusMap[current.status]}</span>
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Đối soát:</strong>
                                    <span style="color: ${getConfirmedColor(current.isConfirmed)}; font-weight: 600;">${current.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát'}</span>
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Giá trị:</strong> ${formatCurrency(current.orderAmount)}
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Cashback:</strong> ${formatCurrency(current.cashbackAmount)}
                                </div>
                            </div>
                        </div>

                        <div style="padding: 16px; background: #ecfdf5; border-radius: 8px; border: 2px solid #10b981;">
                            <h3 style="margin: 0 0 12px 0; color: #059669; font-size: 0.9rem;">🌐 ACCESSTRADE API</h3>
                            <div style="font-size: 0.9rem;">
                                <div style="margin-bottom: 8px;">
                                    <strong>Trạng thái:</strong>
                                    <span style="color: ${getStatusColor(accessTrade.status)}; font-weight: 600;">${statusMap[accessTrade.status]}</span>
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Đối soát:</strong>
                                    <span style="color: ${getConfirmedColor(accessTrade.isConfirmed)}; font-weight: 600;">${accessTrade.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát'}</span>
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Giá trị:</strong> ${formatCurrency(accessTrade.billing)}
                                </div>
                                <div style="margin-bottom: 8px;">
                                    <strong>Hoa hồng:</strong> ${formatCurrency(accessTrade.commission)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 6px; font-size: 0.9rem;">
                        💡 <strong>Lưu ý:</strong> Nếu cập nhật, hệ thống sẽ tự động điều chỉnh số dư user nếu trạng thái thay đổi.
                    </div>
                </div>
                <div class="detail-modal-footer">
                    <button class="btn btn-secondary" onclick="closeATComparisonModal()">Hủy</button>
                    <button class="btn btn-primary" onclick="confirmUpdateFromAT('${conversionId}', ${JSON.stringify(accessTrade).replace(/"/g, '&quot;')})">
                        ✓ Cập Nhật Từ AT
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalContent);
}

/**
 * Close AT comparison modal
 */
function closeATComparisonModal() {
    const modal = document.querySelector('.detail-modal-overlay');
    if (modal && modal.querySelector('h2').textContent.includes('So Sánh')) {
        modal.remove();
    }
}

/**
 * Confirm and update from AccessTrade
 */
async function confirmUpdateFromAT(conversionId, atData) {
    try {
        closeATComparisonModal();
        showToast('Đang cập nhật từ AccessTrade...', 'info');

        const response = await apiRequest(`/admin/conversion/${conversionId}/sync-from-at`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newStatus: atData.status,
                newIsConfirmed: atData.isConfirmed
            })
        });

        if (response.success) {
            const { updated, changes } = response;

            let message = 'Đã cập nhật thành công!';
            if (changes.status) {
                message += ` Trạng thái: ${changes.status.old} → ${changes.status.new}`;
            }
            if (updated.balanceUpdated) {
                message += ' (Số dư đã được cập nhật)';
            }

            showToast(message, 'success');
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to update');
        }
    } catch (error) {
        console.error('Error updating from AT:', error);
        showToast(error.message || 'Lỗi khi cập nhật từ AccessTrade', 'error');
    }
}

/**
 * Toggle action dropdown menu
 */
function toggleActionMenu(event) {
    event.stopPropagation();
    const btn = event.target;
    const dropdown = btn.nextElementSibling;
    const allDropdowns = document.querySelectorAll('.action-dropdown-menu');

    // Close all other dropdowns
    allDropdowns.forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });

    // Toggle current dropdown
    dropdown.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown-menu').forEach(d => {
        d.classList.remove('show');
    });
});

/**
 * View conversion details
 */
async function viewConversionDetails(conversionId) {
    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}`);

        if (response.success && response.conversion) {
            const conv = response.conversion;

            // Create modal content
            const modalContent = `
                <div class="detail-modal-overlay" onclick="closeDetailModal()">
                    <div class="detail-modal" onclick="event.stopPropagation()">
                        <div class="detail-modal-header">
                            <div style="flex: 1;">
                                <h2>📋 Chi tiết đơn hàng</h2>
                                <div class="modal-actions">
                                    ${getStatusBadge(conv.status)}
                                    <button class="btn-check-at" onclick="checkATOrderStatus('${conv.id}'); closeDetailModal();">
                                        <span>🔍</span>
                                        <span>Kiểm tra AT</span>
                                    </button>
                                    ${conv.status === 'pending' ? `
                                        <button class="btn-approve" onclick="approveConversion('${conv.id}'); event.stopPropagation();">
                                            <span>✓</span>
                                            <span>Duyệt đơn</span>
                                        </button>
                                        <button class="btn-reject" onclick="rejectConversion('${conv.id}'); event.stopPropagation();">
                                            <span>✗</span>
                                            <span>Từ chối</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <button class="close-btn" onclick="closeDetailModal()">✕</button>
                        </div>
                        <div class="detail-modal-body">
                            <div class="detail-section">
                                <h3>👤 Thông tin người dùng</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Tên đăng nhập:</span>
                                        <span class="detail-value">${conv.username || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value">${conv.email || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Họ và tên:</span>
                                        <span class="detail-value">${conv.full_name || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>🏪 Thông tin đơn hàng</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Merchant:</span>
                                        <span class="detail-value">${conv.merchant_name || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Mã đơn hàng:</span>
                                        <span class="detail-value"><strong>${conv.order_code || '-'}</strong></span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Click ID:</span>
                                        <span class="detail-value">${conv.click_id || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>💰 Thông tin tài chính</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Giá trị đơn hàng:</span>
                                        <span class="detail-value highlight">${formatCurrency(conv.order_amount)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Hoa hồng:</span>
                                        <span class="detail-value">${formatCurrency(conv.commission)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Cashback:</span>
                                        <span class="detail-value highlight">${formatCurrency(conv.cashback_amount)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>📅 Thời gian</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian đặt hàng:</span>
                                        <span class="detail-value">${formatDate(conv.order_time, true)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian xác nhận:</span>
                                        <span class="detail-value">${conv.confirmed_time ? formatDate(conv.confirmed_time, true) : '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian tạo:</span>
                                        <span class="detail-value">${formatDate(conv.created_at, true)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>ℹ️ Trạng thái & UTM</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">TT Đơn hàng:</span>
                                        <span class="detail-value">${getStatusBadge(conv.status)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">TT Đối soát:</span>
                                        <span class="detail-value">${conv.is_confirmed ? '✅ Đã xác nhận' : '❌ Chưa xác nhận'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">UTM Source:</span>
                                        <span class="detail-value">${conv.utm_source || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">UTM Campaign:</span>
                                        <span class="detail-value">${conv.utm_campaign || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-modal-footer">
                            <button class="btn btn-secondary" onclick="closeDetailModal()">Đóng</button>
                        </div>
                    </div>
                </div>
            `;

            // Add to body
            document.body.insertAdjacentHTML('beforeend', modalContent);
        } else {
            throw new Error(response.message || 'Failed to load conversion details');
        }
    } catch (error) {
        console.error('Error loading details:', error);
        showToast(error.message || 'Failed to load conversion details', 'error');
    }
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const statusClass = status === 'approved' ? 'status-approved' :
                       status === 'pending' ? 'status-pending' :
                       'status-rejected';
    const statusText = status === 'approved' ? 'Đã duyệt' :
                      status === 'pending' ? 'Đang xử lý' : 'Đã hủy';
    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

/**
 * Close detail modal
 */
function closeDetailModal() {
    const modal = document.querySelector('.detail-modal-overlay');
    if (modal) {
        modal.remove();
    }
}

/**
 * Trigger check conversions (match with clicks)
 */
async function triggerSync() {
    try {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Đang kiểm tra...';

        console.log('Triggering check conversions...');

        const response = await apiRequest('/admin/check-conversions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Check response:', response);

        if (response.success) {
            const { results } = response;
            showToast(`Kiểm tra hoàn tất! Matched: ${results.matched}, Skipped: ${results.skipped}, Errors: ${results.errors}`, 'success');
            // Reload conversions after check
            await loadConversions();
        } else {
            throw new Error(response.message || 'Check failed');
        }
    } catch (error) {
        console.error('Error triggering check:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔍 Kiểm tra chuyển đổi';
    }
}

// Make functions globally accessible for onclick handlers
window.approveConversion = approveConversion;
window.rejectConversion = rejectConversion;
window.viewConversionDetails = viewConversionDetails;
window.toggleActionMenu = toggleActionMenu;
window.closeDetailModal = closeDetailModal;
window.checkATOrderStatus = checkATOrderStatus;
window.closeATComparisonModal = closeATComparisonModal;
window.confirmUpdateFromAT = confirmUpdateFromAT;
