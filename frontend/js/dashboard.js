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
let clicksPerPage = 20; // Default: 20 items per page
let currentMerchantsPage = 0;
const merchantsPerPage = 10; // Desktop: 10 merchants per page (2 rows x 5 merchants)
let currentCarouselSlide = 0; // Mobile: carousel slide index
const merchantsPerSlide = 6; // Mobile: 6 merchants per slide (3x2 grid)

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
 * Load dashboard stats (defined later with mobile enhancements)
 */

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
 * Render merchants grid (with carousel on mobile, pagination on desktop)
 */
function renderMerchants() {
    if (merchants.length === 0) {
        merchantsGrid.innerHTML = '<div class="loading">Chưa có merchants nào</div>';
        return;
    }

    // Check if desktop (>768px) - use pagination
    const isDesktop = window.innerWidth > 768;

    if (isDesktop) {
        // Desktop: Show paginated merchants
        const startIndex = currentMerchantsPage * merchantsPerPage;
        const endIndex = startIndex + merchantsPerPage;
        const paginatedMerchants = merchants.slice(startIndex, endIndex);

        merchantsGrid.innerHTML = paginatedMerchants.map(merchant => `
            <div class="merchant-card" data-action="open-merchant-modal" data-merchant-id="${merchant.id}">
                <img src="${merchant.logoUrl || 'https://via.placeholder.com/80'}" alt="${merchant.name}" class="merchant-logo">
                <div class="merchant-name">${merchant.name}</div>
                <div class="merchant-commission">Hoa hồng: ${merchant.commissionRate}</div>
                <button class="merchant-btn">Mua ngay</button>
            </div>
        `).join('');

        // Update pagination controls
        updateMerchantsPagination();
    } else {
        // Mobile: Show carousel (6 merchants per slide)
        const startIndex = currentCarouselSlide * merchantsPerSlide;
        const endIndex = startIndex + merchantsPerSlide;
        const slideMerchants = merchants.slice(startIndex, endIndex);

        merchantsGrid.innerHTML = slideMerchants.map(merchant => `
            <div class="merchant-card" data-action="open-merchant-modal" data-merchant-id="${merchant.id}">
                <img src="${merchant.logoUrl || 'https://via.placeholder.com/80'}" alt="${merchant.name}" class="merchant-logo">
                <div class="merchant-name">${merchant.name}</div>
                <div class="merchant-commission">Hoa hồng: ${merchant.commissionRate}</div>
                <button class="merchant-btn">Mua ngay</button>
            </div>
        `).join('');

        // Update carousel controls
        updateCarouselNav();
    }
}

/**
 * Update merchants pagination controls (Desktop)
 */
function updateMerchantsPagination() {
    const pagination = document.getElementById('merchantsPagination');
    const prevBtn = document.getElementById('prevMerchantsBtn');
    const nextBtn = document.getElementById('nextMerchantsBtn');
    const pageInfo = document.getElementById('merchantsPageInfo');

    if (!pagination || !prevBtn || !nextBtn || !pageInfo) return;

    const totalPages = Math.ceil(merchants.length / merchantsPerPage);

    // Only show pagination on desktop (>768px)
    const isDesktop = window.innerWidth > 768;
    pagination.style.display = (isDesktop && totalPages > 1) ? 'flex' : 'none';

    // Update page info
    pageInfo.textContent = `Trang ${currentMerchantsPage + 1} / ${totalPages}`;

    // Update buttons
    prevBtn.disabled = currentMerchantsPage === 0;
    nextBtn.disabled = currentMerchantsPage >= totalPages - 1;
}

/**
 * Update carousel navigation controls (Mobile)
 */
