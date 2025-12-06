const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const escapeHtml = require('../utils/escapeHtml');
const emailQueue = require('./emailQueue');

/**
 * Email Service
 * Centralized email sending service using nodemailer
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize SMTP transporter
   * Returns true if SMTP is configured and working
   */
  async initialize() {
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn('[EmailService] SMTP not configured - emails will not be sent');
      this.initialized = false;
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      logger.info('[EmailService] SMTP initialized successfully');
      return true;
    } catch (error) {
      logger.error('[EmailService] SMTP initialization failed:', error.message);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Send email (queued - non-blocking)
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content (optional)
   * @param {boolean} options.immediate - If true, send immediately without queueing (default: false)
   * @returns {Promise<boolean>} True if queued/sent successfully
   */
  async sendEmail({ to, subject, html, text, immediate = false }) {
    // Initialize if not already done
    if (!this.initialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        logger.warn('[EmailService] Cannot send email - SMTP not configured');
        return false;
      }
    }

    const emailFn = async () => {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'ChatChiu Cashback <noreply@chatchiu.com>',
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      });
    };

    // If immediate send is requested, execute directly
    if (immediate) {
      try {
        await emailFn();
        logger.info('[EmailService] Email sent immediately', { to, subject });
        return true;
      } catch (error) {
        logger.error('[EmailService] Failed to send email immediately:', {
          to,
          subject,
          error: error.message
        });
        return false;
      }
    }

    // Otherwise, queue the email (default behavior)
    try {
      emailQueue.enqueue(emailFn, {
        type: 'email',
        to,
        subject
      });
      logger.info('[EmailService] Email queued for sending', { to, subject });
      return true;
    } catch (error) {
      logger.error('[EmailService] Failed to queue email:', {
        to,
        subject,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send admin notification email
   * @param {Object} options
   * @param {string} options.subject - Email subject
   * @param {string} options.message - Email message (plain text or HTML)
   * @param {Object} options.data - Additional data to display
   */
  async sendAdminNotification({ subject, message, data = {} }) {
    // Get admin email from environment or use system admin
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

    if (!adminEmail) {
      logger.warn('[EmailService] No admin email configured');
      return false;
    }

    const html = this.formatAdminNotification(subject, message, data);

    return await this.sendEmail({
      to: adminEmail,
      subject: `[ChatChiu Admin] ${subject}`,
      html
    });
  }

  /**
   * Format admin notification HTML
   */
  formatAdminNotification(subject, message, data) {
    // Escape HTML in user-controlled content
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);

    const dataRows = Object.keys(data).length > 0
      ? `
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          ${Object.entries(data).map(([key, value]) => `
            <p style="margin: 5px 0;">
              <strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}
            </p>
          `).join('')}
        </div>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          .message { background: white; padding: 15px; border-radius: 5px; white-space: pre-wrap; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 ${safeSubject}</h1>
          </div>
          <div class="content">
            <div class="message">${safeMessage}</div>
            ${dataRows}
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated notification from ChatChiu Cashback System.
            </p>
          </div>
          <div class="footer">
            <p>© 2025 ChatChiu Cashback. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Strip HTML tags for plain text fallback
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Check if email service is ready
   */
  isReady() {
    return this.initialized;
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
