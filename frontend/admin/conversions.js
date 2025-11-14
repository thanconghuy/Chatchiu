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
const ITEMS_PER_PAGE = 50;

// DOM Elements
const userName = document.getElementById('userName');
const statusFilter = document.getElementById('statusFilter');
const conversionsTable = document.getElementById('conversionsTable');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
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
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
            </tr>
        `).join('');
        conversionsTable.innerHTML = skeletonRows;

        const offset = currentPage * ITEMS_PER_PAGE;
        let url = `/admin/conversions?limit=${ITEMS_PER_PAGE}&offset=${offset}`;

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
                <td colspan="9">
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
                <td colspan="9">
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
            <tr>
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
                <td>${formatDate(conv.orderTime)}</td>
                <td style="white-space: nowrap;">${actions}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Update pagination
 */
function updatePagination(itemCount) {
    pageInfo.textContent = `Page ${currentPage + 1}`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = itemCount < ITEMS_PER_PAGE;
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
                            <h2>📋 Chi tiết đơn hàng</h2>
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
