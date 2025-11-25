/**
 * Enhanced Admin Dashboard
 * With Chart.js visualizations and merchant conversion metrics
 */

// Check authentication
requireAuth();

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success && response.user) {
            saveAuth(getToken(), response.user);
            if (!response.user.is_admin) {
                window.location.href = '/dashboard';
                return false;
            }
            // Update user name display - use full_name if available, fallback to username
            // const userName = document.getElementById('userName');
            // if (userName) {
            //     userName.textContent = response.user.full_name || response.user.username || response.user.email;
            // }
            return true;
        }
        throw new Error('Failed to verify admin access');
    } catch (error) {
        console.error('Admin access check failed:', error);
        window.location.href = '/login';
        return false;
    }
}

// Check admin access
(async () => {
    await checkAdminAccess();
    await init();
})();

// Charts instances
let merchantConversionChart = null;
let revenueTypesChart = null;
let conversionRateChart = null;

// Initialize dashboard
async function init() {
    try {
        // Load dashboard data
        await loadDashboardData();

        // Setup period buttons for merchant chart
        setupPeriodButtons();

        // Setup logout
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showToast('Không thể tải dữ liệu dashboard', 'error');
    }
}

/**
 * Setup period selector buttons (7D, 30D, 90D)
 */
function setupPeriodButtons() {
    const periodButtons = document.querySelectorAll('.period-btn');

    periodButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            // Remove active class from all buttons
            periodButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');

            // Get period from button text
            const period = this.textContent.trim(); // "7D", "30D", or "90D"

            // Reload merchant chart data with new period
            await loadMerchantChartData(period);
        });
    });
}

/**
 * Load merchant chart data for specific period
 */
async function loadMerchantChartData(period) {
    try {
        console.log(`[Dashboard] Loading merchant data for period: ${period}`);

        // Convert period to days
        const days = parseInt(period.replace('D', ''));

        // Call API with period parameter
        const response = await apiRequest(`/admin/dashboard/merchant-stats?days=${days}`);

        if (response.success && response.data) {
            // Update chart with new data
            initMerchantConversionChart(response.data);

            // Update merchant metrics
            if (response.data.topMerchants && response.data.topMerchants.length > 0) {
                const topMerchant = response.data.topMerchants[0];
                document.getElementById('topMerchant').textContent = topMerchant.name;
                document.getElementById('topMerchantRate').textContent = `${topMerchant.conversionRate}% conv rate`;
            }

            if (response.data.avgConversionRate) {
                document.getElementById('avgConvRate').textContent = response.data.avgConversionRate + '%';
            }

            if (response.data.totalActiveMerchants !== undefined) {
                document.getElementById('totalActiveMerchants').textContent = response.data.totalActiveMerchants;
            }

            // Update subtitle text
            const subtitle = document.querySelector('.chart-subtitle');
            if (subtitle) {
                subtitle.textContent = `Hiệu suất chuyển đổi theo merchant trong ${days} ngày`;
            }
        }
    } catch (error) {
        console.error('[Dashboard] Error loading merchant chart data:', error);
        showToast('Lỗi khi tải dữ liệu biểu đồ', 'error');
    }
}

/**
 * Load dashboard data from API
 */
