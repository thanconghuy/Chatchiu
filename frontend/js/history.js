/**
 * History Page Logic
 */

// Check authentication
requireAuth();

// State
let currentTab = 'conversions';
let conversionsPage = 0;
let clicksPage = 0;
let conversionsItemsPerPage = 20;
let clicksItemsPerPage = 20;
let currentStatusFilter = '';

// DOM Elements
const userName = document.getElementById('userName');
const conversionsTab = document.getElementById('conversionsTab');
const clicksTab = document.getElementById('clicksTab');
const conversionsTable = document.getElementById('conversionsTable');
const clicksTable = document.getElementById('clicksTable');
const statusFilter = document.getElementById('statusFilter');

// Pagination elements
const prevConversions = document.getElementById('prevConversions');
const nextConversions = document.getElementById('nextConversions');
const conversionsPageInfo = document.getElementById('conversionsPageInfo');
const conversionsRowsPerPage = document.getElementById('conversionsRowsPerPage');
const prevClicks = document.getElementById('prevClicks');
const nextClicks = document.getElementById('nextClicks');
const clicksPageInfo = document.getElementById('clicksPageInfo');
const clicksRowsPerPage = document.getElementById('clicksRowsPerPage');

// Initialize
init();

async function init() {
    // Set user name - display full name
    displayUserName('userName');

    // Load initial data
    await loadConversions();
    await loadClicks();

    // Setup event listeners
    setupTabs();
    setupPagination();
    setupFilters();
}

