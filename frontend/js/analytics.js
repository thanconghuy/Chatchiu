/**
 * Vercel Analytics Integration for Vanilla JavaScript
 *
 * This script injects Vercel Analytics into your vanilla JS app
 * Alternative to using @vercel/analytics npm package
 */

(function() {
  'use strict';

  // Check if running on localhost
  const isDevelopment = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';

  // Initialize Vercel Analytics
  function initVercelAnalytics() {
    // Create and inject the analytics script
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://va.vercel-scripts.com/v1/script.js';

    // Set data-mode based on environment
    if (isDevelopment) {
      script.setAttribute('data-mode', 'development');
    } else {
      script.setAttribute('data-mode', 'production');
    }

    document.head.appendChild(script);

    // Log initialization (only in development)
    if (isDevelopment) {
      console.log('📊 Vercel Analytics initialized (development mode)');
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVercelAnalytics);
  } else {
    initVercelAnalytics();
  }

  // Track page views (for SPA-like behavior if needed)
  window.vaPageview = function(path) {
    if (window.va) {
      window.va('pageview', { path: path || window.location.pathname });
    }
  };

  // Track custom events
  window.vaEvent = function(name, properties) {
    if (window.va) {
      window.va('event', { name, ...properties });
    }
  };

})();
