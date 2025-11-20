/**
 * Mobile Menu Toggle - Universal Script
 * Handles sidebar toggle and overlay for mobile devices
 * Refactored for consistency between mobile and desktop layouts
 */

(function() {
    'use strict';

    // Prevent multiple initializations
    if (window.mobileMenuInitialized) {
        console.warn('⚠️ Mobile menu already initialized, skipping...');
        return;
    }
    console.log('🚀 Initializing mobile menu for the first time');
    window.mobileMenuInitialized = true;

    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }

    function initMobileMenu() {
        // Get mobile menu toggle button
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        if (!mobileMenuToggle) {
            console.warn('Mobile menu toggle button not found');
            return;
        }

        // Wait for sidebar to be loaded (it's loaded dynamically by user-sidebar.js)
        waitForSidebar(mobileMenuToggle);
    }

    function waitForSidebar(mobileMenuToggle) {
        const sidebar = document.getElementById('sidebar');

        if (sidebar) {
            // Sidebar already exists, setup immediately
            console.log('✓ Sidebar already in DOM');
            setupMobileMenu(mobileMenuToggle, sidebar);
        } else {
            // Sidebar not loaded yet, wait for it using MutationObserver
            console.log('⏳ Waiting for sidebar to load...');
            let setupCompleted = false;

            const observer = new MutationObserver(() => {
                const sidebar = document.getElementById('sidebar');
                if (sidebar && !setupCompleted) {
                    setupCompleted = true;
                    observer.disconnect();
                    console.log('✓ Sidebar detected via MutationObserver');
                    setupMobileMenu(mobileMenuToggle, sidebar);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Fallback timeout
            setTimeout(() => {
                if (!setupCompleted) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) {
                        setupCompleted = true;
                        observer.disconnect();
                        console.log('✓ Sidebar detected via timeout fallback');
                        setupMobileMenu(mobileMenuToggle, sidebar);
                    } else {
                        console.error('❌ Sidebar not found after 3s timeout');
                    }
                }
            }, 3000);
        }
    }

    function setupMobileMenu(mobileMenuToggle, sidebar) {
        console.log('✓ Mobile menu setup starting...', {
            hasToggle: !!mobileMenuToggle,
            hasSidebar: !!sidebar
        });

        // Get or create overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            console.log('✓ Overlay created');
        } else {
            console.log('✓ Overlay found in DOM');
        }

        // Debounce flag to prevent rapid clicks
        let isAnimating = false;

        // Toggle sidebar function
        function toggleSidebar(e) {
            console.log('🔘 Toggle clicked!', { eventType: e.type, isAnimating });
            e.preventDefault();
            e.stopPropagation();

            // Prevent rapid clicks during animation
            if (isAnimating) {
                console.log('⏸️ Ignoring click - animation in progress');
                return;
            }

            isAnimating = true;

            const isActive = sidebar.classList.contains('active');
            console.log('Current sidebar active state:', isActive);

            if (isActive) {
                closeSidebar();
            } else {
                openSidebar();
            }

            // Reset animation flag after transition
            setTimeout(() => {
                isAnimating = false;
                console.log('✓ Animation complete, ready for next toggle');
            }, 350); // Match CSS transition duration
        }

        // Open sidebar
        function openSidebar() {
            console.log('📂 Opening sidebar...');
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('✓ Sidebar opened. Classes:', sidebar.className);
        }

        // Close sidebar
        function closeSidebar() {
            console.log('📁 Closing sidebar...');
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('✓ Sidebar closed. Classes:', sidebar.className);
        }

        // Event listeners
        console.log('📌 Adding click listener to toggle button');
        mobileMenuToggle.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', closeSidebar);
        console.log('✓ Event listeners attached');

        // Close sidebar when clicking nav links on mobile
        const navLinks = sidebar.querySelectorAll('.nav-item');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    closeSidebar();
                }
            });
        });

        // Close sidebar on window resize to desktop
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth > 768 && sidebar.classList.contains('active')) {
                    closeSidebar();
                }
            }, 250);
        });

        // Close sidebar on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                closeSidebar();
            }
        });
    }
})();
