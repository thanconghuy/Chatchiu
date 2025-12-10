# Hướng Dẫn Tích Hợp UI Auto-Sync

## ✅ Đã Hoàn Thành

1. ✅ Migration script: `backend/migrations/028_create_reconciliation_waiting_list.sql`
2. ✅ API Endpoints: Đã thêm 5 routes vào `backend/routes/systemReconciliationAdmin.js`
3. ✅ Tab navigation: Đã thêm vào `frontend/admin/system-reconciliation.html` (dòng 447-458)

## 🔧 Bước Tiếp Theo: Hoàn Thiện UI

### Bước 1: Đóng div cho reconciliationsTab

Tìm dòng 574 trong `frontend/admin/system-reconciliation.html`:
```html
            </div>
        </main>
    </div>
```

**Thay bằng:**
```html
            </div>
            </div> <!-- End reconciliationsTab -->

            <!-- Auto-Sync Tab -->
            <div class="tab-content" id="autoSyncTab" style="display: none;">
                ... (xem phần HTML bên dưới)
            </div>

            <!-- Stats Tab -->
            <div class="tab-content" id="statsTab" style="display: none;">
                ... (xem phần HTML bên dưới)
            </div>

        </main>
    </div>
```

### Bước 2: Thêm CSS cho tabs

Thêm vào phần `<style>` (sau dòng 431):

```css
/* Tab Styles */
.tabs {
    display: flex;
    gap: 4px;
    border-bottom: 2px solid #e0e0e0;
    margin-bottom: 24px;
}

.tab-btn {
    padding: 12px 24px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    color: #6c757d;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    gap: 8px;
}

.tab-btn:hover {
    color: #667eea;
    background: #f8f9fa;
}

.tab-btn.active {
    color: #667eea;
    border-bottom-color: #667eea;
    background: #f8f9fa;
}

.tab-content {
    animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Auto-Sync specific styles */
.month-card {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    transition: all 0.2s;
}

.month-card:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
}

.month-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.month-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #2c3e50;
}

.month-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 16px;
}

.stat-item {
    text-align: center;
}

.stat-label {
    font-size: 0.875rem;
    color: #6c757d;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2c3e50;
}
```

### Bước 3: Thêm HTML cho Auto-Sync Tab

```html
<!-- Auto-Sync Tab -->
<div class="tab-content" id="autoSyncTab" style="display: none;">
    <!-- New Orders Preview -->
    <div class="recon-card" style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; color: #2c3e50;">
            <i class="fas fa-robot"></i> Đơn Mới Đủ Điều Kiện (Chưa trong waiting list)
        </h3>
        <div id="newOrdersPreview">
            <div class="loading">Đang tải...</div>
        </div>
    </div>

    <!-- Waiting List Summary -->
    <div class="recon-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #2c3e50;">
                <i class="fas fa-clock"></i> Danh Sách Chờ Đối Soát
            </h3>
            <div style="display: flex; gap: 12px;">
                <select id="monthFilter" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
                    <option value="">Tất cả tháng</option>
                </select>
                <button class="btn btn-secondary" id="refreshWaitingListBtn">
                    <i class="fas fa-sync-alt"></i> Làm mới
                </button>
            </div>
        </div>
        <div id="waitingListContent">
            <div class="loading">Đang tải...</div>
        </div>
    </div>
</div> <!-- End autoSyncTab -->

<!-- Stats Tab -->
<div class="tab-content" id="statsTab" style="display: none;">
    <div class="recon-card">
        <h3 style="margin: 0 0 20px 0; color: #2c3e50;">
            <i class="fas fa-chart-bar"></i> Thống Kê Tổng Quan
        </h3>
        <div id="statsContent">
            <p style="color: #6c757d;">Thống kê sẽ được hiển thị ở đây...</p>
        </div>
    </div>
</div> <!-- End statsTab -->
```

### Bước 4: Thêm JavaScript cho Auto-Sync

Thêm vào cuối file JavaScript (trước `</script>` cuối cùng):

