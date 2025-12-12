/**
 * User Sidebar Component v2.0 - Professional Grouped Menu
 * Enhanced with Font Awesome icons, collapsible groups, and mobile responsive
 */

const USER_SIDEBAR_MENU_STRUCTURE = {
    dashboard: {
        href: '/dashboard',
        icon: 'fa-solid fa-house',
        text: 'Dashboard',
        id: 'dashboard'
    },
    groups: [
        {
            id: 'shopping',
            title: 'Mua Sắm & Kiếm Tiền',
            icon: 'fa-solid fa-shopping-cart',
            items: [
                { href: '/shopping', icon: 'fa-solid fa-store', text: 'Mua sắm cashback', id: 'shopping' },
                { href: '/history', icon: 'fa-solid fa-receipt', text: 'Đơn hàng của tôi', id: 'history' }
            ]
        },
        {
            id: 'statistics',
            title: 'Thống Kê & Lịch Sử',
            icon: 'fa-solid fa-chart-line',
            items: [
                { href: '/statistics', icon: 'fa-solid fa-chart-pie', text: 'Thống kê tổng quan', id: 'statistics' },
                { href: '/history?tab=clicks', icon: 'fa-solid fa-mouse-pointer', text: 'Lịch sử click', id: 'history-clicks' }
            ]
        },
        {
            id: 'finance',
            title: 'Tài Chính & Thanh Toán',
            icon: 'fa-solid fa-wallet',
            items: [
                { href: '/reconciliation-history', icon: 'fa-solid fa-clipboard-check', text: 'Đối soát', id: 'reconciliation-history' },
                { href: '/payment-requests', icon: 'fa-solid fa-money-bill-wave', text: 'Yêu cầu thanh toán', id: 'payment-requests' },
                { href: '/profile?tab=payment-accounts', icon: 'fa-solid fa-credit-card', text: 'Tài khoản thanh toán', id: 'payment-accounts' }
            ]
        },
        {
            id: 'account',
            title: 'Tài Khoản',
            icon: 'fa-solid fa-user',
            items: [
                { href: '/profile', icon: 'fa-solid fa-id-card', text: 'Hồ sơ cá nhân', id: 'profile' },
                { href: '/profile?tab=password', icon: 'fa-solid fa-key', text: 'Đổi mật khẩu', id: 'profile-password' }
            ]
        }
    ]
};

/**
 * Get collapsed state from localStorage
 */
function getUserCollapsedGroups() {
    const saved = localStorage.getItem('user_sidebar_collapsed_groups');
    return saved ? JSON.parse(saved) : {};
}

/**
 * Save collapsed state to localStorage
 */
function saveUserCollapsedGroups(collapsedGroups) {
    localStorage.setItem('user_sidebar_collapsed_groups', JSON.stringify(collapsedGroups));
}

/**
 * Toggle group collapse (Accordion style - only one group open at a time)
 */
