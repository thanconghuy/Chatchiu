// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// DOM Elements
const testConnectionBtn = document.getElementById('testConnectionBtn');
const fetchConversionsBtn = document.getElementById('fetchConversionsBtn');
const connectionStatus = document.getElementById('connectionStatus');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const conversionsTableBody = document.getElementById('conversionsTableBody');
const totalOrdersEl = document.getElementById('totalOrders');
const totalCommissionEl = document.getElementById('totalCommission');
const approvedOrdersEl = document.getElementById('approvedOrders');
const pendingOrdersEl = document.getElementById('pendingOrders');

// Initialize date inputs with default values (last 30 days)
function initializeDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    endDateInput.valueAsDate = today;
    startDateInput.valueAsDate = thirtyDaysAgo;
}

// Format number as currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show loading state
function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const loader = button.querySelector('.loader');

    if (isLoading) {
        button.disabled = true;
        loader.style.display = 'inline-block';
        btnText.textContent = 'Loading...';
    } else {
        button.disabled = false;
        loader.style.display = 'none';
        btnText.textContent = button === testConnectionBtn ? 'Test Connection' : 'Fetch Conversions';
    }
}

// Show status message
function showStatus(message, isSuccess) {
    connectionStatus.textContent = message;
    connectionStatus.className = `status-message show ${isSuccess ? 'success' : 'error'}`;

    setTimeout(() => {
        connectionStatus.classList.remove('show');
    }, 5000);
}

// Test Connection
async function testConnection() {
    setButtonLoading(testConnectionBtn, true);

    try {
        const response = await fetch(`${API_BASE_URL}/test-connection`);
        const data = await response.json();

        if (data.success) {
            showStatus('✅ Connection successful! Ready to fetch data.', true);
        } else {
            showStatus(`❌ Connection failed: ${data.message}`, false);
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, false);
    } finally {
        setButtonLoading(testConnectionBtn, false);
    }
}

// Get status badge HTML
function getStatusBadge(status) {
    const statusMap = {
        'approved': { class: 'status-approved', text: 'Đã duyệt' },
        'pending': { class: 'status-pending', text: 'Chờ duyệt' },
        'rejected': { class: 'status-rejected', text: 'Từ chối' }
    };

    const statusInfo = statusMap[status?.toLowerCase()] || { class: 'status-pending', text: status || 'N/A' };
    return `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

// Update stats
function updateStats(conversions) {
    let totalOrders = 0;
    let totalCommission = 0;
    let approvedOrders = 0;
    let pendingOrders = 0;

    if (conversions && conversions.length > 0) {
        totalOrders = conversions.length;

        conversions.forEach(conv => {
            // pub_commission = hoa hồng
            const commission = parseFloat(conv.pub_commission || 0);
            totalCommission += commission;

            const status = (conv.status || '').toLowerCase();
            if (status === 'approved' || status === 'approve') {
                approvedOrders++;
            } else if (status === 'pending') {
                pendingOrders++;
            }
        });
    }

    totalOrdersEl.textContent = totalOrders;
    totalCommissionEl.textContent = formatCurrency(totalCommission);
    approvedOrdersEl.textContent = approvedOrders;
    pendingOrdersEl.textContent = pendingOrders;
}

// Store conversions data globally for modal
let conversionsData = [];

// Render conversions table
function renderConversions(conversions) {
    // Store data globally
    conversionsData = conversions || [];

    if (!conversions || conversions.length === 0) {
        conversionsTableBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">
                    <div class="empty-message">
                        <p>📋 Không có dữ liệu</p>
                        <p class="empty-sub">Không tìm thấy conversions trong khoảng thời gian này</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const rows = conversions.map((conv, index) => {
        // AccessTrade API fields mapping:
        // billing = giá trị đơn hàng
        // click_time = ngày click
        // merchant = chiến dịch
        // pub_commission = hoa hồng
        const transactionId = conv.transaction_id || conv.conversion_id || conv.id || 'N/A';
        const orderId = conv.order_id || conv.transaction_id || 'N/A';
        const merchant = conv.merchant || 'N/A'; // Chiến dịch
        const billing = parseFloat(conv.billing || 0); // Giá trị đơn hàng
        const commission = parseFloat(conv.pub_commission || 0); // Hoa hồng
        const status = conv.status || 'N/A';
        const clickTime = conv.click_time || conv.transaction_time || new Date(); // Ngày click
        const subId = conv.utm_source || conv.sub_id || conv.aff_sub1 || 'N/A';

        return `
            <tr data-index="${index}">
                <td>${transactionId}</td>
                <td>${orderId}</td>
                <td>${merchant}</td>
                <td>${formatCurrency(billing)}</td>
                <td>${formatCurrency(commission)}</td>
                <td>${getStatusBadge(status)}</td>
                <td>${formatDate(clickTime)}</td>
                <td>${subId}</td>
                <td>
                    <button class="btn-detail" onclick="showOrderDetail(${index}); event.stopPropagation();">
                        👁️ Xem
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    conversionsTableBody.innerHTML = rows;
}

