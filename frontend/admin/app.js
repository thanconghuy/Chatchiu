/**
 * Admin SPA - Main Application Controller
 */

// Check authentication
requireAuth();

// Check admin access
(async () => {
    const hasAccess = await checkAdminAccess();
    if (hasAccess) {
        await initApp();
    }
})();

// Current module instance
let currentModule = null;

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success && response.user) {
            saveAuth(getToken(), response.user);
            if (!response.user.is_admin) {
                showToast('Access denied: Admin only', 'error');
                setTimeout(() => {
                    window.location.href = '../dashboard.html';
                }, 2000);
                return false;
            }
            return true;
        } else {
            throw new Error('Failed to verify admin status');
        }
    } catch (error) {
        console.error('Admin check error:', error);
        showToast('Access denied: Admin only', 'error');
        setTimeout(() => {
            window.location.href = '../dashboard.html';
        }, 2000);
        return false;
    }
}

/**
 * Initialize SPA
 */
async function initApp() {
    // Display user info
    displayUserName('userName');

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // Setup mobile menu
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Setup router
    setupRouter();

    // Handle initial route
    handleRoute();
}

/**
 * Setup SPA Router
 */
function setupRouter() {
    // Handle hash change
    window.addEventListener('hashchange', handleRoute);

    // Handle nav clicks
    document.querySelectorAll('.nav-item[data-route]').forEach(link => {
        link.addEventListener('click', (e) => {
            // Update active state
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });
}

/**
 * Handle route change
 */
async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/dashboard'; // Remove #
    const route = hash.replace('/', ''); // Remove leading /

    console.log('Route:', route);

    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'users': 'Users Management',
        'conversions': 'Conversions Management',
        'at-orders': 'Tất cả dữ liệu đơn hàng trên AccessTrade',
        'reconciliation': 'Đối soát',
        'merchants': 'Merchants Management',
        'tools': 'Admin Tools'
    };
    document.getElementById('pageTitle').textContent = titles[route] || 'Dashboard';

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Cleanup previous module
    if (currentModule && typeof currentModule.cleanup === 'function') {
        currentModule.cleanup();
    }

    // Load module
    await loadModule(route);
}

/**
 * Load module dynamically
 */
async function loadModule(moduleName) {
    const appContent = document.getElementById('appContent');

    // Show loading
    appContent.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Đang tải ${moduleName}...</p>
        </div>
    `;

    try {
        // Import module script
        const moduleScript = document.createElement('script');
        moduleScript.src = `modules/${moduleName}.js`;
        moduleScript.onload = async () => {
            console.log(`Module ${moduleName} loaded`);

            // Get module instance
            if (window[`${moduleName}Module`]) {
                currentModule = window[`${moduleName}Module`];

                // Render module
                if (typeof currentModule.render === 'function') {
                    const html = await currentModule.render();
                    appContent.innerHTML = html;

                    // Initialize module
                    if (typeof currentModule.init === 'function') {
                        await currentModule.init();
                    }
                }
            } else {
                throw new Error(`Module ${moduleName} not found`);
            }
        };
        moduleScript.onerror = () => {
            throw new Error(`Failed to load module: ${moduleName}`);
        };

        // Remove old module script if exists
        const oldScript = document.querySelector(`script[src="modules/${moduleName}.js"]`);
        if (oldScript) oldScript.remove();

        document.body.appendChild(moduleScript);

    } catch (error) {
        console.error('Module load error:', error);
        appContent.innerHTML = `
            <div class="error-state">
                <h2>❌ Lỗi tải module</h2>
                <p>${error.message}</p>
                <button data-action="go-dashboard" class="btn btn-primary">
                    Về Dashboard
                </button>
            </div>
        `;
    }
}

/**
 * Navigate to route
 */
function navigateTo(route) {
    window.location.hash = `/${route}`;
}

// ============ CSP FIX: Event Delegation ============
document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;

    switch (action) {
        case 'go-dashboard':
            window.location.hash = '/dashboard';
            break;
    }
});

console.log('[app.js] CSP-compliant');
