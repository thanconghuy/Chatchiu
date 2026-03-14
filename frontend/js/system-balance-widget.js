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
   * Load system balance from dashboard stats API
   * Dùng cùng endpoint với trang để đảm bảo số liệu nhất quán
   */
  async function loadSystemBalance() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        console.warn('No token found');
        return;
      }

      const response = await fetch(`${API_BASE}/api/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        updateBalanceUI({ availableBalance: 0, totalCashback: 0, pendingReserved: 0, totalWithdrawn: 0 });
        return;
      }

      const result = await response.json();
      if (result.success) {
        updateBalanceUI(result.stats);
      }
    } catch (error) {
      console.error('Error loading system balance:', error);
      updateBalanceUI({ availableBalance: 0, totalCashback: 0, pendingReserved: 0, totalWithdrawn: 0 });
    }
  }

  /**
   * Update balance UI with data from /api/dashboard/stats
   */
  function updateBalanceUI(stats) {
    const availableEl = document.getElementById('systemAvailableBalance');
    const pendingEl = document.getElementById('systemPendingBalance');

    if (availableEl) {
      // Tổng cashback đã duyệt (approved từ system_conversions)
      availableEl.textContent = formatMoney(stats.totalCashback || 0);
    }

    if (pendingEl) {
      // Đang bị giữ bởi payment request confirmed
      pendingEl.textContent = formatMoney(stats.pendingReserved || 0);
    }

    // Store in global scope for other components (map camelCase → snake_case cho backward compat)
    window.userSystemBalance = {
      available_balance: stats.availableBalance || 0,
      total_earned: stats.totalEarned || 0,
      total_withdrawn: stats.totalWithdrawn || 0,
      pending_reserved: stats.pendingReserved || 0,
      total_approved_cashback: stats.totalCashback || 0
    };
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
          <h3>💰 Tổng Cashback</h3>
          <p>Đây là tổng số tiền cashback từ tất cả đơn hàng đã được duyệt, bao gồm cả những đơn chưa đến kỳ đối soát.</p>
          <p><strong>Lưu ý:</strong> Số tiền này chưa chắc có thể rút được ngay. Để rút tiền, đơn hàng phải được đối soát.</p>
        </div>

        <div class="balance-info-section">
          <h3>⏳ Số dư chờ xử lý</h3>
          <p>Đây là cashback từ các đơn hàng đã được duyệt nhưng chưa đến kỳ đối soát hệ thống (tháng phát sinh + 15 ngày).</p>
          <p>Số tiền này sẽ được chuyển sang <strong>khả dụng</strong> sau khi admin hoàn tất kỳ đối soát.</p>
        </div>

        <div class="balance-info-section">
          <h3>⚡ Lợi ích của hệ thống đối soát</h3>
          <ul>
            <li><strong>Rút tiền nhanh hơn:</strong> Thay vì chờ 65-105 ngày, bạn nhận 100% cashback ngay sau tháng + 15 ngày</li>
            <li><strong>Minh bạch:</strong> Theo dõi rõ ràng số dư khả dụng và chờ xử lý</li>
            <li><strong>Đơn giản:</strong> Không cần lo lắng về rủi ro, hệ thống trả 100% cashback ngay</li>
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
        window.location.href = '/payment-history';
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
