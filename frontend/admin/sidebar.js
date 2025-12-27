/**
 * Admin Sidebar Component with Collapsible Menu Groups
 * Enhanced with Font Awesome icons, user dropdown, and notification badges
 * Version 2.0 - Professional Admin Panel
 */

const SIDEBAR_MENU_STRUCTURE = {
    dashboard: {
        href: '/admin',
        icon: 'fa-solid fa-chart-line',
        text: 'Dashboard',
        id: 'dashboard'
    },
    groups: [
        {
            id: 'data',
            title: 'Dữ Liệu & Thống Kê',
            icon: 'fa-solid fa-chart-bar',
            items: [
                { href: '/admin/conversions', icon: 'fa-solid fa-money-bill-wave', text: 'Conversions', id: 'conversions', badge: null },
                { href: '/admin/cashback-stats', icon: 'fa-solid fa-chart-pie', text: 'Cashback Stats', id: 'cashback-stats' },
                { href: '/admin/at-orders', icon: 'fa-solid fa-box', text: 'Dữ liệu đơn AT', id: 'at-orders' }
            ]
        },
        {
            id: 'reconciliation',
            title: 'Đối Soát & Thanh Toán',
            icon: 'fa-solid fa-credit-card',
            items: [
                { href: '/admin/reconciliation', icon: 'fa-solid fa-clipboard-list', text: 'Đối soát API', id: 'reconciliation' },
                { href: '/admin/system-reconciliation', icon: 'fa-solid fa-rotate', text: 'Đối soát hệ thống', id: 'system-reconciliation' },
                { href: '/admin/payment-requests', icon: 'fa-solid fa-wallet', text: 'Thanh toán', id: 'payment-requests', badge: null },
                { href: '/admin/payment-stats', icon: 'fa-solid fa-chart-line', text: 'Thống kê thanh toán', id: 'payment-stats' }
            ]
        },
        {
            id: 'management',
            title: 'Quản Lý Hệ Thống',
            icon: 'fa-solid fa-users-gear',
            items: [
                { href: '/admin/users', icon: 'fa-solid fa-user', text: 'Users', id: 'users' },
                { href: '/admin/merchants', icon: 'fa-solid fa-store', text: 'Merchants', id: 'merchants' },
                { href: '/admin/notification-settings', icon: 'fa-solid fa-bell', text: 'Email Notifications', id: 'notification-settings' },
                { href: '/admin/tools', icon: 'fa-solid fa-wrench', text: 'Tools', id: 'tools' },
                { href: '/admin/settings', icon: 'fa-solid fa-gear', text: 'Settings', id: 'settings' }
            ]
        },
        {
            id: 'monitoring',
            title: 'Giám Sát & Logs',
            icon: 'fa-solid fa-display',
            items: [
                { href: '/admin/monitoring', icon: 'fa-solid fa-heart-pulse', text: 'Monitoring', id: 'monitoring' },
                { href: '/admin/activity-logs', icon: 'fa-solid fa-file-lines', text: 'Activity Logs', id: 'activity-logs' },
                { href: '/admin/email-logs', icon: 'fa-solid fa-envelope', text: 'Email Logs', id: 'email-logs' }
            ]
        }
    ]
};

/**
 * Fetch notification counts for badges (can be customized)
 */
async function fetchNotificationCounts() {
    // This can be extended to fetch real counts from API
    // For now, return empty object
    return {};
}

/**
 * Get collapsed state from localStorage
 */
function getCollapsedGroups() {
    const saved = localStorage.getItem('sidebar_collapsed_groups');
    return saved ? JSON.parse(saved) : {};
}

/**
 * Save collapsed state to localStorage
 */
function saveCollapsedGroups(collapsedGroups) {
    localStorage.setItem('sidebar_collapsed_groups', JSON.stringify(collapsedGroups));
}

/**
 * Toggle group collapse (Accordion style - only one group open at a time)
 * Updated to use CSS classes instead of re-rendering
 */
