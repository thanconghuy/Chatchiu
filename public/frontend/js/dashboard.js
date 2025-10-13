/**
 * Dashboard Logic
 */

// Check authentication
requireAuth();

// State
let currentMerchant = null;
let merchants = [];

// DOM Elements
const userName = document.getElementById('userName');
const availableBalance = document.getElementById('availableBalance');
const pendingBalance = document.getElementById('pendingBalance');
const totalOrders = document.getElementById('totalOrders');
const approvedOrders = document.getElementById('approvedOrders');
const merchantsGrid = document.getElementById('merchantsGrid');
const recentOrdersTable = document.getElementById('recentOrdersTable');
const merchantModal = document.getElementById('merchantModal');
const closeModal = document.getElementById('closeModal');
const freeShoppingBtn = document.getElementById('freeShoppingBtn');
const generateLinkBtn = document.getElementById('generateLinkBtn');
const productUrlInput = document.getElementById('productUrlInput');
const logoutBtn = document.getElementById('logoutBtn');

// Initialize
init();

async function init() {
    // Set user name
    const user = getUser();
    if (user && user.username) {
        userName.textContent = user.username;
    }

    // Load data
    await Promise.all([
        loadStats(),
        loadMerchants(),
        loadRecentOrders()
    ]);

    // Auto refresh stats every 5 minutes
    setInterval(loadStats, 5 * 60 * 1000);
}

/**
 * Load dashboard stats
 */
async function loadStats() {
    try {
        const response = await apiRequest('/dashboard/stats');

        if (response.success) {
            const stats = response.stats;
            availableBalance.textContent = formatCurrency(stats.availableBalance);
            pendingBalance.textContent = formatCurrency(stats.pendingBalance);
            totalOrders.textContent = stats.totalConversions;
            approvedOrders.textContent = stats.approvedConversions;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Load merchants
 */
async function loadMerchants() {
    try {
        const response = await apiRequest('/dashboard/merchants');

        if (response.success) {
            merchants = response.merchants;
            renderMerchants();
        }
    } catch (error) {
        console.error('Error loading merchants:', error);
        merchantsGrid.innerHTML = '<div class="loading">Không thể tải danh sách merchants</div>';
    }
}

/**
 * Render merchants grid
 */
function renderMerchants() {
    if (merchants.length === 0) {
        merchantsGrid.innerHTML = '<div class="loading">Chưa có merchants nào</div>';
        return;
    }

    merchantsGrid.innerHTML = merchants.map(merchant => `
        <div class="merchant-card" onclick="openMerchantModal('${merchant.id}')">
            <img src="${merchant.logoUrl || 'https://via.placeholder.com/80'}" alt="${merchant.name}" class="merchant-logo">
            <div class="merchant-name">${merchant.name}</div>
            <div class="merchant-commission">Hoa hồng: ${merchant.commissionRate}</div>
            <button class="merchant-btn">Mua ngay</button>
        </div>
    `).join('');
}

/**
 * Load recent orders
 */
async function loadRecentOrders() {
    try {
        const response = await apiRequest('/dashboard/recent-clicks?limit=10');

        if (response.success) {
            renderRecentOrders(response.clicks);
        }
    } catch (error) {
        console.error('Error loading recent orders:', error);
    }
}

/**
 * Render recent orders
 */
function renderRecentOrders(clicks) {
    if (clicks.length === 0) {
        recentOrdersTable.innerHTML = `
            <tr class="empty-state">
                <td colspan="5">
                    <p>Chưa có đơn hàng nào</p>
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
             click.conversionStatus === 'pending' ? 'Chờ duyệt' : 'Từ chối') :
            'Chưa mua';

        return `
            <tr>
                <td>${click.merchantName}</td>
                <td>${click.clickType === 'button' ? '🎯 Tự do' : '🔗 Link SP'}</td>
                <td>${formatDate(click.clickedAt)}</td>
                <td>
                    ${statusClass ? `<span class="status-badge ${statusClass}">${statusText}</span>` : statusText}
                </td>
                <td>${click.cashback ? formatCurrency(click.cashback) : '-'}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Open merchant modal
 */
function openMerchantModal(merchantId) {
    const merchant = merchants.find(m => m.id === merchantId);
    if (!merchant) return;

    currentMerchant = merchant;

    // Update modal content
    document.getElementById('modalMerchantLogo').src = merchant.logoUrl || 'https://via.placeholder.com/80';
    document.getElementById('modalMerchantName').textContent = merchant.name;
    document.getElementById('merchantNameOption1').textContent = merchant.name;
    document.getElementById('merchantNameBtn1').textContent = merchant.name;
    document.getElementById('merchantNameOption2').textContent = merchant.name;

    // Clear input
    productUrlInput.value = '';

    // Show modal
    merchantModal.classList.add('show');
}

/**
 * Close merchant modal
 */
function closeMerchantModal() {
    merchantModal.classList.remove('show');
    currentMerchant = null;
}

/**
 * Handle free shopping (button click)
 */
async function handleFreeShoppingClick() {
    if (!currentMerchant) return;

    try {
        freeShoppingBtn.disabled = true;
        freeShoppingBtn.textContent = 'Đang tạo link...';

        const response = await apiRequest('/dashboard/generate-link', {
            method: 'POST',
            body: JSON.stringify({
                merchantId: currentMerchant.id,
                clickType: 'button'
            })
        });

        if (response.success) {
            showToast('Link đã được tạo! Đang chuyển hướng...', 'success');

            // Open in new tab
            window.open(response.data.affiliateUrl, '_blank');

            // Close modal and refresh
            setTimeout(() => {
                closeMerchantModal();
                loadRecentOrders();
            }, 1000);
        }
    } catch (error) {
        showToast(error.message || 'Không thể tạo link', 'error');
    } finally {
        freeShoppingBtn.disabled = false;
        freeShoppingBtn.textContent = `Đi đến ${currentMerchant.name}`;
    }
}

/**
 * Handle product link generation
 */
async function handleGenerateLinkClick() {
    if (!currentMerchant) return;

    const productUrl = productUrlInput.value.trim();

    // Validate URL
    if (!productUrl) {
        showToast('Vui lòng nhập link sản phẩm', 'error');
        return;
    }

    if (!isValidUrl(productUrl)) {
        showToast('Link không hợp lệ', 'error');
        return;
    }

    try {
        generateLinkBtn.disabled = true;
        generateLinkBtn.textContent = 'Đang tạo link...';

        const response = await apiRequest('/dashboard/generate-link', {
            method: 'POST',
            body: JSON.stringify({
                merchantId: currentMerchant.id,
                clickType: 'link',
                productUrl: productUrl
            })
        });

        if (response.success) {
            showToast('Link đã được tạo! Đang chuyển hướng...', 'success');

            // Open in new tab
            window.open(response.data.affiliateUrl, '_blank');

            // Close modal and refresh
            setTimeout(() => {
                closeMerchantModal();
                loadRecentOrders();
            }, 1000);
        }
    } catch (error) {
        showToast(error.message || 'Không thể tạo link', 'error');
    } finally {
        generateLinkBtn.disabled = false;
        generateLinkBtn.textContent = 'Tạo link mua hàng';
    }
}

// Event Listeners
closeModal.addEventListener('click', closeMerchantModal);
merchantModal.querySelector('.modal-overlay')?.addEventListener('click', closeMerchantModal);
freeShoppingBtn.addEventListener('click', handleFreeShoppingClick);
generateLinkBtn.addEventListener('click', handleGenerateLinkClick);
logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && merchantModal.classList.contains('show')) {
        closeMerchantModal();
    }
});