function updateCarouselNav() {
    const carouselNav = document.getElementById('merchantsCarouselNav');
    const prevBtn = document.getElementById('prevCarouselBtn');
    const nextBtn = document.getElementById('nextCarouselBtn');
    const pageInfo = document.getElementById('carouselPageInfo');

    if (!carouselNav || !prevBtn || !nextBtn || !pageInfo) return;

    const totalSlides = Math.ceil(merchants.length / merchantsPerSlide);

    // Only show carousel nav on mobile (≤768px)
    const isMobile = window.innerWidth <= 768;
    carouselNav.style.display = (isMobile && totalSlides > 1) ? 'flex' : 'none';

    // Update page info
    pageInfo.textContent = `${currentCarouselSlide + 1} / ${totalSlides}`;

    // Update buttons
    prevBtn.disabled = currentCarouselSlide === 0;
    nextBtn.disabled = currentCarouselSlide >= totalSlides - 1;
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
 * Open merchant modal
 */
function openMerchantModal(merchantId) {
    const merchant = merchants.find(m => m.id === merchantId);
    if (!merchant) {
        console.error('Merchant not found:', merchantId);
        return;
    }

    currentMerchant = merchant;

    // IMPORTANT: Query modal elements FRESH each time (not cached)
    // This prevents issues with dynamic DOM updates
    const modal = document.getElementById('merchantModal');
    const modalLogo = document.getElementById('modalMerchantLogo');
    const modalName = document.getElementById('modalMerchantName');
    const nameOption1 = document.getElementById('merchantNameOption1');
    const nameBtn1 = document.getElementById('merchantNameBtn1');
    const nameOption2 = document.getElementById('merchantNameOption2');
    const productInput = document.getElementById('productUrlInput');

    // Validate all required elements exist
    if (!modal || !modalLogo || !modalName || !nameOption1 || !nameBtn1 || !nameOption2 || !productInput) {
        console.error('Modal elements not found. Missing:', {
            modal: !!modal,
            modalLogo: !!modalLogo,
            modalName: !!modalName,
            nameOption1: !!nameOption1,
            nameBtn1: !!nameBtn1,
            nameOption2: !!nameOption2,
            productInput: !!productInput
        });
        console.error('DOM state:', {
            modalInDOM: !!document.querySelector('#merchantModal'),
            allModals: document.querySelectorAll('.modal').length
        });
        return;
    }

    // Update modal content
    modalLogo.src = merchant.logoUrl || 'https://via.placeholder.com/80';
    modalName.textContent = merchant.name;
    nameOption1.textContent = merchant.name;
    nameBtn1.textContent = merchant.name;
    nameOption2.textContent = merchant.name;

    // Update placeholder with merchant's domain
    const placeholderUrl = getMerchantPlaceholder(merchant.id, merchant.deepLinkBase);
    productInput.placeholder = placeholderUrl;

    // Clear input
    productInput.value = '';

    // Show modal
    modal.classList.add('show');
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
    const modal = document.getElementById('merchantModal');
    const productInput = document.getElementById('productUrlInput');
    const freeBtn = document.getElementById('freeShoppingBtn');
    const generateBtn = document.getElementById('generateLinkBtn');

    if (modal) {
        modal.classList.remove('show');
    }

    // Reset state
    currentMerchant = null;

    if (productInput) {
        productInput.value = '';
    }

    // Reset buttons
    if (freeBtn) {
        freeBtn.disabled = false;
        // Don't use innerHTML - it destroys the <span id="merchantNameBtn1"> inside
        // Instead, update the span's textContent
        const nameBtn1 = document.getElementById('merchantNameBtn1');
        if (nameBtn1) {
            nameBtn1.textContent = 'Merchant';
        }
    }
    if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Tạo link mua hàng';
    }
}

/**
 * Handle free shopping (button click)
 */
async function handleFreeShoppingClick() {
    if (!currentMerchant) return;

    const freeBtn = document.getElementById('freeShoppingBtn');
    const nameBtn1 = document.getElementById('merchantNameBtn1');
    if (!freeBtn || !nameBtn1) return;

    // Disable button and show loading
    freeBtn.disabled = true;
    const originalMerchantName = nameBtn1.textContent;

    // Update button to show loading (preserve structure, don't use innerHTML)
    nameBtn1.innerHTML = '<span class="spinner"></span> Đang tạo link...';

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
        if (freeBtn && nameBtn1) {
            freeBtn.disabled = false;
            nameBtn1.textContent = originalMerchantName;
        }
    }
}

/**
 * Handle product link generation
 */
async function handleGenerateLinkClick() {
    if (!currentMerchant) return;

    const productInput = document.getElementById('productUrlInput');
    const generateBtn = document.getElementById('generateLinkBtn');

    if (!productInput || !generateBtn) return;

    const productUrl = productInput.value.trim();

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
    generateBtn.disabled = true;
    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<span class="spinner"></span> Đang tạo link...';

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
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalText;
        }
    }
}