// Fetch Conversions
async function fetchConversions() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (!startDate || !endDate) {
        showStatus('❌ Please select start date and end date', false);
        return;
    }

    setButtonLoading(fetchConversionsBtn, true);

    try {
        const response = await fetch(
            `${API_BASE_URL}/conversions?start_date=${startDate}&end_date=${endDate}`
        );
        const data = await response.json();

        if (data.success) {
            // AccessTrade API might return data in different formats
            // Try to extract the conversions array from the response
            let conversions = data.data?.data || data.data?.conversions || data.data || [];

            // Handle if data is an object with results
            if (!Array.isArray(conversions) && typeof conversions === 'object') {
                conversions = conversions.data || conversions.results || [];
            }

            updateStats(conversions);
            renderConversions(conversions);
            showStatus(`✅ Successfully loaded ${conversions.length} conversions`, true);
        } else {
            showStatus(`❌ Failed to fetch conversions: ${data.message}`, false);
            updateStats([]);
            renderConversions([]);
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, false);
        updateStats([]);
        renderConversions([]);
    } finally {
        setButtonLoading(fetchConversionsBtn, false);
    }
}

// Modal functionality
const modal = document.getElementById('orderModal');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close');

// Calculate time difference in human readable format
function calculateTimeDiff(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';

    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;

    if (diffMs < 0) return 'N/A';

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        const remainingHours = diffHours % 24;
        return `${diffDays} ngày ${remainingHours} giờ`;
    } else if (diffHours > 0) {
        const remainingMinutes = diffMinutes % 60;
        return `${diffHours} giờ ${remainingMinutes} phút`;
    } else {
        return `${diffMinutes} phút`;
    }
}

