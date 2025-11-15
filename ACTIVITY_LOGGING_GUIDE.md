# Activity Logging System - Implementation Guide

## ✅ Đã Hoàn Thành

### 1. Database Schema
- ✅ Bảng `user_activity_logs` đã tạo
- ✅ Indexes tối ưu cho performance
- ✅ Hỗ trợ lưu product URL
- ✅ Function `cleanup_old_activity_logs()` cho auto-delete

**File:** `backend/migrations/008_create_user_activity_logs.sql`

### 2. ActivityLogger Service
- ✅ Async logging (non-blocking)
- ✅ Device/Browser detection (UA parser)
- ✅ Performance metrics tracking
- ✅ Product URL tracking
- ✅ Methods để query, stats, cleanup

**File:** `backend/services/activityLogger.js`

---

## 📋 Cần Implement Tiếp

### 3. Integration vào Routes

**File cần sửa:** `backend/routes/dashboard.js`

**Thêm vào đầu file:**
```javascript
const { ActivityLogger, ACTIVITY_TYPES } = require('../services/activityLogger');
```

**Sửa endpoint `/generate-link` (line ~177-177):**

```javascript
router.post('/generate-link', authenticate, async (req, res) => {
  const startTime = Date.now(); // ⭐ ADD: Track response time
  const { merchantId, clickType, productUrl } = req.body;

  // ... existing validation code ...

  try {
    // ⭐ ADD: Log attempt
    await ActivityLogger.log({
      userId: req.userId,
      activityType: ACTIVITY_TYPES.LINK_GENERATE_ATTEMPT,
      merchantId,
      eventData: { clickType, hasProductUrl: !!productUrl },
      req,
      status: 'pending'
    });

    // ... existing link generation logic ...

    const responseTime = Date.now() - startTime; // ⭐ Calculate time

    // ⭐ ADD: Log success
    await ActivityLogger.log({
      userId: req.userId,
      activityType: ACTIVITY_TYPES.LINK_GENERATE_SUCCESS,
      merchantId,
      productUrl: clickType === 'link' ? productUrl : null, // ⭐ Track product URL
      eventData: {
        clickType,
        source: linkData.source, // 'api' or 'diy'
        clickId: click.click_id
      },
      req,
      status: 'success',
      responseTime
    });

    res.json({ success: true, data: linkData });

  } catch (error) {
    const responseTime = Date.now() - startTime;

    // ⭐ ADD: Log failure
    await ActivityLogger.log({
      userId: req.userId,
      activityType: ACTIVITY_TYPES.LINK_GENERATE_FAILED,
      merchantId,
      productUrl: clickType === 'link' ? productUrl : null,
      eventData: { clickType, errorType: error.name },
      req,
      status: 'failed',
      errorMessage: error.message,
      responseTime
    });

    res.status(500).json({ success: false, message: error.message });
  }
});
```

### 4. Admin Endpoints (New Routes)

**File tạo mới:** `backend/routes/activityLogs.js`

```javascript
const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');
const { ActivityLogger } = require('../services/activityLogger');

/**
 * GET /api/admin/activity-logs
 * Get activity logs with filters
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      userId,
      activityType,
      dateFrom,
      dateTo,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM user_activity_logs WHERE 1=1';
    const params = [];

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (activityType) {
      params.push(activityType);
      query += ` AND activity_type = $${params.length}`;
    }

    if (dateFrom) {
      params.push(dateFrom);
      query += ` AND created_at >= $${params.length}`;
    }

    if (dateTo) {
      params.push(dateTo);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      logs: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/activity-logs/stats
 * Get activity statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const { userId, dateFrom, dateTo } = req.query;

    const stats = await ActivityLogger.getStats(
      userId || null,
      new Date(dateFrom),
      new Date(dateTo)
    );

    const deviceStats = await ActivityLogger.getDeviceStats(
      new Date(dateFrom),
      new Date(dateTo)
    );

    const topProducts = await ActivityLogger.getTopProducts(
      10,
      new Date(dateFrom),
      new Date(dateTo)
    );

    res.json({
      success: true,
      data: {
        activityStats: stats,
        deviceStats,
        topProducts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/admin/activity-logs
 * Delete logs by date range
 */
router.delete('/', authenticateAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'dateFrom and dateTo are required'
      });
    }

    const deletedCount = await ActivityLogger.deleteLogs(
      new Date(dateFrom),
      new Date(dateTo)
    );

    res.json({
      success: true,
      message: `Deleted ${deletedCount} log entries`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/admin/activity-logs/cleanup
 * Manually trigger 90-day cleanup
 */
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const deletedCount = await ActivityLogger.cleanupOldLogs();

    res.json({
      success: true,
      message: `Cleanup completed. Deleted ${deletedCount} old logs`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
```

