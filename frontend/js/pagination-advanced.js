/**
 * Advanced Pagination Component
 *
 * Features:
 * - Multiple page number buttons
 * - First/Last page navigation
 * - Modern UI with icons
 * - Responsive design
 *
 * Usage:
 * const paginator = new AdvancedPagination({
 *   containerId: 'paginationContainer',
 *   onPageChange: (page) => { ... }
 * });
 *
 * paginator.render({ total: 100, page: 1, limit: 20, totalPages: 5, hasNext: true, hasPrev: false });
 */

class AdvancedPagination {
  /**
   * @param {Object} options
   * @param {string} options.containerId - ID of container element
   * @param {Function} options.onPageChange - Callback when page changes: (page) => void
   * @param {number} options.maxPagesToShow - Maximum page buttons to show (default: 5)
   */
  constructor(options) {
    this.containerId = options.containerId;
    this.onPageChange = options.onPageChange || (() => {});
    this.maxPagesToShow = options.maxPagesToShow || 5;

    this.currentPagination = null;
  }

  /**
   * Render pagination HTML
   * @param {Object} pagination - { total, page, limit, totalPages, hasNext, hasPrev }
   */
  render(pagination) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Pagination container #${this.containerId} not found`);
      return;
    }

    if (!pagination || pagination.total === 0) {
      container.innerHTML = '';
      return;
    }

    this.currentPagination = pagination;
    const { total, page, limit, totalPages, hasNext, hasPrev } = pagination;

    const startItem = ((page - 1) * limit) + 1;
    const endItem = Math.min(page * limit, total);

    // Generate page numbers to show
    const pageNumbers = this.generatePageNumbers(page, totalPages);

    container.innerHTML = `
      <div class="pagination-container">
        <div class="pagination-info">
          Hiển thị <strong>${startItem}-${endItem}</strong> / <strong>${total}</strong> kết quả
        </div>
        <div class="pagination-controls">
          <button
            class="pagination-btn"
            ${!hasPrev ? 'disabled' : ''}
            data-page="1"
            title="Trang đầu"
          >
            <i class="fas fa-angle-double-left"></i>
          </button>
          <button
            class="pagination-btn"
            ${!hasPrev ? 'disabled' : ''}
            data-page="${page - 1}"
            title="Trang trước"
          >
            <i class="fas fa-angle-left"></i>
          </button>

          ${pageNumbers.map(p => `
            <button
              class="pagination-btn page-number-btn ${p === page ? 'active' : ''}"
              data-page="${p}"
            >
              ${p}
            </button>
          `).join('')}

          <button
            class="pagination-btn"
            ${!hasNext ? 'disabled' : ''}
            data-page="${page + 1}"
            title="Trang sau"
          >
            <i class="fas fa-angle-right"></i>
          </button>
          <button
            class="pagination-btn"
            ${!hasNext ? 'disabled' : ''}
            data-page="${totalPages}"
            title="Trang cuối"
          >
            <i class="fas fa-angle-double-right"></i>
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Generate page numbers to show
   * @param {number} currentPage
   * @param {number} totalPages
   * @returns {Array<number>}
   */
  generatePageNumbers(currentPage, totalPages) {
    const pageNumbers = [];

    if (totalPages <= this.maxPagesToShow) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Show current page and surrounding pages
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, currentPage + 2);

      // Adjust if we're near the beginning or end
      if (currentPage <= 3) {
        endPage = Math.min(totalPages, this.maxPagesToShow);
      } else if (currentPage >= totalPages - 2) {
        startPage = Math.max(1, totalPages - this.maxPagesToShow + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }
    }

    return pageNumbers;
  }

  /**
   * Attach event listeners to pagination buttons
   */
  attachEventListeners() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('.pagination-btn[data-page]');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const page = parseInt(button.dataset.page);
        if (!isNaN(page) && page > 0 && !button.disabled) {
          this.onPageChange(page);
        }
      });
    });
  }

  /**
   * Update pagination (alias for render for compatibility)
   * @param {Object} pagination
   */
  update(pagination) {
    this.render(pagination);
  }

  /**
   * Reset pagination
   */
  reset() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = '';
    }
    this.currentPagination = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdvancedPagination;
}
