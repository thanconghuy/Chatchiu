# 🚀 Roadmap Tự Động Hóa Module Đối Soát Hệ Thống

## 📊 Tình Trạng Hiện Tại

### Mức Độ Tự Động: **~40%**

| Quy trình | Tự động | Thủ công | Lý do |
|-----------|---------|----------|-------|
| Thu thập đơn hàng hàng ngày | ✅ 100% | - | DailyCollectionJob |
| Phát hiện đơn đủ điều kiện | ✅ 100% | - | Database function |
| Thêm vào danh sách chờ | ❌ 0% | 👤 100% | Admin click button |
| Tạo kỳ đối soát | ❌ 0% | 👤 100% | Admin review & create |
| Duyệt kỳ đối soát | ❌ 0% | 👤 100% | Admin review draft |
| Hoàn tất & chi trả | ❌ 0% | 👤 100% | Critical - must stay manual |
| Đồng bộ API | ✅ 100% | - | APISyncJob every 6h |

### Điểm Yếu Hiện Tại:
1. ❌ Admin phải thủ công thêm đơn vào waiting list
2. ❌ Admin phải thủ công tạo kỳ đối soát mỗi tháng
3. ❌ MonthlyReconciliationJob tồn tại nhưng không hoạt động
4. ⚠️ Không có thông báo tự động khi có đơn đủ điều kiện
5. ⚠️ Không có dashboard monitoring cho automation

---

## 🎯 Mục Tiêu Tự Động Hóa

### Target: **85%** automation

**Giữ nguyên thủ công** (15%):
- ✋ Review & Finalize reconciliation (financial safety)
- ✋ Handle edge cases (corrections, disputes)
- ✋ Emergency interventions

**Tự động hóa** (85%):
- ✅ Auto-populate waiting list
- ✅ Auto-create monthly reconciliation drafts
- ✅ Auto-notify admin when action needed
- ✅ Auto-health monitoring & alerts
- ✅ Auto-retry on transient failures

---

## 📅 GIAI ĐOẠN 1: Quick Wins (1-2 tuần)
**Mục tiêu:** Tăng automation lên **60%** với minimal risk

### 1.1. Auto-Populate Waiting List ⭐ HIGH PRIORITY
**Impact:** HIGH | **Risk:** LOW | **Effort:** SMALL

**Hiện tại:**
```javascript
// Admin manually clicks button
POST /api/admin/system-reconciliation/auto-sync/add-to-waiting
```

