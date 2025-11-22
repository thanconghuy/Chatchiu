/**
 * Monthly Reconciliation Job
 *
 * Purpose: Automatically create reconciliation period on 15th of each month
 * Schedule: 15th day of month at 02:00 AM
 *
 * Workflow:
 * 1. Calculate previous month period
 * 2. Create reconciliation period (draft status)
 * 3. Collect all approved orders from that month
 * 4. Calculate risk and reserved amount
 * 5. Send notification to admin for review
 */

const SystemReconciliationService = require('../../services/systemReconciliation/SystemReconciliationService');

class MonthlyReconciliationJob {
  /**
   * Run the monthly reconciliation job
   */
  static async run() {
    const startTime = Date.now();
    console.log('[MonthlyReconciliationJob] Starting monthly reconciliation creation...');

    try {
      // Calculate previous month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = lastMonth.getMonth() + 1;
      const year = lastMonth.getFullYear();

      console.log(`[MonthlyReconciliationJob] Creating reconciliation for ${month}/${year}`);

      // Use system user for auto-creation (you should have a system admin user)
      // For now, we'll use null - admin will need to claim it
      const createdBy = null; // TODO: Use system admin user ID

      // Create reconciliation
      const reconciliation = await SystemReconciliationService.createReconciliation({
        month,
        year,
        createdBy
      });

      const duration = Date.now() - startTime;

      console.log('[MonthlyReconciliationJob] Reconciliation created successfully:');
      console.log(`  - ID: ${reconciliation.id}`);
      console.log(`  - Period: ${reconciliation.period_label}`);
      console.log(`  - Orders: ${reconciliation.total_orders}`);
      console.log(`  - Users: ${reconciliation.total_users}`);
      console.log(`  - Total Cashback: ${this.formatMoney(reconciliation.total_cashback)}`);
      console.log(`  - Reserved: ${this.formatMoney(reconciliation.reserved_amount)}`);
      console.log(`  - High Risk: ${reconciliation.high_risk_count} orders`);
      console.log(`  - Reconciliation Date: ${new Date(reconciliation.reconciliation_date).toLocaleDateString('vi-VN')}`);
      console.log(`  - Duration: ${duration}ms`);

      // TODO: Send notification to admin
      await this.notifyAdmin(reconciliation);

      return {
        success: true,
        reconciliation_id: reconciliation.id,
        month,
        year,
        total_orders: reconciliation.total_orders,
        total_cashback: reconciliation.total_cashback,
        duration
      };

    } catch (error) {
      console.error('[MonthlyReconciliationJob] Error:', error);

      // If reconciliation already exists, that's OK (idempotent)
      if (error.message.includes('đã tồn tại')) {
        console.log('[MonthlyReconciliationJob] Reconciliation already exists - skipping');
        return {
          success: true,
          skipped: true,
          reason: 'Already exists'
        };
      }

      throw error;
    }
  }

  /**
   * Notify admin about new reconciliation (placeholder)
   */
  static async notifyAdmin(reconciliation) {
    // TODO: Implement notification system
    // Options:
    // 1. Email notification
    // 2. In-app notification
    // 3. Slack/Discord webhook
    // 4. SMS for high-value reconciliations

    console.log('[MonthlyReconciliationJob] Admin notification sent (placeholder)');

    // Example notification message:
    const message = `
🔔 Kỳ đối soát mới: ${reconciliation.period_label}

📊 Thống kê:
- Tổng đơn hàng: ${reconciliation.total_orders}
- Người dùng: ${reconciliation.total_users}
- Tổng cashback: ${this.formatMoney(reconciliation.total_cashback)}
- Dự trữ: ${this.formatMoney(reconciliation.reserved_amount)}

⚠️ Đơn hàng rủi ro cao: ${reconciliation.high_risk_count}

📅 Ngày đối soát: ${new Date(reconciliation.reconciliation_date).toLocaleDateString('vi-VN')}

👉 Vui lòng review và finalize tại Admin Dashboard
    `.trim();

    console.log(message);

    // Return notification result
    return {
      sent: false, // Change to true when implemented
      method: 'none',
      message
    };
  }

  /**
   * Format money helper
   */
  static formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Check if reconciliation should run today
   */
  static shouldRunToday() {
    const today = new Date();
    return today.getDate() === 15;
  }

  /**
   * Get next run date
   */
  static getNextRunDate() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // If today is before 15th, next run is 15th of this month
    // Otherwise, next run is 15th of next month
    if (now.getDate() < 15) {
      return new Date(currentYear, currentMonth, 15, 2, 0, 0);
    } else {
      return new Date(currentYear, currentMonth + 1, 15, 2, 0, 0);
    }
  }
}

module.exports = MonthlyReconciliationJob;
