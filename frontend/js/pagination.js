/**
 * Reusable Pagination Component
 *
 * Usage:
 * const paginator = new Pagination({
 *   containerId: 'paginationContainer',
 *   itemsPerPage: 20,
 *   onPageChange: (page, itemsPerPage) => { ... }
 * });
 *
 * paginator.update(totalItems, currentPage);
 */

class Pagination {
  /**
   * @param {Object} options
   * @param {string} options.containerId - ID of container element
   * @param {number} options.itemsPerPage - Default items per page
   * @param {Function} options.onPageChange - Callback when page changes: (page, itemsPerPage) => void
   * @param {Array<number>} options.pageSizeOptions - Available page size options (default: [10, 20, 50, 100])
   */
  constructor(options) {
    this.containerId = options.containerId;
    this.itemsPerPage = options.itemsPerPage || 20;
    this.onPageChange = options.onPageChange || (() => {});
    this.pageSizeOptions = options.pageSizeOptions || [10, 20, 50, 100];

    this.currentPage = 1;
    this.totalItems = 0;
    this.totalPages = 1;

    this.render();
    this.attachEventListeners();
  }

  /**
   * Render pagination HTML
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Pagination container #${this.containerId} not found`);
      return;
    }

    const pageSizeOptionsHTML = this.pageSizeOptions
      .map(size => `<option value="${size}" ${size === this.itemsPerPage ? 'selected' : ''}>${size}</option>`)
      .join('');

    container.innerHTML = `
      <div class="pagination">
        <div class="rows-per-page">
          <label for="${this.containerId}-pageSize">Hiển thị:</label>
          <select id="${this.containerId}-pageSize">
            ${pageSizeOptionsHTML}
          </select>
        </div>
        <button id="${this.containerId}-prevBtn" disabled>« Trước</button>
        <span id="${this.containerId}-pageInfo">Trang 1 / 1 (0 items)</span>
        <button id="${this.containerId}-nextBtn" disabled>Sau »</button>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const prevBtn = document.getElementById(`${this.containerId}-prevBtn`);
    const nextBtn = document.getElementById(`${this.containerId}-nextBtn`);
    const pageSizeSelect = document.getElementById(`${this.containerId}-pageSize`);

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.goToPreviousPage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.goToNextPage());
    }

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        this.itemsPerPage = parseInt(e.target.value);
        this.currentPage = 1; // Reset to first page
        this.onPageChange(this.currentPage, this.itemsPerPage);
      });
    }
  }

  /**
   * Update pagination state and UI
   * @param {number} totalItems - Total number of items
   * @param {number} currentPage - Current page number (optional)
   */
  update(totalItems, currentPage = null) {
    this.totalItems = totalItems;
    this.totalPages = Math.ceil(totalItems / this.itemsPerPage) || 1;

    if (currentPage !== null) {
      this.currentPage = currentPage;
    }

    // Update UI
    const pageInfo = document.getElementById(`${this.containerId}-pageInfo`);
    const prevBtn = document.getElementById(`${this.containerId}-prevBtn`);
    const nextBtn = document.getElementById(`${this.containerId}-nextBtn`);

    if (pageInfo) {
      pageInfo.textContent = `Trang ${this.currentPage} / ${this.totalPages} (${totalItems} items)`;
    }

    if (prevBtn) {
      prevBtn.disabled = this.currentPage === 1;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= this.totalPages;
    }
  }

  /**
   * Go to previous page
   */
  goToPreviousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.onPageChange(this.currentPage, this.itemsPerPage);
    }
  }

  /**
   * Go to next page
   */
  goToNextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.onPageChange(this.currentPage, this.itemsPerPage);
    }
  }

  /**
   * Go to specific page
   * @param {number} page - Page number
   */
  goToPage(page) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.onPageChange(this.currentPage, this.itemsPerPage);
    }
  }

  /**
   * Get current page
   * @returns {number}
   */
  getCurrentPage() {
    return this.currentPage;
  }

  /**
   * Get items per page
   * @returns {number}
   */
  getItemsPerPage() {
    return this.itemsPerPage;
  }

  /**
   * Reset pagination to first page
   */
  reset() {
    this.currentPage = 1;
    this.update(0);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
}
