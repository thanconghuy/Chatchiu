/**
 * Shopping Page Logic
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
let currentMerchantsPage = 0;
const merchantsPerPage = 10; // Desktop: 10 merchants per page (2 rows x 5 merchants)
let currentCarouselSlide = 0; // Mobile: carousel slide index
const merchantsPerSlide = 6; // Mobile: 6 merchants per slide (3x2 grid)

// DOM Elements
const merchantsGrid = document.getElementById('merchantsGrid');
const merchantModal = document.getElementById('merchantModal');
const closeModal = document.getElementById('closeModal');
const freeShoppingBtn = document.getElementById('freeShoppingBtn');
const generateLinkBtn = document.getElementById('generateLinkBtn');
const productUrlInput = document.getElementById('productUrlInput');

// Initialize
init();

async function init() {
    // Update user avatar
    const avatarInitial = document.getElementById('avatarInitial');
    if (avatarInitial && user) {
        const displayName = user.full_name || user.username || 'User';
        avatarInitial.textContent = displayName.charAt(0).toUpperCase();
    }

    // Load data
    await Promise.all([
        loadQuickStats(),
        loadMerchants()
    ]);

    // Auto refresh quick stats every 5 minutes
    setInterval(loadQuickStats, 5 * 60 * 1000);
}

/**
 * Load quick stats for top bar
 */
async function loadQuickStats() {
    try {
        const response = await apiRequest('/dashboard/stats');

        if (response && response.success) {
            const stats = response.stats;

            // Update quick stats bar
            const quickAvailableBalance = document.getElementById('quickAvailableBalance');
            const quickPendingBalance = document.getElementById('quickPendingBalance');
            const quickTotalOrders = document.getElementById('quickTotalOrders');

            if (quickAvailableBalance) {
                quickAvailableBalance.textContent = formatCurrency(stats.availableBalance || 0);
            }

            if (quickPendingBalance) {
                quickPendingBalance.textContent = formatCurrency(stats.pendingBalance || 0);
            }

            if (quickTotalOrders) {
                quickTotalOrders.textContent = stats.totalConversions || 0;
            }
        }
    } catch (error) {
        console.error('Error loading quick stats:', error);
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
            <div class="merchant-card" onclick="openMerchantModal('${merchant.id}')">
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
            <div class="merchant-card" onclick="openMerchantModal('${merchant.id}')">
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
 * Open merchant modal
 */
function openMerchantModal(merchantId) {
    const merchant = merchants.find(m => m.id === merchantId);
    if (!merchant) {
        console.error('Merchant not found:', merchantId);
        return;
    }

    currentMerchant = merchant;

    // Query modal elements
    const modal = document.getElementById('merchantModal');
    const modalLogo = document.getElementById('modalMerchantLogo');
    const modalName = document.getElementById('modalMerchantName');
    const nameOption1 = document.getElementById('merchantNameOption1');
    const nameBtn1 = document.getElementById('merchantNameBtn1');
    const nameOption2 = document.getElementById('merchantNameOption2');
    const productInput = document.getElementById('productUrlInput');

    // Validate all required elements exist
    if (!modal || !modalLogo || !modalName || !nameOption1 || !nameBtn1 || !nameOption2 || !productInput) {
        console.error('Modal elements not found');
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

    // Update button to show loading
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

            // Close modal and refresh quick stats
            setTimeout(() => {
                closeMerchantModal();
                loadQuickStats();
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

            // Close modal and refresh quick stats
            setTimeout(() => {
                closeMerchantModal();
                loadQuickStats();
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

// Event Listeners
closeModal?.addEventListener('click', closeMerchantModal);
merchantModal?.querySelector('.modal-overlay')?.addEventListener('click', closeMerchantModal);
freeShoppingBtn?.addEventListener('click', handleFreeShoppingClick);
generateLinkBtn?.addEventListener('click', handleGenerateLinkClick);

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('merchantModal');
    if (e.key === 'Escape' && modal?.classList.contains('show')) {
        closeMerchantModal();
    }
});

// Merchants pagination event listeners (Desktop)
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

/**
 * Auto-refresh data when user returns to the page
 */
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page became visible - refresh quick stats
        loadQuickStats();
    }
});