```javascript
// ========================================
// TAB SWITCHING
// ========================================

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const tabMap = {
        'reconciliations': 'reconciliationsTab',
        'auto-sync': 'autoSyncTab',
        'stats': 'statsTab'
    };

    const tabId = tabMap[tabName];
    if (tabId) {
        document.getElementById(tabId).style.display = 'block';
    }

    // Add active class to clicked button
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Load data for the tab
    if (tabName === 'auto-sync') {
        loadAutoSyncData();
    } else if (tabName === 'stats') {
        loadStatsData();
    }
}

// Setup tab click listeners
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        switchTab(tabName);
    });
});

// ========================================
// AUTO-SYNC FUNCTIONS
// ========================================

async function loadAutoSyncData() {
    await loadNewOrdersPreview();
    await loadWaitingList();
}

async function loadNewOrdersPreview() {
    const container = document.getElementById('newOrdersPreview');

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/preview`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            displayNewOrdersPreview(result.data);
        } else {
            container.innerHTML = `<div class="error-message">${result.message}</div>`;
        }
    } catch (error) {
        console.error('Error loading new orders preview:', error);
        container.innerHTML = `<div class="error-message">Lỗi khi tải dữ liệu</div>`;
    }
}

function displayNewOrdersPreview(data) {
    const container = document.getElementById('newOrdersPreview');

    if (data.newOrders === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <h3>Không có đơn mới</h3>
                <p>Tất cả đơn đủ điều kiện đã được thêm vào danh sách chờ</p>
            </div>
        `;
        return;
    }

    const html = `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                <div>
                    <div style="font-size: 0.875rem; color: #64748b;">Tổng đơn mới</div>
                    <div style="font-size: 2rem; font-weight: 700; color: #3b82f6;">${data.newOrders}</div>
                </div>
                <div>
                    <div style="font-size: 0.875rem; color: #64748b;">Tổng cashback</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">${formatMoney(data.totalCashback)}</div>
                </div>
                <div>
                    <div style="font-size: 0.875rem; color: #64748b;">Số tháng</div>
                    <div style="font-size: 2rem; font-weight: 700; color: #f59e0b;">${data.byMonth.length}</div>
                </div>
            </div>
            <button class="btn btn-primary" onclick="addToWaitingList()" style="width: 100%; padding: 12px; font-size: 1.1rem;">
                <i class="fas fa-plus-circle"></i> Thêm ${data.newOrders} Đơn Vào Danh Sách Chờ
            </button>
        </div>

        <details style="margin-top: 16px;">
            <summary style="cursor: pointer; font-weight: 600; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                Xem chi tiết theo tháng (${data.byMonth.length} tháng)
            </summary>
            <div style="margin-top: 16px;">
                ${data.byMonth.map(month => `
                    <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${month.label}</strong>
                                <span style="color: #6c757d; margin-left: 12px;">${month.count} đơn</span>
                            </div>
                            <div style="font-weight: 700; color: #10b981;">${formatMoney(month.cashback)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </details>
    `;

    container.innerHTML = html;
}

async function addToWaitingList() {
    if (!confirm('Bạn có chắc muốn thêm tất cả đơn đủ điều kiện vào danh sách chờ?')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/add-to-waiting`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            showToast(`✅ ${result.message}`, 'success');
            await loadAutoSyncData(); // Reload
        } else {
            showToast(`❌ ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error adding to waiting list:', error);
        showToast('❌ Lỗi khi thêm vào danh sách chờ', 'error');
    }
}

async function loadWaitingList() {
    const container = document.getElementById('waitingListContent');

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/waiting-list`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.success) {
            displayWaitingList(result.data);
        } else {
            container.innerHTML = `<div class="error-message">${result.message}</div>`;
        }
    } catch (error) {
        console.error('Error loading waiting list:', error);
        container.innerHTML = `<div class="error-message">Lỗi khi tải danh sách chờ</div>`;
    }
}

function displayWaitingList(data) {
    const container = document.getElementById('waitingListContent');

    if (data.summary.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>Danh sách chờ trống</h3>
                <p>Chưa có đơn hàng nào trong danh sách chờ đối soát</p>
            </div>
        `;
        return;
    }

    const html = data.summary.map(month => `
        <div class="month-card">
            <div class="month-card-header">
                <div>
                    <div class="month-title">📅 ${month.month_label}</div>
                    <div style="color: #6c757d; font-size: 0.875rem; margin-top: 4px;">
                        Đủ điều kiện từ: ${formatDate(month.eligible_since)}
                    </div>
                </div>
                <button class="btn btn-primary" onclick="createReconciliationFromWaiting('${month.approval_month}', '${month.month_label}')">
                    <i class="fas fa-check-circle"></i> Tạo Kỳ Đối Soát
                </button>
            </div>

            <div class="month-stats">
                <div class="stat-item">
                    <div class="stat-label">Số đơn</div>
                    <div class="stat-value">${month.order_count}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Tổng cashback</div>
                    <div class="stat-value" style="color: #10b981;">${formatMoney(month.total_cashback)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Số user</div>
                    <div class="stat-value" style="color: #f59e0b;">${month.user_count}</div>
                </div>
            </div>

            <button class="btn btn-secondary" onclick="viewWaitingListDetails('${month.approval_month}')" style="width: 100%;">
                <i class="fas fa-eye"></i> Xem Chi Tiết
            </button>
        </div>
    `).join('');

    container.innerHTML = html;
}

async function createReconciliationFromWaiting(month, periodLabel) {
    if (!confirm(`Tạo kỳ đối soát "${periodLabel}" từ danh sách chờ?`)) {
        return;
    }

    try {
        // Get all orders for this month
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/waiting-list?month=${month}&limit=1000`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        const orderIds = result.data.orders.map(o => o.conversion_id);

        // Create reconciliation
        const createResponse = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/auto-sync/create-from-waiting`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                month,
                periodLabel,
                selectedOrderIds: orderIds
            })
        });

        const createResult = await createResponse.json();

        if (createResult.success) {
            showToast(`✅ ${createResult.message}`, 'success');
            switchTab('reconciliations'); // Switch back to reconciliations tab
            loadReconciliations(); // Reload reconciliations
        } else {
            showToast(`❌ ${createResult.message}`, 'error');
        }
    } catch (error) {
        console.error('Error creating reconciliation:', error);
        showToast('❌ Lỗi khi tạo kỳ đối soát', 'error');
    }
}