**Cải tiến:**
```javascript
// File: backend/jobs/systemReconciliation/WaitingListAutoPopulateJob.js

const schedule = require('node-schedule');
const { pool } = require('../../config/database');
const logger = require('../../utils/logger');

class WaitingListAutoPopulateJob {
  static cronPattern = '0 1 * * *'; // 01:00 AM daily
  static timezone = 'Asia/Ho_Chi_Minh';

  static async run() {
    try {
      logger.info('[WaitingList Auto-Populate] Starting job...');

      // Call database function to add eligible conversions
      const result = await pool.query(
        "SELECT * FROM add_eligible_conversions_to_waiting_list($1)",
        ['cron-auto']
      );

      const { added_count, total_cashback } = result.rows[0];

      logger.info('[WaitingList Auto-Populate] Completed', {
        added_count: parseInt(added_count),
        total_cashback: parseFloat(total_cashback)
      });

      // Send notification if orders added
      if (added_count > 0) {
        await this.notifyAdmin({
          added_count,
          total_cashback,
          waiting_list_url: `${process.env.FRONTEND_URL}/admin/system-reconciliation?tab=auto-sync`
        });
      }

      return {
        success: true,
        added_count: parseInt(added_count),
        total_cashback: parseFloat(total_cashback)
      };

    } catch (error) {
      logger.error('[WaitingList Auto-Populate] Job failed', {
        error: error.message,
        stack: error.stack
      });

      // Send error notification
      await this.notifyAdminError(error);

      throw error;
    }
  }

  static async notifyAdmin({ added_count, total_cashback, waiting_list_url }) {
    const { sendEmail } = require('../../services/emailService');
    const adminEmails = await this.getAdminEmails();

    const subject = `🔔 ${added_count} đơn hàng mới vào danh sách chờ đối soát`;
    const html = `
      <h2>Danh sách chờ đối soát đã được cập nhật tự động</h2>
      <p>Hệ thống đã tự động thêm <strong>${added_count} đơn hàng</strong> vào danh sách chờ đối soát.</p>

      <h3>Chi tiết:</h3>
      <ul>
        <li>Số đơn hàng: ${added_count}</li>
        <li>Tổng cashback: ${total_cashback.toLocaleString('vi-VN')} VNĐ</li>
        <li>Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</li>
      </ul>

      <p><a href="${waiting_list_url}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Xem Danh Sách Chờ
      </a></p>

      <p><small>Email này được gửi tự động từ hệ thống đối soát.</small></p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }

  static async notifyAdminError(error) {
    // Send error notification to admin
    const { sendEmail } = require('../../services/emailService');
    const adminEmails = await this.getAdminEmails();

    const subject = '❌ Lỗi tự động thêm vào danh sách chờ';
    const html = `
      <h2>Cảnh báo: Job tự động thất bại</h2>
      <p>Job auto-populate waiting list đã gặp lỗi.</p>
      <pre>${error.message}</pre>
      <p>Vui lòng kiểm tra logs và xử lý thủ công nếu cần.</p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }

  static async getAdminEmails() {
    const result = await pool.query(`
      SELECT email FROM users WHERE is_admin = true
    `);
    return result.rows.map(r => r.email);
  }

  static start() {
    schedule.scheduleJob({
      rule: this.cronPattern,
      tz: this.timezone
    }, async () => {
      await this.run();
    });

    logger.info(`[WaitingList Auto-Populate] Job scheduled: ${this.cronPattern} (${this.timezone})`);
  }
}

module.exports = WaitingListAutoPopulateJob;
```

**Thêm vào JobScheduler:**
```javascript
// File: backend/jobs/systemReconciliation/JobScheduler.js

const WaitingListAutoPopulateJob = require('./WaitingListAutoPopulateJob');

function startAllJobs() {
  DailyCollectionJob.start();
  APISyncJob.start();
  WaitingListAutoPopulateJob.start(); // ← NEW

  logger.info('[System Reconciliation] All jobs started');
}
```

**Lợi ích:**
- ✅ Tự động thêm đơn vào waiting list mỗi ngày
- ✅ Admin nhận email thông báo khi có đơn mới
- ✅ Giảm thiểu công việc thủ công hàng ngày
- ✅ Risk thấp - admin vẫn review trước khi tạo reconciliation

---

### 1.2. Notification System ⭐ HIGH PRIORITY
**Impact:** MEDIUM | **Risk:** LOW | **Effort:** SMALL

**Tạo service thông báo thống nhất:**

```javascript
// File: backend/services/systemReconciliation/NotificationService.js

const { pool } = require('../../config/database');
const { sendEmail } = require('../emailService');
const logger = require('../../utils/logger');

class NotificationService {
  /**
   * Send notification when waiting list has orders ready for reconciliation
   */
  static async notifyWaitingListReady(summary) {
    const adminEmails = await this.getAdminEmails();

    const subject = `📋 Danh sách chờ đối soát: ${summary.month_count} tháng cần xử lý`;
    const html = `
      <h2>Danh sách chờ đối soát sẵn sàng</h2>
      <p>Có ${summary.total_count} đơn hàng trong danh sách chờ, nhóm thành ${summary.month_count} kỳ đối soát.</p>

      <h3>Thống kê:</h3>
      <ul>
        <li>Tổng đơn hàng: ${summary.total_count}</li>
        <li>Tổng cashback: ${summary.total_cashback.toLocaleString('vi-VN')} VNĐ</li>
        <li>Số tháng: ${summary.month_count}</li>
      </ul>

      ${summary.by_month.map(m => `
        <div style="border-left: 3px solid #2196F3; padding-left: 12px; margin: 12px 0;">
          <strong>${m.period_label}</strong><br>
          ${m.order_count} đơn hàng - ${m.total_cashback.toLocaleString('vi-VN')} VNĐ
        </div>
      `).join('')}

      <p><a href="${process.env.FRONTEND_URL}/admin/system-reconciliation?tab=auto-sync"
         style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Tạo Kỳ Đối Soát
      </a></p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }

    logger.info('[Notification] Sent waiting list ready notification', {
      recipients: adminEmails.length,
      total_count: summary.total_count
    });
  }

  /**
   * Send notification when reconciliation is created and needs review
   */
  static async notifyReconciliationDraftCreated(reconciliation) {
    const adminEmails = await this.getAdminEmails();

    const subject = `📝 Kỳ đối soát mới cần duyệt: ${reconciliation.period_label}`;
    const html = `
      <h2>Kỳ đối soát nháp đã được tạo</h2>
      <p>Kỳ đối soát <strong>"${reconciliation.period_label}"</strong> đã được tạo tự động và cần duyệt.</p>

      <h3>Thông tin:</h3>
      <ul>
        <li>Số đơn hàng: ${reconciliation.total_orders}</li>
        <li>Tổng cashback: ${reconciliation.total_cashback.toLocaleString('vi-VN')} VNĐ</li>
        <li>Trạng thái: Nháp</li>
        <li>Ngày tạo: ${new Date(reconciliation.created_at).toLocaleString('vi-VN')}</li>
      </ul>

      <p><a href="${process.env.FRONTEND_URL}/admin/system-reconciliation?id=${reconciliation.id}"
         style="background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Xem & Duyệt Kỳ Đối Soát
      </a></p>

      <p><small>⚠️ Vui lòng kiểm tra kỹ trước khi hoàn tất để chi trả tiền cho người dùng.</small></p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }

  /**
   * Send weekly summary report
   */
  static async sendWeeklySummary() {
    const summary = await this.getWeeklySummary();
    const adminEmails = await this.getAdminEmails();

    const subject = `📊 Báo cáo đối soát tuần (${summary.week_start} - ${summary.week_end})`;
    const html = `
      <h2>Báo cáo đối soát hệ thống tuần này</h2>

      <h3>Kỳ đối soát:</h3>
      <ul>
        <li>Đã hoàn tất: ${summary.finalized_count}</li>
        <li>Đang nháp: ${summary.draft_count}</li>
        <li>Tổng tiền chi trả: ${summary.total_paid.toLocaleString('vi-VN')} VNĐ</li>
      </ul>

      <h3>Danh sách chờ:</h3>
      <ul>
        <li>Đơn hàng chờ xử lý: ${summary.waiting_count}</li>
        <li>Giá trị chờ xử lý: ${summary.waiting_cashback.toLocaleString('vi-VN')} VNĐ</li>
      </ul>

      <h3>Cảnh báo:</h3>
      ${summary.alerts.length > 0 ? `
        <ul style="color: #F44336;">
          ${summary.alerts.map(a => `<li>${a}</li>`).join('')}
        </ul>
      ` : '<p style="color: #4CAF50;">✅ Không có cảnh báo</p>'}
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }

  static async getAdminEmails() {
    const result = await pool.query(`
      SELECT email FROM users WHERE is_admin = true
    `);
    return result.rows.map(r => r.email);
  }

  static async getWeeklySummary() {
    // Implementation for weekly summary stats
    // ...
    return {
      week_start: '',
      week_end: '',
      finalized_count: 0,
      draft_count: 0,
      total_paid: 0,
      waiting_count: 0,
      waiting_cashback: 0,
      alerts: []
    };
  }
}