function toggleGroup(groupId) {
    const collapsedGroups = getCollapsedGroups();
    const isCurrentlyCollapsed = collapsedGroups[groupId];

    // Close all groups first (accordion style)
    document.querySelectorAll('.nav-group').forEach(groupElement => {
        const groupIdAttr = groupElement.querySelector('.nav-group-header')?.getAttribute('data-group-id');
        if (groupIdAttr) {
            const groupItems = groupElement.querySelector('.nav-group-items');
            const chevron = groupElement.querySelector('.nav-chevron i');

            if (groupIdAttr === groupId && isCurrentlyCollapsed) {
                // Open the clicked group if it was closed
                groupItems?.classList.remove('collapsed');
                chevron?.classList.remove('fa-chevron-right');
                chevron?.classList.add('fa-chevron-down');
                collapsedGroups[groupIdAttr] = false;
            } else {
                // Close all other groups (including the clicked one if it was open)
                groupItems?.classList.add('collapsed');
                chevron?.classList.remove('fa-chevron-down');
                chevron?.classList.add('fa-chevron-right');
                collapsedGroups[groupIdAttr] = true;
            }
        }
    });

    saveCollapsedGroups(collapsedGroups);
}

/**
 * Toggle user dropdown
 */
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

/**
 * Detect active page from URL
 */
function detectActivePageId() {
    const currentPath = window.location.pathname;

    if (currentPath === '/admin' || currentPath === '/admin/') {
        return 'dashboard';
    }

    // Check all menu items in groups
    for (const group of SIDEBAR_MENU_STRUCTURE.groups) {
        for (const item of group.items) {
            if (currentPath.includes(item.id)) {
                return item.id;
            }
        }
    }

    return 'dashboard';
}

/**
 * Check if any item in group is active
 */
function isGroupActive(group, activePageId) {
    return group.items.some(item => item.id === activePageId);
}

/**
 * Render sidebar HTML with Font Awesome icons
 */