function viewWaitingListDetails(month) {
    // TODO: Show modal with detailed orders list
    showToast('Chức năng xem chi tiết đang được phát triển', 'info');
}

// Refresh waiting list button
document.getElementById('refreshWaitingListBtn')?.addEventListener('click', () => {
    loadWaitingList();
});

// ========================================
// STATS TAB
// ========================================

function loadStatsData() {
    const container = document.getElementById('statsContent');
    container.innerHTML = `<p style="color: #6c757d;">Thống kê tổng quan sẽ hiển thị ở đây (đang phát triển)</p>`;
}
```

### Bước 5: Thêm CSP Fix Script

Tìm tag `</body>` cuối file và thêm TRƯỚC nó:

```html
<!-- CSP Fix: Remove inline event handlers -->
<script src="/admin/js/csp-fix.js"></script>
</body>
```

### Bước 6: Apply Migration

Chạy migration script:

```bash
# Option 1: Nếu có migration runner
node backend/apply-migrations.js

# Option 2: Chạy trực tiếp SQL
psql -U postgres -d chatchiu_db -f backend/migrations/028_create_reconciliation_waiting_list.sql
```

### Bước 7: Restart Server

```bash
pm2 restart chatchiu-backend
# hoặc
npm run dev
```

## 📊 Test Checklist

- [ ] Tab navigation hoạt động
- [ ] Tab "Auto-Sync" hiển thị đơn mới
- [ ] Button "Thêm vào danh sách chờ" hoạt động
- [ ] Danh sách chờ hiển thị theo tháng
- [ ] Button "Tạo kỳ đối soát" từ waiting list hoạt động
- [ ] CSP không có lỗi trong console

## 🎯 Kết Quả Mong Đợi

Khi hoàn thành, bạn sẽ có:

1. **Tab "Auto-Sync"** với 2 phần:
   - **Đơn mới đủ điều kiện**: Hiển thị đơn approval_time + 15 ngày
   - **Danh sách chờ**: Nhóm theo tháng, sẵn sàng tạo kỳ

2. **Workflow**:
   ```
   Đơn đủ điều kiện → Click "Thêm vào waiting list" →
   Review theo tháng → Click "Tạo kỳ đối soát" → Done!
   ```

3. **Tự động hóa tương lai**: Có thể thêm cron job để auto-add vào waiting list hàng ngày

## 💡 Tips

- File dài nên search `<!-- Pagination -->` ở dòng ~574 để tìm vị trí insert
- Nếu lỗi syntax, kiểm tra đóng/mở tag `<div>` đúng
- Console sẽ báo lỗi nếu có vấn đề với JavaScript