async function loadDashboardData() {
    try {
        console.log('[Dashboard] Loading data from /admin/dashboard/stats...');
        const response = await apiRequest('/admin/dashboard/stats');
        console.log('[Dashboard] API Response:', response);

        if (response.success && response.data) {
            const { users, revenue, conversions, merchants, transactions, balance, clicksAndConversions } = response.data;
            console.log('[Dashboard] Data loaded:', { users, revenue, conversions, merchants, transactions, balance, clicksAndConversions });

            // Update stat cards
            updateStatCards(users, revenue, conversions);

            // Update circular progress cards
            updateCircularProgressCards(balance, clicksAndConversions);

            // Update charts
            initMerchantConversionChart(merchants);
            initRevenueTypesChart(revenue);
            initConversionRateChart(conversions);

            // Update transactions table
            updateTransactionsTable(transactions);
        } else {
            console.error('[Dashboard] Invalid response:', response);
            showToast('Không thể tải dữ liệu dashboard', 'error');
        }
    } catch (error) {
        console.error('[Dashboard] Error loading data:', error);
        showToast('Lỗi khi tải dữ liệu: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Update stat cards with data
 */
function updateStatCards(users, revenue, conversions) {
    // Row 1: Total Users, Total Commission, Cashback Paid, Platform Profit
    document.getElementById('totalUsers').textContent = users.total.toLocaleString();
    document.getElementById('usersGrowth').textContent = formatGrowth(users.growth);

    document.getElementById('totalCommission').textContent = formatCurrency(revenue.commissionRevenue);
    document.getElementById('commissionGrowth').textContent = formatGrowth(revenue.growth);

    document.getElementById('cashbackPaid').textContent = formatCurrency(revenue.cashbackPaid);
    document.getElementById('cashbackGrowth').textContent = formatGrowth(revenue.growth);

    document.getElementById('platformProfit').textContent = formatCurrency(revenue.platformFee);
    document.getElementById('profitGrowth').textContent = formatGrowth(revenue.growth);

    // Row 2: Approved, Pending, Rejected, Total Order Value
    const total = conversions.total || 1; // Prevent division by zero

    document.getElementById('approvedCount').textContent = conversions.approved.toLocaleString();
    document.getElementById('approvedPercent').textContent = ((conversions.approved / total) * 100).toFixed(1) + '%';

    document.getElementById('pendingCount').textContent = conversions.pending.toLocaleString();
    document.getElementById('pendingPercent').textContent = ((conversions.pending / total) * 100).toFixed(1) + '%';

    document.getElementById('rejectedCount').textContent = conversions.rejected.toLocaleString();
    document.getElementById('rejectedPercent').textContent = ((conversions.rejected / total) * 100).toFixed(1) + '%';

    document.getElementById('totalOrderValue').textContent = formatCurrency(revenue.totalOrderValue || 0);
    document.getElementById('orderValueGrowth').textContent = formatGrowth(revenue.growth);

    // Update growth indicators
    updateGrowthIndicators('usersGrowth', users.growth);
    updateGrowthIndicators('commissionGrowth', revenue.growth);
    updateGrowthIndicators('cashbackGrowth', revenue.growth);
    updateGrowthIndicators('profitGrowth', revenue.growth);
    updateGrowthIndicators('orderValueGrowth', revenue.growth);
}

/**
 * Update circular progress cards
 */
function updateCircularProgressCards(balance, clicksAndConversions) {
    // User Balance Card
    const totalBalance = balance.availableBalance + balance.pendingBalance;
    const balancePercent = totalBalance > 0
        ? (balance.availableBalance / totalBalance * 100)
        : 0;

    document.getElementById('availableBalance').textContent = formatCurrency(balance.availableBalance);
    document.getElementById('pendingBalance').textContent = formatCurrency(balance.pendingBalance);
    document.getElementById('userBalancePercent').textContent = balancePercent.toFixed(1) + '%';

    // Update circular progress (circumference = 2 * PI * radius = 2 * 3.14159 * 85 = 534)
    const balanceCircle = document.getElementById('userBalanceCircle');
    const balanceOffset = 534 - (534 * balancePercent / 100);
    balanceCircle.style.strokeDashoffset = balanceOffset;

    // Conversion Rate Card
    const convRate = clicksAndConversions.conversionRate || 0;

    document.getElementById('totalClicksCount').textContent = clicksAndConversions.totalClicks.toLocaleString();
    document.getElementById('totalConversionsCount').textContent = clicksAndConversions.totalConversions.toLocaleString();
    document.getElementById('conversionRatePercent').textContent = convRate.toFixed(1) + '%';

    // Update circular progress
    const convRateCircle = document.getElementById('conversionRateCircle');
    const convRateOffset = 534 - (534 * convRate / 100);
    convRateCircle.style.strokeDashoffset = convRateOffset;
}

/**
 * Update growth indicator colors
 */
function updateGrowthIndicators(elementId, growth) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const parentDiv = element.closest('.stat-growth');
    if (growth >= 0) {
        parentDiv.classList.remove('negative');
        parentDiv.classList.add('positive');
        parentDiv.querySelector('.stat-growth-icon').textContent = '↑';
    } else {
        parentDiv.classList.remove('positive');
        parentDiv.classList.add('negative');
        parentDiv.querySelector('.stat-growth-icon').textContent = '↓';
    }
}

/**
 * Initialize Merchant Conversion Chart (Area Chart)
 */
function initMerchantConversionChart(merchants) {
    const ctx = document.getElementById('merchantConversionChart');
    if (!ctx) return;

    // Destroy existing chart
    if (merchantConversionChart) {
        merchantConversionChart.destroy();
    }

    // Prepare data - top 5 merchants by conversions
    const topMerchants = merchants.topMerchants.slice(0, 5);
    const labels = topMerchants.map(m => m.name);
    const conversions = topMerchants.map(m => m.conversions);
    const conversionRates = topMerchants.map(m => m.conversionRate);

    merchantConversionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Conversions',
                data: conversions,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 2,
                borderRadius: 8,
                yAxisID: 'y'
            }, {
                label: 'Conversion Rate (%)',
                data: conversionRates,
                type: 'line',
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex === 1) {
                                label += context.parsed.y.toFixed(2) + '%';
                            } else {
                                label += context.parsed.y;
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Conversions'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Conversion Rate (%)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });

    // Update merchant metrics
    if (topMerchants.length > 0) {
        document.getElementById('topMerchant').textContent = topMerchants[0].name;
        document.getElementById('topMerchantRate').textContent = `${topMerchants[0].conversionRate.toFixed(2)}% conv rate`;
    }
    document.getElementById('avgConvRate').textContent = `${merchants.avgConversionRate.toFixed(2)}%`;
    document.getElementById('totalActiveMerchants').textContent = merchants.activeCount;
}

/**
 * Initialize Revenue Types Pie Chart
 */
function initRevenueTypesChart(revenue) {
    const ctx = document.getElementById('revenueTypesChart');
    if (!ctx) return;

    // Destroy existing chart
    if (revenueTypesChart) {
        revenueTypesChart.destroy();
    }

    revenueTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Commission Revenue', 'Platform Fee', 'Cashback Paid'],
            datasets: [{
                data: [
                    revenue.commissionRevenue,
                    revenue.platformFee,
                    revenue.cashbackPaid
                ],
                backgroundColor: [
                    'rgba(99, 102, 241, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)'
                ],
                borderColor: [
                    'rgba(99, 102, 241, 1)',
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            return label + ': ' + formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Initialize Conversion Rate Chart (Stacked Bar)
 */
function initConversionRateChart(conversions) {
    const ctx = document.getElementById('conversionRateChart');
    if (!ctx) return;

    // Destroy existing chart
    if (conversionRateChart) {
        conversionRateChart.destroy();
    }

    const months = conversions.byMonth.map(m => m.month);
    const approved = conversions.byMonth.map(m => m.approved);
    const pending = conversions.byMonth.map(m => m.pending);
    const rejected = conversions.byMonth.map(m => m.rejected);

    conversionRateChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Approved',
                    data: approved,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Pending',
                    data: pending,
                    backgroundColor: 'rgba(245, 158, 11, 0.8)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Rejected',
                    data: rejected,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Number of Conversions'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

/**
 * Update transactions table
 */
function updateTransactionsTable(transactions) {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    Chưa có giao dịch nào
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transactions.map(tx => {
        // Use full_name if available, fallback to userName
        const displayName = tx.fullName || tx.userName || 'Unknown';
        const initials = displayName.substring(0, 2).toUpperCase();
        const paymentClass = tx.paymentMethod === 'cashback' ? 'transfer' : 'shares';

        return `
            <tr>
                <td data-cashback="${formatCurrency(tx.cashbackAmount)}">
                    <div class="transaction-user">
                        <div class="user-avatar">${initials}</div>
                        <div>
                            <div style="font-weight: 600;">${displayName}</div>
                            <div style="font-size: 0.75rem; color: #9ca3af;">${tx.userEmail || '-'}</div>
                        </div>
                    </div>
                </td>
                <td>${formatDate(tx.createdAt)}</td>
                <td>${tx.merchantName || '-'}</td>
                <td>
                    <span class="payment-badge ${paymentClass}">
                        ${tx.paymentMethod || 'Cashback'}
                    </span>
                </td>
                <td style="font-weight: 600; color: #10b981;">${formatCurrency(tx.cashbackAmount)}</td>
                <td>
                    <button class="action-btn" onclick="viewTransaction('${tx.id}')">Xem chi tiết</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * View transaction details
 */
async function viewTransaction(transactionId) {
    try {
        const response = await apiRequest(`/admin/conversion/${transactionId}`);

        if (response.success && response.conversion) {
            const conv = response.conversion;

            // Create modal content
            const modalContent = `
                <div class="detail-modal-overlay" onclick="closeDetailModal()">
                    <div class="detail-modal" onclick="event.stopPropagation()">
                        <div class="detail-modal-header">
                            <div style="flex: 1;">
                                <h2>📋 Chi tiết đơn hàng</h2>
                                <div class="modal-actions">
                                    ${getStatusBadge(conv.status)}
                                    <button class="btn-check-at" onclick="checkATOrderStatus('${conv.id}'); closeDetailModal();">
                                        <span>🔍</span>
                                        <span>Kiểm tra AT</span>
                                    </button>
                                    ${conv.status === 'pending' ? `
                                        <button class="btn-approve" onclick="approveConversion('${conv.id}'); event.stopPropagation();">
                                            <span>✓</span>
                                            <span>Duyệt đơn</span>
                                        </button>
                                        <button class="btn-reject" onclick="rejectConversion('${conv.id}'); event.stopPropagation();">
                                            <span>✗</span>
                                            <span>Từ chối</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <button class="close-btn" onclick="closeDetailModal()">✕</button>
                        </div>
                        <div class="detail-modal-body">
                            <div class="detail-section">
                                <h3>👤 Thông tin người dùng</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Tên đăng nhập:</span>
                                        <span class="detail-value">${conv.username || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value">${conv.email || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Họ và tên:</span>
                                        <span class="detail-value">${conv.full_name || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>🏪 Thông tin đơn hàng</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Merchant:</span>
                                        <span class="detail-value">${conv.merchant_name || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Mã đơn hàng:</span>
                                        <span class="detail-value"><strong>${conv.order_code || '-'}</strong></span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Click ID:</span>
                                        <span class="detail-value">${conv.click_id || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>💰 Thông tin tài chính</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Giá trị đơn hàng:</span>
                                        <span class="detail-value highlight">${formatCurrency(conv.order_amount)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Hoa hồng:</span>
                                        <span class="detail-value">${formatCurrency(conv.commission)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Cashback:</span>
                                        <span class="detail-value highlight">${formatCurrency(conv.cashback_amount)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>📅 Thời gian</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian đặt hàng:</span>
                                        <span class="detail-value">${formatDate(conv.order_time, true)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian xác nhận:</span>
                                        <span class="detail-value">${conv.confirmed_time ? formatDate(conv.confirmed_time, true) : '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Thời gian tạo:</span>
                                        <span class="detail-value">${formatDate(conv.created_at, true)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-section">
                                <h3>ℹ️ Trạng thái & UTM</h3>
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <span class="detail-label">TT Đơn hàng:</span>
                                        <span class="detail-value">${getStatusBadge(conv.status)}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">TT Đối soát:</span>
                                        <span class="detail-value">${conv.is_confirmed ? '✅ Đã xác nhận' : '❌ Chưa xác nhận'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">UTM Source:</span>
                                        <span class="detail-value">${conv.utm_source || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">UTM Campaign:</span>
                                        <span class="detail-value">${conv.utm_campaign || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-modal-footer">
                            <button class="btn btn-secondary" onclick="closeDetailModal()">Đóng</button>
                        </div>
                    </div>
                </div>
            `;

            // Add to body
            document.body.insertAdjacentHTML('beforeend', modalContent);
        } else {
            throw new Error(response.message || 'Failed to load conversion details');
        }
    } catch (error) {
        console.error('Error loading details:', error);
        showToast(error.message || 'Failed to load conversion details', 'error');
    }
}

/**
 * Format growth percentage
 */
function formatGrowth(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format currency
 */
function formatCurrency(amount) {
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
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const statusClass = status === 'approved' ? 'status-approved' :
                       status === 'pending' ? 'status-pending' :
                       'status-rejected';
    const statusText = status === 'approved' ? 'Đã duyệt' :
                      status === 'pending' ? 'Đang xử lý' : 'Đã hủy';
    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

/**
 * Close detail modal
 */
function closeDetailModal() {
    const modal = document.querySelector('.detail-modal-overlay');
    if (modal) {
        modal.remove();
    }
}

/**
 * Approve conversion
 */
async function approveConversion(conversionId) {
    if (!confirm('Bạn có chắc chắn muốn duyệt đơn này?')) {
        return;
    }

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'approved' })
        });

        if (response.success) {
            showToast('Đã duyệt đơn thành công', 'success');
            closeDetailModal();
            // Reload dashboard data
            loadDashboardData();
        } else {
            throw new Error(response.message || 'Failed to approve conversion');
        }
    } catch (error) {
        console.error('Error approving conversion:', error);
        showToast(error.message || 'Lỗi khi duyệt đơn', 'error');
    }
}

/**
 * Reject conversion
 */
async function rejectConversion(conversionId) {
    if (!confirm('Bạn có chắc chắn muốn từ chối đơn này?')) {
        return;
    }

    try {
        const response = await apiRequest(`/admin/conversion/${conversionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'rejected' })
        });

        if (response.success) {
            showToast('Đã từ chối đơn thành công', 'success');
            closeDetailModal();
            // Reload dashboard data
            loadDashboardData();
        } else {
            throw new Error(response.message || 'Failed to reject conversion');
        }
    } catch (error) {
        console.error('Error rejecting conversion:', error);
        showToast(error.message || 'Lỗi khi từ chối đơn', 'error');
    }
}

/**
 * Check AT order status
 */
async function checkATOrderStatus(conversionId) {
    try {
        showToast('Đang kiểm tra trạng thái trên AccessTrade...', 'info');

        const response = await apiRequest(`/admin/conversion/${conversionId}/check-at-status`);

        if (response.success) {
            // Show AT order details in a new modal or alert
            const atOrder = response.atOrder;
            if (atOrder) {
                const message = `
Trạng thái AT: ${atOrder.conversion_status || 'N/A'}
Giá trị đơn: ${formatCurrency(atOrder.conversion_amount || 0)}
Hoa hồng: ${formatCurrency(atOrder.conversion_commission_amount || 0)}
                `.trim();
                alert(message);
            } else {
                showToast('Không tìm thấy đơn hàng trên AT', 'warning');
            }
        } else {
            throw new Error(response.message || 'Failed to check AT status');
        }
    } catch (error) {
        console.error('Error checking AT status:', error);
        showToast(error.message || 'Lỗi khi kiểm tra AT', 'error');
    }
}
