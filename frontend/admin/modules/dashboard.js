/**
 * Dashboard Module
 */

window.dashboardModule = {
    /**
     * Render dashboard HTML
     */
    render() {
        return `
            <div class="dashboard-stats">
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-info">
                        <div class="stat-label">Total Users</div>
                        <div class="stat-value" id="statTotalUsers">-</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">💰</div>
                    <div class="stat-info">
                        <div class="stat-label">Total Conversions</div>
                        <div class="stat-value" id="statTotalConversions">-</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏳</div>
                    <div class="stat-info">
                        <div class="stat-label">Pending</div>
                        <div class="stat-value" id="statPendingConversions">-</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-info">
                        <div class="stat-label">Approved</div>
                        <div class="stat-value" id="statApprovedConversions">-</div>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="dashboard-card">
                    <h2>📊 Thống kê tổng quan</h2>
                    <div class="stats-list">
                        <div class="stats-row">
                            <span>Tổng giá trị đơn hàng:</span>
                            <strong id="statTotalOrderValue">-</strong>
                        </div>
                        <div class="stats-row">
                            <span>Tổng commission:</span>
                            <strong id="statTotalCommission">-</strong>
                        </div>
                        <div class="stats-row">
                            <span>Tổng cashback đã trả:</span>
                            <strong id="statTotalCashback">-</strong>
                        </div>
                        <div class="stats-row">
                            <span>Cashback đang chờ:</span>
                            <strong id="statPendingCashback">-</strong>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card">
                    <h2>🎯 Quick Actions</h2>
                    <div class="quick-actions">
                        <button class="action-btn" onclick="navigateTo('users')">
                            <span>👥</span>
                            <span>Quản lý Users</span>
                        </button>
                        <button class="action-btn" onclick="navigateTo('conversions')">
                            <span>💰</span>
                            <span>Quản lý Conversions</span>
                        </button>
                        <button class="action-btn" onclick="navigateTo('at-orders')">
                            <span>📦</span>
                            <span>Xem đơn AT</span>
                        </button>
                        <button class="action-btn" onclick="navigateTo('tools')">
                            <span>🔧</span>
                            <span>Admin Tools</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Initialize dashboard
     */
    async init() {
        await this.loadStats();
    },

    /**
     * Load dashboard stats
     */
    async loadStats() {
        try {
            const response = await apiRequest('/admin/stats');
            if (response.success) {
                const stats = response.stats;

                // Update stat cards
                document.getElementById('statTotalUsers').textContent = stats.total_users || 0;
                document.getElementById('statTotalConversions').textContent = stats.total_conversions || 0;
                document.getElementById('statPendingConversions').textContent = stats.pending_conversions || 0;
                document.getElementById('statApprovedConversions').textContent = stats.approved_conversions || 0;

                // Update detailed stats
                document.getElementById('statTotalOrderValue').textContent = formatCurrency(stats.total_order_value || 0);
                document.getElementById('statTotalCommission').textContent = formatCurrency(stats.total_commission || 0);
                document.getElementById('statTotalCashback').textContent = formatCurrency(stats.total_cashback_paid || 0);
                document.getElementById('statPendingCashback').textContent = formatCurrency(stats.pending_cashback || 0);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            showToast('Lỗi tải thống kê', 'error');
        }
    },

    /**
     * Cleanup module
     */
    cleanup() {
        // Cleanup event listeners if any
    }
};