module.exports = NotificationService;
```

**Lợi ích:**
- ✅ Admin luôn được thông báo khi cần hành động
- ✅ Báo cáo tuần tự động
- ✅ Cảnh báo sớm các vấn đề
- ✅ Giảm thiểu rủi ro bỏ sót

---

### 1.3. Health Monitoring Dashboard
**Impact:** MEDIUM | **Risk:** LOW | **Effort:** MEDIUM

**API endpoint mới:**

```javascript
// File: backend/routes/systemReconciliationAdmin.js

/**
 * GET /api/admin/system-reconciliation/automation/health
 * Get health status of automation jobs
 */
router.get('/automation/health', async (req, res) => {
  try {
    const health = {
      jobs: [],
      waiting_list: {},
      recent_reconciliations: [],
      alerts: []
    };

    // Check job status
    const jobStatus = await pool.query(`
      SELECT
        job_name,
        last_run_at,
        last_run_status,
        last_run_message,
        enabled
      FROM automation_jobs
      ORDER BY last_run_at DESC
    `);

    health.jobs = jobStatus.rows.map(job => ({
      name: job.job_name,
      last_run: job.last_run_at,
      status: job.last_run_status,
      message: job.last_run_message,
      enabled: job.enabled,
      health_status: getJobHealthStatus(job)
    }));

    // Check waiting list
    const waitingListStats = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        SUM(cashback_amount) as total_cashback,
        COUNT(DISTINCT approval_month) as month_count
      FROM reconciliation_waiting_list
      WHERE status = 'waiting'
    `);

    health.waiting_list = waitingListStats.rows[0];

    // Check for alerts
    const now = new Date();

    // Alert if waiting list too old
    const oldestOrder = await pool.query(`
      SELECT MIN(approval_time) as oldest
      FROM reconciliation_waiting_list
      WHERE status = 'waiting'
    `);

    if (oldestOrder.rows[0].oldest) {
      const daysOld = (now - new Date(oldestOrder.rows[0].oldest)) / (1000 * 60 * 60 * 24);
      if (daysOld > 30) {
        health.alerts.push({
          level: 'warning',
          message: `Danh sách chờ có đơn cũ hơn ${Math.floor(daysOld)} ngày`,
          action: 'Cân nhắc tạo kỳ đối soát'
        });
      }
    }

    // Alert if draft reconciliation not finalized
    const oldDrafts = await pool.query(`
      SELECT id, period_label, created_at
      FROM system_reconciliations
      WHERE status = 'draft'
        AND created_at < NOW() - INTERVAL '7 days'
    `);

    if (oldDrafts.rows.length > 0) {
      health.alerts.push({
        level: 'warning',
        message: `${oldDrafts.rows.length} kỳ đối soát nháp chưa hoàn tất hơn 7 ngày`,
        action: 'Kiểm tra và hoàn tất các kỳ đối soát',
        drafts: oldDrafts.rows
      });
    }

    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    console.error('Error getting automation health:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

function getJobHealthStatus(job) {
  if (!job.enabled) return 'disabled';
  if (!job.last_run_at) return 'never_run';

  const hoursSinceRun = (Date.now() - new Date(job.last_run_at)) / (1000 * 60 * 60);

  if (job.last_run_status === 'error') return 'error';
  if (hoursSinceRun > 48) return 'stale'; // Hasn't run in 2 days
  if (job.last_run_status === 'success') return 'healthy';

  return 'unknown';
}
```

**Frontend widget:**

```javascript
// File: frontend/admin/system-reconciliation.html
// Add to dashboard

<div class="automation-health-widget">
  <h3>🤖 Trạng Thái Tự Động Hóa</h3>
  <div id="automationHealthStatus">
    Loading...
  </div>
</div>

<script>
async function loadAutomationHealth() {
  const response = await fetch(`${CONFIG.API_BASE_URL}/admin/system-reconciliation/automation/health`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const result = await response.json();
  const health = result.data;

  let html = '<div class="jobs-status">';

  // Jobs
  health.jobs.forEach(job => {
    const statusIcon = {
      'healthy': '✅',
      'error': '❌',
      'stale': '⚠️',
      'disabled': '⏸️',
      'never_run': '⏳'
    }[job.health_status];

    html += `
      <div class="job-status ${job.health_status}">
        ${statusIcon} <strong>${job.name}</strong><br>
        <small>Last run: ${new Date(job.last_run).toLocaleString('vi-VN')}</small>
      </div>
    `;
  });

  html += '</div>';

  // Alerts
  if (health.alerts.length > 0) {
    html += '<div class="alerts">';
    health.alerts.forEach(alert => {
      html += `
        <div class="alert ${alert.level}">
          ${alert.level === 'warning' ? '⚠️' : '❌'} ${alert.message}<br>
          <small>${alert.action}</small>
        </div>
      `;
    });
    html += '</div>';
  }

  document.getElementById('automationHealthStatus').innerHTML = html;
}

// Refresh every 5 minutes
setInterval(loadAutomationHealth, 5 * 60 * 1000);
loadAutomationHealth();
</script>
```

**Lợi ích:**
- ✅ Theo dõi real-time trạng thái automation
- ✅ Phát hiện sớm các job bị lỗi
- ✅ Cảnh báo các vấn đề cần xử lý
- ✅ Transparency cho admin

---

## 📅 GIAI ĐOẠN 2: Intelligent Automation (2-3 tuần)
**Mục tiêu:** Tăng automation lên **75%** với smart features

### 2.1. Auto-Create Monthly Reconciliation ⭐ MEDIUM PRIORITY
**Impact:** HIGH | **Risk:** MEDIUM | **Effort:** MEDIUM

**Fix MonthlyReconciliationJob để hoạt động:**

```javascript
// File: backend/jobs/systemReconciliation/MonthlyReconciliationJob.js

const schedule = require('node-schedule');
const { pool } = require('../../config/database');
const SystemReconciliationService = require('../../services/systemReconciliation/SystemReconciliationService');
const NotificationService = require('../../services/systemReconciliation/NotificationService');
const logger = require('../../utils/logger');

class MonthlyReconciliationJob {
  static cronPattern = '0 2 15 * *'; // 02:00 AM on 15th of month
  static timezone = 'Asia/Ho_Chi_Minh';

  static async run() {
    try {
      logger.info('[Monthly Reconciliation] Starting job...');

      // Get last month's date range
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthLabel = `Tháng ${lastMonth.getMonth() + 1}/${lastMonth.getFullYear()}`;

      // Check if reconciliation already exists for this month
      const existingCheck = await pool.query(`
        SELECT id, period_label, status
        FROM system_reconciliations
        WHERE period_start >= $1
          AND period_start < $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [
        lastMonth,
        new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1)
      ]);

      if (existingCheck.rows.length > 0) {
        logger.info('[Monthly Reconciliation] Reconciliation already exists', {
          id: existingCheck.rows[0].id,
          label: existingCheck.rows[0].period_label,
          status: existingCheck.rows[0].status
        });
        return { skipped: true, reason: 'already_exists' };
      }

      // Get waiting list for last month
      const monthKey = lastMonth.toISOString().slice(0, 7) + '-01';
      const waitingOrders = await pool.query(`
        SELECT conversion_id, cashback_amount
        FROM reconciliation_waiting_list
        WHERE approval_month = $1
          AND status = 'waiting'
        ORDER BY approval_time ASC
      `, [monthKey]);

      if (waitingOrders.rows.length === 0) {
        logger.info('[Monthly Reconciliation] No orders in waiting list for last month');
        return { skipped: true, reason: 'no_orders' };
      }

      const selectedOrderIds = waitingOrders.rows.map(o => o.conversion_id);
      const totalCashback = waitingOrders.rows.reduce((sum, o) => sum + parseFloat(o.cashback_amount), 0);

      logger.info('[Monthly Reconciliation] Creating reconciliation', {
        month_label: monthLabel,
        order_count: selectedOrderIds.length,
        total_cashback: totalCashback
      });

      // Create reconciliation
      const periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      const periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      periodEnd.setHours(23, 59, 59, 999);

      const reconciliation = await SystemReconciliationService.createReconciliation({
        periodStart,
        periodEnd,
        periodLabel: monthLabel,
        selectedOrderIds,
        createdBy: 'system-auto'
      });

      logger.info('[Monthly Reconciliation] Reconciliation created', {
        id: reconciliation.id,
        total_orders: selectedOrderIds.length
      });

      // Move from waiting list to reconciliation
      await pool.query(
        'SELECT move_from_waiting_to_reconciliation($1, $2)',
        [reconciliation.id, selectedOrderIds]
      );

      // Send notification to admin
      await NotificationService.notifyReconciliationDraftCreated(reconciliation);

      return {
        success: true,
        reconciliation_id: reconciliation.id,
        order_count: selectedOrderIds.length,
        total_cashback: totalCashback
      };

    } catch (error) {
      logger.error('[Monthly Reconciliation] Job failed', {
        error: error.message,
        stack: error.stack
      });

      // Send error notification
      await this.notifyError(error);

      throw error;
    }
  }

  static async notifyError(error) {
    const { sendEmail } = require('../../services/emailService');
    const adminEmails = await this.getAdminEmails();

    const subject = '❌ Lỗi tự động tạo kỳ đối soát tháng';
    const html = `
      <h2>Cảnh báo: Tạo kỳ đối soát tự động thất bại</h2>
      <p>Job tạo kỳ đối soát hàng tháng đã gặp lỗi.</p>
      <pre>${error.message}</pre>
      <p>Vui lòng tạo kỳ đối soát thủ công qua giao diện admin.</p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }

  static async getAdminEmails() {
    const result = await pool.query(`
      SELECT email FROM users WHERE is_admin = true
    `);
    return result.rows.map(r => r.email);
  }

  static start() {
    schedule.scheduleJob({
      rule: this.cronPattern,
      tz: this.timezone
    }, async () => {
      await this.run();
    });

    logger.info(`[Monthly Reconciliation] Job scheduled: ${this.cronPattern} (${this.timezone})`);
  }
}

module.exports = MonthlyReconciliationJob;
```

**Configuration option:**

```javascript
// File: backend/config/automation.js

module.exports = {
  reconciliation: {
    // Enable/disable auto-create monthly reconciliation
    auto_create_monthly: process.env.AUTO_CREATE_MONTHLY_RECONCILIATION === 'true',

    // Auto-finalize (DANGEROUS - keep false)
    auto_finalize: false,

    // Notification settings
    notifications: {
      waiting_list_threshold: 10, // Send notification if > 10 orders
      draft_age_warning_days: 7   // Warn if draft older than 7 days
    }
  }
};
```

**.env addition:**
```bash
# Automation settings
AUTO_CREATE_MONTHLY_RECONCILIATION=true  # Set to false to disable
```

**Lợi ích:**
- ✅ Tự động tạo kỳ đối soát mỗi ngày 15
- ✅ Admin chỉ cần review & finalize
- ✅ Có thể tắt feature qua .env
- ⚠️ Admin vẫn phải finalize (safety)

**Rủi ro:**
- ⚠️ Nếu waiting list có dữ liệu lỗi, tự động tạo reconciliation sai
- ⚠️ Admin mất bước review trước khi tạo

**Mitigations:**
- ✅ Chỉ tạo draft, không tự động finalize
- ✅ Gửi email notification ngay lập tức
- ✅ Có thể disable qua .env
- ✅ Admin review draft trước khi finalize

---

### 2.2. Smart Retry & Error Recovery
**Impact:** MEDIUM | **Risk:** LOW | **Effort:** SMALL

```javascript
// File: backend/jobs/systemReconciliation/JobRunner.js

class JobRunner {
  static async runWithRetry(jobName, jobFunction, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 60000, // 1 minute
      notifyOnFailure = true
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[${jobName}] Attempt ${attempt}/${maxRetries}`);

        const result = await jobFunction();

        logger.info(`[${jobName}] Success on attempt ${attempt}`);
        return result;

      } catch (error) {
        lastError = error;
        logger.error(`[${jobName}] Failed attempt ${attempt}/${maxRetries}`, {
          error: error.message
        });

        if (attempt < maxRetries) {
          logger.info(`[${jobName}] Retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    }

    // All retries failed
    logger.error(`[${jobName}] All ${maxRetries} attempts failed`, {
      error: lastError.message
    });

    if (notifyOnFailure) {
      await this.notifyJobFailure(jobName, lastError, maxRetries);
    }

    throw lastError;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async notifyJobFailure(jobName, error, attempts) {
    const { sendEmail } = require('../../services/emailService');
    const { pool } = require('../../config/database');

    const adminEmails = await pool.query(`
      SELECT email FROM users WHERE is_admin = true
    `).then(r => r.rows.map(row => row.email));

    const subject = `❌ Job ${jobName} thất bại sau ${attempts} lần thử`;
    const html = `
      <h2>Cảnh báo: Job tự động thất bại</h2>
      <p>Job <strong>${jobName}</strong> đã thất bại sau ${attempts} lần thử.</p>

      <h3>Lỗi:</h3>
      <pre>${error.message}</pre>

      <h3>Stack trace:</h3>
      <pre>${error.stack}</pre>

      <p>Vui lòng kiểm tra logs và xử lý thủ công nếu cần.</p>
    `;

    for (const email of adminEmails) {
      await sendEmail(email, subject, html);
    }
  }
}

module.exports = JobRunner;
```

**Usage:**

```javascript
// Update all jobs to use JobRunner

class WaitingListAutoPopulateJob {
  static async run() {
    return await JobRunner.runWithRetry(
      'WaitingList Auto-Populate',
      async () => {
        // Original job logic
        const result = await pool.query(...);
        return result;
      },
      {
        maxRetries: 3,
        retryDelay: 60000,
        notifyOnFailure: true
      }
    );
  }
}
```

**Lợi ích:**
- ✅ Tự động retry khi có lỗi tạm thời
- ✅ Notification khi job thất bại hoàn toàn
- ✅ Tăng reliability của automation
- ✅ Centralized error handling

---

### 2.3. Job Execution History Tracking
**Impact:** MEDIUM | **Risk:** LOW | **Effort:** SMALL

**Migration: Create job history table**

```sql
-- File: backend/migrations/035_create_automation_job_history.sql

CREATE TABLE IF NOT EXISTS automation_job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  job_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,

  status VARCHAR(20) NOT NULL, -- running, success, error

  -- Metrics
  duration_ms INTEGER,
  records_processed INTEGER DEFAULT 0,

  -- Results
  result JSONB,
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  triggered_by VARCHAR(50) DEFAULT 'cron', -- cron, manual, api
  server_instance VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_history_name ON automation_job_history(job_name);
CREATE INDEX idx_job_history_started ON automation_job_history(started_at DESC);
CREATE INDEX idx_job_history_status ON automation_job_history(status);

COMMENT ON TABLE automation_job_history IS 'Execution history for all automation jobs';
```

**Track job execution:**

```javascript
// File: backend/jobs/systemReconciliation/JobTracker.js

class JobTracker {
  static async startTracking(jobName, triggeredBy = 'cron') {
    const result = await pool.query(`
      INSERT INTO automation_job_history (
        job_name,
        status,
        triggered_by,
        server_instance
      ) VALUES ($1, 'running', $2, $3)
      RETURNING id
    `, [jobName, triggeredBy, process.env.SERVER_INSTANCE || 'local']);

    return result.rows[0].id;
  }

  static async completeTracking(trackingId, success, result, error = null) {
    await pool.query(`
      UPDATE automation_job_history
      SET
        status = $2,
        completed_at = NOW(),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
        result = $3,
        error_message = $4,
        error_stack = $5
      WHERE id = $1
    `, [
      trackingId,
      success ? 'success' : 'error',
      JSON.stringify(result),
      error?.message || null,
      error?.stack || null
    ]);
  }
}
```

**API to view history:**

```javascript
// GET /api/admin/system-reconciliation/automation/history
router.get('/automation/history', async (req, res) => {
  const { job_name, limit = 50 } = req.query;

  let query = `
    SELECT
      id,
      job_name,
      started_at,
      completed_at,
      status,
      duration_ms,
      records_processed,
      result,
      error_message
    FROM automation_job_history
    WHERE 1=1
  `;

  const params = [];

  if (job_name) {
    params.push(job_name);
    query += ` AND job_name = $${params.length}`;
  }

  query += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);

  res.json({
    success: true,
    data: result.rows
  });
});
```

**Lợi ích:**
- ✅ Audit trail đầy đủ cho tất cả jobs
- ✅ Debug khi có vấn đề
- ✅ Metrics để optimize
- ✅ Compliance & transparency

---

## 📅 GIAI ĐOẠN 3: Advanced Features (3-4 tuần)
**Mục tiêu:** Đạt **85%** automation với advanced AI/ML

### 3.1. Intelligent Anomaly Detection
**Impact:** HIGH | **Risk:** LOW | **Effort:** LARGE

**Phát hiện bất thường tự động:**

```javascript
// File: backend/services/systemReconciliation/AnomalyDetectionService.js

class AnomalyDetectionService {
  /**
   * Check for anomalies before creating reconciliation
   */
  static async detectAnomalies(orderIds) {
    const anomalies = [];

    // Get order statistics
    const stats = await this.getOrderStatistics(orderIds);

    // 1. Check for unusual cashback amounts
    if (stats.max_cashback > stats.avg_cashback * 5) {
      anomalies.push({
        type: 'high_value_outlier',
        severity: 'warning',
        message: `Phát hiện đơn có cashback gấp 5 lần trung bình: ${stats.max_cashback.toLocaleString()} VNĐ`,
        details: stats.outlier_orders
      });
    }

    // 2. Check for spike in order volume
    const historicalAvg = await this.getHistoricalAverageOrders();
    if (orderIds.length > historicalAvg * 1.5) {
      anomalies.push({
        type: 'volume_spike',
        severity: 'info',
        message: `Số đơn hàng tăng ${Math.round((orderIds.length / historicalAvg - 1) * 100)}% so với trung bình`,
        details: { current: orderIds.length, average: historicalAvg }
      });
    }

    // 3. Check for new merchants
    const newMerchants = await this.detectNewMerchants(orderIds);
    if (newMerchants.length > 0) {
      anomalies.push({
        type: 'new_merchants',
        severity: 'info',
        message: `Phát hiện ${newMerchants.length} merchant mới`,
        details: newMerchants
      });
    }

    // 4. Check for users with unusually high orders
    const suspiciousUsers = await this.detectSuspiciousUsers(orderIds);
    if (suspiciousUsers.length > 0) {
      anomalies.push({
        type: 'suspicious_users',
        severity: 'warning',
        message: `Phát hiện ${suspiciousUsers.length} user có số đơn bất thường`,
        details: suspiciousUsers
      });
    }

    return anomalies;
  }

  static async getOrderStatistics(orderIds) {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        AVG(cashback_amount) as avg_cashback,
        MAX(cashback_amount) as max_cashback,
        MIN(cashback_amount) as min_cashback,
        STDDEV(cashback_amount) as stddev_cashback
      FROM conversions
      WHERE id = ANY($1)
    `, [orderIds]);

    return result.rows[0];
  }

  static async getHistoricalAverageOrders() {
    const result = await pool.query(`
      SELECT AVG(total_orders) as avg_orders
      FROM system_reconciliations
      WHERE created_at > NOW() - INTERVAL '6 months'
        AND status != 'cancelled'
    `);

    return parseFloat(result.rows[0].avg_orders) || 100;
  }

  static async detectNewMerchants(orderIds) {
    // Logic to detect merchants appearing for first time
    return [];
  }

  static async detectSuspiciousUsers(orderIds) {
    const result = await pool.query(`
      SELECT
        user_id,
        COUNT(*) as order_count,
        SUM(cashback_amount) as total_cashback
      FROM conversions
      WHERE id = ANY($1)
      GROUP BY user_id
      HAVING COUNT(*) > 10  -- Threshold: 10 orders in same period
      ORDER BY order_count DESC
    `, [orderIds]);

    return result.rows;
  }
}
```

**Integrate into reconciliation creation:**

```javascript
// Before creating reconciliation
const anomalies = await AnomalyDetectionService.detectAnomalies(selectedOrderIds);

