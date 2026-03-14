/**
 * Payment Request Service - FIXED LOGIC
 *
 * Version: 4.0
 * Date: 2026-01-16
 *
 * KEY CHANGES (v4.0 - WORKFLOW CHÍNH XÁC):
 * - available_balance = GENERATED COLUMN (total_earned - total_withdrawn - pending_reserved)
 * - Số dư khả dụng chỉ tính từ conversions ĐÃ ĐỐI SOÁT (system_reconciliation_status = 'reconciled')
 *
 * WORKFLOW THANH TOÁN:
 * 1. User tạo request (pending) → KHÔNG trừ balance
 * 2. Admin confirm (confirmed) → TRỪ pending_reserved
 * 3. Admin thanh toán (paid) → Chuyển từ pending_reserved sang total_withdrawn
 * 4. Admin hủy (rejected/cancelled) → Hoàn lại pending_reserved (nếu đã confirm)
 *
 * FUNCTIONS:
 * - createPaymentRequest() - Validate số dư từ conversions reconciled, KHÔNG reserve
 * - confirmPaymentRequest() - RESERVE balance (tăng pending_reserved)
 * - cancelPaymentRequest() - RELEASE balance nếu đã confirm (giảm pending_reserved)
 * - markAsPaid() - Tăng total_withdrawn, giảm pending_reserved
 * - FIFO chỉ lấy conversions ĐÃ ĐỐI SOÁT
 */

const db = require('../config/database');
const PaymentRequest = require('../models/PaymentRequest');
const PaymentAccount = require('../models/PaymentAccount');
const BalanceManagementService = require('./systemReconciliation/BalanceManagementService');
const SystemSettingsService = require('./systemSettingsService');
const logger = require('../utils/logger');
const paymentEmailHelper = require('./emailHelpers/paymentEmailHelper'); // NEW

class PaymentRequestService {

