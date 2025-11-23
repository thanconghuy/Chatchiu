/**
 * System Balance History Page
 * Displays user's balance transactions and reconciliation history
 */

(function() {
  'use strict';

  const API_BASE = window.CONFIG?.API_BASE || '';
  const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
    TOKEN: 'cashback_token',
    USER: 'cashback_user'
  };

  let currentTab = 'transactions';
  let transactionsPage = 1;
  let reconciliationsPage = 1;
  const itemsPerPage = 20;

  /**
   * Format money value
   */
  function formatMoney(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Format date
   */
  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get transaction type badge
   */
  function getTransactionTypeBadge(type) {
    const typeMap = {
      'reconciliation_credit': { label: 'Đối soát', class: 'reconciliation' },
      'payment_deducted': { label: 'Thanh toán', class: 'payment' },
      'payment_refunded': { label: 'Hoàn tiền', class: 'reconciliation' },
      'chargeback': { label: 'Hoàn trả', class: 'payment' },
      'debt_offset': { label: 'Trừ nợ', class: 'reconciliation' },
      'pending_added': { label: 'Thêm chờ xử lý', class: 'pending' },
      'balance_increased': { label: 'Tăng số dư', class: 'reconciliation' }
    };

    const typeInfo = typeMap[type] || { label: type, class: 'pending' };
    return `<span class="transaction-type-badge ${typeInfo.class}">${typeInfo.label}</span>`;
  }

  /**
   * Load balance summary
   */
  async function loadBalanceSummary() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) return;

      const response = await fetch(`${API_BASE}/api/user/system-reconciliation/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          // Balance not initialized yet
          updateSummaryUI({
            available_balance: 0,
            debt_balance: 0,
            total_earned: 0
          });
          return;
        }
        throw new Error('Failed to load balance');
      }

      const result = await response.json();
      if (result.success) {
        updateSummaryUI(result.data);
      }
    } catch (error) {
      console.error('Error loading balance summary:', error);
    }
  }

  /**
   * Update summary UI
   */
  function updateSummaryUI(balance) {
    document.getElementById('summaryAvailable').textContent = formatMoney(balance.available_balance || 0);
    document.getElementById('summaryEarned').textContent = formatMoney(balance.total_earned || 0);

    // Show debt card if user has debt
    const debtBalance = parseFloat(balance.debt_balance || 0);
    const debtCard = document.getElementById('debtCard');
    const debtValue = document.getElementById('summaryDebt');

    if (debtBalance > 0) {
      debtCard.style.display = 'block';
      debtValue.textContent = formatMoney(debtBalance);
    } else {
      debtCard.style.display = 'none';
    }
  }

  /**
   * Load transactions
   */
  async function loadTransactions(page = 1) {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        showError('Vui lòng đăng nhập');
        return;
      }

      const container = document.getElementById('transactionsContainer');
      container.innerHTML = '<div class="loading">Đang tải...</div>';

      const response = await fetch(
        `${API_BASE}/api/user/system-reconciliation/transactions?page=${page}&limit=${itemsPerPage}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load transactions');
      }

      const result = await response.json();
      if (result.success) {
        renderTransactions(result.data.transactions);
        updatePagination('transactions', result.data.pagination);
        transactionsPage = page;
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      const container = document.getElementById('transactionsContainer');
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Không thể tải dữ liệu</div></div>';
    }
  }

  /**
   * Render transactions table
   */
  function renderTransactions(transactions) {
    const container = document.getElementById('transactionsContainer');

    if (!transactions || transactions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">Chưa có giao dịch nào</div>
        </div>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Thời gian</th>
          <th>Loại giao dịch</th>
          <th>Số tiền</th>
          <th class="hide-mobile">Số dư sau</th>
          <th>Mô tả</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(tx => {
          const isIncrease = tx.balance_after > tx.balance_before ||
                            tx.reserved_after > tx.reserved_before ||
                            tx.pending_after > tx.pending_before;
          const amountClass = isIncrease ? 'amount-positive' : 'amount-negative';
          const amountPrefix = isIncrease ? '+' : '-';

          return `
            <tr>
              <td>${formatDate(tx.created_at)}</td>
              <td>${getTransactionTypeBadge(tx.transaction_type)}</td>
              <td class="${amountClass}">${amountPrefix}${formatMoney(tx.amount)}</td>
              <td class="hide-mobile">${formatMoney(tx.balance_after)}</td>
              <td>${tx.description || '-'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;

    container.innerHTML = '';
    container.appendChild(table);
  }

  /**
   * Load reconciliation history
   */
  async function loadReconciliations(page = 1) {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        showError('Vui lòng đăng nhập');
        return;
      }

      const container = document.getElementById('reconciliationsContainer');
      container.innerHTML = '<div class="loading">Đang tải...</div>';

      const response = await fetch(
        `${API_BASE}/api/user/system-reconciliation/history?page=${page}&limit=${itemsPerPage}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load reconciliation history');
      }

      const result = await response.json();
      if (result.success) {
        renderReconciliations(result.data.items);
        updatePagination('reconciliations', result.data.pagination);
        reconciliationsPage = page;
      }
    } catch (error) {
      console.error('Error loading reconciliations:', error);
      const container = document.getElementById('reconciliationsContainer');
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Không thể tải dữ liệu</div></div>';
    }
  }

  /**
   * Render reconciliations table
   */
  function renderReconciliations(items) {
    const container = document.getElementById('reconciliationsContainer');

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">Chưa có lịch sử đối soát</div>
        </div>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Kỳ đối soát</th>
          <th class="hide-mobile">Merchant</th>
          <th>Cashback</th>
          <th class="hide-mobile">Rủi ro</th>
          <th>Trạng thái</th>
          <th class="hide-mobile">Thời gian</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const riskBadge = item.is_high_risk
            ? '<span style="color: #ef4444;">⚠️ Cao</span>'
            : '<span style="color: #10b981;">✓ Thấp</span>';

          const statusBadge = item.conversion_status === 'approved'
            ? '<span class="transaction-type-badge reconciliation">Đã duyệt</span>'
            : item.conversion_status === 'rejected'
            ? '<span class="transaction-type-badge payment">Từ chối</span>'
            : '<span class="transaction-type-badge pending">Chờ duyệt</span>';

          return `
            <tr>
              <td><strong>${item.period_label}</strong></td>
              <td class="hide-mobile">${item.merchant_name || '-'}</td>
              <td class="amount-positive">${formatMoney(item.cashback_amount)}</td>
              <td class="hide-mobile">${riskBadge}</td>
              <td>${statusBadge}</td>
              <td class="hide-mobile">${formatDate(item.created_at)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;

    container.innerHTML = '';
    container.appendChild(table);
  }

  /**
   * Update pagination
   */
  function updatePagination(type, pagination) {
    const paginationEl = document.getElementById(`${type}Pagination`);
    const prevBtn = document.getElementById(`prev${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
    const nextBtn = document.getElementById(`next${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
    const info = document.getElementById(`${type}PaginationInfo`);

    if (pagination.totalPages <= 1) {
      paginationEl.style.display = 'none';
      return;
    }

    paginationEl.style.display = 'flex';
    info.textContent = `Trang ${pagination.page} / ${pagination.totalPages}`;

    prevBtn.disabled = pagination.page <= 1;
    nextBtn.disabled = pagination.page >= pagination.totalPages;
  }

  /**
   * Switch tab
   */
  function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.getElementById('transactionsTab').style.display = tabName === 'transactions' ? 'block' : 'none';
    document.getElementById('reconciliationsTab').style.display = tabName === 'reconciliations' ? 'block' : 'none';

    // Load data for the active tab
    if (tabName === 'transactions') {
      loadTransactions(transactionsPage);
    } else {
      loadReconciliations(reconciliationsPage);
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.className = 'toast show error';
      setTimeout(() => {
        toast.className = 'toast';
      }, 3000);
    }
  }

  /**
   * Initialize page
   */
  function init() {
    // Load balance summary
    loadBalanceSummary();

    // Load initial data
    loadTransactions(1);

    // Setup tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
      });
    });

    // Setup pagination buttons
    document.getElementById('prevTransactionsBtn').addEventListener('click', () => {
      if (transactionsPage > 1) {
        loadTransactions(transactionsPage - 1);
      }
    });

    document.getElementById('nextTransactionsBtn').addEventListener('click', () => {
      loadTransactions(transactionsPage + 1);
    });

    document.getElementById('prevReconciliationsBtn').addEventListener('click', () => {
      if (reconciliationsPage > 1) {
        loadReconciliations(reconciliationsPage - 1);
      }
    });

    document.getElementById('nextReconciliationsBtn').addEventListener('click', () => {
      loadReconciliations(reconciliationsPage + 1);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
