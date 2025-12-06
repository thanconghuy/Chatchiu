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
const User = require('../../models/User');
const emailService = require('../../services/emailService');
const { ActivityLogger, ACTIVITY_TYPES } = require('../../services/activityLogger');

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

      // Get system admin user ID for auto-creation
      const createdBy = await User.getSystemAdminId();

      if (!createdBy) {
        console.warn('[MonthlyReconciliationJob] No admin user found - reconciliation will be created without owner');
      } else {
        console.log(`[MonthlyReconciliationJob] Using system admin ID: ${createdBy}`);
      }

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

      // Send notification to admin
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
   * Notify admin about new reconciliation
   * Sends email notification and logs activity
   */
  static async notifyAdmin(reconciliation) {
    const startTime = Date.now();

    // Format notification message
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

    console.log('[MonthlyReconciliationJob] Sending admin notification...');
    console.log(message);

    let emailSent = false;
    let notificationMethod = 'console';

    // Try to send email notification
    try {
      emailSent = await emailService.sendAdminNotification({
        subject: `Kỳ đối soát mới: ${reconciliation.period_label}`,
        message: message,
        data: {
          'Reconciliation ID': reconciliation.id,
          'Period': reconciliation.period_label,
          'Total Orders': reconciliation.total_orders,
          'Total Users': reconciliation.total_users,
          'Total Cashback': this.formatMoney(reconciliation.total_cashback),
          'Reserved Amount': this.formatMoney(reconciliation.reserved_amount),
          'High Risk Orders': reconciliation.high_risk_count,
          'Reconciliation Date': new Date(reconciliation.reconciliation_date).toLocaleDateString('vi-VN')
        }
      });

      if (emailSent) {
        notificationMethod = 'email';
        console.log('[MonthlyReconciliationJob] Email notification sent successfully');
      } else {
        console.log('[MonthlyReconciliationJob] Email notification failed - SMTP not configured');
      }
    } catch (error) {
      console.error('[MonthlyReconciliationJob] Failed to send email notification:', error.message);
    }

    // Log activity
    const responseTime = Date.now() - startTime;
    try {
      await ActivityLogger.log({
        activityType: ACTIVITY_TYPES.ADMIN_NOTIFICATION,
        eventData: {
          notificationType: 'monthly_reconciliation',
          reconciliationId: reconciliation.id,
          period: reconciliation.period_label,
          stats: {
            totalOrders: reconciliation.total_orders,
            totalUsers: reconciliation.total_users,
            totalCashback: reconciliation.total_cashback,
            reservedAmount: reconciliation.reserved_amount,
            highRiskCount: reconciliation.high_risk_count
          },
          emailSent,
          notificationMethod
        },
        req: { headers: {}, ip: 'system' },
        status: 'success',
        responseTime
      });
    } catch (logError) {
      console.error('[MonthlyReconciliationJob] Failed to log notification activity:', logError.message);
    }

    // Return notification result
    return {
      sent: emailSent,
      method: notificationMethod,
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
