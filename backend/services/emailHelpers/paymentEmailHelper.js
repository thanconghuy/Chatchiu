const EmailService = require('../EmailService');
const EmailTemplateService = require('../EmailTemplateService');
const emailConfig = require('../../config/email');

/**
 * Payment Email Helper
 *
 * Helper functions để gửi email cho payment request events
 * Tách riêng để tránh ảnh hưởng business logic
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

    // Render email template
    const html = await EmailTemplateService.renderTemplate(
      emailConfig.TEMPLATES.PAYMENT_CONFIRMED,
      {
        // Header
        headerTitle: `${emailConfig.ICONS.CHECKMARK} Yêu Cầu Đã Xác Nhận`,
        headerSubtitle: 'Chúng tôi đang xử lý yêu cầu rút tiền của bạn',

        // User info
        userName: paymentRequest.user_name || paymentRequest.user_email,

        // Payment info
        requestId: paymentRequest.id,
        requestedAmount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
        bankName: paymentRequest.bank_name,
        bankAccountNumber: EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number),
        confirmedAt: EmailTemplateService.formatDateTime(paymentRequest.confirmed_at),
        adminNotes: paymentRequest.admin_notes || '',

        // URLs
        frontendUrl: emailConfig.FRONTEND_URL,
        dashboardUrl: emailConfig.DASHBOARD_URL,
        paymentHistoryUrl: emailConfig.PAYMENT_HISTORY_URL,
        supportUrl: emailConfig.SUPPORT_URL,
        notificationSettingsUrl: emailConfig.NOTIFICATION_SETTINGS_URL,
        copyrightYear: emailConfig.COPYRIGHT_YEAR,

        // Subject (for layout)
        subject: emailConfig.SUBJECTS.PAYMENT_CONFIRMED(EmailTemplateService.formatCurrency(paymentRequest.requested_amount))
      }
    );

    // Send email
    const result = await EmailService.sendEmail({
      to: paymentRequest.user_email,
      subject: emailConfig.SUBJECTS.PAYMENT_CONFIRMED(EmailTemplateService.formatCurrency(paymentRequest.requested_amount)),
      html: html,
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

    // Render email template
    const html = await EmailTemplateService.renderTemplate(
      emailConfig.TEMPLATES.PAYMENT_REJECTED,
      {
        // Header
        headerTitle: `${emailConfig.ICONS.WARNING} Yêu Cầu Bị Từ Chối`,
        headerSubtitle: 'Vui lòng kiểm tra thông tin và thử lại',

        // User info
        userName: paymentRequest.user_name || paymentRequest.user_email,

        // Payment info
        requestId: paymentRequest.id,
        requestedAmount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
        bankName: paymentRequest.bank_name,
        bankAccountNumber: EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number),
        rejectedAt: EmailTemplateService.formatDateTime(paymentRequest.rejected_at),
        rejectionReason: paymentRequest.admin_notes || 'Không có lý do cụ thể',

        // URLs
        frontendUrl: emailConfig.FRONTEND_URL,
        dashboardUrl: emailConfig.DASHBOARD_URL,
        createPaymentUrl: emailConfig.CREATE_PAYMENT_URL,
        supportUrl: emailConfig.SUPPORT_URL,
        notificationSettingsUrl: emailConfig.NOTIFICATION_SETTINGS_URL,
        copyrightYear: emailConfig.COPYRIGHT_YEAR,

        // Subject (for layout)
        subject: emailConfig.SUBJECTS.PAYMENT_REJECTED(EmailTemplateService.formatCurrency(paymentRequest.requested_amount))
      }
    );

    // Send email
    const result = await EmailService.sendEmail({
      to: paymentRequest.user_email,
      subject: emailConfig.SUBJECTS.PAYMENT_REJECTED(EmailTemplateService.formatCurrency(paymentRequest.requested_amount)),
      html: html,
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

    // Render email template
    const html = await EmailTemplateService.renderTemplate(
      emailConfig.TEMPLATES.PAYMENT_PAID,
      {
        // Header
        headerTitle: `${emailConfig.ICONS.CELEBRATION} Đã Chuyển Tiền Thành Công!`,
        headerSubtitle: 'Vui lòng kiểm tra tài khoản ngân hàng của bạn',

        // User info
        userName: paymentRequest.user_name || paymentRequest.user_email,

        // Payment info
        requestId: paymentRequest.id,
        requestedAmount: EmailTemplateService.formatCurrency(paymentRequest.requested_amount),
        bankName: paymentRequest.bank_name,
        bankAccountNumber: EmailTemplateService.maskBankAccount(paymentRequest.bank_account_number),
        transactionReference: paymentRequest.transaction_reference || 'N/A',
        paidAt: EmailTemplateService.formatDateTime(paymentRequest.paid_at),
        adminNotes: paymentRequest.admin_notes || '',

        // URLs
        frontendUrl: emailConfig.FRONTEND_URL,
        dashboardUrl: emailConfig.DASHBOARD_URL,
        paymentHistoryUrl: emailConfig.PAYMENT_HISTORY_URL,
        supportUrl: emailConfig.SUPPORT_URL,
        notificationSettingsUrl: emailConfig.NOTIFICATION_SETTINGS_URL,
        copyrightYear: emailConfig.COPYRIGHT_YEAR,

        // Subject (for layout)
        subject: emailConfig.SUBJECTS.PAYMENT_PAID(EmailTemplateService.formatCurrency(paymentRequest.requested_amount))
      }
    );

    // Send email
    const result = await EmailService.sendEmail({
      to: paymentRequest.user_email,
      subject: emailConfig.SUBJECTS.PAYMENT_PAID(EmailTemplateService.formatCurrency(paymentRequest.requested_amount)),
      html: html,
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

module.exports = {
  sendPaymentConfirmedEmail,
  sendPaymentRejectedEmail,
  sendPaymentPaidEmail
};
