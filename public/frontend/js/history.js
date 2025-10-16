/**
 * History Page Logic
 */

// Check authentication
requireAuth();

// State
let currentTab = 'conversions';
let conversionsPage = 0;
let clicksPage = 0;
const ITEMS_PER_PAGE = 20;
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
const prevClicks = document.getElementById('prevClicks');
const nextClicks = document.getElementById('nextClicks');
const clicksPageInfo = document.getElementById('clicksPageInfo');

// Initialize
init();

async function init() {
    // Set user name
    const user = getUser();
    if (user && user.username) {
        userName.textContent = user.username;
    }

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
        conversionsTable.innerHTML = '<tr class="loading-state"><td colspan="8"><div class="loading">Đang tải...</div></td></tr>';

        const offset = conversionsPage * ITEMS_PER_PAGE;
        let url = `/dashboard/conversions?limit=${ITEMS_PER_PAGE}&offset=${offset}`;

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
                <td colspan="8">
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
                <td colspan="8">
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
                          conv.status === 'pending' ? 'Chờ duyệt' : 'Từ chối';

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
                <td>${formatCurrency(conv.commission)}</td>
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
    nextConversions.disabled = itemCount < ITEMS_PER_PAGE;
}

/**
 * Load clicks
 */
async function loadClicks() {
    try {
        clicksTable.innerHTML = '<tr class="loading-state"><td colspan="6"><div class="loading">Đang tải...</div></td></tr>';

        const limit = 100; // Show more clicks since they're smaller
        const response = await apiRequest(`/dashboard/recent-clicks?limit=${limit}`);

        if (response.success) {
            renderClicks(response.clicks);
        }
    } catch (error) {
        console.error('Error loading clicks:', error);
        clicksTable.innerHTML = `
            <tr class="error-state">
                <td colspan="6">
                    <div class="error">Không thể tải dữ liệu</div>
                </td>
            </tr>
        `;
    }
}

/**
 * Render clicks table
 */
function renderClicks(clicks) {
    if (clicks.length === 0) {
        clicksTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="6">
                    <p>Chưa có lượt click nào</p>
                </td>
            </tr>
        `;
        return;
    }

    clicksTable.innerHTML = clicks.map(click => {
        // Click type badge
        const clickTypeBadge = click.clickType === 'button'
            ? '<span class="click-type-badge click-type-button">🎯 Tự do</span>'
            : '<span class="click-type-badge click-type-link">🔗 Link SP</span>';

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
                              click.conversionStatus === 'pending' ? 'Chờ duyệt' : 'Từ chối';
            statusCell = `<span class="status-badge ${statusClass}">${statusText}</span>`;
        }

        // Cashback cell
        const cashbackCell = click.cashback > 0
            ? `<span class="cashback-amount">${formatCurrency(click.cashback)}</span>`
            : '<span class="cashback-none">-</span>';

        return `
            <tr>
                <td>
                    <div class="merchant-cell">
                        ${click.merchantLogo ? `<img src="${click.merchantLogo}" alt="${click.merchantName}" class="merchant-mini-logo">` : ''}
                        <span>${click.merchantName}</span>
                    </div>
                </td>
                <td>${clickTypeBadge}</td>
                <td>${formatDate(click.clickedAt)}</td>
                <td>${hasConversionBadge}</td>
                <td>${statusCell}</td>
                <td>${cashbackCell}</td>
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
    nextClicks.disabled = itemCount < ITEMS_PER_PAGE;
}

// Logout handler
logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});
