/**
 * Progress Bar Helper
 * Reusable progress bar component for sync operations
 */

class ProgressBar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.progressElement = null;
    }

    /**
     * Show indeterminate loading progress
     * @param {string} message - Loading message
     */
    showLoading(message = 'Đang xử lý...') {
        if (!this.container) return;

        this.container.style.display = 'block';
        this.container.className = 'import-result';
        this.container.innerHTML = `
            <div class="progress-container active">
                <div style="margin-bottom: 12px;">
                    <strong>⏳ ${message}</strong>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar progress-indeterminate" style="width: 100%;">
                        <div class="progress-shimmer"></div>
                    </div>
                </div>
                <div class="progress-stats">
                    <span>Vui lòng đợi...</span>
                </div>
            </div>
        `;
    }

    /**
     * Update progress with percentage
     * @param {number} current - Current progress value
     * @param {number} total - Total value
     * @param {string} message - Custom message
     */
    updateProgress(current, total, message = '') {
        if (!this.container) return;

        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        this.container.style.display = 'block';
        this.container.className = 'import-result';
        this.container.innerHTML = `
            <div class="progress-container active">
                <div style="margin-bottom: 12px;">
                    <strong>⏳ ${message || 'Đang xử lý...'}</strong>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" style="width: ${percentage}%;">
                        ${percentage}%
                    </div>
                </div>
                <div class="progress-stats">
                    <span>📊 Đã xử lý: ${current} / ${total}</span>
                    <span>${percentage}%</span>
                </div>
            </div>
        `;
    }

    /**
     * Show success result
     * @param {string} title - Success title
     * @param {string} content - Success content (HTML)
     */
    showSuccess(title, content) {
        if (!this.container) return;

        this.container.style.display = 'block';
        this.container.className = 'import-result success';
        this.container.innerHTML = `
            <h3>✅ ${title}</h3>
            ${content}
        `;
    }

    /**
     * Show error result
     * @param {string} title - Error title
     * @param {string} message - Error message
     */
    showError(title, message) {
        if (!this.container) return;

        this.container.style.display = 'block';
        this.container.className = 'import-result error';
        this.container.innerHTML = `
            <h3>❌ ${title}</h3>
            <div style="margin-top: 12px;">
                ${message}
            </div>
        `;
    }

    /**
     * Hide progress bar
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
}

// Export for use in other files
window.ProgressBar = ProgressBar;