if (anomalies.length > 0) {
  // Send notification to admin
  await NotificationService.notifyAnomaliesDetected(anomalies, {
    reconciliation_label: periodLabel,
    total_orders: selectedOrderIds.length
  });

  // Log anomalies
  logger.warn('[Reconciliation Creation] Anomalies detected', { anomalies });
}
```

**Lợi ích:**
- ✅ Phát hiện sớm các vấn đề
- ✅ Giảm rủi ro gian lận
- ✅ Cảnh báo các pattern bất thường
- ✅ Data-driven insights

---

### 3.2. Predictive Analytics Dashboard
**Impact:** MEDIUM | **Risk:** LOW | **Effort:** LARGE

**Dự đoán cashback tương lai:**

```javascript
// File: backend/services/systemReconciliation/PredictiveAnalyticsService.js

class PredictiveAnalyticsService {
  /**
   * Predict next month's reconciliation
   */
  static async predictNextMonth() {
    // Get historical data
    const historical = await pool.query(`
      SELECT
        DATE_TRUNC('month', period_start) as month,
        total_orders,
        total_cashback,
        total_users
      FROM system_reconciliations
      WHERE status IN ('finalized', 'paid')
        AND created_at > NOW() - INTERVAL '12 months'
      ORDER BY month DESC
    `);

    const data = historical.rows;

    // Simple moving average (3-month)
    const recentMonths = data.slice(0, 3);
    const avgOrders = recentMonths.reduce((sum, m) => sum + m.total_orders, 0) / recentMonths.length;
    const avgCashback = recentMonths.reduce((sum, m) => sum + parseFloat(m.total_cashback), 0) / recentMonths.length;
    const avgUsers = recentMonths.reduce((sum, m) => sum + m.total_users, 0) / recentMonths.length;

    // Calculate trend (growth rate)
    const oldestMonth = recentMonths[recentMonths.length - 1];
    const newestMonth = recentMonths[0];
    const growthRate = (newestMonth.total_cashback - oldestMonth.total_cashback) / oldestMonth.total_cashback;

    // Prediction for next month
    const prediction = {
      month: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 7),
      predicted_orders: Math.round(avgOrders * (1 + growthRate)),
      predicted_cashback: avgCashback * (1 + growthRate),
      predicted_users: Math.round(avgUsers * (1 + growthRate)),
      confidence: this.calculateConfidence(data),
      growth_rate: growthRate * 100
    };

