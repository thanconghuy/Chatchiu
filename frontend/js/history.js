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
const logoutBtn = document.getElementById('logoutBtn');

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
        conversionsTable.innerHTML = '<tr class="loading-state"><td colspan="7"><div class="loading">Đang tải...</div></td></tr>';

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
        conversionsTable.innerHTML = `
            <tr class="error-state">
                <td colspan="7">
                    <div class="error">Không thể tải dữ liệu</div>
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
                <td colspan="7">
                    <p>Chưa có đơn hàng nào</p>
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
                          conv.status === 'pending' ? 'Đang xử lý' : 'Hủy';

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
                <td>${formatDate(conv.orderTime)}</td>
                <td>${conv.approvalTime ? formatDate(conv.approvalTime) : '-'}</td>
            </tr>
        `;
    }).join('');
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
        clicksTable.innerHTML = '<tr class="loading-state"><td colspan="7"><div class="loading">Đang tải...</div></td></tr>';

        const offset = clicksPage * clicksItemsPerPage;
        const response = await apiRequest(`/dashboard/recent-clicks?limit=${clicksItemsPerPage}&offset=${offset}`);

        if (response.success) {
            renderClicks(response.clicks);
            updateClicksPagination(response.clicks.length);
        }
    } catch (error) {
        console.error('Error loading clicks:', error);
        clicksTable.innerHTML = `
            <tr class="error-state">
                <td colspan="7">
                    <div class="error">Không thể tải dữ liệu</div>
                </td>
            </tr>
        `;
    }
}

/**
 * Render clicks table with highlighting for conversions
 */
function renderClicks(clicks) {
    if (clicks.length === 0) {
        clicksTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">
                    <p>Chưa có lượt click nào</p>
                </td>
            </tr>
        `;
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
}

/**
 * Update clicks pagination
 */
function updateClicksPagination(itemCount) {
    clicksPageInfo.textContent = `Trang ${clicksPage + 1}`;
    prevClicks.disabled = clicksPage === 0;
    nextClicks.disabled = itemCount < clicksItemsPerPage;
}

// Logout handler
logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});