// Event Listeners - with null checks
closeModal?.addEventListener('click', closeMerchantModal);
merchantModal?.querySelector('.modal-overlay')?.addEventListener('click', closeMerchantModal);
freeShoppingBtn?.addEventListener('click', handleFreeShoppingClick);
generateLinkBtn?.addEventListener('click', handleGenerateLinkClick);

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

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('merchantModal');
    if (e.key === 'Escape' && modal?.classList.contains('show')) {
        closeMerchantModal();
    }
});

/* ============================================
   MOBILE-FIRST ENHANCEMENTS
   ============================================ */

// Mobile Sidebar Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

if (mobileMenuToggle && sidebar && sidebarOverlay) {
    // Toggle sidebar on button click
    mobileMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    });

    // Close sidebar when clicking overlay
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });

    // Close sidebar when clicking nav item
    const navItems = sidebar.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    });
}

// Update Hero Balance Card
async function updateHeroBalance() {
    try {
        const response = await apiRequest('/dashboard/stats');
        if (response && response.success) {
            const heroBalance = document.getElementById('heroBalance');
            const mobileUserName = document.getElementById('mobileUserName');
            const avatarInitial = document.getElementById('avatarInitial');

            if (heroBalance) {
                heroBalance.textContent = formatCurrency(response.stats.availableBalance || 0);
            }

            // Update mobile user name and avatar (prefer full_name)
            const user = getUser();
            if (user) {
                // Priority: full_name > username > 'User'
                const displayName = user.full_name || user.username || 'User';

                if (mobileUserName) {
                    mobileUserName.textContent = displayName;
                    console.log('Mobile user name updated:', displayName);
                }
                if (avatarInitial) {
                    avatarInitial.textContent = displayName.charAt(0).toUpperCase();
                }
            }
        }
    } catch (error) {
        console.error('Error updating hero balance:', error);
    }
}

// Update stats to also update hero balance and new stat cards
async function loadStats() {
    try {
        console.log('Loading dashboard stats...');
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

            // Update new mobile-optimized cards
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

// Merchants pagination event listeners
document.getElementById('prevMerchantsBtn')?.addEventListener('click', () => {
    if (currentMerchantsPage > 0) {
        currentMerchantsPage--;
        renderMerchants();
    }
});

document.getElementById('nextMerchantsBtn')?.addEventListener('click', () => {
    const totalPages = Math.ceil(merchants.length / merchantsPerPage);
    if (currentMerchantsPage < totalPages - 1) {
        currentMerchantsPage++;
        renderMerchants();
    }
});

// Carousel navigation event listeners (Mobile)
document.getElementById('prevCarouselBtn')?.addEventListener('click', () => {
    if (currentCarouselSlide > 0) {
        currentCarouselSlide--;
        renderMerchants();
    }
});

document.getElementById('nextCarouselBtn')?.addEventListener('click', () => {
    const totalSlides = Math.ceil(merchants.length / merchantsPerSlide);
    if (currentCarouselSlide < totalSlides - 1) {
        currentCarouselSlide++;
        renderMerchants();
    }
});

// Re-render merchants on window resize (switch between mobile/desktop)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (merchants.length > 0) {
            renderMerchants();

            // Force hide/show correct navigation based on screen size
            const isDesktop = window.innerWidth > 768;
            const carouselNav = document.getElementById('merchantsCarouselNav');
            const pagination = document.getElementById('merchantsPagination');

            if (isDesktop) {
                // Desktop: hide carousel, show pagination
                if (carouselNav) carouselNav.style.display = 'none';
                updateMerchantsPagination();
            } else {
                // Mobile: hide pagination, show carousel
                if (pagination) pagination.style.display = 'none';
                updateCarouselNav();
            }
        }
    }, 250);
});

// Update desktop user name (prefer full_name)
const desktopUserName = document.getElementById('desktopUserName');
if (desktopUserName) {
    const user = getUser();
    if (user) {
        // Priority: full_name > username > 'User'
        const displayName = user.full_name || user.username || 'User';
        desktopUserName.textContent = displayName;
        console.log('Desktop user name updated:', displayName);
    }
}

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
    const merchantId = element.dataset.merchantId;
    const url = element.dataset.url;

    switch (action) {
        case 'open-merchant-modal':
            openMerchantModal(merchantId);
            break;
        case 'open-link':
            window.open(url, '_blank');
            break;
    }
});

console.log('[dashboard.js] CSP-compliant event delegation loaded');
