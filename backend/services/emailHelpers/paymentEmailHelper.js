const EmailService = require('../EmailService');
const EmailTemplateService = require('../EmailTemplateService');
const SystemSettings = require('../systemSettings');
const emailConfig = require('../../config/email');

/**
 * Payment Email Helper
 *
 * Helper functions để gửi email cho payment request events
 * Tách riêng để tránh ảnh hưởng business logic
 *
 * Updated: 2026-01-04 - Migrate to database-based templates from SystemSettings
 */

/**
 * Send payment confirmed email
 *
 * @param {Object} paymentRequest - Payment request data from PaymentRequest.findById()
 * @returns {Promise<Object>} { success: boolean }
 */
async function sendPaymentConfirmedEmail(paymentRequest) {
  try {
    if (!paymentRequest.user_email) {
      console.warn(`[PaymentEmailHelper] Payment request ${paymentRequest.id} has no user email`);
      return { success: false, reason: 'no_email' };
    }

    // Load template from SystemSettings (database-based)
    const subject = await SystemSettings.get('email_template_payment_confirmed_subject');
    let htmlContent = await SystemSettings.get('email_template_payment_confirmed_content');

    if (!subject || !htmlContent) {
      console.error('[PaymentEmailHelper] Template payment_confirmed not found in database');
      return { success: false, reason: 'template_not_found' };
    }

    // Prepare variables for replacement
    const variables = {
      userName: paymentRequest.user_name || paymentRequest.user_email,
      paymentId: paymentRequest.id,
      amount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
      bankAccount: `${paymentRequest.bank_name} - ${EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number)}`,
      approvedDate: EmailTemplateService.formatDateTime(paymentRequest.confirmed_at)
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
      to: paymentRequest.user_email,
      subject: finalSubject,
      html: finalContent,
      context: {
        userId: paymentRequest.user_id,
        emailType: emailConfig.EMAIL_TYPES.PAYMENT_CONFIRMED,
        contextId: paymentRequest.id,
        contextType: 'payment_request'
      }
    });

    return result;

  } catch (error) {
    console.error('[PaymentEmailHelper] Failed to send confirmed email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment rejected email
 *
 * @param {Object} paymentRequest - Payment request data from PaymentRequest.findById()
 * @returns {Promise<Object>} { success: boolean }
 */
async function sendPaymentRejectedEmail(paymentRequest) {
  try {
    if (!paymentRequest.user_email) {
      console.warn(`[PaymentEmailHelper] Payment request ${paymentRequest.id} has no user email`);
      return { success: false, reason: 'no_email' };
    }

    // Load template from SystemSettings (database-based)
    const subject = await SystemSettings.get('email_template_payment_rejected_subject');
    let htmlContent = await SystemSettings.get('email_template_payment_rejected_content');

    if (!subject || !htmlContent) {
      console.error('[PaymentEmailHelper] Template payment_rejected not found in database');
      return { success: false, reason: 'template_not_found' };
    }

    // Prepare variables for replacement
    const variables = {
      userName: paymentRequest.user_name || paymentRequest.user_email,
      paymentId: paymentRequest.id,
      amount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
      bankAccount: `${paymentRequest.bank_name} - ${EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number)}`,
      reason: paymentRequest.admin_notes || 'Không có lý do cụ thể'
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
      to: paymentRequest.user_email,
      subject: finalSubject,
      html: finalContent,
      context: {
        userId: paymentRequest.user_id,
        emailType: emailConfig.EMAIL_TYPES.PAYMENT_REJECTED,
        contextId: paymentRequest.id,
        contextType: 'payment_request'
      }
    });

    return result;

  } catch (error) {
    console.error('[PaymentEmailHelper] Failed to send rejected email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment paid email
 *
 * @param {Object} paymentRequest - Payment request data from PaymentRequest.findById()
 * @returns {Promise<Object>} { success: boolean }
 */
async function sendPaymentPaidEmail(paymentRequest) {
  try {
    if (!paymentRequest.user_email) {
      console.warn(`[PaymentEmailHelper] Payment request ${paymentRequest.id} has no user email`);
      return { success: false, reason: 'no_email' };
    }

    // Load template from SystemSettings (database-based)
    const subject = await SystemSettings.get('email_template_payment_paid_subject');
    let htmlContent = await SystemSettings.get('email_template_payment_paid_content');

    if (!subject || !htmlContent) {
      console.error('[PaymentEmailHelper] Template payment_paid not found in database');
      return { success: false, reason: 'template_not_found' };
    }

    // Prepare variables for replacement
    const variables = {
      userName: paymentRequest.user_name || paymentRequest.user_email,
      paymentId: paymentRequest.id,
      amount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
      bankAccount: `${paymentRequest.bank_name} - ${EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number)}`,
      paidDate: EmailTemplateService.formatDateTime(paymentRequest.paid_at),
      transactionId: paymentRequest.transaction_reference || 'N/A'
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
      to: paymentRequest.user_email,
      subject: finalSubject,
      html: finalContent,
      context: {
        userId: paymentRequest.user_id,
        emailType: emailConfig.EMAIL_TYPES.PAYMENT_PAID,
        contextId: paymentRequest.id,
        contextType: 'payment_request'
      }
    });

    return result;

  } catch (error) {
    console.error('[PaymentEmailHelper] Failed to send paid email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment request created notification to admin
 *
 * @param {Object} paymentRequest - Payment request data with user info
 * @param {Object} userBalance - User balance data { availableBalance, totalBalance, totalWithdrawn }
 * @param {Object} stats - User payment stats { pendingCount, totalCount }
 * @returns {Promise<Object>} { success: boolean }
 */
async function sendPaymentRequestCreatedAdminEmail(paymentRequest, userBalance = {}, stats = {}) {
  try {
    // Get admin email from system settings
    const adminEmail = await SystemSettings.get('admin_notification_email');

    if (!adminEmail) {
      console.warn('[PaymentEmailHelper] Admin notification email not configured in system settings');
      return { success: false, reason: 'no_admin_email' };
    }

    // Load template from SystemSettings (database-based)
    const subject = await SystemSettings.get('email_template_payment_request_created_admin_subject');
    let htmlContent = await SystemSettings.get('email_template_payment_request_created_admin_content');

    if (!subject || !htmlContent) {
      console.error('[PaymentEmailHelper] Template payment_request_created_admin not found in database');
      return { success: false, reason: 'template_not_found' };
    }

    // Prepare variables for replacement
    const variables = {
      userName: paymentRequest.user_name || paymentRequest.user_email,
      userEmail: paymentRequest.user_email,
      userId: paymentRequest.user_id,
      requestId: paymentRequest.id,
      requestedAmount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
      availableBalance: EmailTemplateService.formatCurrency(userBalance.availableBalance || 0),
      totalBalance: EmailTemplateService.formatCurrency(userBalance.totalBalance || 0),
      totalWithdrawn: EmailTemplateService.formatCurrency(userBalance.totalWithdrawn || 0),
      bankName: paymentRequest.bank_name,
      bankAccountNumber: paymentRequest.bank_account_number, // Don't mask for admin
      bankAccountName: paymentRequest.bank_account_name,
      bankBranch: paymentRequest.bank_branch || '',
      notes: paymentRequest.notes || '',
      createdAt: EmailTemplateService.formatDateTime(paymentRequest.created_at),
      pendingRequestsCount: stats.pendingCount || 0,
      totalRequestsCount: stats.totalCount || 0,
      adminPanelUrl: emailConfig.ADMIN_PANEL_URL,
      userProfileUrl: typeof emailConfig.ADMIN_USER_PROFILE_URL === 'function'
        ? emailConfig.ADMIN_USER_PROFILE_URL(paymentRequest.user_id)
        : `${emailConfig.FRONTEND_URL}/admin/users/${paymentRequest.user_id}`
    };

    // Replace variables in subject and content
    let finalSubject = subject;
    let finalContent = htmlContent;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      finalSubject = finalSubject.replace(regex, value || '');
      finalContent = finalContent.replace(regex, value || '');
    }

    // Send email to admin
    const result = await EmailService.sendEmail({
      to: adminEmail,
      subject: finalSubject,
      html: finalContent,
      context: {
        userId: paymentRequest.user_id,
        emailType: emailConfig.EMAIL_TYPES.PAYMENT_REQUEST_CREATED_ADMIN,
        contextId: paymentRequest.id,
        contextType: 'payment_request'
      }
    });

    return result;

  } catch (error) {
    console.error('[PaymentEmailHelper] Failed to send admin notification email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment cancelled email to user
 *
 * @param {Object} paymentRequest - Payment request data
 * @param {Number} currentBalance - User's current available balance after cancellation
 * @returns {Promise<Object>} { success: boolean }
 */
async function sendPaymentCancelledEmail(paymentRequest, currentBalance) {
  try {
    if (!paymentRequest.user_email) {
      console.warn(`[PaymentEmailHelper] Payment request ${paymentRequest.id} has no user email`);
      return { success: false, reason: 'no_email' };
    }

    // Load template from SystemSettings (database-based)
    const subject = await SystemSettings.get('email_template_payment_cancelled_subject');
    let htmlContent = await SystemSettings.get('email_template_payment_cancelled_content');

    if (!subject || !htmlContent) {
      console.error('[PaymentEmailHelper] Template payment_cancelled not found in database');
      return { success: false, reason: 'template_not_found' };
    }

    // Prepare variables for replacement
    const variables = {
      userName: paymentRequest.user_name || paymentRequest.user_email,
      requestId: paymentRequest.id,
      requestedAmount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
      bankName: paymentRequest.bank_name,
      bankAccountNumber: EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number),
      cancelledAt: EmailTemplateService.formatDateTime(paymentRequest.updated_at || new Date()),
      currentBalance: EmailTemplateService.formatCurrency(currentBalance),
      cancellationReason: paymentRequest.cancellation_reason || '',
      createNewRequestUrl: emailConfig.CREATE_PAYMENT_URL,
      paymentHistoryUrl: emailConfig.PAYMENT_HISTORY_URL,
      supportUrl: emailConfig.SUPPORT_URL
    };

    // Replace variables in subject and content
    let finalSubject = subject;
    let finalContent = htmlContent;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      finalSubject = finalSubject.replace(regex, value || '');
      finalContent = finalContent.replace(regex, value || '');
    }

    // Send email
    const result = await EmailService.sendEmail({
      to: paymentRequest.user_email,
      subject: finalSubject,
      html: finalContent,
      context: {
        userId: paymentRequest.user_id,
        emailType: emailConfig.EMAIL_TYPES.PAYMENT_CANCELLED,
        contextId: paymentRequest.id,
        contextType: 'payment_request'
      }
    });

    return result;

  } catch (error) {
    console.error('[PaymentEmailHelper] Failed to send cancelled email:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPaymentConfirmedEmail,
  sendPaymentRejectedEmail,
  sendPaymentPaidEmail,
  sendPaymentRequestCreatedAdminEmail, // NEW
  sendPaymentCancelledEmail // NEW
};
