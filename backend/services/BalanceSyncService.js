/**
 * Balance Sync Service
 * Application-level logic để sync balance và log transactions
 * Làm việc cùng với database trigger để đảm bảo data integrity
 */

const { pool } = require('../config/database');
const logger = require('../utils/logger');

class BalanceSyncService {
  /**
   * Verify balance integrity for a user
   * Kiểm tra xem total_earned có khớp với SUM(cashback) không
   */
  static async verifyUserBalance(userId) {
    try {
      const result = await pool.query(`
        SELECT
          usb.total_earned,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = $1
          ), 0) as actual_total,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = $1
          ), 0) - COALESCE(usb.total_earned, 0) as diff
        FROM user_system_balance usb
        WHERE usb.user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return {
          valid: false,
          reason: 'User has no balance record',
          needsSync: true
        };
      }

      const row = result.rows[0];
      const diff = Math.abs(parseFloat(row.diff));

      if (diff > 0.01) {
        logger.warn('Balance mismatch detected', {
          userId,
          totalEarned: parseFloat(row.total_earned),
          actualTotal: parseFloat(row.actual_total),
          diff: parseFloat(row.diff)
        });

        return {
          valid: false,
          reason: `Balance mismatch: ${diff} đ`,
          needsSync: true,
          data: {
            totalEarned: parseFloat(row.total_earned),
            actualTotal: parseFloat(row.actual_total),
            diff: parseFloat(row.diff)
          }
        };
      }

      return {
        valid: true,
        data: {
          totalEarned: parseFloat(row.total_earned),
          actualTotal: parseFloat(row.actual_total)
        }
      };

    } catch (error) {
      logger.error('Verify balance error', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Force sync balance for a user
   * Dùng khi phát hiện lỗi hoặc cần đồng bộ thủ công
   */
  static async syncUserBalance(userId) {
    try {
      const result = await pool.query(`
        WITH conversion_total AS (
          SELECT COALESCE(SUM(cashback_amount), 0) as total
          FROM system_conversions
          WHERE user_id = $1
        )
        UPDATE user_system_balance
        SET
          total_earned = (SELECT total FROM conversion_total),
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING
          total_earned,
          (SELECT total FROM conversion_total) as expected_total
      `, [userId]);

      if (result.rows.length === 0) {
        // Create new record if not exists
        await pool.query(`
          INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved)
          VALUES ($1, (
            SELECT COALESCE(SUM(cashback_amount), 0)
            FROM system_conversions
            WHERE user_id = $1
          ), 0, 0)
        `, [userId]);

        logger.info('Created new balance record', { userId });
      } else {
        logger.info('Synced user balance', {
          userId,
          totalEarned: parseFloat(result.rows[0].total_earned)
        });
      }

      return {
        success: true,
        totalEarned: result.rows.length > 0 ? parseFloat(result.rows[0].total_earned) : 0
      };

    } catch (error) {
      logger.error('Sync balance error', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify all users' balances
   * Trả về danh sách users có vấn đề
   */
  static async verifyAllBalances() {
    try {
      const result = await pool.query(`
        SELECT
          u.id as user_id,
          u.email,
          COALESCE(usb.total_earned, 0) as balance_total_earned,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = u.id
          ), 0) as conversions_total,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = u.id
          ), 0) - COALESCE(usb.total_earned, 0) as diff
        FROM users u
        LEFT JOIN user_system_balance usb ON u.id = usb.user_id
        WHERE EXISTS (
          SELECT 1 FROM system_conversions WHERE user_id = u.id
        )
        AND ABS(
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = u.id
          ), 0) - COALESCE(usb.total_earned, 0)
        ) > 0.01
      `);

      return result.rows.map(row => ({
        userId: row.user_id,
        email: row.email,
        balanceTotalEarned: parseFloat(row.balance_total_earned),
        conversionsTotal: parseFloat(row.conversions_total),
        diff: parseFloat(row.diff)
      }));

    } catch (error) {
      logger.error('Verify all balances error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Log balance change
   * Ghi log khi có thay đổi balance (cho audit trail)
   */
  static async logBalanceChange(userId, type, amount, description, metadata = {}) {
    try {
      await pool.query(`
        INSERT INTO balance_change_logs (
          user_id,
          change_type,
          amount,
          description,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        userId,
        type,
        amount,
        description,
        JSON.stringify(metadata)
      ]);

      logger.info('Balance change logged', {
        userId,
        type,
        amount,
        description
      });

    } catch (error) {
      // Don't throw error if log table doesn't exist yet
      // Just log warning
      logger.warn('Failed to log balance change', {
        userId,
        error: error.message
      });
    }
  }
}

module.exports = BalanceSyncService;
