const nodemailer = require('nodemailer');
const pool = require('../config/database');

/**
 * EmailService - Core email sending service
 *
 * Features:
 * - SMTP connection với nodemailer
 * - Fallback to console logging trong dev mode
 * - Email audit logging vào database
 * - Error handling không block business logic
 *
 * @class EmailService
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.smtpConfigured = false;
    this.isInitialized = false;
  }

  /**
   * Load SMTP config from database (priority) or environment variables (fallback)
   * @private
   */
  async _loadConfig() {
    try {
      const SystemSettings = require('./systemSettings');
      const encryption = require('../utils/encryption');

      // Try to load from database first (production priority)
      const host = await SystemSettings.get('smtp_host', '');
      const port = await SystemSettings.get('smtp_port', '');
      const user = await SystemSettings.get('smtp_user', '');
      const passwordEncrypted = await SystemSettings.get('smtp_password_encrypted', '');
      const from = await SystemSettings.get('smtp_from', '');

      // If database has config, use it
      if (host && user && passwordEncrypted) {
        const password = encryption.decrypt(passwordEncrypted);

        console.log('[EmailService] Using SMTP config from database');
        return {
          host,
          port: parseInt(port) || 587,
          user,
          pass: password,
          from: from || process.env.SMTP_FROM || 'ChatChiu Cashback <noreply@chatchiu.com>'
        };
      }

      // Fallback to environment variables
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log('[EmailService] Using SMTP config from environment variables');
        return {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          from: process.env.SMTP_FROM || 'ChatChiu Cashback <noreply@chatchiu.com>'
        };
      }

      // No config found
      return null;

    } catch (error) {
      console.error('[EmailService] Error loading config:', error.message);

      // Fallback to env vars if database fails
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log('[EmailService] Fallback to environment variables due to database error');
        return {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          from: process.env.SMTP_FROM || 'ChatChiu Cashback <noreply@chatchiu.com>'
        };
      }

      return null;
    }
  }

  /**
   * Initialize SMTP transporter (lazy initialization)
   * @private
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load config from database or env
      const config = await this._loadConfig();

      if (!config) {
        console.warn('[EmailService] SMTP not configured. Emails will be logged to console.');
        this.smtpConfigured = false;
        this.isInitialized = true;
        return;
      }

      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465, // true for 465, false for other ports
        auth: {
          user: config.user,
          pass: config.pass
        },
        pool: true, // Use pooled connections
        maxConnections: 5,
        maxMessages: 100
      });

      // Store 'from' address for use in sendEmail
      this.smtpFrom = config.from;

      // Verify connection
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified successfully');
      this.smtpConfigured = true;
      this.isInitialized = true;

    } catch (error) {
      console.error('[EmailService] Failed to initialize SMTP:', error.message);
      this.smtpConfigured = false;
      this.isInitialized = true;
    }
  }

  /**
   * Reinitialize SMTP transporter with new config (e.g., after admin updates settings)
   * @public
   */
  async reinitialize() {
    console.log('[EmailService] Reinitializing SMTP transporter...');

    // Close existing connections
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }

    // Reset state
    this.isInitialized = false;
    this.smtpConfigured = false;

    // Re-initialize with new config
    await this.initialize();

    console.log('[EmailService] Reinitialization complete');
  }

  /**
   * Send single email
   *
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {Object} options.context - Context for logging (optional)
   * @param {string} options.context.userId - User ID
   * @param {string} options.context.emailType - Email type (reconciliation_finalized, payment_confirmed, etc.)
   * @param {string} options.context.contextId - Reconciliation ID or Payment Request ID
   * @param {string} options.context.contextType - 'reconciliation' or 'payment_request'
   *
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  async sendEmail({ to, subject, html, context = {} }) {
    // Initialize if needed
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const { userId, emailType, contextId, contextType } = context;

    try {
      // Validate inputs
      if (!to || !subject || !html) {
        throw new Error('Missing required fields: to, subject, html');
      }

      // Dev mode: Log to console
      if (!this.smtpConfigured) {
        console.log('\n========== EMAIL (DEV MODE) ==========');
        console.log('To:', to);
        console.log('Subject:', subject);
        console.log('Type:', emailType || 'N/A');
        console.log('HTML Length:', html.length, 'characters');
        console.log('=====================================\n');

        // Log to database
        await this._logEmail({
          userId,
          emailTo: to,
          emailType,
          subject,
          status: 'skipped',
          errorMessage: 'SMTP not configured - development mode',
          contextId,
          contextType
        });

        return { success: true, mode: 'dev' };
      }

      // Production mode: Send via SMTP
      const mailOptions = {
        from: this.smtpFrom || process.env.SMTP_FROM || 'ChatChiu <noreply@chatchiu.com>',
        to,
        subject,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      const duration = Date.now() - startTime;

      console.log(`[EmailService] Email sent successfully to ${to} (${duration}ms)`);

      // Log success to database
      await this._logEmail({
        userId,
        emailTo: to,
        emailType,
        subject,
        status: 'sent',
        contextId,
        contextType
      });

      return { success: true, messageId: info.messageId };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[EmailService] Failed to send email to ${to} (${duration}ms):`, error.message);

      // Log failure to database
      await this._logEmail({
        userId,
        emailTo: to,
        emailType,
        subject,
        status: 'failed',
        errorMessage: error.message,
        contextId,
        contextType
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk emails (for reconciliation finalized - multiple users)
   *
   * @param {Array<Object>} emails - Array of email options (same format as sendEmail)
   * @returns {Promise<Object>} { total: number, sent: number, failed: number, errors: Array }
   */
  async sendBulkEmails(emails) {
    console.log(`[EmailService] Sending bulk emails: ${emails.length} total`);

    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    // Send emails in parallel (but don't await - fire and forget)
    const promises = emails.map(async (emailOptions, index) => {
      try {
        const result = await this.sendEmail(emailOptions);

        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push({
            index,
            email: emailOptions.to,
            error: result.error
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          index,
          email: emailOptions.to,
          error: error.message
        });
      }
    });

    // Wait for all emails to complete
    await Promise.all(promises);

    console.log(`[EmailService] Bulk send complete: ${results.sent} sent, ${results.failed} failed`);

    return results;
  }

  /**
   * Log email to database for audit trail
   *
   * @private
   * @param {Object} data - Log data
   */
  async _logEmail(data) {
    try {
      const {
        userId,
        emailTo,
        emailType,
        subject,
        status,
        errorMessage = null,
        contextId = null,
        contextType = null
      } = data;

      await pool.query(`
        INSERT INTO email_logs (
          user_id,
          email_to,
          email_type,
          subject,
          status,
          error_message,
          context_id,
          context_type,
          sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        userId || null,
        emailTo,
        emailType || 'unknown',
        subject,
        status,
        errorMessage,
        contextId || null,
        contextType || null
      ]);
    } catch (error) {
      // Don't throw - logging failure should not break email sending
      console.error('[EmailService] Failed to log email to database:', error.message);
    }
  }

  /**
   * Get email statistics from logs
   *
   * @param {Object} filters - Filters (optional)
   * @param {string} filters.emailType - Filter by email type
   * @param {number} filters.days - Number of days to look back (default: 7)
   *
   * @returns {Promise<Array>} Statistics
   */
  async getEmailStats(filters = {}) {
    const { emailType, days = 7 } = filters;

    try {
      let query = `
        SELECT
          email_type,
          status,
          COUNT(*) as count,
          DATE(sent_at) as date
        FROM email_logs
        WHERE sent_at >= NOW() - INTERVAL '${days} days'
      `;

      const params = [];
      if (emailType) {
        query += ` AND email_type = $1`;
        params.push(emailType);
      }

      query += ` GROUP BY email_type, status, DATE(sent_at) ORDER BY date DESC, email_type`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[EmailService] Failed to get stats:', error.message);
      return [];
    }
  }

  /**
   * Get recent failed emails
   *
   * @param {number} hours - Hours to look back (default: 24)
   * @returns {Promise<Array>} Failed emails
   */
  async getFailedEmails(hours = 24) {
    try {
      const result = await pool.query(`
        SELECT *
        FROM email_logs
        WHERE status = 'failed'
          AND sent_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY sent_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('[EmailService] Failed to get failed emails:', error.message);
      return [];
    }
  }

  /**
   * Close SMTP connection (cleanup)
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      console.log('[EmailService] SMTP connection closed');
    }
  }

  /**
   * Load and render HTML email template
   *
   * @param {string} templateName - Template file name (without .html extension)
   * @param {Object} context - Variables to replace in template
   * @returns {Promise<string>} Rendered HTML
   */
  async loadTemplate(templateName, context = {}) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      // Load template file
      const templatePath = path.join(__dirname, 'emailTemplates', `${templateName}.html`);
      let html = await fs.readFile(templatePath, 'utf8');

      // Replace placeholders with context values
      // {{variableName}} -> context.variableName
      Object.keys(context).forEach(key => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(placeholder, context[key] || '');
      });

      return html;

    } catch (error) {
      console.error(`[EmailService] Failed to load template "${templateName}":`, error.message);
      throw new Error(`Template not found: ${templateName}`);
    }
  }

  /**
   * Send email using template
   *
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.template - Template name
   * @param {Object} options.context - Template variables + logging context
   * @returns {Promise<Object>}
   */
  async sendEmailWithTemplate({ to, subject, template, context = {} }) {
    // Load and render template
    const html = await this.loadTemplate(template, context);

    // Send email using existing method
    return this.sendEmail({
      to,
      subject,
      html,
      context: {
        userId: context.userId,
        emailType: template,
        contextId: context.contextId,
        contextType: context.contextType
      }
    });
  }
}

// Export singleton instance
module.exports = new EmailService();