**Thêm vào `backend/server-cashback.js`:**
```javascript
const activityLogsRoutes = require('./routes/activityLogs');
app.use('/api/admin/activity-logs', activityLogsRoutes);
```

### 5. Cron Job cho Auto-Cleanup

**File:** `backend/cron/cleanupActivityLogs.js` (tạo mới)

```javascript
const { ActivityLogger } = require('../services/activityLogger');
const logger = require('../utils/logger');

/**
 * Cleanup activity logs older than 90 days
 * Run daily at 2 AM
 */
async function cleanupOldActivityLogs() {
  try {
    logger.info('Starting activity logs cleanup (90+ days)...');

    const deletedCount = await ActivityLogger.cleanupOldLogs();

    logger.info(`Activity logs cleanup completed. Deleted ${deletedCount} rows`);

    return {
      success: true,
      deletedCount
    };
  } catch (error) {
    logger.error('Activity logs cleanup failed:', error.message);
    throw error;
  }
}

module.exports = cleanupOldActivityLogs;
```

**Thêm vào `backend/cron/index.js`:**
```javascript
const cleanupActivityLogs = require('./cleanupActivityLogs');

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('[CRON] Running activity logs cleanup...');
  try {
    await cleanupActivityLogs();
  } catch (error) {
    logger.error('[CRON] Activity logs cleanup failed:', error.message);
  }
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});
```

### 6. Admin UI - Activity Logs Page

**File:** `frontend/admin/activity-logs.html` (tạo mới)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Activity Logs - Admin</title>
    <link rel="stylesheet" href="admin.css">
</head>
<body>
    <div class="admin-container">
        <aside class="sidebar">
            <!-- Same sidebar as other admin pages -->
            <nav class="sidebar-nav">
                <a href="/admin/dashboard">Dashboard</a>
                <a href="/admin/monitoring">Monitoring</a>
                <a href="/admin/settings">Settings</a>
                <a href="/admin/activity-logs" class="active">Activity Logs</a>
            </nav>
        </aside>

        <main class="main-content">
            <div class="content-header">
                <h1>User Activity Logs</h1>
                <div class="header-actions">
                    <button class="btn btn-danger" id="cleanupBtn">
                        🗑️ Cleanup Old Logs (90+ days)
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div class="filter-bar">
                <input type="date" id="dateFrom" class="filter-input">
                <input type="date" id="dateTo" class="filter-input">
                <select id="activityTypeFilter" class="filter-select">
                    <option value="">All Activities</option>
                    <option value="link_generate_success">Link Generated</option>
                    <option value="link_generate_failed">Failed Generations</option>
                    <option value="login">Logins</option>
                </select>
                <button class="btn btn-primary" id="filterBtn">Apply Filters</button>
                <button class="btn btn-secondary" id="clearLogsBtn">Clear Selected Range</button>
            </div>

            <!-- Stats Cards -->
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Total Activities (Today)</h3>
                    <p class="stat-value" id="totalActivities">0</p>
                </div>
                <div class="stat-card">
                    <h3>Success Rate</h3>
                    <p class="stat-value" id="successRate">0%</p>
                </div>
                <div class="stat-card">
                    <h3>Avg Response Time</h3>
                    <p class="stat-value" id="avgResponseTime">0ms</p>
                </div>
                <div class="stat-card">
                    <h3>Active Users</h3>
                    <p class="stat-value" id="activeUsers">0</p>
                </div>
            </div>

            <!-- Activity Logs Table -->
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Activity</th>
                            <th>Merchant</th>
                            <th>Product URL</th>
                            <th>Device</th>
                            <th>Status</th>
                            <th>Response Time</th>
                        </tr>
                    </thead>
                    <tbody id="logsTable">
                        <tr><td colspan="8">Loading...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div class="pagination">
                <button class="btn-secondary" id="prevBtn">« Prev</button>
                <span id="pageInfo">Page 1</span>
                <button class="btn-secondary" id="nextBtn">Next »</button>
            </div>

            <!-- Top Products Section -->
            <div class="section">
                <h2>🔥 Top Products (by clicks)</h2>
                <div id="topProductsList"></div>
            </div>
        </main>
    </div>

    <script src="../js/config.js"></script>
    <script src="shared/auth.js"></script>
    <script src="shared/utils.js"></script>
    <script src="activity-logs.js"></script>
