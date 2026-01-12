const EmailService = require('../EmailService');
const EmailTemplateService = require('../EmailTemplateService');
const SystemSettings = require('../systemSettings');
const emailConfig = require('../../config/email');
const { pool } = require('../../config/database');

/**
 * Reconciliation Email Helper
 *
 * Helper functions để gửi email cho reconciliation events
 * Tách riêng để tránh ảnh hưởng business logic
 *
 * Updated: 2026-01-04 - Migrate to database-based templates from SystemSettings
 */

/**
 * Send reconciliation finalized emails to all affected users
 *
 * @param {Object} params
 * @param {string} params.reconciliationId - Reconciliation ID
 * @param {string} params.periodLabel - Period label (e.g., "Tháng 11/2025")
 * @param {Array} params.userBalances - Array of user balances from reconciliation
 *   [{user_id, total_cashback, order_count, conversion_ids}, ...]
 *
 * @returns {Promise<Object>} { success: boolean, sent: number, failed: number }
 */
async function sendReconciliationFinalizedEmails({ reconciliationId, periodLabel, userBalances }) {
  try {
    console.log(`[ReconciliationEmailHelper] Preparing emails for ${userBalances.length} users`);

    // Prepare email data for each user
    const emailPromises = userBalances.map(async (userBalance) => {
      try {
        // Get user details
        const userQuery = 'SELECT id, email, full_name FROM users WHERE id = $1';
        const userResult = await pool.query(userQuery, [userBalance.user_id]);
        const user = userResult.rows[0];

        if (!user || !user.email) {
          console.warn(`[ReconciliationEmailHelper] User ${userBalance.user_id} has no email, skipping`);
          return { success: false, reason: 'no_email' };
        }

        // Get updated balance
        const balanceQuery = 'SELECT available_balance FROM user_system_balance WHERE user_id = $1';
        const balanceResult = await pool.query(balanceQuery, [userBalance.user_id]);
        const newBalance = balanceResult.rows[0]?.available_balance || 0;

        // Format data for template
        const cashbackAmount = parseFloat(userBalance.total_cashback);
        const orderCount = parseInt(userBalance.order_count);

        // Load template from SystemSettings (database-based)
        const subject = await SystemSettings.get('email_template_reconciliation_finalized_subject');
        let htmlContent = await SystemSettings.get('email_template_reconciliation_finalized_content');

        if (!subject || !htmlContent) {
          console.error('[ReconciliationEmailHelper] Template reconciliation_finalized not found in database');
          return { success: false, reason: 'template_not_found' };
        }

        // Prepare variables for replacement
        const variables = {
          userName: user.full_name || user.email,
          reconciliationId: reconciliationId,
          period: periodLabel,
          totalAmount: EmailTemplateService.formatCurrency(cashbackAmount),
          finalizedDate: EmailTemplateService.formatDate(new Date()),
          totalOrders: orderCount.toString(),
          totalPayments: '0' // TODO: Add actual payment count if needed
        };

        // Replace variables in subject and content
        let finalSubject = subject;
        let finalContent = htmlContent;

        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          finalSubject = finalSubject.replace(regex, value);
          finalContent = finalContent.replace(regex, value);
        }

        // Send email
        const result = await EmailService.sendEmail({
          to: user.email,
          subject: finalSubject,
          html: finalContent,
          context: {
            userId: user.id,
            emailType: emailConfig.EMAIL_TYPES.RECONCILIATION_FINALIZED,
            contextId: reconciliationId,
            contextType: 'reconciliation'
          }
        });

        return result;

      } catch (error) {
        console.error(`[ReconciliationEmailHelper] Failed to send email for user ${userBalance.user_id}:`, error.message);
        return { success: false, error: error.message };
      }
    });

    // Wait for all emails to be sent (or fail)
    const results = await Promise.all(emailPromises);

    // Count successes and failures
    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[ReconciliationEmailHelper] Email results: ${sent} sent, ${failed} failed`);

    return {
      success: true,
      sent,
      failed,
      total: userBalances.length
    };

  } catch (error) {
    console.error('[ReconciliationEmailHelper] Fatal error sending emails:', error);
    return {
      success: false,
      sent: 0,
      failed: userBalances.length,
      error: error.message
    };
  }
}

module.exports = {
  sendReconciliationFinalizedEmails
};
