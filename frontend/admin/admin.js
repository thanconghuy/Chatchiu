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
            // Update user name display
            const userName = document.getElementById('userName');
            if (userName) {
                userName.textContent = response.user.username || response.user.email;
            }
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
 * Load dashboard data from API
 */
async function loadDashboardData() {
    try {
        console.log('[Dashboard] Loading data from /admin/dashboard/stats...');
        const response = await apiRequest('/admin/dashboard/stats');
        console.log('[Dashboard] API Response:', response);

        if (response.success && response.data) {
            const { users, revenue, conversions, merchants, transactions } = response.data;
            console.log('[Dashboard] Data loaded:', { users, revenue, conversions, merchants, transactions });

            // Update stat cards
            updateStatCards(users, revenue);

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
function updateStatCards(users, revenue) {
    // Total Users
    document.getElementById('totalUsers').textContent = users.total.toLocaleString();
    document.getElementById('usersGrowth').textContent = formatGrowth(users.growth);

    // New Users
    document.getElementById('newUsers').textContent = users.newThisMonth.toLocaleString();
    document.getElementById('newUsersGrowth').textContent = `+${users.newThisMonth}`;

    // Total Revenue
    document.getElementById('totalRevenue').textContent = formatCurrency(revenue.total);
    document.getElementById('revenueGrowth').textContent = formatGrowth(revenue.growth);

    // Churned Users
    document.getElementById('churnedUsers').textContent = users.churned.toLocaleString();
    document.getElementById('churnGrowth').textContent = formatGrowth(users.churnRate);

    // Update growth indicators
    updateGrowthIndicators('usersGrowth', users.growth);
    updateGrowthIndicators('revenueGrowth', revenue.growth);
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

    const years = conversions.byYear.map(y => y.year);
    const approved = conversions.byYear.map(y => y.approved);
    const pending = conversions.byYear.map(y => y.pending);
    const rejected = conversions.byYear.map(y => y.rejected);

    conversionRateChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
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
        const initials = tx.userName ? tx.userName.substring(0, 2).toUpperCase() : 'U';
        const paymentClass = tx.paymentMethod === 'cashback' ? 'transfer' : 'shares';

        return `
            <tr>
                <td>
                    <div class="transaction-user">
                        <div class="user-avatar">${initials}</div>
                        <div>
                            <div style="font-weight: 600;">${tx.userName || 'Unknown'}</div>
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
                    <button class="action-btn" onclick="viewTransaction('${tx.id}')">View more</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * View transaction details
 */
function viewTransaction(transactionId) {
    // Navigate to conversions page with filter
    window.location.href = `/admin/conversions?id=${transactionId}`;
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
