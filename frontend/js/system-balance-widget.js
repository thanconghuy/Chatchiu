/**
 * System Balance Widget
 * Handles loading and displaying user's system balance
 */

(function() {
  'use strict';

  const API_BASE = window.CONFIG?.API_BASE || '';
  const STORAGE_KEYS = window.CONFIG?.STORAGE_KEYS || {
    TOKEN: 'cashback_token',
    USER: 'cashback_user'
  };

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
   * Load system balance from API
   */
  async function loadSystemBalance() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        console.warn('No token found');
        return;
      }

      const response = await fetch(`${API_BASE}/api/user/system-reconciliation/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // If 404 or balance not found, show zeros (user hasn't been reconciled yet)
        if (response.status === 404 || response.status === 500) {
          console.log('System balance not yet initialized');
          updateBalanceUI({
            available_balance: 0,
            reserved_balance: 0,
            pending_balance: 0,
            total_earned: 0,
            total_withdrawn: 0
          });
          return;
        }
        throw new Error('Failed to load system balance');
      }

      const result = await response.json();
      if (result.success) {
        updateBalanceUI(result.data);
      }
    } catch (error) {
      console.error('Error loading system balance:', error);
      // Show zeros on error
      updateBalanceUI({
        available_balance: 0,
        reserved_balance: 0,
        pending_balance: 0,
        total_earned: 0,
        total_withdrawn: 0
      });
    }
  }

  /**
   * Update balance UI with data
   */
  function updateBalanceUI(balance) {
    const availableEl = document.getElementById('systemAvailableBalance');
    const reservedEl = document.getElementById('systemReservedBalance');
    const pendingEl = document.getElementById('systemPendingBalance');

    if (availableEl) {
      availableEl.textContent = formatMoney(balance.available_balance || 0);
    }

    if (reservedEl) {
      reservedEl.textContent = formatMoney(balance.reserved_balance || 0);
    }

    if (pendingEl) {
      pendingEl.textContent = formatMoney(balance.pending_balance || 0);
    }

    // Store balance in global scope for other components to use
    window.userSystemBalance = balance;
  }

  /**
   * Show balance info modal
   */
  function showBalanceInfoModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('balanceInfoModal');
    if (!modal) {
      modal = createBalanceInfoModal();
      document.body.appendChild(modal);
    }

    modal.classList.add('active');
  }

  /**
   * Create balance info modal
   */
  function createBalanceInfoModal() {
    const modal = document.createElement('div');
    modal.id = 'balanceInfoModal';
    modal.className = 'balance-info-modal';
    modal.innerHTML = `
      <div class="balance-info-content">
        <div class="balance-info-header">
          <h3 class="balance-info-title">💳 Về số dư hệ thống</h3>
          <button class="balance-info-close" id="closeBalanceInfoBtn">×</button>
        </div>

        <div class="balance-info-section">
          <h3>💰 Số dư khả dụng</h3>
          <p>Đây là số tiền bạn có thể rút ngay lập tức. Số tiền này đã được hệ thống xác nhận và sẵn sàng để thanh toán.</p>
        </div>

        <div class="balance-info-section">
          <h3>🔒 Số dư dự trữ</h3>
          <p>Đây là phần cashback từ các đơn hàng có rủi ro cao, tạm thời được giữ lại để chờ xác nhận cuối cùng từ đối tác AccessTrade (thường 65-105 ngày).</p>
          <p><strong>Lý do dự trữ:</strong></p>
          <ul>
            <li>Đơn hàng từ tài khoản mới (< 30 ngày)</li>
            <li>Đơn hàng giá trị cao (> 5 triệu)</li>
            <li>Lịch sử từ chối cao</li>
          </ul>
          <p>Khi đối tác xác nhận đơn hàng được duyệt, số tiền này sẽ chuyển sang <strong>khả dụng</strong>. Nếu bị từ chối, số tiền sẽ bị trừ.</p>
        </div>

        <div class="balance-info-section">
          <h3>⏳ Số dư chờ xử lý</h3>
          <p>Đây là cashback từ các đơn hàng đã được duyệt nhưng chưa đến kỳ đối soát hệ thống (tháng phát sinh + 15 ngày).</p>
          <p>Số tiền này sẽ được chuyển sang <strong>khả dụng</strong> hoặc <strong>dự trữ</strong> sau khi hệ thống đối soát.</p>
        </div>

        <div class="balance-info-section">
          <h3>⚡ Lợi ích của hệ thống đối soát</h3>
          <ul>
            <li><strong>Rút tiền nhanh hơn:</strong> Thay vì chờ 65-105 ngày, bạn có thể rút tiền sau tháng + 15 ngày</li>
            <li><strong>Minh bạch:</strong> Theo dõi rõ ràng số dư khả dụng, dự trữ và chờ xử lý</li>
            <li><strong>An toàn:</strong> Hệ thống quản lý rủi ro tự động</li>
          </ul>
        </div>
      </div>
    `;

    // Close modal when clicking outside or close button
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    const closeBtn = modal.querySelector('#closeBalanceInfoBtn');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    return modal;
  }

  /**
   * Initialize widget
   */
  function init() {
    // Load balance on page load
    loadSystemBalance();

    // Setup info button
    const infoBtn = document.getElementById('systemBalanceInfoBtn');
    if (infoBtn) {
      infoBtn.addEventListener('click', showBalanceInfoModal);
    }

    // Setup withdraw button
    const withdrawBtn = document.getElementById('btnWithdraw');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', () => {
        window.location.href = '/payment-requests';
      });
    }

    // Setup balance history button
    const historyBtn = document.getElementById('btnBalanceHistory');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        window.location.href = '/system-balance-history';
      });
    }

    // Refresh balance every 60 seconds
    setInterval(loadSystemBalance, 60000);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for use in other scripts
  window.SystemBalanceWidget = {
    reload: loadSystemBalance,
    getBalance: () => window.userSystemBalance
  };
})();