  /**
   * Create Payment Request with Balance Reserve (NEW LOGIC)
   *
   * Flow:
   * 1. Check idempotency (return cached if exists)
   * 2. Validate amount & bank info
   * 3. Start transaction
   * 4. Lock & check balance
   * 5. Create payment request
   * 6. RESERVE balance (deduct from available_balance)
   * 7. Log to balance_transactions
   * 8. Commit
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} params.requestedAmount
   * @param {string} params.idempotencyKey - REQUIRED UUID v4
   * @param {string} params.bankName
   * @param {string} params.bankAccountNumber
   * @param {string} params.bankAccountName
   * @param {string} params.bankBranch
   * @param {string} params.notes
   * @param {string} params.paymentAccountId
   * @returns {Promise<Object>}
   */
  async createPaymentRequest(params) {
    const {
      userId,
      requestedAmount,
      idempotencyKey, // NEW: Required for idempotency
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankBranch = null,
      notes = null,
      paymentAccountId = null
    } = params;

    // ========================================
    // STEP 0: Get settings BEFORE acquiring pool connection
    // This prevents pool exhaustion when SystemSettingsService makes its own queries
    // ========================================
    const minAmount = await SystemSettingsService.getSetting('min_withdrawal_amount') || 40000;
    const maxAmount = await SystemSettingsService.getSetting('max_withdrawal_amount') || 500000;

    // ========================================
    // STEP 1: Validate Input (before acquiring connection)
    // ========================================
    if (requestedAmount < minAmount) {
      const error = new Error(`Số tiền tối thiểu là ${minAmount.toLocaleString('vi-VN')}đ`);
      error.code = 'BELOW_MIN_AMOUNT';
      throw error;
    }

    if (requestedAmount > maxAmount) {
      const error = new Error(`Số tiền tối đa là ${maxAmount.toLocaleString('vi-VN')}đ`);
      error.code = 'ABOVE_MAX_AMOUNT';
      throw error;
    }

    // IMPORTANT: Amount must be a multiple of minAmount
    // E.g., if minAmount = 50,000đ, valid amounts are 50,000đ, 100,000đ, 150,000đ, etc.
    if (requestedAmount % minAmount !== 0) {
      const error = new Error(
        `Số tiền phải là bội số của ${minAmount.toLocaleString('vi-VN')}đ. ` +
        `Ví dụ: ${minAmount.toLocaleString('vi-VN')}đ, ${(minAmount * 2).toLocaleString('vi-VN')}đ, ${(minAmount * 3).toLocaleString('vi-VN')}đ...`
      );
      error.code = 'INVALID_AMOUNT_MULTIPLE';
      throw error;
    }

    if (!bankName || !bankAccountNumber || !bankAccountName) {
      const error = new Error('Thông tin ngân hàng không đầy đủ');
      error.code = 'INVALID_BANK_INFO';
      throw error;
    }

    // Now acquire pool connection for transaction
    const client = await db.pool.connect();

    try {
      // ========================================
      // STEP 2: Idempotency Check
      // ========================================
      const existingRequest = await client.query(`
        SELECT * FROM payment_requests
        WHERE idempotency_key = $1
      `, [idempotencyKey]);

      if (existingRequest.rows.length > 0) {
        logger.info('Idempotent request detected', {
          idempotencyKey,
          existingRequestId: existingRequest.rows[0].id
        });
        client.release(); // Release early for idempotent requests
        return existingRequest.rows[0];
      }

      // ========================================
      // STEP 3: Start Transaction
      // ========================================
      await client.query('BEGIN');
      // Note: Using READ COMMITTED (default) + FOR UPDATE for row-level locking
      // SERIALIZABLE was causing performance issues with Neon serverless

      logger.info('Creating payment request with reserve logic', {
        userId,
        requestedAmount,
        idempotencyKey
      });

      // ========================================
      // STEP 3: Check Balance (with lock)
      // ========================================
      // IMPORTANT: Phải tính số dư từ các conversions ĐÃ ĐỐI SOÁT
      // Không dùng available_balance trực tiếp vì nó tính từ TẤT CẢ conversions
      const balanceResult = await client.query(`
        SELECT
          usb.total_withdrawn,
          usb.pending_reserved,
          -- Tính từ conversions ĐÃ ĐỐI SOÁT (reconciled)
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = $1
              AND status = 'approved'
              AND system_reconciliation_status = 'reconciled'
              AND (payment_status IS NULL OR payment_status = 'unpaid')
          ), 0) as reconciled_balance
        FROM user_system_balance usb
        WHERE usb.user_id = $1
        FOR UPDATE
      `, [userId]);

      if (balanceResult.rows.length === 0) {
        throw new Error('Bạn chưa có số dư. Vui lòng chờ đối soát hoàn tất.');
      }

      const currentBalance = balanceResult.rows[0];
      const reconciledBalance = parseFloat(currentBalance.reconciled_balance);
      const totalWithdrawn = parseFloat(currentBalance.total_withdrawn);
      const pendingReserved = parseFloat(currentBalance.pending_reserved);

      // Số dư khả dụng ĐÚNG = Đã đối soát - Đã rút - Đang chờ xử lý
      const availableBalance = reconciledBalance - totalWithdrawn - pendingReserved;

      // IMPORTANT: Max payable = floor(available / minAmount) * minAmount
      // This ensures user cannot pay into debt
      // E.g., if available = 238,500đ and minAmount = 50,000đ, maxPayable = 200,000đ
      const maxPayable = Math.floor(availableBalance / minAmount) * minAmount;

      if (maxPayable < minAmount) {
        throw new Error(
          `Số dư khả dụng không đủ để rút tối thiểu ${minAmount.toLocaleString('vi-VN')}đ. ` +
          `Số dư hiện tại: ${availableBalance.toLocaleString('vi-VN')}đ`
        );
      }

      if (requestedAmount > maxPayable) {
        const error = new Error(
          `Số tiền tối đa có thể rút là ${maxPayable.toLocaleString('vi-VN')}đ ` +
          `(số dư khả dụng: ${availableBalance.toLocaleString('vi-VN')}đ, làm tròn xuống bội số ${minAmount.toLocaleString('vi-VN')}đ)`
        );
        error.code = 'EXCEEDS_MAX_PAYABLE';
        error.details = {
          available: availableBalance,
          maxPayable: maxPayable,
          requested: requestedAmount,
          minAmount: minAmount,
          reconciled_balance: reconciledBalance,
          total_withdrawn: totalWithdrawn,
          pending_reserved: pendingReserved
        };
        throw error;
      }

      // ========================================
      // STEP 4: Create Payment Request
      // ========================================
      const prResult = await client.query(`
        INSERT INTO payment_requests (
          user_id,
          requested_amount,
          bank_name,
          bank_account_number,
          bank_account_name,
          bank_branch,
          notes,
          payment_account_id,
          status,
          idempotency_key,
          reserve_balance_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
        RETURNING *
      `, [
        userId,
        requestedAmount,
        bankName,
        bankAccountNumber,
        bankAccountName,
        bankBranch,
        notes,
        paymentAccountId,
        idempotencyKey
      ]);

      const paymentRequest = prResult.rows[0];

      logger.info('Payment request record created', {
        paymentRequestId: paymentRequest.id,
        userId,
        requestedAmount
      });

      // ========================================
      // STEP 5: NO BALANCE CHANGE YET!
      // ========================================
      // IMPORTANT: Theo workflow mới, pending_reserved chỉ được trừ khi:
      // - Admin CONFIRM payment request (status = 'confirmed')
      // - KHÔNG trừ ngay khi user tạo request (status = 'pending')
      // Lý do: Tránh user tạo nhiều request rồi hủy gây lock balance

      logger.info('Payment request created - balance NOT reserved yet', {
        paymentRequestId: paymentRequest.id,
        userId,
        requestedAmount,
        note: 'Balance will be reserved when admin confirms (status=confirmed)'
      });

      // ========================================
      // STEP 6: Log Action
      // ========================================
      await client.query(`
        INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          notes
        ) VALUES ($1, 'created', NULL, 'pending', $2, $3)
      `, [
        paymentRequest.id,
        userId,
        `Tạo yêu cầu thanh toán ${requestedAmount.toLocaleString('vi-VN')}đ`
      ]);

      // ========================================
      // STEP 7: Commit Transaction
      // ========================================
      await client.query('COMMIT');

      logger.success('Payment request created successfully', {
        paymentRequestId: paymentRequest.id,
        userId,
        requestedAmount,
        idempotencyKey
      });

      // ========================================
      // STEP 8: Send Email Notification to Admin (async, non-blocking)
      // ========================================
      setImmediate(async () => {
        try {
          // Get full payment request with user info for email
          const fullPaymentRequest = await PaymentRequest.findById(paymentRequest.id);

          // Get user balance info
          const userBalanceResult = await db.query(`
            SELECT
              total_earned - total_withdrawn - pending_reserved AS available_balance,
              total_earned,
              total_withdrawn
            FROM user_system_balance
            WHERE user_id = $1
          `, [userId]);

          const userBalance = userBalanceResult.rows[0] || {
            available_balance: 0,
            total_earned: 0,
            total_withdrawn: 0
          };

          // Get user payment request stats
          const statsResult = await db.query(`
            SELECT
              COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
              COUNT(*) AS total_count
            FROM payment_requests
            WHERE user_id = $1
          `, [userId]);

          const stats = statsResult.rows[0] || { pending_count: 0, total_count: 0 };

          // Send email to admin
          await paymentEmailHelper.sendPaymentRequestCreatedAdminEmail(
            fullPaymentRequest,
            {
              availableBalance: userBalance.available_balance,
              totalBalance: userBalance.total_earned,
              totalWithdrawn: userBalance.total_withdrawn
            },
            {
              pendingCount: parseInt(stats.pending_count),
              totalCount: parseInt(stats.total_count)
            }
          );

          logger.info('Admin notification email sent successfully', {
            paymentRequestId: paymentRequest.id
          });
        } catch (emailError) {
          logger.error('Failed to send admin notification email', {
            paymentRequestId: paymentRequest.id,
            error: emailError.message
          });
          // Don't throw - email failure shouldn't affect payment request creation
        }
      });

      return paymentRequest;

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to create payment request', {
        userId,
        requestedAmount,
        idempotencyKey,
        error: error.message,
        code: error.code
      });

      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Cancel Payment Request with Balance Release (NEW LOGIC)
   *
   * Flow:
   * 1. Validate request exists & belongs to user
   * 2. Validate status is 'pending' (only pending can be cancelled)
   * 3. Start transaction
   * 4. Update payment_requests status to 'cancelled'
   * 5. RELEASE balance (add back to available_balance)
   * 6. Log to balance_transactions
   * 7. Commit
   *
   * @param {string} paymentRequestId
   * @param {string} userId
   * @param {string} reason - Optional cancellation reason
   * @returns {Promise<Object>}
   */
  async cancelPaymentRequest(paymentRequestId, userId, reason = null) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

