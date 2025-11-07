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
const checkPendingBtn = document.getElementById('checkPendingBtn');
const checkPendingModal = document.getElementById('checkPendingModal');
const closeCheckModal = document.getElementById('closeCheckModal');
const checkResultsContainer = document.getElementById('checkResultsContainer');
const detailsModal = document.getElementById('detailsModal');
const closeDetailsModal = document.getElementById('closeDetailsModal');
const detailsContainer = document.getElementById('detailsContainer');

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

    if (checkPendingBtn) {
        checkPendingBtn.addEventListener('click', async () => {
            await checkPendingOrders();
        });
        console.log('✓ Check pending button listener attached');
    }

    if (closeCheckModal) {
        closeCheckModal.addEventListener('click', () => {
            checkPendingModal.style.display = 'none';
        });
        console.log('✓ Close check modal listener attached');
    }

    // Close modal when clicking outside
    if (checkPendingModal) {
        checkPendingModal.addEventListener('click', (e) => {
            if (e.target === checkPendingModal) {
                checkPendingModal.style.display = 'none';
            }
        });
    }

    if (closeDetailsModal) {
        closeDetailsModal.addEventListener('click', () => {
            detailsModal.style.display = 'none';
        });
        console.log('✓ Close details modal listener attached');
    }

    // Close details modal when clicking outside
    if (detailsModal) {
        detailsModal.addEventListener('click', (e) => {
            if (e.target === detailsModal) {
                detailsModal.style.display = 'none';
            }
        });
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
        // Determine status display based on AccessTrade fields:
        // 1. order_reject = 1 → Huỷ (status should be 'rejected')
        // 2. is_confirmed = 1 → Đã duyệt (status should be 'approved')
        // 3. order_pending != 0 → Chờ duyệt (status = 'pending')
        // 4. order_approved != 0 + order_pending = 0 → Tạm duyệt (status = 'pending')

        let statusClass, statusText;

        if (conv.status === 'rejected' || conv.orderReject === 1) {
            statusClass = 'status-rejected';
            statusText = 'Huỷ';
        } else if (conv.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Đã duyệt';
        } else if (conv.status === 'pending') {
            // Check if temp approved
            const isTempApproved = conv.orderApproved > 0 &&
                                   conv.orderPending === 0 &&
                                   conv.orderReject === 0;

            if (isTempApproved) {
                statusClass = 'status-temp-approved';
                statusText = 'Tạm duyệt (đợi đối soát)';
            } else {
                statusClass = 'status-pending';
                statusText = 'Chờ duyệt';
            }
        } else {
            // Fallback
            statusClass = 'status-pending';
            statusText = 'Pending';
        }

        let actions = `
            <button class="action-btn" onclick="viewConversionDetails('${conv.id}')" style="background: #3b82f6; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin: 2px;">
                📋 Chi tiết
            </button>
        `;

        if (conv.status === 'pending') {
            actions += `
                <button class="action-btn" onclick="checkSingleOrder('${conv.id}', '${conv.orderCode}', '${conv.merchantName}', event)" style="background: #8b5cf6; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin: 2px;">
                    🔍 Kiểm tra
                </button>
                <button class="action-btn btn-approve" onclick="approveConversion('${conv.id}')">
                    ✓ Approve
                </button>
                <button class="action-btn btn-reject" onclick="rejectConversion('${conv.id}')">
                    ✗ Reject
                </button>
            `;
        }

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; font-size: 0.9rem;">${conv.username}</div>
                    ${conv.fullName ? `<div style="font-size: 0.8rem; color: var(--gray-600);">${conv.fullName}</div>` : ''}
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

/**
 * Check pending orders status from AccessTrade
 */
async function checkPendingOrders() {
    try {
        checkPendingBtn.disabled = true;
        checkPendingBtn.textContent = '⏳ Đang kiểm tra...';

        console.log('Checking pending orders...');

        const response = await apiRequest('/admin/check-pending-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Check response:', response);

        if (response.success) {
            displayCheckResults(response.results);
        } else {
            throw new Error(response.message || 'Check failed');
        }
    } catch (error) {
        console.error('Error checking pending orders:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        checkPendingBtn.disabled = false;
        checkPendingBtn.textContent = '✅ Kiểm tra đơn Pending';
    }
}

/**
 * Display check results in modal
 */
function displayCheckResults(results) {
    const { total, approved, stillPending, rejected, errors } = results;

    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 2rem; font-weight: 700; color: var(--gray-900);">${total}</div>
                <div style="color: var(--gray-600); font-size: 0.9rem; margin-top: 4px;">Tổng số đơn</div>
            </div>
            <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 2rem; font-weight: 700; color: #065f46;">${approved.length}</div>
                <div style="color: #065f46; font-size: 0.9rem; margin-top: 4px;">Đã duyệt trên AT</div>
            </div>
            <div style="background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 2rem; font-weight: 700; color: #7c2d12;">${stillPending.length}</div>
                <div style="color: #7c2d12; font-size: 0.9rem; margin-top: 4px;">Vẫn pending</div>
            </div>
            <div style="background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%); padding: 16px; border-radius: 8px; text-align: center;">
                <div style="font-size: 2rem; font-weight: 700; color: #7f1d1d;">${rejected.length + errors.length}</div>
                <div style="color: #7f1d1d; font-size: 0.9rem; margin-top: 4px;">Từ chối / Lỗi</div>
            </div>
        </div>
    `;

    // Show approved orders
    if (approved.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #065f46; margin-bottom: 16px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                    <span>✅</span>
                    <span>Đơn hàng đã duyệt trên AccessTrade (${approved.length})</span>
                </h3>
                <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <p style="margin: 0 0 12px 0; color: #065f46; font-weight: 600;">
                        Các đơn hàng này đã được duyệt trên AccessTrade. Bạn có muốn cập nhật trạng thái trên hệ thống không?
                    </p>
                    <button onclick="approveAllPendingOrders()" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                        Xác nhận cập nhật tất cả ${approved.length} đơn
                    </button>
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead>
                            <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
                                <th style="padding: 8px; text-align: left;">Mã đơn</th>
                                <th style="padding: 8px; text-align: left;">Merchant</th>
                                <th style="padding: 8px; text-align: left;">Email</th>
                                <th style="padding: 8px; text-align: right;">Cashback</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        approved.forEach(order => {
            html += `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 8px;">${order.order_code}</td>
                    <td style="padding: 8px;">${order.merchant_name}</td>
                    <td style="padding: 8px; color: #6b7280; font-size: 0.85rem;">${order.user_email}</td>
                    <td style="padding: 8px; text-align: right; font-weight: 600; color: #10b981;">${formatCurrency(order.cashback_amount)}</td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // Show still pending orders
    if (stillPending.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #c2410c; margin-bottom: 12px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                    <span>⏳</span>
                    <span>Đơn hàng vẫn đang pending (${stillPending.length})</span>
                </h3>
                <div style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto;">
        `;

        stillPending.forEach(order => {
            html += `
                <div style="padding: 6px 0; border-bottom: 1px solid #fef3c7; font-size: 0.9rem;">
                    <strong>${order.order_code}</strong> - ${order.merchant_name}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    // Show rejected/error orders
    if (rejected.length > 0 || errors.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #991b1b; margin-bottom: 12px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                    <span>❌</span>
                    <span>Đơn hàng bị từ chối hoặc lỗi (${rejected.length + errors.length})</span>
                </h3>
                <div style="background: #fef2f2; border: 1px solid #f87171; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto;">
        `;

        [...rejected, ...errors].forEach(order => {
            html += `
                <div style="padding: 6px 0; border-bottom: 1px solid #fee2e2; font-size: 0.9rem;">
                    <strong>${order.order_code}</strong> - ${order.merchant_name}
                    <div style="color: #991b1b; font-size: 0.85rem; margin-top: 2px;">${order.reason || 'Rejected'}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    if (total === 0) {
        html = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 4rem; margin-bottom: 16px;">🎉</div>
                <h3 style="color: var(--gray-700); margin-bottom: 8px;">Không có đơn pending nào</h3>
                <p style="color: var(--gray-500);">Tất cả đơn hàng đã được xử lý</p>
            </div>
        `;
    }

    checkResultsContainer.innerHTML = html;
    checkPendingModal.style.display = 'flex';

    // Store approved order IDs for batch approval
    window.approvedOrderIds = approved.map(o => o.id);
}

/**
 * Approve all pending orders
 */
async function approveAllPendingOrders() {
    if (!window.approvedOrderIds || window.approvedOrderIds.length === 0) {
        showToast('Không có đơn nào để duyệt', 'error');
        return;
    }

    if (!confirm(`Xác nhận cập nhật ${window.approvedOrderIds.length} đơn hàng sang trạng thái Approved?\n\nSố dư cashback sẽ được cộng vào tài khoản người dùng.`)) {
        return;
    }

    try {
        const response = await apiRequest('/admin/approve-pending-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                order_ids: window.approvedOrderIds
            })
        });

        if (response.success) {
            showToast(`Đã duyệt ${response.results.approved} đơn hàng!`, 'success');
            checkPendingModal.style.display = 'none';
            await loadConversions();
        } else {
            throw new Error(response.message || 'Failed to approve orders');
        }
    } catch (error) {
        console.error('Error approving orders:', error);
        showToast('Lỗi: ' + error.message, 'error');
    }
}

/**
 * Check single order status from AccessTrade
 */
async function checkSingleOrder(conversionId, orderCode, merchantName, event) {
    const btn = event?.target;

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Đang kiểm tra...';
        }

        console.log('Checking single order:', orderCode);

        const response = await apiRequest(`/admin/check-single-order?order_code=${orderCode}&merchant=${merchantName}`);

        console.log('Check single order response:', response);

        if (response.success) {
            const { status, totalCommission, confirmedTime, details } = response;

            if (status === 'approved') {
                let message = `✅ Đơn hàng #${orderCode} đã được duyệt trên AccessTrade!\n\n`;

                if (totalCommission) {
                    message += `Tổng hoa hồng: ${totalCommission.toLocaleString('vi-VN')} VND\n`;
                }

                if (confirmedTime) {
                    const date = new Date(confirmedTime);
                    message += `Thời gian xác nhận: ${date.toLocaleString('vi-VN')}\n`;
                }

                message += `\nBạn có muốn cập nhật trạng thái trên hệ thống?`;

                if (confirm(message)) {
                    await approveConversion(conversionId);
                }
            } else if (status === 'pending') {
                showToast(`⏳ Đơn hàng vẫn đang pending trên AccessTrade`, 'info');
            } else if (status === 'rejected') {
                showToast(`❌ Đơn hàng đã bị từ chối trên AccessTrade`, 'error');
            } else {
                showToast(`❓ Không tìm thấy đơn hàng trên AccessTrade`, 'warning');
            }
        } else {
            throw new Error(response.message || 'Check failed');
        }
    } catch (error) {
        console.error('Error checking single order:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔍 Kiểm tra';
        }
    }
}

/**
 * View conversion details
 */
async function viewConversionDetails(conversionId) {
    try {
        detailsContainer.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading">Đang tải...</div></div>';
        detailsModal.style.display = 'flex';

        const response = await apiRequest(`/admin/conversion/${conversionId}/details`);

        if (response.success && response.conversion) {
            const conv = response.conversion;
            const statusClass = conv.status === 'approved' ? 'status-approved' :
                               conv.status === 'pending' ? 'status-pending' : 'status-rejected';
            const statusText = conv.status === 'approved' ? 'Approved' :
                              conv.status === 'pending' ? 'Pending' : 'Rejected';

            let html = `
                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">Merchant</div>
                            <div style="font-weight: 600; color: #111827;">${conv.merchant_name}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">Trạng thái</div>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">Order Code</div>
                            <div style="font-weight: 600; color: #111827;">${conv.order_code || '-'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">User</div>
                            <div style="font-weight: 600; color: #111827;">${conv.user_email}</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                    <div style="background: #eff6ff; border-radius: 8px; padding: 16px;">
                        <div style="font-size: 0.85rem; color: #1e40af; margin-bottom: 4px;">Giá trị đơn</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${formatCurrency(conv.order_amount)}</div>
                    </div>
                    <div style="background: #f0fdf4; border-radius: 8px; padding: 16px;">
                        <div style="font-size: 0.85rem; color: #15803d; margin-bottom: 4px;">Cashback</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: #166534;">${formatCurrency(conv.cashback_amount)}</div>
                    </div>
                </div>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                    <div style="font-size: 0.9rem; font-weight: 600; color: #374151; margin-bottom: 12px;">Thông tin hoa hồng</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280;">Commission</div>
                            <div style="font-weight: 600;">${formatCurrency(conv.commission)}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #6b7280;">Commission Rate</div>
                            <div style="font-weight: 600;">${conv.commission_rate || 0}%</div>
                        </div>
                    </div>
                </div>

                <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                    <div style="font-size: 0.9rem; font-weight: 600; color: #374151; margin-bottom: 12px;">Thời gian</div>
                    <div style="display: grid; gap: 8px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #6b7280;">Thời gian đặt:</span>
                            <span style="font-weight: 600;">${formatDate(conv.order_time)}</span>
                        </div>
                        ${conv.approved_at ? `
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #6b7280;">Thời gian duyệt:</span>
                            <span style="font-weight: 600;">${formatDate(conv.approved_at)}</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #6b7280;">Cập nhật lần cuối:</span>
                            <span style="font-weight: 600;">${formatDate(conv.updated_at)}</span>
                        </div>
                    </div>
                </div>
            `;

            detailsContainer.innerHTML = html;
        } else {
            throw new Error(response.message || 'Failed to load details');
        }
    } catch (error) {
        console.error('Error loading conversion details:', error);
        detailsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <div style="font-size: 3rem; margin-bottom: 16px;">❌</div>
                <div>Không thể tải chi tiết: ${error.message}</div>
            </div>
        `;
    }
}

// Make functions globally accessible for onclick handlers
window.approveConversion = approveConversion;
window.rejectConversion = rejectConversion;
window.approveAllPendingOrders = approveAllPendingOrders;
window.checkSingleOrder = checkSingleOrder;
window.viewConversionDetails = viewConversionDetails;
