/**
 * User Sidebar Component Loader
 * Loads sidebar HTML and handles active state + logout
 */

(function() {
    'use strict';

    // Load sidebar component
    async function loadSidebar() {
        try {
            const response = await fetch('/components/user-sidebar.html');
            if (!response.ok) {
                throw new Error('Failed to load sidebar');
            }

            const sidebarHTML = await response.text();

            // Insert sidebar at the beginning of app-container
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                appContainer.insertAdjacentHTML('afterbegin', sidebarHTML);

                // Initialize after sidebar is loaded
                initializeSidebar();
            }
        } catch (error) {
            console.error('Error loading sidebar:', error);
        }
    }

    // Initialize sidebar functionality
    function initializeSidebar() {
        // Set active nav item based on current page
        const currentPage = getCurrentPage();
        const navItems = document.querySelectorAll('.nav-item[data-page]');

        navItems.forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === currentPage) {
                item.classList.add('active');
            }
        });

        // Setup logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    }

    // Get current page from URL
    function getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('/dashboard')) return 'dashboard';
        if (path.includes('/history')) return 'history';
        if (path.includes('/reconciliation-history')) return 'reconciliation-history';
        return 'dashboard';
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSidebar);
    } else {
        loadSidebar();
    }
})();
