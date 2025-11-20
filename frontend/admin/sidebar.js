/**
 * Admin Sidebar Component
 * Centralized sidebar navigation for all admin pages
 */

const SIDEBAR_MENU_ITEMS = [
    { href: '/admin', icon: '📊', text: 'Dashboard', id: 'dashboard' },
    { href: '/admin/users', icon: '👥', text: 'Users', id: 'users' },
    { href: '/admin/conversions', icon: '💰', text: 'Conversions', id: 'conversions' },
    { href: '/admin/cashback-stats', icon: '📈', text: 'Cashback Stats', id: 'cashback-stats' },
    { href: '/admin/at-orders', icon: '📦', text: 'Dữ liệu đơn AT', id: 'at-orders' },
    { href: '/admin/reconciliation', icon: '📋', text: 'Đối soát', id: 'reconciliation' },
    { href: '/admin/payment-requests', icon: '💳', text: 'Thanh toán', id: 'payment-requests' },
    { href: '/admin/merchants', icon: '🏪', text: 'Merchants', id: 'merchants' },
    { href: '/admin/tools', icon: '🔧', text: 'Tools', id: 'tools' },
    { href: '/admin/monitoring', icon: '📈', text: 'Monitoring', id: 'monitoring' },
    { href: '/admin/activity-logs', icon: '📝', text: 'Activity Logs', id: 'activity-logs' },
    { href: '/admin/settings', icon: '⚙️', text: 'Settings', id: 'settings' }
];

/**
 * Render sidebar HTML
 * @param {string} activePageId - ID of the currently active page
 * @returns {string} Sidebar HTML
 */
function renderSidebar(activePageId) {
    const menuItems = SIDEBAR_MENU_ITEMS.map(item => {
        const isActive = item.id === activePageId;
        const activeClass = isActive ? 'active' : '';

        return `
            <a href="${item.href}" class="nav-item ${activeClass}">
                <span class="nav-icon">${item.icon}</span>
                <span class="nav-text">${item.text}</span>
            </a>
        `;
    }).join('');

    return `
        <aside class="sidebar" id="sidebar">
            <div class="logo">
                <span class="logo-icon">⚡</span>
                <span class="logo-text">Admin</span>
            </div>

            <nav class="nav">
                ${menuItems}
                <a href="#" class="nav-item" id="logoutBtn">
                    <span class="nav-icon">🚪</span>
                    <span class="nav-text">Logout</span>
                </a>
            </nav>
        </aside>
    `;
}

/**
 * Initialize sidebar on page load
 * Automatically detects active page from URL
 */
function initSidebar() {
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (!sidebarContainer) {
        console.error('Sidebar container not found');
        return;
    }

    // Detect active page from URL
    const currentPath = window.location.pathname;
    let activePageId = 'dashboard';

    if (currentPath.includes('/users')) {
        activePageId = 'users';
    } else if (currentPath.includes('/conversions')) {
        activePageId = 'conversions';
    } else if (currentPath.includes('/cashback-stats')) {
        activePageId = 'cashback-stats';
    } else if (currentPath.includes('/at-orders')) {
        activePageId = 'at-orders';
    } else if (currentPath.includes('/reconciliation')) {
        activePageId = 'reconciliation';
    } else if (currentPath.includes('/payment-requests')) {
        activePageId = 'payment-requests';
    } else if (currentPath.includes('/merchants')) {
        activePageId = 'merchants';
    } else if (currentPath.includes('/tools')) {
        activePageId = 'tools';
    } else if (currentPath.includes('/monitoring')) {
        activePageId = 'monitoring';
    } else if (currentPath.includes('/activity-logs')) {
        activePageId = 'activity-logs';
    } else if (currentPath.includes('/settings')) {
        activePageId = 'settings';
    }

    // Render sidebar
    sidebarContainer.innerHTML = renderSidebar(activePageId);

    // Setup logout button (only if not already handled by page-specific JS)
    // Note: Some pages handle logout in their own JS files (e.g., conversions.js, admin.js)
    // This is a fallback handler
    setTimeout(() => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.hasAttribute('data-logout-attached')) {
            logoutBtn.setAttribute('data-logout-attached', 'true');
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Call logout function if available, otherwise handle it here
                if (typeof logout === 'function') {
                    logout();
                } else {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            });
        }
    }, 100);
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
} else {
    initSidebar();
}