function toggleUserGroup(groupId) {
    const collapsedGroups = getUserCollapsedGroups();
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

    saveUserCollapsedGroups(collapsedGroups);
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
function detectActiveUserPage() {
    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');

    // Check dashboard
    if (currentPath.includes('/dashboard')) return 'dashboard';

    // Check profile tabs
    if (currentPath.includes('/profile')) {
        if (tab === 'password') return 'profile-password';
        if (tab === 'payment-accounts') return 'payment-accounts';
        return 'profile';
    }

    // Check history tabs
    if (currentPath.includes('/history')) {
        if (tab === 'clicks') return 'history-clicks';
        return 'history';
    }

    // Check all menu items in groups
    for (const group of USER_SIDEBAR_MENU_STRUCTURE.groups) {
        for (const item of group.items) {
            if (currentPath.includes(item.id) || currentPath.includes(item.href)) {
                return item.id;
            }
        }
    }

    return 'dashboard';
}

/**
 * Check if any item in group is active
 */
function isUserGroupActive(group, activePageId) {
    return group.items.some(item => item.id === activePageId);
}

/**
 * Render sidebar HTML with Font Awesome icons
 */
async function renderUserSidebar(activePageId) {
    // Get user info from localStorage
    const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
        TOKEN: 'cashback_token',
        USER: 'cashback_user'
    };
    const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
    const userName = user.fullName || user.full_name || user.email || 'User';
    const userEmail = user.email || '';

    const collapsedGroups = getUserCollapsedGroups();

    // Render Dashboard (always visible)
    const dashboardHtml = `
        <a href="${USER_SIDEBAR_MENU_STRUCTURE.dashboard.href}" class="nav-item ${activePageId === 'dashboard' ? 'active' : ''}">
            <span class="nav-icon"><i class="${USER_SIDEBAR_MENU_STRUCTURE.dashboard.icon}"></i></span>
            <span class="nav-text">${USER_SIDEBAR_MENU_STRUCTURE.dashboard.text}</span>
        </a>
    `;

    // Render Groups
    const groupsHtml = USER_SIDEBAR_MENU_STRUCTURE.groups.map(group => {
        const isCollapsed = collapsedGroups[group.id];
        const isActive = isUserGroupActive(group, activePageId);
        const chevronIcon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

        const itemsHtml = group.items.map(item => {
            const itemActive = item.id === activePageId ? 'active' : '';

            return `
                <a href="${item.href}" class="nav-item nav-subitem ${itemActive}">
                    <span class="nav-icon"><i class="${item.icon}"></i></span>
                    <span class="nav-text">${item.text}</span>
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
        <aside class="user-sidebar" id="userSidebar">
            <div class="logo">
                <span class="logo-text">Chắt Chiu.Online</span>
            </div>

            <div class="user-info-card">
                <div class="user-dropdown-trigger" id="userDropdownTrigger">
                    <div class="user-avatar">
                        <i class="fa-solid fa-user-circle"></i>
                    </div>
                    <div class="user-details">
                        <div class="user-greeting">Xin chào</div>
                        <div class="user-name">${userName}</div>
                    </div>
                    <i class="fa-solid fa-chevron-down dropdown-icon"></i>
                </div>

                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-header">
                        <div class="dropdown-name">${userName}</div>
                        <div class="dropdown-email">${userEmail}</div>
                    </div>
                    <div class="dropdown-divider"></div>
                    <a href="/profile" class="dropdown-item">
                        <i class="fa-solid fa-user"></i>
                        <span>Thông tin cá nhân</span>
                    </a>
                    <a href="/profile?tab=payment-accounts" class="dropdown-item">
                        <i class="fa-solid fa-credit-card"></i>
                        <span>Tài khoản thanh toán</span>
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
function setupUserSidebarEvents() {
    // Group toggle
    document.querySelectorAll('.nav-group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const groupId = header.getAttribute('data-group-id');
            toggleUserGroup(groupId);
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
            // Call logout function if available
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
    const sidebar = document.getElementById('userSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (mobileMenuToggle && sidebar && !mobileMenuToggle.hasAttribute('data-mobile-attached')) {
        mobileMenuToggle.setAttribute('data-mobile-attached', 'true');

        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
            if (sidebarOverlay) {
                sidebarOverlay.classList.toggle('show');
            }
            document.body.classList.toggle('sidebar-open');
        });

        // Close sidebar when clicking overlay
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
                document.body.classList.remove('sidebar-open');
            });
        }

        // Close sidebar when clicking on menu items on mobile
        const navLinks = sidebar.querySelectorAll('.nav-item, .nav-subitem');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('show');
                    if (sidebarOverlay) {
                        sidebarOverlay.classList.remove('show');
                    }
                    document.body.classList.remove('sidebar-open');
                }
            });
        });
    }
}

/**
 * Initialize user sidebar on page load
 */
async function initUserSidebar() {
    const activePageId = detectActiveUserPage();
    const sidebarHtml = await renderUserSidebar(activePageId);

    // Insert sidebar at the beginning of app-container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        // Add overlay for mobile
        if (!document.getElementById('sidebarOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'sidebarOverlay';
            overlay.className = 'sidebar-overlay';
            appContainer.insertAdjacentElement('afterbegin', overlay);
        }

        // Insert sidebar
        appContainer.insertAdjacentHTML('afterbegin', sidebarHtml);

        setupUserSidebarEvents();
    }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserSidebar);
} else {
    initUserSidebar();
}