</body>
</html>
```

**File:** `frontend/admin/activity-logs.js` (tạo mới)

```javascript
// Initialize
let currentPage = 1;
let filters = {
    dateFrom: null,
    dateTo: null,
    activityType: ''
};

async function init() {
    requireAuth();
    await checkAdminAccess();

    // Set default date range (last 7 days)
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    document.getElementById('dateFrom').value = formatDateForPicker(lastWeek);
    document.getElementById('dateTo').value = formatDateForPicker(today);

    await loadActivityLogs();
    await loadStats();
    setupEventListeners();
}

async function loadActivityLogs() {
    try {
        const params = new URLSearchParams({
            limit: 50,
            offset: (currentPage - 1) * 50,
            ...filters
        });

        const response = await apiRequest(`/admin/activity-logs?${params}`);

        if (response.success) {
            renderLogs(response.logs);
        }
    } catch (error) {
        showToast('Failed to load activity logs', 'error');
    }
}

function renderLogs(logs) {
    const tbody = document.getElementById('logsTable');

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No logs found</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${formatDate(log.created_at, true)}</td>
            <td>${log.user_id.substring(0, 8)}...</td>
            <td><span class="activity-badge">${log.activity_type}</span></td>
            <td>${log.merchant_id || '-'}</td>
            <td>${log.product_url ? `<a href="${log.product_url}" target="_blank">View</a>` : '-'}</td>
            <td>${log.device_type} / ${log.browser}</td>
            <td><span class="status-badge status-${log.status}">${log.status}</span></td>
            <td>${log.response_time_ms ? log.response_time_ms + 'ms' : '-'}</td>
        </tr>
    `).join('');
}

async function handleCleanup() {
    if (!confirm('This will delete all logs older than 90 days. Continue?')) {
        return;
    }

    try {
        const response = await apiRequest('/admin/activity-logs/cleanup', {
            method: 'POST'
        });

        if (response.success) {
            showToast(`Cleanup completed. Deleted ${response.deletedCount} logs`, 'success');
            await loadActivityLogs();
        }
    } catch (error) {
        showToast('Cleanup failed', 'error');
    }
}

// Event Listeners
document.getElementById('cleanupBtn').addEventListener('click', handleCleanup);

init();
```

---

## 🎯 Kế Hoạch Triển Khai

1. ✅ **Database** - Done
2. ✅ **Service Layer** - Done
3. ⏳ **Routes Integration** - Cần implement
4. ⏳ **Admin API** - Cần implement
5. ⏳ **Cron Job** - Cần implement
6. ⏳ **Admin UI** - Cần implement

---

## 💡 Tính Năng Chính

### Đã Có:
- ✅ Async logging không làm chậm requests
- ✅ Track product URL cho từng click
- ✅ Device/Browser detection
- ✅ Performance metrics (response time)
- ✅ Auto-cleanup function (SQL)

### Sẽ Có:
- Admin xem logs với filters
- Admin xóa logs theo date range
- Admin trigger manual cleanup
- Cron auto cleanup mỗi ngày
- Top products analytics
- Device distribution stats
- Success rate metrics

---

## 📊 Use Cases

1. **Debug**: Xem user nào gặp lỗi khi tạo link
2. **Analytics**: Sản phẩm nào được click nhiều nhất
3. **Performance**: API response time có bị chậm không?
4. **Security**: Phát hiện spam/abuse patterns
5. **UX**: User chủ yếu dùng mobile hay desktop?

---

## Bạn muốn tôi implement phần nào tiếp theo?

1. **Routes Integration** - Add logging vào dashboard.js
2. **Admin API** - Tạo endpoints để admin manage logs
3. **Cron Job** - Auto cleanup 90 days
4. **Admin UI** - Activity logs page với charts

Chọn 1 trong 4, hoặc tôi làm tất cả luôn?
