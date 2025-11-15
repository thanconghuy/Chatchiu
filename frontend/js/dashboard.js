/**
 * Dashboard Logic
 */

// Check authentication
requireAuth();

// Check if admin - redirect to admin page
const user = getUser();
if (user && user.is_admin) {
    window.location.href = '/admin';
}

// State
let currentMerchant = null;
let merchants = [];
let currentClicksPage = 0;
const clicksPerPage = 10;

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
    // Display user name using shared utility function
    displayUserName('userName');

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
        console.log('Loading dashboard stats...');
        const response = await apiRequest('/dashboard/stats');
        console.log('Stats response:', response);

        if (response && response.success) {
            const stats = response.stats;
            console.log('Stats data:', stats);

            // Update UI with stats
            availableBalance.textContent = formatCurrency(stats.availableBalance || 0);
            pendingBalance.textContent = formatCurrency(stats.pendingBalance || 0);
            totalOrders.textContent = stats.totalConversions || 0;
            approvedOrders.textContent = stats.approvedConversions || 0;

            console.log('Stats loaded successfully');
        } else {
            console.error('Stats response not successful:', response);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        console.error('Error details:', error.message, error.stack);

        // Show error to user (optional)
        availableBalance.textContent = '0 đ';
        pendingBalance.textContent = '0 đ';
        totalOrders.textContent = '0';
        approvedOrders.textContent = '0';
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
 * Load recent orders with pagination
 */
async function loadRecentOrders() {
    try {
        const offset = currentClicksPage * clicksPerPage;
        const response = await apiRequest(`/dashboard/recent-clicks?limit=${clicksPerPage}&offset=${offset}`);

        if (response.success) {
            // Backend already sorted: clicks with conversions first, then by date
            renderRecentOrders(response.clicks);
            updateClicksPagination(response.clicks.length);
        }
    } catch (error) {
        console.error('Error loading recent orders:', error);
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
        pageInfo.textContent = `Trang ${currentClicksPage + 1}`;
    } else {
        pagination.style.display = 'none';
    }
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

    // Update placeholder with merchant's domain
    const placeholderUrl = getMerchantPlaceholder(merchant.id, merchant.deepLinkBase);
    productUrlInput.placeholder = placeholderUrl;

    // Clear input
    productUrlInput.value = '';

    // Show modal
    merchantModal.classList.add('show');
}

/**
 * Get placeholder URL for merchant
 */
function getMerchantPlaceholder(merchantId, deepLinkBase) {
    const placeholders = {
        'shopee': 'https://shopee.vn/product/...',
        'lazada': 'https://www.lazada.vn/products/...',
        'tiki': 'https://tiki.vn/product/...',
        'sendo': 'https://www.sendo.vn/...'
    };

    // Try to get specific placeholder, otherwise extract domain from deepLinkBase
    if (placeholders[merchantId]) {
        return placeholders[merchantId];
    }

    // Extract domain from deep link base
    if (deepLinkBase) {
        try {
            const url = new URL(deepLinkBase);
            return `${url.protocol}//${url.host}/...`;
        } catch (e) {
            return 'https://example.com/product/...';
        }
    }

    return 'https://example.com/product/...';
}

/**
 * Close merchant modal
 */
function closeMerchantModal() {
    merchantModal.classList.remove('show');

    // Reset state
    currentMerchant = null;
    productUrlInput.value = '';

    // Reset buttons
    if (freeShoppingBtn) {
        freeShoppingBtn.disabled = false;
        freeShoppingBtn.innerHTML = 'Đi đến ' + (currentMerchant?.name || 'Shopee');
    }
    if (generateLinkBtn) {
        generateLinkBtn.disabled = false;
        generateLinkBtn.innerHTML = 'Tạo link mua hàng';
    }
}

/**
 * Handle free shopping (button click)
 */
async function handleFreeShoppingClick() {
    if (!currentMerchant) return;

    // Disable button and show loading
    freeShoppingBtn.disabled = true;
    const originalText = freeShoppingBtn.innerHTML;
    freeShoppingBtn.innerHTML = '<span class="spinner"></span> Đang tạo link...';

    try {
        // Show loading toast
        showToast(`Đang chuyển đến trang ${currentMerchant.name} mua hàng, đợi trong vài giây...`, 'info');

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

        // Restore button
        freeShoppingBtn.disabled = false;
        freeShoppingBtn.innerHTML = originalText;
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

    // Disable button and show loading
    generateLinkBtn.disabled = true;
    const originalText = generateLinkBtn.innerHTML;
    generateLinkBtn.innerHTML = '<span class="spinner"></span> Đang tạo link...';

    try {
        // Show loading toast
        showToast(`Đang chuyển đến trang ${currentMerchant.name} mua hàng, đợi trong vài giây...`, 'info');

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

        // Restore button
        generateLinkBtn.disabled = false;
        generateLinkBtn.innerHTML = originalText;
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

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && merchantModal.classList.contains('show')) {
        closeMerchantModal();
    }
});
