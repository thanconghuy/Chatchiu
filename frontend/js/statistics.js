/**
 * Statistics Page Logic
 */

// Check authentication
requireAuth();

// Check if admin - redirect to admin page
const user = getUser();
if (user && user.is_admin) {
    window.location.href = '/admin';
}

// State
let currentClicksPage = 0;
let clicksPerPage = 20; // Default: 20 items per page

// DOM Elements
const availableBalance = document.getElementById('availableBalance');
const pendingBalance = document.getElementById('pendingBalance');
const totalOrders = document.getElementById('totalOrders');
const approvedOrders = document.getElementById('approvedOrders');
const recentOrdersTable = document.getElementById('recentOrdersTable');

// Initialize
init();

async function init() {
    // Display user name using shared utility function
    displayUserName('userName');

    // Update desktop and mobile user names
    const desktopUserName = document.getElementById('desktopUserName');
    const mobileUserName = document.getElementById('mobileUserName');
    const avatarInitial = document.getElementById('avatarInitial');

    if (user) {
        const displayName = user.full_name || user.username || 'User';

        if (desktopUserName) {
            desktopUserName.textContent = displayName;
        }
        if (mobileUserName) {
            mobileUserName.textContent = displayName;
        }
        if (avatarInitial) {
            avatarInitial.textContent = displayName.charAt(0).toUpperCase();
        }
    }

    // Load data
    await Promise.all([
        loadStats(),
        loadRecentOrders()
    ]);

    // Auto refresh stats every 5 minutes
    setInterval(loadStats, 5 * 60 * 1000);
}

/**
 * Helper: Format time ago (e.g., "2 giờ trước", "Hôm qua")
 */
function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN');
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Render mobile history cards
 */
