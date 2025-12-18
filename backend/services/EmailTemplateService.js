const fs = require('fs').promises;
const path = require('path');

/**
 * EmailTemplateService - Template rendering service
 *
 * Features:
 * - Load HTML templates from files
 * - Replace variables with values
 * - Format currency và datetime cho Tiếng Việt
 * - Wrap content trong layout
 *
 * @class EmailTemplateService
 */
class EmailTemplateService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../templates/email');
    this.templateCache = new Map(); // Cache loaded templates
  }

  /**
   * Load template file từ disk (with caching)
   *
   * @private
   * @param {string} templatePath - Relative path from templates/email/
   * @returns {Promise<string>} Template content
   */
  async _loadTemplate(templatePath) {
    // Check cache first
    if (this.templateCache.has(templatePath)) {
      return this.templateCache.get(templatePath);
    }

    try {
      const fullPath = path.join(this.templatesPath, templatePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      // Cache the template
      this.templateCache.set(templatePath, content);

      return content;
    } catch (error) {
      console.error(`[EmailTemplateService] Failed to load template: ${templatePath}`, error.message);
      throw new Error(`Template not found: ${templatePath}`);
    }
  }

  /**
   * Replace variables in template
   *
   * Variables format: {{variableName}}
   *
   * @private
   * @param {string} template - Template content
   * @param {Object} variables - Variables object
   * @returns {string} Rendered content
   */
  _replaceVariables(template, variables) {
    let result = template;

    // Replace all {{variable}} with values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value !== undefined ? value : '');
    }

    // Remove any remaining unreplaced variables (show empty)
    result = result.replace(/{{[^}]+}}/g, '');

    return result;
  }

  /**
   * Render template with variables
   *
   * @param {string} templateName - Template name (e.g., 'reconciliation/finalized')
   * @param {Object} variables - Variables to replace
   * @returns {Promise<string>} Rendered HTML
   */
  async renderTemplate(templateName, variables = {}) {
    try {
      // Load template
      const templatePath = `${templateName}.html`;
      let content = await this._loadTemplate(templatePath);

      // Load layout
      const layout = await this._loadTemplate('base/layout.html');

      // Load components if needed
      const header = await this._loadTemplate('base/components/header.html');
      const footer = await this._loadTemplate('base/components/footer.html');

      // Replace variables in content
      content = this._replaceVariables(content, variables);

      // Replace variables in components
      const renderedHeader = this._replaceVariables(header, variables);
      const renderedFooter = this._replaceVariables(footer, variables);

      // Wrap content in layout
      let finalHtml = this._replaceVariables(layout, {
        ...variables,
        header: renderedHeader,
        content: content,
        footer: renderedFooter
      });

      return finalHtml;

    } catch (error) {
      console.error('[EmailTemplateService] Template rendering failed:', error.message);

      // Fallback to plain text
      return this._generatePlainTextFallback(templateName, variables);
    }
  }

  /**
   * Generate plain text fallback when template fails
   *
   * @private
   * @param {string} templateName - Template name
   * @param {Object} variables - Variables
   * @returns {string} Plain text HTML
   */
  _generatePlainTextFallback(templateName, variables) {
    const { subject, userName = 'Quý khách' } = variables;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${subject || 'Thông báo từ ChatChiu'}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
          <h2>${subject || 'Thông báo từ ChatChiu'}</h2>
          <p>Xin chào ${userName},</p>
          <p>Đây là email tự động từ hệ thống ChatChiu Cashback.</p>
          <p>Vui lòng đăng nhập vào tài khoản để xem chi tiết.</p>
          <br>
          <p>Trân trọng,<br>ChatChiu Team</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Format currency theo định dạng Tiếng Việt
   *
   * @param {number} amount - Amount to format
   * @returns {string} Formatted string (e.g., "1.000.000 ₫")
   */
  formatCurrency(amount) {
    if (!amount && amount !== 0) return '0 ₫';

    try {
      const formatted = new Intl.NumberFormat('vi-VN').format(amount);
      return `${formatted} ₫`;
    } catch (error) {
      return `${amount} ₫`;
    }
  }

  /**
   * Format datetime theo định dạng Tiếng Việt
   *
   * @param {Date|string} date - Date to format
   * @param {Object} options - Format options
   * @param {boolean} options.includeTime - Include time (default: true)
   * @returns {string} Formatted string
   */
  formatDateTime(date, options = {}) {
    const { includeTime = true } = options;

    if (!date) return 'N/A';

    try {
      const d = new Date(date);

      if (isNaN(d.getTime())) {
        return 'N/A';
      }

      const dateOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      };

      if (includeTime) {
        dateOptions.hour = '2-digit';
        dateOptions.minute = '2-digit';
      }

      return new Intl.DateTimeFormat('vi-VN', dateOptions).format(d);
    } catch (error) {
      return String(date);
    }
  }

  /**
   * Format date only (no time)
   *
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted string (e.g., "15/11/2025")
   */
  formatDate(date) {
    return this.formatDateTime(date, { includeTime: false });
  }

  /**
   * Mask bank account number
   *
   * @param {string} accountNumber - Account number to mask
   * @returns {string} Masked number (e.g., "****1234")
   */
  maskBankAccount(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) {
      return '****';
    }

    const lastFour = accountNumber.slice(-4);
    return `****${lastFour}`;
  }

  /**
   * Generate button HTML
   *
   * @param {string} text - Button text
   * @param {string} url - Button URL
   * @param {string} color - Button color (default: #667eea)
   * @returns {string} Button HTML
   */
  generateButton(text, url, color = '#667eea') {
    return `
      <table border="0" cellspacing="0" cellpadding="0" style="margin: 20px auto;">
        <tr>
          <td style="border-radius: 6px; background: ${color};">
            <a href="${url}" target="_blank" style="display: inline-block; padding: 15px 30px; font-size: 16px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
              ${text}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  /**
   * Generate info box HTML
   *
   * @param {string} content - Box content (HTML)
   * @param {string} borderColor - Border color (default: #667eea)
   * @param {string} bgColor - Background color (default: #f0f7ff)
   * @returns {string} Info box HTML
   */
  generateInfoBox(content, borderColor = '#667eea', bgColor = '#f0f7ff') {
    return `
      <div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; padding: 15px; margin: 20px 0; border-radius: 4px;">
        ${content}
      </div>
    `;
  }

  /**
   * Clear template cache (useful for development)
   */
  clearCache() {
    this.templateCache.clear();
    console.log('[EmailTemplateService] Template cache cleared');
  }

  /**
   * Preload commonly used templates (optimization)
   */
  async preloadTemplates() {
    const templates = [
      'base/layout.html',
      'base/components/header.html',
      'base/components/footer.html',
      'reconciliation/finalized.html',
      'payment/confirmed.html',
      'payment/rejected.html',
      'payment/paid.html'
    ];

    console.log('[EmailTemplateService] Preloading templates...');

    for (const template of templates) {
      try {
        await this._loadTemplate(template);
      } catch (error) {
        console.warn(`[EmailTemplateService] Failed to preload: ${template}`);
      }
    }

    console.log(`[EmailTemplateService] Preloaded ${this.templateCache.size} templates`);
  }
}

// Export singleton instance
module.exports = new EmailTemplateService();