// Show order detail in modal
function showOrderDetail(index) {
    const order = conversionsData[index];
    if (!order) return;

    // Calculate time from click to purchase
    const clickToPurchaseTime = calculateTimeDiff(order.click_time, order.sales_time);

    // Build detail HTML
    const detailHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Transaction ID</div>
                <div class="detail-value">${order.transaction_id || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Order ID</div>
                <div class="detail-value">${order.order_id || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Status</div>
                <div class="detail-value">${getStatusBadge(order.status || 'N/A')}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Đã duyệt đối soát</div>
                <div class="detail-value">${order.is_confirmed ? '✅ Đã duyệt' : '⏳ Chưa duyệt'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Merchant (Chiến dịch)</div>
                <div class="detail-value">${order.merchant || 'N/A'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Giá trị đơn hàng (Billing)</div>
                <div class="detail-value">${formatCurrency(parseFloat(order.billing || 0))}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Hoa hồng (Pub Commission)</div>
                <div class="detail-value">${formatCurrency(parseFloat(order.pub_commission || 0))}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Số lượng sản phẩm</div>
                <div class="detail-value">${order.products_count || 'N/A'}</div>
            </div>
        </div>

        <div class="detail-section">
            <h3>⏰ Thông tin Thời gian</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Thời gian Click</div>
                    <div class="detail-value">${formatDate(order.click_time)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Thời gian Mua hàng (Sales Time)</div>
                    <div class="detail-value">${formatDate(order.sales_time)}</div>
                </div>
                <div class="detail-item" style="background: linear-gradient(135deg, #e8f4ff 0%, #f0e8ff 100%); border-left-color: #667eea;">
                    <div class="detail-label">⏱️ Thời gian từ Click đến Mua</div>
                    <div class="detail-value" style="color: #667eea; font-weight: bold; font-size: 1.1rem;">${clickToPurchaseTime}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Thời gian chấp nhận HH (Conversion Time)</div>
                    <div class="detail-value">${formatDate(order.conversion_time)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Thời gian xác nhận (Confirmed Time)</div>
                    <div class="detail-value">${formatDate(order.confirmed_time)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Thời gian cập nhật (Update Time)</div>
                    <div class="detail-value">${formatDate(order.update_time)}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>📦 Trạng thái Đơn hàng</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">✅ Items Approved</div>
                    <div class="detail-value">${order.order_approved || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">⏳ Items Pending</div>
                    <div class="detail-value">${order.order_pending || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">❌ Items Rejected</div>
                    <div class="detail-value">${order.order_reject || 0}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>🖥️ Thông tin Thiết bị & Platform</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Nền tảng phát sinh (Browser)</div>
                    <div class="detail-value">${order.browser || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Thiết bị (Client Platform)</div>
                    <div class="detail-value">${order.client_platform || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Mua qua đâu (Conversion Platform)</div>
                    <div class="detail-value">${order.conversion_platform || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Loại khách hàng (Customer Type)</div>
                    <div class="detail-value">${order.customer_type || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>🏷️ Thông tin Sản phẩm</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Ngành hàng (Category)</div>
                    <div class="detail-value">${order.category_name || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Ngành hàng SP (Product Category)</div>
                    <div class="detail-value">${order.product_category || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>UTM Parameters</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">UTM Source</div>
                    <div class="detail-value">${order.utm_source || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Medium</div>
                    <div class="detail-value">${order.utm_medium || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Campaign</div>
                    <div class="detail-value">${order.utm_campaign || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">UTM Content</div>
                    <div class="detail-value">${order.utm_content || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>🔗 Links & URLs</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Link tracking (AT Product Link)</div>
                    <div class="detail-value" style="word-break: break-all; font-size: 0.85rem;">
                        ${order.at_product_link ? `<a href="${order.at_product_link}" target="_blank" style="color: #667eea;">${order.at_product_link}</a>` : 'N/A'}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Landing Page</div>
                    <div class="detail-value" style="word-break: break-all; font-size: 0.85rem;">
                        ${order.landing_page ? `<a href="${order.landing_page}" target="_blank" style="color: #667eea;">${order.landing_page}</a>` : 'N/A'}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Website nguồn</div>
                    <div class="detail-value">${order.website || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Website URL</div>
                    <div class="detail-value" style="word-break: break-all; font-size: 0.85rem;">
                        ${order.website_url ? `<a href="${order.website_url}" target="_blank" style="color: #667eea;">${order.website_url}</a>` : 'N/A'}
                    </div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Raw Data (JSON)</h3>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.85rem;">${JSON.stringify(order, null, 2)}</pre>
        </div>
    `;

    modalBody.innerHTML = detailHTML;
    modal.classList.add('show');
}

// Close modal
closeBtn.onclick = function() {
    modal.classList.remove('show');
}

// Close when clicking outside
window.onclick = function(event) {
    if (event.target == modal) {
        modal.classList.remove('show');
    }
}

// Close with ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && modal.classList.contains('show')) {
        modal.classList.remove('show');
    }
});

// Event Listeners
testConnectionBtn.addEventListener('click', testConnection);
fetchConversionsBtn.addEventListener('click', fetchConversions);

// Allow Enter key to trigger fetch
startDateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchConversions();
});

endDateInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchConversions();
});

// Initialize
initializeDates();
console.log('AccessTrade Dashboard initialized');
console.log('API Base URL:', API_BASE_URL);