function renderMobileHistoryCards(orders) {
    const historyCardsList = document.getElementById('historyCardsList');

    if (!historyCardsList) {
        console.error('historyCardsList element not found!');
        return;
    }

    if (!orders || orders.length === 0) {
        historyCardsList.innerHTML = `
            <div class="empty-state-card">
                <p>Chưa có lịch sử click nào</p>
            </div>
        `;
        return;
    }

    historyCardsList.innerHTML = orders.map(order => {
        // Match desktop logic: check hasConversion first
        let statusClass = '';
        let statusText = '';

        if (order.hasConversion) {
            // Has conversion - show actual status
            statusClass = order.conversionStatus === 'approved' ? 'success' :
                         order.conversionStatus === 'pending' ? 'pending' : 'rejected';
            statusText = order.conversionStatus === 'approved' ? '✅ Đã duyệt' :
                        order.conversionStatus === 'pending' ? '⏳ Đang xử lý' : '❌ Hủy';
        } else {
            // No conversion yet - show "Chưa mua"
            statusClass = 'not-purchased';
            statusText = '⏸️ Chưa mua';
        }

        const timeAgo = formatTimeAgo(new Date(order.clickedAt));
        const cashback = order.cashback || 0;

        // Generate link button HTML
        const linkButton = order.affiliateUrl
            ? `<button class="history-link-btn" data-action="open-link" data-url="${escapeHtml(order.affiliateUrl)}">
                 🔗 Mở link
               </button>`
            : `<button class="history-link-btn" disabled style="opacity: 0.5;">
                 🔗 Không có link
               </button>`;

        // Merchant logo or fallback icon
        const merchantIcon = order.merchantLogo
            ? `<img src="${escapeHtml(order.merchantLogo)}" alt="${escapeHtml(order.merchantName)}" class="merchant-mini-logo">`
            : '🛒';

        return `
            <div class="history-card">
                <div class="history-card-header">
                    <span class="history-merchant">
                        ${merchantIcon} ${escapeHtml(order.merchantName)}
                    </span>
                    ${linkButton}
                </div>
                <div class="history-card-body">
                    <div class="history-card-row">
                        <span class="history-amount">+${formatCurrency(cashback)}</span>
                        <span class="history-time">${timeAgo}</span>
                    </div>
                    <div class="history-card-row">
                        <span class="history-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Load recent orders with pagination (mobile + desktop)
 */
async function loadRecentOrders() {
    try {
        const offset = currentClicksPage * clicksPerPage;
        const response = await apiRequest(`/dashboard/recent-clicks?limit=${clicksPerPage}&offset=${offset}`);

        if (response.success) {
            // Render desktop table
            renderRecentOrders(response.clicks);
            updateClicksPagination(response.clicks.length);

            // Render mobile cards
            renderMobileHistoryCards(response.clicks);
        }
    } catch (error) {
        console.error('❌ Error loading recent orders:', error);

        // Show error in mobile cards too
        const historyCardsList = document.getElementById('historyCardsList');
        if (historyCardsList) {
            historyCardsList.innerHTML = `
                <div class="empty-state-card">
                    <p>Lỗi tải lịch sử. Vui lòng thử lại.</p>
                </div>
            `;
        }
    }
}

/**
 * Render recent orders with highlighting for conversions
 */
function renderRecentOrders(clicks) {
    if (clicks.length === 0) {
        recentOrdersTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="6">
                    <p>Chưa có lượt click nào</p>
                </td>
            </tr>
        `;
        return;
    }

    recentOrdersTable.innerHTML = clicks.map(click => {
        const statusClass = click.conversionStatus === 'approved' ? 'status-approved' :
                           click.conversionStatus === 'pending' ? 'status-pending' : '';
        const statusText = click.hasConversion ?
            (click.conversionStatus === 'approved' ? 'Đã duyệt' :
             click.conversionStatus === 'pending' ? 'Đang xử lý' : 'Hủy') :
            'Chưa mua';

        // Create link button if affiliate URL exists
        const linkButton = click.affiliateUrl
            ? `<a href="${click.affiliateUrl}" target="_blank" class="link-btn">🔗 Mở link</a>`
            : '<span class="link-none">-</span>';

        // Highlight row if has conversion
        const rowStyle = click.hasConversion ?
            'background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981;' :
            '';

        // Icon for conversion
        const conversionIcon = click.hasConversion ? '🎉 ' : '';

        return `
            <tr style="${rowStyle}">
                <td><strong>${conversionIcon}${click.merchantName}</strong></td>
                <td>${click.clickType === 'button' ? '🎯 Tự do' : '🔗 Link SP'}</td>
                <td>${formatDate(click.clickedAt)}</td>
                <td>
                    ${statusClass ? `<span class="status-badge ${statusClass}">${statusText}</span>` : statusText}
                </td>
                <td><strong style="color: ${click.hasConversion ? '#10b981' : '#666'};">${click.cashback ? formatCurrency(click.cashback) : '-'}</strong></td>
                <td>${linkButton}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Update clicks pagination controls
 */
function updateClicksPagination(clicksCount) {
    const pagination = document.getElementById('clicksPagination');
    const prevBtn = document.getElementById('prevClicksBtn');
    const nextBtn = document.getElementById('nextClicksBtn');
    const pageInfo = document.getElementById('clicksPageInfo');

    if (clicksCount > 0) {
        pagination.style.display = 'flex';
        prevBtn.disabled = currentClicksPage === 0;
        nextBtn.disabled = clicksCount < clicksPerPage;

        // Display range info (e.g., "1-20 | Trang 1")
        const startItem = currentClicksPage * clicksPerPage + 1;
        const endItem = startItem + clicksCount - 1;
        pageInfo.textContent = `${startItem}-${endItem} | Trang ${currentClicksPage + 1}`;
    } else {
        pagination.style.display = 'none';
    }
}

/**
 * Update Hero Balance Card
 */
async function updateHeroBalance() {
    try {
        const response = await apiRequest('/dashboard/stats');
        if (response && response.success) {
            const heroBalance = document.getElementById('heroBalance');

            if (heroBalance) {
                heroBalance.textContent = formatCurrency(response.stats.availableBalance || 0);
            }
        }
    } catch (error) {
        console.error('Error updating hero balance:', error);
    }
}

/**
 * Load stats and update all stat cards
 */
async function loadStats() {
    try {
        console.log('Loading statistics...');
        const response = await apiRequest('/dashboard/stats');
        console.log('Stats response:', response);

        if (response && response.success) {
            const stats = response.stats;
            console.log('Stats data:', stats);

            // Update old stat cards (if they exist)
            if (availableBalance) availableBalance.textContent = formatCurrency(stats.availableBalance || 0);
            if (pendingBalance) pendingBalance.textContent = formatCurrency(stats.pendingBalance || 0);
            if (totalOrders) totalOrders.textContent = stats.totalConversions || 0;
            if (approvedOrders) approvedOrders.textContent = stats.approvedConversions || 0;

            // Update mobile-optimized cards
            const heroBalance = document.getElementById('heroBalance');
            const approvedBalance = document.getElementById('approvedBalance');
            const approvalRate = document.getElementById('approvalRate');

            if (heroBalance) {
                heroBalance.textContent = formatCurrency(stats.availableBalance || 0);
            }

            if (approvedBalance) {
                approvedBalance.textContent = formatCurrency(stats.approvedBalance || 0);
            }

            if (approvalRate) {
                const total = stats.totalConversions || 0;
                const approved = stats.approvedConversions || 0;
                const rate = total > 0 ? ((approved / total) * 100).toFixed(1) : 0;
                approvalRate.textContent = `${rate}%`;
            }

            console.log('Stats loaded successfully');
        } else {
            console.error('Stats response not successful:', response);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        console.error('Error details:', error.message, error.stack);
    }
}

// Balance expand button handler
const expandBalanceBtn = document.getElementById('expandBalanceBtn');
if (expandBalanceBtn) {
    expandBalanceBtn.addEventListener('click', () => {
        // Navigate to history page
        window.location.href = '/history';
    });
}

// Initialize mobile enhancements on load
updateHeroBalance();

// Pagination event listeners
document.getElementById('prevClicksBtn')?.addEventListener('click', () => {
    if (currentClicksPage > 0) {
        currentClicksPage--;
        loadRecentOrders();
    }
});

document.getElementById('nextClicksBtn')?.addEventListener('click', () => {
    currentClicksPage++;
    loadRecentOrders();
});

// Items per page selector
document.getElementById('clicksPerPageSelect')?.addEventListener('change', (e) => {
    clicksPerPage = parseInt(e.target.value);
    currentClicksPage = 0; // Reset to first page
    loadRecentOrders();
});

/**
 * Auto-refresh data when user returns to the page
 */
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page became visible - refresh stats and recent orders
        loadStats();
        loadRecentOrders();
    }
});

/**
 * Button event handlers
 */

// Balance History button - Navigate to payment history page
const btnBalanceHistory = document.getElementById('btnBalanceHistory');
if (btnBalanceHistory) {
    btnBalanceHistory.addEventListener('click', () => {
        window.location.href = '/payment-history';
    });
}

// Withdraw button - Navigate to payment requests page
const btnWithdraw = document.getElementById('btnWithdraw');
if (btnWithdraw) {
    btnWithdraw.addEventListener('click', () => {
        window.location.href = '/payment-requests.html';
    });
}

// ============ CSP FIX: Event Delegation ============
document.addEventListener('click', (e) => {
    const element = e.target.closest('[data-action]');
    if (!element) return;

    const action = element.dataset.action;
    const url = element.dataset.url;

    switch (action) {
        case 'open-link':
            window.open(url, '_blank');
            break;
    }
});

console.log('[statistics.js] CSP-compliant event delegation loaded');