/**
 * Setup tab switching
 */
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Update active states
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${targetTab}Tab`).classList.add('active');

            currentTab = targetTab;
        });
    });
}

/**
 * Setup pagination
 */
function setupPagination() {
    // Conversions pagination
    prevConversions.addEventListener('click', () => {
        if (conversionsPage > 0) {
            conversionsPage--;
            loadConversions();
        }
    });

    nextConversions.addEventListener('click', () => {
        conversionsPage++;
        loadConversions();
    });

    // Conversions rows per page
    if (conversionsRowsPerPage) {
        conversionsRowsPerPage.addEventListener('change', (e) => {
            conversionsItemsPerPage = parseInt(e.target.value);
            conversionsPage = 0; // Reset to first page
            loadConversions();
        });
    }

    // Clicks pagination
    prevClicks.addEventListener('click', () => {
        if (clicksPage > 0) {
            clicksPage--;
            loadClicks();
        }
    });

    nextClicks.addEventListener('click', () => {
        clicksPage++;
        loadClicks();
    });

    // Clicks rows per page
    if (clicksRowsPerPage) {
        clicksRowsPerPage.addEventListener('change', (e) => {
            clicksItemsPerPage = parseInt(e.target.value);
            clicksPage = 0; // Reset to first page
            loadClicks();
        });
    }
}

/**
 * Setup filters
 */
function setupFilters() {
    statusFilter.addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        conversionsPage = 0; // Reset to first page
        loadConversions();
    });
}

/**
 * Load conversions
 */
async function loadConversions() {
    try {
        const conversionsCards = document.getElementById('conversionsCards');

        conversionsTable.innerHTML = '<tr class="loading-state"><td colspan="8"><div class="loading">Đang tải...</div></td></tr>';
        if (conversionsCards) {
            conversionsCards.innerHTML = '<div class="loading">Đang tải...</div>';
        }

        const offset = conversionsPage * conversionsItemsPerPage;
        let url = `/dashboard/conversions?limit=${conversionsItemsPerPage}&offset=${offset}`;

        if (currentStatusFilter) {
            url += `&status=${currentStatusFilter}`;
        }

        const response = await apiRequest(url);

        if (response.success) {
            renderConversions(response.conversions);
            updateConversionsPagination(response.conversions.length);
        }
    } catch (error) {
        console.error('Error loading conversions:', error);
        const conversionsCards = document.getElementById('conversionsCards');

        conversionsTable.innerHTML = `
            <tr class="error-state">
                <td colspan="8">
                    <div class="error">Không thể tải dữ liệu</div>
                </td>
            </tr>
        `;
        if (conversionsCards) {
            conversionsCards.innerHTML = '<div class="error">Không thể tải dữ liệu</div>';
        }
    }
}

/**
 * Render conversions table
 */
function renderConversions(conversions) {
    const conversionsCards = document.getElementById('conversionsCards');

    if (conversions.length === 0) {
        conversionsTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">
                    <p>Chưa có đơn hàng nào</p>
                </td>
            </tr>
        `;
        if (conversionsCards) {
            conversionsCards.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">Chưa có đơn hàng nào</div>';
        }
        return;
    }

    conversionsTable.innerHTML = conversions.map(conv => {
        const statusClass = conv.status === 'approved' ? 'status-approved' :
                           conv.status === 'pending' ? 'status-pending' :
                           'status-rejected';
        const statusText = conv.status === 'approved' ? 'Đã duyệt' :
                          conv.status === 'pending' ? 'Đang xử lý' : 'Hủy';

        // Reconciliation status - Kiểm tra từ bảng reconciliation_items và reconciliations
        let reconciliationBadge;
        if (conv.isReconciled) {
            // Đã đối soát = có trong reconciliation_items VÀ status = 'completed'
            const periodInfo = conv.reconciliationPeriod ? ` (${conv.reconciliationPeriod})` : '';
            reconciliationBadge = `<span class="status-badge status-approved" title="Đã hoàn thành đối soát${periodInfo}">Đã đối soát</span>`;
        } else if (conv.reconciliationStatus && conv.reconciliationStatus !== 'completed') {
            // Có trong reconciliation nhưng chưa completed
            const statusMap = {
                'draft': 'Nháp',
                'pending': 'Chờ duyệt',
                'cancelled': 'Đã hủy'
            };
            const statusText = statusMap[conv.reconciliationStatus] || conv.reconciliationStatus;
            reconciliationBadge = `<span class="status-badge status-pending" title="Trạng thái: ${statusText}">Đang xử lý</span>`;
        } else {
            // Chưa có trong hệ thống đối soát
            reconciliationBadge = '<span class="status-badge status-gray">Chưa đối soát</span>';
        }

        return `
            <tr>
                <td>
                    <div class="merchant-cell">
                        ${conv.merchantLogo ? `<img src="${conv.merchantLogo}" alt="${conv.merchantName}" class="merchant-mini-logo">` : ''}
                        <span>${conv.merchantName}</span>
                    </div>
                </td>
                <td>${conv.orderCode || '-'}</td>
                <td>${formatCurrency(conv.orderAmount)}</td>
                <td class="highlight">${formatCurrency(conv.cashbackAmount)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${reconciliationBadge}</td>
                <td>${formatDate(conv.orderTime)}</td>
                <td>${conv.approvalTime ? formatDate(conv.approvalTime) : '-'}</td>
            </tr>
        `;
    }).join('');

    // Render mobile cards
    if (conversionsCards) {
        conversionsCards.innerHTML = conversions.map(conv => {
            const statusClass = conv.status === 'approved' ? 'status-approved' :
                               conv.status === 'pending' ? 'status-pending' :
                               'status-rejected';
            const statusText = conv.status === 'approved' ? 'Đã duyệt' :
                              conv.status === 'pending' ? 'Đang xử lý' : 'Hủy';

            // Reconciliation status
            let reconciliationBadge;
            if (conv.isReconciled) {
                const periodInfo = conv.reconciliationPeriod ? ` (${conv.reconciliationPeriod})` : '';
                reconciliationBadge = `<span class="status-badge status-approved" title="Đã hoàn thành đối soát${periodInfo}">Đã đối soát</span>`;
            } else if (conv.reconciliationStatus && conv.reconciliationStatus !== 'completed') {
                const statusMap = { 'draft': 'Nháp', 'pending': 'Chờ duyệt', 'cancelled': 'Đã hủy' };
                const reconStatusText = statusMap[conv.reconciliationStatus] || conv.reconciliationStatus;
                reconciliationBadge = `<span class="status-badge status-pending" title="Trạng thái: ${reconStatusText}">Đang xử lý</span>`;
            } else {
                reconciliationBadge = '<span class="status-badge status-gray">Chưa đối soát</span>';
            }

            return `
                <div class="conversion-card">
                    <div class="conversion-card-header">
                        ${conv.merchantLogo ? `<img src="${conv.merchantLogo}" alt="${conv.merchantName}">` : ''}
                        <div class="conversion-card-merchant">
                            <div class="conversion-card-merchant-name">${conv.merchantName}</div>
                            <div class="conversion-card-order-code">${conv.orderCode || '-'}</div>
                        </div>
                    </div>
                    <div class="conversion-card-body">
                        <div class="conversion-card-item">
                            <div class="conversion-card-label">Giá trị đơn</div>
                            <div class="conversion-card-value">${formatCurrency(conv.orderAmount)}</div>
                        </div>
                        <div class="conversion-card-item">
                            <div class="conversion-card-label">Cashback</div>
                            <div class="conversion-card-value highlight">${formatCurrency(conv.cashbackAmount)}</div>
                        </div>
                        <div class="conversion-card-item">
                            <div class="conversion-card-label">TT Đơn hàng</div>
                            <div class="conversion-card-value"><span class="status-badge ${statusClass}">${statusText}</span></div>
                        </div>
                        <div class="conversion-card-item">
                            <div class="conversion-card-label">TT Đối soát</div>
                            <div class="conversion-card-value">${reconciliationBadge}</div>
                        </div>
                    </div>
                    <div class="conversion-card-footer">
                        <div class="conversion-card-date">
                            📅 ${formatDate(conv.orderTime)}
                        </div>
                        ${conv.approvalTime ? `
                        <div class="conversion-card-date">
                            ✅ ${formatDate(conv.approvalTime)}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
}

/**
 * Update conversions pagination
 */
function updateConversionsPagination(itemCount) {
    conversionsPageInfo.textContent = `Trang ${conversionsPage + 1}`;
    prevConversions.disabled = conversionsPage === 0;
    nextConversions.disabled = itemCount < conversionsItemsPerPage;
}

/**
 * Load clicks with pagination
 */
async function loadClicks() {
    try {
        const clicksCards = document.getElementById('clicksCards');

        clicksTable.innerHTML = '<tr class="loading-state"><td colspan="7"><div class="loading">Đang tải...</div></td></tr>';
        if (clicksCards) {
            clicksCards.innerHTML = '<div class="loading">Đang tải...</div>';
        }

        const offset = clicksPage * clicksItemsPerPage;
        const response = await apiRequest(`/dashboard/recent-clicks?limit=${clicksItemsPerPage}&offset=${offset}`);

        if (response.success) {
            renderClicks(response.clicks);
            updateClicksPagination(response.clicks.length);
        }
    } catch (error) {
        console.error('Error loading clicks:', error);
        const clicksCards = document.getElementById('clicksCards');

        clicksTable.innerHTML = `
            <tr class="error-state">
                <td colspan="7">
                    <div class="error">Không thể tải dữ liệu</div>
                </td>
            </tr>
        `;
        if (clicksCards) {
            clicksCards.innerHTML = '<div class="error">Không thể tải dữ liệu</div>';
        }
    }
}

/**
 * Render clicks table with highlighting for conversions
 */
function renderClicks(clicks) {
    const clicksCards = document.getElementById('clicksCards');

    if (clicks.length === 0) {
        clicksTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">
                    <p>Chưa có lượt click nào</p>
                </td>
            </tr>
        `;
        if (clicksCards) {
            clicksCards.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">Chưa có lượt click nào</div>';
        }
        return;
    }

    clicksTable.innerHTML = clicks.map(click => {
        // Highlight row if has conversion
        const rowStyle = click.hasConversion ?
            'background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981;' :
            '';

        // Icon for conversion
        const conversionIcon = click.hasConversion ? '🎉 ' : '';

        // Click type badge
        const clickTypeBadge = click.clickType === 'button'
            ? '<span class="click-type-badge click-type-button">🎯 Tự do</span>'
            : '<span class="click-type-badge click-type-link">🔗 Link SP</span>';

        // Link button
        const linkButton = click.affiliateUrl
            ? `<a href="${click.affiliateUrl}" target="_blank" rel="noopener noreferrer" class="link-btn" title="Mở link mua hàng">
                   🔗 Mở link
               </a>`
            : '<span class="link-none">-</span>';

        // Has conversion badge
        const hasConversionBadge = click.hasConversion
            ? '<span class="conversion-badge conversion-yes">✓ Có</span>'
            : '<span class="conversion-badge conversion-no">Không</span>';

        // Status cell
        let statusCell = '<span class="status-badge status-none">-</span>';
        if (click.hasConversion) {
            const statusClass = click.conversionStatus === 'approved' ? 'status-approved' :
                               click.conversionStatus === 'pending' ? 'status-pending' :
                               'status-rejected';
            const statusText = click.conversionStatus === 'approved' ? 'Đã duyệt' :
                              click.conversionStatus === 'pending' ? 'Đang xử lý' : 'Hủy';
            statusCell = `<span class="status-badge ${statusClass}">${statusText}</span>`;
        }

        // Cashback cell with highlight color
        const cashbackCell = click.cashback > 0
            ? `<strong style="color: ${click.hasConversion ? '#10b981' : '#666'};">${formatCurrency(click.cashback)}</strong>`
            : '<span class="cashback-none">-</span>';

        return `
            <tr style="${rowStyle}">
                <td>
                    <div class="merchant-cell">
                        ${click.merchantLogo ? `<img src="${click.merchantLogo}" alt="${click.merchantName}" class="merchant-mini-logo">` : ''}
                        <strong>${conversionIcon}${click.merchantName}</strong>
                    </div>
                </td>
                <td>${clickTypeBadge}</td>
                <td>${formatDate(click.clickedAt)}</td>
                <td>${hasConversionBadge}</td>
                <td>${statusCell}</td>
                <td>${cashbackCell}</td>
                <td>${linkButton}</td>
            </tr>
        `;
    }).join('');

    // Render mobile cards
    if (clicksCards) {
        clicksCards.innerHTML = clicks.map(click => {
            // Click type badge
            const clickTypeBadge = click.clickType === 'button'
                ? '<span class="click-type-badge click-type-button">Tự do</span>'
                : '<span class="click-type-badge click-type-link">Link SP</span>';

            // Has conversion badge
            const hasConversionBadge = click.hasConversion
                ? '<span class="conversion-badge conversion-yes">✓ Có</span>'
                : '<span class="conversion-badge conversion-no">Không</span>';

            // Status badge
            let statusBadge = '<span class="status-badge status-gray">-</span>';
            if (click.hasConversion) {
                const statusClass = click.conversionStatus === 'approved' ? 'status-approved' :
                                   click.conversionStatus === 'pending' ? 'status-pending' :
                                   'status-rejected';
                const statusText = click.conversionStatus === 'approved' ? 'Đã duyệt' :
                                  click.conversionStatus === 'pending' ? 'Đang xử lý' : 'Hủy';
                statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;
            }

            // Cashback with highlight
            const cashbackValue = click.cashback > 0
                ? `<span class="highlight">${formatCurrency(click.cashback)}</span>`
                : '<span style="color: #9ca3af;">-</span>';

            // Link button
            const linkButton = click.affiliateUrl
                ? `<a href="${click.affiliateUrl}" target="_blank" rel="noopener noreferrer" class="link-btn-inline" title="Mở link mua hàng">Mở link</a>`
                : '';

            // Card style - highlight if has conversion
            const cardClass = click.hasConversion ? 'click-card has-conversion' : 'click-card';

            return `
                <div class="${cardClass}">
                    <div class="click-card-header">
                        ${click.merchantLogo ? `<img src="${click.merchantLogo}" alt="${click.merchantName}">` : ''}
                        <div class="click-card-merchant">
                            <div class="click-card-merchant-name">${click.merchantName}</div>
                            <div class="click-card-click-type">${clickTypeBadge}</div>
                        </div>
                        ${linkButton}
                    </div>
                    <div class="click-card-body">
                        <div class="click-card-item">
                            <div class="click-card-label">Thời gian click</div>
                            <div class="click-card-value">${formatDate(click.clickedAt)}</div>
                        </div>
                        <div class="click-card-item">
                            <div class="click-card-label">Có mua hàng?</div>
                            <div class="click-card-value">${hasConversionBadge}</div>
                        </div>
                        <div class="click-card-item">
                            <div class="click-card-label">Trạng thái</div>
                            <div class="click-card-value">${statusBadge}</div>
                        </div>
                        <div class="click-card-item">
                            <div class="click-card-label">Cashback</div>
                            <div class="click-card-value">${cashbackValue}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

/**
 * Update clicks pagination
 */
function updateClicksPagination(itemCount) {
    clicksPageInfo.textContent = `Trang ${clicksPage + 1}`;
    prevClicks.disabled = clicksPage === 0;
    nextClicks.disabled = itemCount < clicksItemsPerPage;
}

// Logout handler is now in user-sidebar.js

/**
 * Auto-refresh data when user returns to the page
 */
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page became visible - refresh current tab data
        if (currentTab === 'conversions') {
            loadConversions();
        } else {
            loadClicks();
        }
    }
});