function renderSidebar(activePageId, notificationCounts = {}) {
    // Get user info from localStorage
    const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
        TOKEN: 'cashback_token',
        USER: 'cashback_user'
    };
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
    const userName = user.fullName || user.full_name || user.email || 'Admin';
    const userEmail = user.email || '';

    const collapsedGroups = getCollapsedGroups();

    // Render Dashboard (always visible)
    const dashboardHtml = `
        <a href="${SIDEBAR_MENU_STRUCTURE.dashboard.href}" class="nav-item ${activePageId === 'dashboard' ? 'active' : ''}">
            <span class="nav-icon"><i class="${SIDEBAR_MENU_STRUCTURE.dashboard.icon}"></i></span>
            <span class="nav-text">${SIDEBAR_MENU_STRUCTURE.dashboard.text}</span>
        </a>
    `;

    // Render Groups
    const groupsHtml = SIDEBAR_MENU_STRUCTURE.groups.map(group => {
        const isCollapsed = collapsedGroups[group.id];
        const isActive = isGroupActive(group, activePageId);
        const chevronIcon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

        const itemsHtml = group.items.map(item => {
            const itemActive = item.id === activePageId ? 'active' : '';
            const badgeHtml = item.badge !== undefined && notificationCounts[item.id]
                ? `<span class="nav-badge">${notificationCounts[item.id]}</span>`
                : '';

            return `
                <a href="${item.href}" class="nav-item nav-subitem ${itemActive}">
                    <span class="nav-icon"><i class="${item.icon}"></i></span>
                    <span class="nav-text">${item.text}</span>
                    ${badgeHtml}
                </a>
            `;
        }).join('');

        return `
            <div class="nav-group ${isActive ? 'group-active' : ''}">
                <div class="nav-group-header" data-group-id="${group.id}">
                    <span class="nav-icon"><i class="${group.icon}"></i></span>
                    <span class="nav-text">${group.title}</span>
                    <span class="nav-chevron"><i class="fa-solid ${chevronIcon}"></i></span>
                </div>
                <div class="nav-group-items ${isCollapsed ? 'collapsed' : ''}">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }).join('');

    return `
        <aside class="sidebar" id="sidebar">
            <div class="logo">
                <span class="logo-text">Chắt Chiu.Online</span>
                <span class="logo-subtitle">Admin Panel</span>
            </div>

            <div class="admin-user-info">
                <div class="user-dropdown-trigger" id="userDropdownTrigger">
                    <div class="user-avatar">
                        <i class="fa-solid fa-user-circle"></i>
                    </div>
                    <div class="user-details">
                        <div class="admin-greeting">Xin chào</div>
                        <div class="admin-name">${userName}</div>
                    </div>
                    <i class="fa-solid fa-chevron-down dropdown-icon"></i>
                </div>

                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-header">
                        <div class="dropdown-name">${userName}</div>
                        <div class="dropdown-email">${userEmail}</div>
                    </div>
                    <div class="dropdown-divider"></div>
                    <a href="/admin/profile" class="dropdown-item">
                        <i class="fa-solid fa-user"></i>
                        <span>Thông tin cá nhân</span>
                    </a>
                    <a href="/admin/settings" class="dropdown-item">
                        <i class="fa-solid fa-gear"></i>
                        <span>Cài đặt</span>
                    </a>
                    <div class="dropdown-divider"></div>
                    <button class="dropdown-item logout-item" id="logoutBtn">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span>Đăng xuất</span>
                    </button>
                </div>
            </div>

            <nav class="nav">
                ${dashboardHtml}
                ${groupsHtml}
            </nav>
        </aside>
    `;
}

/**
 * Setup sidebar events (group toggle, logout, user dropdown)
 */
function setupSidebarEvents() {
    // Group toggle
    document.querySelectorAll('.nav-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const groupId = header.getAttribute('data-group-id');
            toggleGroup(groupId);
        });
    });

    // User dropdown toggle
    const dropdownTrigger = document.getElementById('userDropdownTrigger');
    if (dropdownTrigger && !dropdownTrigger.hasAttribute('data-dropdown-attached')) {
        dropdownTrigger.setAttribute('data-dropdown-attached', 'true');
        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleUserDropdown();
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('userDropdown');
        const trigger = document.getElementById('userDropdownTrigger');
        if (dropdown && trigger && !trigger.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.hasAttribute('data-logout-attached')) {
        logoutBtn.setAttribute('data-logout-attached', 'true');
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Call logout function if available, otherwise handle it here
            if (typeof logout === 'function') {
                logout();
            } else {
                const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
                    TOKEN: 'cashback_token',
                    USER: 'cashback_user'
                };
                localStorage.removeItem(STORAGE_KEYS.TOKEN);
                localStorage.removeItem(STORAGE_KEYS.USER);
                window.location.href = '/login';
            }
        });
    }

    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');

    if (mobileMenuToggle && sidebar && !mobileMenuToggle.hasAttribute('data-mobile-attached')) {
        mobileMenuToggle.setAttribute('data-mobile-attached', 'true');

        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
            document.body.classList.toggle('sidebar-open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (sidebar.classList.contains('show') &&
                    !sidebar.contains(e.target) &&
                    !mobileMenuToggle.contains(e.target)) {
                    sidebar.classList.remove('show');
                    document.body.classList.remove('sidebar-open');
                }
            }
        });

        // Close sidebar when clicking on menu items on mobile
        const navLinks = sidebar.querySelectorAll('.nav-item, .nav-subitem');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('show');
                    document.body.classList.remove('sidebar-open');
                }
            });
        });
    }
}

/**
 * Initialize sidebar on page load
 */
async function initSidebar() {
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (!sidebarContainer) {
        console.error('Sidebar container not found');
        return;
    }

    const activePageId = detectActivePageId();
    const notificationCounts = await fetchNotificationCounts();
    sidebarContainer.innerHTML = renderSidebar(activePageId, notificationCounts);
    setupSidebarEvents();
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
} else {
    initSidebar();
}
