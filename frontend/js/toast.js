/**
 * Toast Notification System
 * Lightweight, dependency-free toast notifications
 *
 * Usage:
 *   Toast.success('Operation completed successfully');
 *   Toast.error('An error occurred');
 *   Toast.warning('Please be careful');
 *   Toast.info('Information message');
 */

class ToastNotification {
  constructor() {
    this.container = null;
    this.initContainer();
  }

  /**
   * Initialize toast container
   */
  initContainer() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);

    // Inject CSS styles
    this.injectStyles();
  }

  /**
   * Inject CSS styles for toast notifications
   */
  injectStyles() {
    if (document.getElementById('toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
      }

      .toast {
        background: white;
        border-radius: 8px;
        padding: 16px 20px;
        margin-bottom: 12px;
        min-width: 300px;
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        pointer-events: auto;
        cursor: pointer;
        transition: all 0.3s ease;
        animation: slideIn 0.3s ease;
        border-left: 4px solid #ccc;
      }

      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }

      .toast.hiding {
        animation: slideOut 0.3s ease;
      }

      .toast:hover {
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        transform: translateY(-2px);
      }

      .toast-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .toast-content {
        flex: 1;
      }

      .toast-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
        color: #1a1a1a;
      }

      .toast-message {
        font-size: 13px;
        color: #666;
        line-height: 1.4;
      }

      .toast-close {
        font-size: 18px;
        color: #999;
        cursor: pointer;
        flex-shrink: 0;
        transition: color 0.2s;
        padding: 0 4px;
      }

      .toast-close:hover {
        color: #333;
      }

      /* Toast types */
      .toast.success {
        border-left-color: #10b981;
      }

      .toast.success .toast-icon {
        color: #10b981;
      }

      .toast.error {
        border-left-color: #ef4444;
      }

      .toast.error .toast-icon {
        color: #ef4444;
      }

      .toast.warning {
        border-left-color: #f59e0b;
      }

      .toast.warning .toast-icon {
        color: #f59e0b;
      }

      .toast.info {
        border-left-color: #3b82f6;
      }

      .toast.info .toast-icon {
        color: #3b82f6;
      }

      /* Mobile responsiveness */
      @media (max-width: 640px) {
        .toast-container {
          left: 10px;
          right: 10px;
          top: 10px;
        }

        .toast {
          min-width: auto;
          max-width: 100%;
          margin-bottom: 8px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show toast notification
   * @param {Object} options - Toast options
   * @param {string} options.type - Toast type: success, error, warning, info
   * @param {string} options.title - Toast title (optional)
   * @param {string} options.message - Toast message
   * @param {number} options.duration - Display duration in ms (default: 5000)
   * @param {boolean} options.autoClose - Auto close after duration (default: true)
   */
  show({ type = 'info', title = '', message = '', duration = 5000, autoClose = true }) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const icon = icons[type] || icons.info;

    // Build toast HTML
    let html = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
    `;

    if (title) {
      html += `<div class="toast-title">${this.escapeHtml(title)}</div>`;
    }

    html += `
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      <div class="toast-close">×</div>
    `;

    toast.innerHTML = html;

    // Add to container
    this.container.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide(toast);
    });

    // Click to dismiss
    toast.addEventListener('click', () => {
      this.hide(toast);
    });

    // Auto close
    if (autoClose && duration > 0) {
      setTimeout(() => {
        this.hide(toast);
      }, duration);
    }

    return toast;
  }

  /**
   * Hide toast with animation
   * @param {HTMLElement} toast - Toast element
   */
  hide(toast) {
    if (!toast || toast.classList.contains('hiding')) return;

    toast.classList.add('hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Clear all toasts
   */
  clearAll() {
    const toasts = this.container.querySelectorAll('.toast');
    toasts.forEach(toast => this.hide(toast));
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return String(text || '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Success toast
   * @param {string} message - Success message
   * @param {string} title - Toast title (optional)
   * @param {Object} options - Additional options
   */
  success(message, title = 'Thành công', options = {}) {
    return this.show({
      type: 'success',
      title,
      message,
      ...options
    });
  }

  /**
   * Error toast
   * @param {string} message - Error message
   * @param {string} title - Toast title (optional)
   * @param {Object} options - Additional options
   */
  error(message, title = 'Lỗi', options = {}) {
    return this.show({
      type: 'error',
      title,
      message,
      duration: 7000, // Longer duration for errors
      ...options
    });
  }

  /**
   * Warning toast
   * @param {string} message - Warning message
   * @param {string} title - Toast title (optional)
   * @param {Object} options - Additional options
   */
  warning(message, title = 'Cảnh báo', options = {}) {
    return this.show({
      type: 'warning',
      title,
      message,
      duration: 6000,
      ...options
    });
  }

  /**
   * Info toast
   * @param {string} message - Info message
   * @param {string} title - Toast title (optional)
   * @param {Object} options - Additional options
   */
  info(message, title = 'Thông báo', options = {}) {
    return this.show({
      type: 'info',
      title,
      message,
      ...options
    });
  }
}

// Create global instance
const Toast = new ToastNotification();

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Toast;
}