    return prediction;
  }

  static calculateConfidence(data) {
    // Simple confidence based on data consistency
    if (data.length < 3) return 'low';
    if (data.length < 6) return 'medium';
    return 'high';
  }

  /**
   * Get cashflow forecast
   */
  static async getCashflowForecast(months = 3) {
    const forecast = [];

    for (let i = 1; i <= months; i++) {
      // Simple linear regression or ML model
      const prediction = await this.predictMonth(i);
      forecast.push(prediction);
    }

    return forecast;
  }
}
```

**Dashboard widget:**

```javascript
// Frontend: Show predictions

<div class="prediction-widget">
  <h3>📊 Dự Báo Tháng Tới</h3>
  <div id="predictionData">
    <div class="metric">
      <span class="value">~250</span>
      <span class="label">Đơn hàng dự kiến</span>
    </div>
    <div class="metric">
      <span class="value">~15M VNĐ</span>
      <span class="label">Cashback dự kiến</span>
    </div>
    <div class="metric">
      <span class="value">+12%</span>
      <span class="label">Tăng trưởng</span>
    </div>
  </div>
</div>
```

---

### 3.3. Auto-Optimize Job Scheduling
**Impact:** LOW | **Risk:** LOW | **Effort:** MEDIUM

**Tự động điều chỉnh thời gian chạy job:**

```javascript
// Analyze when database load is lowest
// Schedule jobs during off-peak hours
// Dynamically adjust retry intervals
```

---

## 🎯 Tổng Kết & Khuyến Nghị

### Ưu tiên triển khai:

**Ngay lập tức** (1-2 tuần):
1. ⭐⭐⭐ Auto-populate waiting list job
2. ⭐⭐⭐ Notification system
3. ⭐⭐ Health monitoring dashboard
4. ⭐⭐ Smart retry & error recovery

**Trung hạn** (2-4 tuần):
5. ⭐⭐ Auto-create monthly reconciliation (với option tắt)
6. ⭐ Job execution history tracking

**Dài hạn** (1-2 tháng):
7. ⭐ Anomaly detection
8. ⭐ Predictive analytics
9. Auto-optimize scheduling

### Automation Target:

```
Hiện tại:  ████░░░░░░ 40%
Giai đoạn 1: ███████░░░ 60%  (Quick wins)
Giai đoạn 2: ████████░░ 75%  (Intelligent automation)
Giai đoạn 3: █████████░ 85%  (Advanced features)
```

### ROI Ước tính:

**Tiết kiệm thời gian:**
- Hiện tại: ~2 giờ/tháng cho admin
- Sau cải tiến: ~15 phút/tháng
- **Tiết kiệm: 87.5%**

**Giảm rủi ro:**
- Anomaly detection → Giảm 80% rủi ro gian lận
- Auto-notifications → Giảm 90% rủi ro bỏ sót
- Health monitoring → Phát hiện sớm 100% job failures

**Tăng tốc độ:**
- Hiện tại: Reconciliation sau 15-20 ngày
- Sau cải tiến: Reconciliation sau 15 ngày (đúng schedule)
- Users nhận tiền nhanh hơn → Tăng satisfaction

---

## 🚧 Những Gì KHÔNG Nên Tự Động Hóa

❌ **Finalization** - Luôn giữ manual vì:
- Liên quan đến tiền thật
- Cần review bởi con người
- Legal/compliance requirements

❌ **Edge case handling** - Vẫn cần admin:
- Dispute resolution
- Manual adjustments
- Fraud investigation

❌ **Policy decisions** - Cần human judgment:
- Risk threshold adjustments
- New merchant approvals
- Special case approvals

---

**Generated by:** Claude Code 🤖
**Date:** 2026-01-02
**Status:** Ready for Implementation
