/**
 * Daily Balance Reconciliation Job
 * Chạy mỗi ngày để kiểm tra và sửa lỗi balance tự động
 *
 * Schedule: 3:00 AM mỗi ngày
 * Purpose: Phát hiện và fix các lỗi balance không khớp
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');
const logger = require('../utils/logger');
const BalanceSyncService = require('../services/BalanceSyncService');

class DailyBalanceReconciliation {
  /**
   * Run reconciliation
   */
  static async run() {
    const startTime = Date.now();

    try {
      logger.info('========================================');
      logger.info('DAILY BALANCE RECONCILIATION - START');
      logger.info('========================================');

      // 1. Verify all users' balances
      logger.info('Step 1: Verifying all users balances...');
      const mismatchUsers = await BalanceSyncService.verifyAllBalances();

      if (mismatchUsers.length === 0) {
        logger.info('✅ All users balances are correct!');
        logger.info('========================================');
        return {
          success: true,
          mismatchCount: 0,
          fixedCount: 0,
          duration: Date.now() - startTime
        };
      }

      logger.warn(`⚠️  Found ${mismatchUsers.length} users with balance mismatch`);

      // 2. Fix each user
      logger.info('Step 2: Fixing mismatched balances...');
      let fixedCount = 0;
      let failedCount = 0;

      for (const user of mismatchUsers) {
        try {
          logger.info(`Fixing user ${user.email}...`);
          logger.info(`  Current: ${user.balanceTotalEarned.toLocaleString('vi-VN')} đ`);
          logger.info(`  Expected: ${user.conversionsTotal.toLocaleString('vi-VN')} đ`);
          logger.info(`  Diff: ${user.diff.toLocaleString('vi-VN')} đ`);

          await BalanceSyncService.syncUserBalance(user.userId);

          // Verify fix
          const verification = await BalanceSyncService.verifyUserBalance(user.userId);
          if (verification.valid) {
            logger.info(`  ✅ Fixed!`);
            fixedCount++;
          } else {
            logger.error(`  ❌ Fix failed - still mismatch`);
            failedCount++;
          }

        } catch (error) {
          logger.error(`Failed to fix user ${user.email}`, {
            error: error.message
          });
          failedCount++;
        }
      }

      // 3. Summary
      const duration = Date.now() - startTime;
      logger.info('========================================');
      logger.info('RECONCILIATION COMPLETE');
      logger.info('========================================');
      logger.info(`Total users checked: ${mismatchUsers.length}`);
      logger.info(`Fixed: ${fixedCount}`);
      logger.info(`Failed: ${failedCount}`);
      logger.info(`Duration: ${(duration / 1000).toFixed(2)}s`);
      logger.info('========================================');

      // 4. Send alert if there are still errors
      if (failedCount > 0) {
        await this.sendAlert({
          type: 'BALANCE_RECONCILIATION_FAILED',
          failedCount,
          totalChecked: mismatchUsers.length,
          duration
        });
      }

      return {
        success: failedCount === 0,
        mismatchCount: mismatchUsers.length,
        fixedCount,
        failedCount,
        duration
      };

    } catch (error) {
      logger.error('Daily reconciliation error', {
        error: error.message,
        stack: error.stack
      });

      await this.sendAlert({
        type: 'BALANCE_RECONCILIATION_ERROR',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Send alert email/notification
   */
  static async sendAlert(data) {
    try {
      // TODO: Implement email/slack notification
      logger.error('ALERT: Balance reconciliation issue', data);

      // For now, just log to database
      await pool.query(`
        INSERT INTO system_alerts (
          alert_type,
          severity,
          message,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [
        data.type,
        'high',
        data.type === 'BALANCE_RECONCILIATION_FAILED'
          ? `Failed to fix ${data.failedCount} users`
          : `Reconciliation error: ${data.error}`,
        JSON.stringify(data)
      ]);

    } catch (error) {
      logger.error('Failed to send alert', {
        error: error.message
      });
    }
  }

  /**
   * Get reconciliation stats (for monitoring)
   */
  static async getStats(days = 7) {
    try {
      // TODO: Query from balance_change_logs or system_alerts
      logger.info(`Getting reconciliation stats for last ${days} days...`);

      return {
        totalRuns: 0,
        totalFixed: 0,
        totalFailed: 0,
        averageDuration: 0
      };

    } catch (error) {
      logger.error('Get stats error', {
        error: error.message
      });
      throw error;
    }
  }
}

// Export class
module.exports = DailyBalanceReconciliation;

// If run directly (not imported)
if (require.main === module) {
  (async () => {
    try {
      const result = await DailyBalanceReconciliation.run();

      if (result.success) {
        console.log('\n✅ Reconciliation completed successfully\n');
        process.exit(0);
      } else {
        console.log('\n⚠️  Reconciliation completed with errors\n');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n❌ Reconciliation failed:', error.message, '\n');
      process.exit(1);
    }
  })();
}