      // ========================================
      // STEP 1: Get and Lock Payment Request
      // ========================================
      const prResult = await client.query(`
        SELECT * FROM payment_requests
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      `, [paymentRequestId, userId]);

      if (prResult.rows.length === 0) {
        throw new Error('Không tìm thấy yêu cầu thanh toán hoặc bạn không có quyền hủy');
      }

      const paymentRequest = prResult.rows[0];

      // ========================================
      // STEP 2: Validate Can Cancel
      // ========================================
      if (paymentRequest.status !== 'pending') {
        throw new Error(
          `Chỉ có thể hủy yêu cầu đang chờ xử lý. ` +
          `Trạng thái hiện tại: ${paymentRequest.status}`
        );
      }

      if (paymentRequest.cancelled_at) {
        throw new Error('Yêu cầu thanh toán đã được hủy trước đó');
      }

      logger.info('Cancelling payment request', {
        paymentRequestId,
        userId,
        amount: paymentRequest.requested_amount
      });

      // ========================================
      // STEP 3: Update Payment Request
      // ========================================
      await client.query(`
        UPDATE payment_requests
        SET status = 'cancelled',
            cancelled_at = NOW(),
            cancelled_by = $2,
            cancellation_reason = $3,
            release_balance_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [paymentRequestId, userId, reason]);

      // ========================================
      // STEP 4: NO BALANCE CHANGE FOR PENDING REQUESTS
      // ========================================
      // IMPORTANT: User can only cancel PENDING requests (line 398 validates this)
      // PENDING requests have NOT reserved balance yet (balance is reserved on CONFIRM)
      // Therefore, we do NOT need to release any balance here
      //
      // Balance lifecycle:
      // - pending: NO balance reserved
      // - confirmed: balance RESERVED (pending_reserved += amount)
      // - paid: balance WITHDRAWN (pending_reserved -= amount, total_withdrawn += amount)
      // - rejected (from confirmed): balance RELEASED (pending_reserved -= amount)
      // - cancelled (from pending): NO balance change needed

      logger.info('Payment request cancelled - no balance change needed (was pending)', {
        paymentRequestId,
        userId,
        amount: paymentRequest.requested_amount
      });

      // ========================================
      // STEP 5: Log Action
      // ========================================
      await client.query(`
        INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          notes
        ) VALUES ($1, 'cancelled', 'pending', 'cancelled', $2, $3)
      `, [
        paymentRequestId,
        userId,
        reason || 'Người dùng hủy yêu cầu thanh toán'
      ]);

      // ========================================
      // STEP 6: Commit Transaction
      // ========================================
      await client.query('COMMIT');

      logger.success('Payment request cancelled successfully', {
        paymentRequestId,
        userId,
        amount: paymentRequest.requested_amount,
        reason
      });

      // ========================================
      // STEP 7: Send Email Confirmation to User (async, non-blocking)
      // ========================================
      setImmediate(async () => {
        try {
          // Get full payment request with user info for email
          const fullPaymentRequest = await PaymentRequest.findById(paymentRequestId);

          // Get current balance after cancellation
          const balanceResult = await db.query(`
            SELECT total_earned - total_withdrawn - pending_reserved AS available_balance
            FROM user_system_balance
            WHERE user_id = $1
          `, [userId]);

          const currentBalance = balanceResult.rows[0]?.available_balance || 0;

          // Send email to user
          await paymentEmailHelper.sendPaymentCancelledEmail(
            {
              ...fullPaymentRequest,
              cancellation_reason: reason
            },
            currentBalance
          );

          logger.info('Cancellation confirmation email sent successfully', {
            paymentRequestId
          });
        } catch (emailError) {
          logger.error('Failed to send cancellation confirmation email', {
            paymentRequestId,
            error: emailError.message
          });
          // Don't throw - email failure shouldn't affect cancellation
        }
      });

      return {
        ...paymentRequest,
        status: 'cancelled',
        cancelled_at: new Date(),
        cancelled_by: userId,
        cancellation_reason: reason
      };

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to cancel payment request', {
        paymentRequestId,
        userId,
        error: error.message
      });

      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Mark Payment Request as Paid (NEW LOGIC)
   *
   * Flow:
   * 1. Validate request exists & status
   * 2. Start transaction
   * 3. Update payment_requests status to 'paid'
   * 4. RECORD withdrawal (update total_withdrawn ONLY, no balance deduction)
   * 5. Mark conversions as paid (FIFO)
   * 6. Log to balance_transactions
   * 7. Commit
   * 8. Send email notification (async)
   *
   * @param {string} paymentRequestId
   * @param {Object} adminInfo - { id, full_name, email }
   * @param {string} transactionReference - Bank transaction reference
   * @param {string} adminNotes - Optional admin notes
   * @returns {Promise<Object>}
   */
  async markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes = null) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

      if (!transactionReference) {
        throw new Error('Mã giao dịch là bắt buộc');
      }

      // ========================================
      // STEP 1: Get and Lock Payment Request
      // ========================================
      const prResult = await client.query(`
        SELECT * FROM payment_requests
        WHERE id = $1
        FOR UPDATE
      `, [paymentRequestId]);

      if (prResult.rows.length === 0) {
        throw new Error('Không tìm thấy yêu cầu thanh toán');
      }

      const paymentRequest = prResult.rows[0];
      const requestedAmount = parseFloat(paymentRequest.requested_amount);

      // ========================================
      // STEP 2: Validate Can Mark Paid
      // ========================================
      if (!['pending', 'confirmed'].includes(paymentRequest.status)) {
        throw new Error(
          `Không thể đánh dấu đã thanh toán từ trạng thái: ${paymentRequest.status}`
        );
      }

      const previousStatus = paymentRequest.status;

      logger.info('Marking payment request as paid', {
        paymentRequestId,
        userId: paymentRequest.user_id,
        amount: requestedAmount,
        adminId: adminInfo.id,
        previousStatus
      });

      // ========================================
      // STEP 3: Update Payment Request Status
      // ========================================
      await client.query(`
        UPDATE payment_requests
        SET status = 'paid',
            paid_at = NOW(),
            paid_by = $2,
            transaction_reference = $3,
            admin_notes = $4,
            updated_at = NOW()
        WHERE id = $1
      `, [paymentRequestId, adminInfo.id, transactionReference, adminNotes]);

      // ========================================
      // STEP 4: UPDATE total_withdrawn AND RELEASE pending_reserved (FIXED LOGIC)
      // ========================================
      // Khi thanh toán thành công:
      // - Nếu từ 'confirmed': pending_reserved đã được tăng → giảm pending_reserved
      // - Nếu từ 'pending': pending_reserved chưa được tăng → KHÔNG giảm
      // => available_balance = total_earned - total_withdrawn - pending_reserved (auto computed)

      if (previousStatus === 'confirmed') {
        // Was confirmed → pending_reserved was increased → need to decrease
        await client.query(`
          UPDATE user_system_balance
          SET
            total_withdrawn = total_withdrawn + $1,
            pending_reserved = pending_reserved - $1,
            updated_at = NOW()
          WHERE user_id = $2
        `, [requestedAmount, paymentRequest.user_id]);

        logger.success('Withdrawal recorded and pending released (was confirmed)', {
          paymentRequestId,
          userId: paymentRequest.user_id,
          amount: requestedAmount
        });
      } else {
        // Was pending → pending_reserved was NOT increased → only increase total_withdrawn
        await client.query(`
          UPDATE user_system_balance
          SET
            total_withdrawn = total_withdrawn + $1,
            updated_at = NOW()
          WHERE user_id = $2
        `, [requestedAmount, paymentRequest.user_id]);

        logger.success('Withdrawal recorded (was pending, no pending_reserved to release)', {
          paymentRequestId,
          userId: paymentRequest.user_id,
          amount: requestedAmount
        });
      }

      // ========================================
      // STEP 5: Mark Conversions as Paid (FIFO)
      // ========================================
      // IMPORTANT: CHỈ lấy conversions ĐÃ ĐỐI SOÁT (reconciled)
      const fifoQuery = `
        WITH selected_conversions AS (
          SELECT
            id,
            cashback_amount,
            SUM(cashback_amount) OVER (
              ORDER BY order_time ASC, id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as running_total
          FROM system_conversions
          WHERE user_id = $1
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
            AND (payment_status IS NULL OR payment_status = 'unpaid')
        )
        UPDATE system_conversions
        SET payment_status = 'paid',
            payment_request_id = $2,
            payment_linked_at = NOW()
        WHERE id IN (
          SELECT id FROM selected_conversions
          WHERE running_total <= $3
             OR (running_total - cashback_amount) < $3
        )
        RETURNING id, cashback_amount
      `;

      const conversionsResult = await client.query(fifoQuery, [
        paymentRequest.user_id,
        paymentRequestId,
        requestedAmount
      ]);

      logger.info('Conversions marked as paid (FIFO)', {
        paymentRequestId,
        conversionsCount: conversionsResult.rowCount,
        amount: requestedAmount
      });

      // ========================================
      // STEP 6: Log Action
      // ========================================
      await client.query(`
        INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          performed_by_name,
          performed_by_email,
          notes,
          metadata
        ) VALUES ($1, 'marked_paid', $2, 'paid', $3, $4, $5, $6, $7)
      `, [
        paymentRequestId,
        paymentRequest.status,
        adminInfo.id,
        adminInfo.full_name,
        adminInfo.email,
        adminNotes || `Đã thanh toán - Mã GD: ${transactionReference}`,
        JSON.stringify({
          transactionReference,
          conversionsMarked: conversionsResult.rowCount
        })
      ]);

      // ========================================
      // STEP 7: Commit Transaction
      // ========================================
      await client.query('COMMIT');

      logger.success('Payment request marked as paid successfully', {
        paymentRequestId,
        userId: paymentRequest.user_id,
        amount: requestedAmount,
        transactionReference,
        conversionsMarked: conversionsResult.rowCount
      });

      // ========================================
      // STEP 8: Send Email (async, non-blocking)
      // ========================================
      setImmediate(async () => {
        try {
          const { sendPaymentPaidEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentPaidEmail({
            ...paymentRequest,
            status: 'paid',
            paid_at: new Date(),
            transaction_reference: transactionReference
          });
          logger.info('Payment paid email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment email', {
            paymentRequestId,
            error: emailError.message
          });
        }
      });

      return {
        ...paymentRequest,
        status: 'paid',
        paid_at: new Date(),
        transaction_reference: transactionReference,
        admin_notes: adminNotes,
        conversions_marked: conversionsResult.rowCount
      };

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to mark payment as paid', {
        paymentRequestId,
        error: error.message
      });

      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Check Eligibility for Payment Request
   *
   * FIXED: Tính available_balance từ conversions ĐÃ ĐỐI SOÁT (reconciled)
   *
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async checkEligibility(userId) {
    try {
      // Get balance info from user_system_balance
      const balanceResult = await db.query(`
        SELECT
          COALESCE(total_earned, 0) as total_earned,
          COALESCE(total_withdrawn, 0) as total_withdrawn,
          COALESCE(pending_reserved, 0) as pending_reserved,
          COALESCE(debt_balance, 0) as debt_balance
        FROM user_system_balance
        WHERE user_id = $1
      `, [userId]);

      const balanceRow = balanceResult.rows[0] || {
        total_earned: 0,
        total_withdrawn: 0,
        pending_reserved: 0,
        debt_balance: 0
      };

      const totalEarned = parseFloat(balanceRow.total_earned);
      const totalWithdrawn = parseFloat(balanceRow.total_withdrawn);
      const pendingReserved = parseFloat(balanceRow.pending_reserved);
      const debt = parseFloat(balanceRow.debt_balance);

      // FIXED 2026-03-14: Tính số dư khả dụng từ user_system_balance
      // Công thức đúng: available = total_earned - total_withdrawn - pending_reserved
      // Bug cũ: dùng reconciled_unpaid (payment_status IS NULL) - total_withdrawn → double deduction
      // Vì FIFO marking có thể mark nhiều conversion hơn số tiền thực tế rút,
      // dẫn đến reconciled_unpaid < total_withdrawn → available = 0 (SAI)
      const reconciledCashback = totalEarned; // Để backward compat với return value bên dưới
      const availableBalance = Math.max(0, totalEarned - totalWithdrawn - pendingReserved);

      const minAmount = await SystemSettingsService.getSetting('min_withdrawal_amount') || 50000;

      // IMPORTANT: Max payable = floor(available / minAmount) * minAmount
      // This ensures user cannot pay into debt
      // E.g., if available = 238,500 and minAmount = 50,000, maxPayable = 200,000
      const maxPayable = Math.floor(availableBalance / minAmount) * minAmount;

      // Check for pending requests
      const pendingResult = await db.query(`
        SELECT COUNT(*) as count, COALESCE(SUM(requested_amount), 0) as total
        FROM payment_requests
        WHERE user_id = $1
          AND status IN ('pending', 'confirmed')
          AND cancelled_at IS NULL
      `, [userId]);

      const pendingCount = parseInt(pendingResult.rows[0].count);
      const pendingTotal = parseFloat(pendingResult.rows[0].total);

      // Get total confirmed cashback (approved conversions not yet paid - for display)
      const confirmedResult = await db.query(`
        SELECT COALESCE(SUM(cashback_amount), 0) as total
        FROM system_conversions
        WHERE user_id = $1
          AND status = 'approved'
          AND (payment_status IS NULL OR payment_status = 'unpaid')
      `, [userId]);

      const totalConfirmedCashback = parseFloat(confirmedResult.rows[0].total);

      // User is eligible if maxPayable >= minAmount (can withdraw at least 1 unit)
      const isEligible = (
        maxPayable >= minAmount &&
        debt === 0
      );

      return {
        isEligible: isEligible,
        eligible: isEligible, // Backward compatibility
        availableBalance: availableBalance,
        available_balance: availableBalance, // Backward compatibility
        reconciledCashback: reconciledCashback, // NEW: Hiển thị cashback đã đối soát
        totalConfirmedCashback: totalConfirmedCashback, // Tổng cashback đã duyệt (bao gồm chưa đối soát)
        totalRequested: pendingTotal,
        minAmount: minAmount,
        min_withdrawal_amount: minAmount, // Backward compatibility
        maxPayable: maxPayable, // NEW: Số tiền tối đa có thể rút (bội số của minAmount)
        max_payable: maxPayable, // Backward compatibility
        pendingRequests: pendingCount,
        pending_requests: pendingCount, // Backward compatibility
        pendingAmount: pendingTotal,
        pending_amount: pendingTotal, // Backward compatibility
        debtBalance: debt,
        debt_balance: debt, // Backward compatibility
        totalEarned: totalEarned,
        total_earned: totalEarned, // Backward compatibility
        totalWithdrawn: totalWithdrawn,
        total_withdrawn: totalWithdrawn, // Backward compatibility
        pendingReserved: pendingReserved, // NEW: Số dư đang chờ xử lý
        reasons: isEligible ? [] : [
          maxPayable < minAmount && `Số dư khả dụng không đủ để rút tối thiểu ${minAmount.toLocaleString('vi-VN')}đ (cần ít nhất ${minAmount.toLocaleString('vi-VN')}đ)`,
          debt > 0 && `Có khoản nợ chưa thanh toán (${debt.toLocaleString('vi-VN')}đ)`
        ].filter(Boolean)
      };

    } catch (error) {
      logger.error('Failed to check eligibility', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get Payment Requests for User
   *
   * @param {string} userId
   * @param {Object} filters - { status, limit, offset }
   * @returns {Promise<Array>}
   */
  async getPaymentRequestsForUser(userId, filters = {}) {
    const {
      status = null,
      limit = 20,
      offset = 0
    } = filters;

    let query = `
      SELECT *
      FROM payment_requests
      WHERE user_id = $1
        AND cancelled_at IS NULL
    `;

    const params = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get Payment Request by ID
   *
   * @param {string} paymentRequestId
   * @param {string} userId - Optional, for access control
   * @returns {Promise<Object>}
   */
  async getPaymentRequestById(paymentRequestId, userId = null) {
    let query = `
      SELECT pr.*,
        u.full_name as user_name,
        u.email as user_email
      FROM payment_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.id = $1
    `;

    const params = [paymentRequestId];

    if (userId) {
      query += ` AND pr.user_id = $2`;
      params.push(userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Confirm Payment Request (Admin)
   *
   * Flow:
   * 1. Validate request exists & status
   * 2. Update status to 'confirmed'
   * 3. Log action
   * 4. Send email notification
   *
   * NOTE: No balance changes - balance was already reserved on create
   *
   * @param {string} paymentRequestId
   * @param {Object} adminInfo - { id, full_name, email }
   * @param {string} adminNotes - Optional admin notes
   * @returns {Promise<Object>}
   */
  async confirmPaymentRequest(paymentRequestId, adminInfo, adminNotes = null) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get payment request
      const prResult = await client.query(`
        SELECT * FROM payment_requests
        WHERE id = $1
        FOR UPDATE
      `, [paymentRequestId]);

      if (prResult.rows.length === 0) {
        throw new Error('Không tìm thấy yêu cầu thanh toán');
      }

      const paymentRequest = prResult.rows[0];

      // Validate can confirm
      if (paymentRequest.status !== 'pending') {
        throw new Error(
          `Không thể xác nhận yêu cầu từ trạng thái: ${paymentRequest.status}`
        );
      }

      logger.info('Confirming payment request', {
        paymentRequestId,
        adminId: adminInfo.id
      });

      // ========================================
      // RESERVE BALANCE - Trừ pending_reserved
      // ========================================
      const requestedAmount = parseFloat(paymentRequest.requested_amount);

      await client.query(`
        UPDATE user_system_balance
        SET
          pending_reserved = pending_reserved + $1,
          updated_at = NOW()
        WHERE user_id = $2
      `, [requestedAmount, paymentRequest.user_id]);

      logger.success('Balance reserved', {
        paymentRequestId,
        userId: paymentRequest.user_id,
        amount: requestedAmount
      });

      // Update status
      await client.query(`
        UPDATE payment_requests
        SET status = 'confirmed',
            confirmed_at = NOW(),
            confirmed_by = $2,
            admin_notes = $3,
            updated_at = NOW()
        WHERE id = $1
      `, [paymentRequestId, adminInfo.id, adminNotes]);

      // Log action
      await client.query(`
        INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          performed_by_name,
          performed_by_email,
          notes
        ) VALUES ($1, 'confirmed', 'pending', 'confirmed', $2, $3, $4, $5)
      `, [
        paymentRequestId,
        adminInfo.id,
        adminInfo.full_name,
        adminInfo.email,
        adminNotes || 'Yêu cầu thanh toán đã được xác nhận'
      ]);

      await client.query('COMMIT');

      logger.success('Payment request confirmed', {
        paymentRequestId,
        adminId: adminInfo.id
      });

      // Send email (async)
      setImmediate(async () => {
        try {
          const { sendPaymentConfirmedEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentConfirmedEmail({
            ...paymentRequest,
            status: 'confirmed',
            confirmed_at: new Date()
          });
          logger.info('Payment confirmed email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment email', {
            paymentRequestId,
            error: emailError.message
          });
        }
      });

      return {
        ...paymentRequest,
        status: 'confirmed',
        confirmed_at: new Date(),
        confirmed_by: adminInfo.id,
        admin_notes: adminNotes
      };

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to confirm payment request', {
        paymentRequestId,
        error: error.message
      });

      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Reject Payment Request with Balance Release (Admin)
   *
   * Flow:
   * 1. Validate request exists & status
   * 2. Update status to 'rejected'
   * 3. RELEASE balance (add back to available_balance)
   * 4. Log action
   * 5. Send email notification
   *
   * @param {string} paymentRequestId
   * @param {Object} adminInfo - { id, full_name, email }
   * @param {string} rejectionReason - REQUIRED
   * @returns {Promise<Object>}
   */
  async rejectPaymentRequest(paymentRequestId, adminInfo, rejectionReason) {
    const client = await db.pool.connect();

    try {
      if (!rejectionReason) {
        throw new Error('Lý do từ chối là bắt buộc');
      }

      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

      // Get payment request
      const prResult = await client.query(`
        SELECT * FROM payment_requests
        WHERE id = $1
        FOR UPDATE
      `, [paymentRequestId]);

      if (prResult.rows.length === 0) {
        throw new Error('Không tìm thấy yêu cầu thanh toán');
      }

      const paymentRequest = prResult.rows[0];

      // Validate can reject
      if (!['pending', 'confirmed'].includes(paymentRequest.status)) {
        throw new Error(
          `Không thể từ chối yêu cầu từ trạng thái: ${paymentRequest.status}`
        );
      }

      const previousStatus = paymentRequest.status;

      logger.info('Rejecting payment request', {
        paymentRequestId,
        adminId: adminInfo.id,
        amount: paymentRequest.requested_amount,
        previousStatus
      });

      // Update status
      await client.query(`
        UPDATE payment_requests
        SET status = 'rejected',
            rejected_at = NOW(),
            rejected_by = $2,
            rejection_reason = $3,
            release_balance_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [paymentRequestId, adminInfo.id, rejectionReason]);

      // RELEASE pending_reserved ONLY if was CONFIRMED
      // (pending requests never had balance reserved)
      if (previousStatus === 'confirmed') {
        await client.query(`
          UPDATE user_system_balance
          SET
            pending_reserved = pending_reserved - $1,
            updated_at = NOW()
          WHERE user_id = $2
        `, [parseFloat(paymentRequest.requested_amount), paymentRequest.user_id]);

        logger.success('Pending reserved released on rejection (was confirmed)', {
          paymentRequestId,
          userId: paymentRequest.user_id,
          amount: paymentRequest.requested_amount
        });
      } else {
        logger.info('No balance release needed (was pending, never reserved)', {
          paymentRequestId,
          userId: paymentRequest.user_id,
          previousStatus
        });
      }

      // Log action
      await client.query(`
        INSERT INTO payment_request_logs (
          payment_request_id,
          action,
          old_status,
          new_status,
          performed_by,
          performed_by_name,
          performed_by_email,
          notes
        ) VALUES ($1, 'rejected', $2, 'rejected', $3, $4, $5, $6)
      `, [
        paymentRequestId,
        paymentRequest.status,
        adminInfo.id,
        adminInfo.full_name,
        adminInfo.email,
        rejectionReason
      ]);

      await client.query('COMMIT');

      logger.success('Payment request rejected', {
        paymentRequestId,
        adminId: adminInfo.id
      });

      // Send email (async)
      setImmediate(async () => {
        try {
          const { sendPaymentRejectedEmail } = require('./emailHelpers/paymentEmailHelper');
          await sendPaymentRejectedEmail({
            ...paymentRequest,
            status: 'rejected',
            rejected_at: new Date(),
            rejection_reason: rejectionReason
          });
          logger.info('Payment rejected email sent', { paymentRequestId });
        } catch (emailError) {
          logger.error('Failed to send payment email', {
            paymentRequestId,
            error: emailError.message
          });
        }
      });

      return {
        ...paymentRequest,
        status: 'rejected',
        rejected_at: new Date(),
        rejected_by: adminInfo.id,
        rejection_reason: rejectionReason
      };

    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to reject payment request', {
        paymentRequestId,
        error: error.message
      });

      throw error;

    } finally {
      client.release();
    }
  }
}

module.exports = new PaymentRequestService();
