/**
 * Payment Request Service Wrapper
 *
 * Provides feature flag based routing between original and optimized service
 * Allows gradual rollout and A/B testing
 */

const featureFlags = require('../utils/featureFlags');
const logger = require('../utils/logger');

// Import both services
const PaymentRequestService = require('../services/paymentRequestService');
const {
  PaymentRequestServiceOptimized,
  PaymentValidationError,
  PaymentProcessingError
} = require('../services/paymentRequestService.optimized');

class PaymentRequestServiceWrapper {

  /**
   * Get the appropriate service based on feature flags
   */
  static _getService(userId = null) {
    const useOptimized = featureFlags.shouldUseOptimizedPaymentService(userId);

    if (useOptimized) {
      logger.info('Using optimized payment service', { userId });
      return PaymentRequestServiceOptimized;
    } else {
      logger.info('Using original payment service', { userId });
      return PaymentRequestService;
    }
  }

  /**
   * Create payment request
   */
  static async createPaymentRequest(data) {
    const service = this._getService(data.userId);

    try {
      return await service.createPaymentRequest(data);
    } catch (error) {
      // Log which service threw the error
      logger.error('Payment request creation failed', {
        service: service === PaymentRequestServiceOptimized ? 'optimized' : 'original',
        error: error.message,
        userId: data.userId
      });

      throw error;
    }
  }

  /**
   * Get payment requests for user
   */
  static async getPaymentRequestsForUser(userId, filters = {}) {
    const service = this._getService(userId);
    return await service.getPaymentRequestsForUser(userId, filters);
  }

  /**
   * Get payment request details
   */
  static async getPaymentRequestDetails(paymentRequestId, userId) {
    const service = this._getService(userId);

    // Handle different method names between services
    if (service === PaymentRequestServiceOptimized) {
      return await service.getPaymentRequestDetails(paymentRequestId, userId);
    } else {
      // Original service uses different method
      return await service.getPaymentRequestById(paymentRequestId, userId);
    }
  }

  /**
   * Get admin payment requests
   */
  static async getAdminPaymentRequests(filters = {}) {
    // For admin queries, always use optimized version if enabled
    const service = this._getService();

    if (service === PaymentRequestServiceOptimized) {
      return await service.getAdminPaymentRequests(filters);
    } else {
      return await service.getAdminPaymentList(filters);
    }
  }

  /**
   * Get setting (only available in optimized service)
   */
  static async getSetting(key, defaultValue = null) {
    if (featureFlags.isEnabled('useOptimizedPaymentService')) {
      return await PaymentRequestServiceOptimized.getSetting(key, defaultValue);
    } else {
      // Fallback to direct DB query
      const { pool } = require('../config/database');
      const result = await pool.query(
        'SELECT value FROM system_settings WHERE key = $1',
        [key]
      );
      return result.rows[0]?.value || defaultValue;
    }
  }

  /**
   * Invalidate settings cache (only for optimized service)
   */
  static invalidateSettingsCache(key = null) {
    if (featureFlags.isEnabled('useOptimizedPaymentService')) {
      PaymentRequestServiceOptimized.invalidateSettingsCache(key);
    }
  }

  /**
   * Check eligibility (delegates to original service method)
   */
  static async checkEligibility(userId) {
    return await PaymentRequestService.checkEligibility(userId);
  }

  /**
   * Confirm payment request
   */
  static async confirmPaymentRequest(paymentRequestId, adminId, notes = null) {
    return await PaymentRequestService.confirmPaymentRequest(paymentRequestId, adminId, notes);
  }

  /**
   * Reject payment request
   */
  static async rejectPaymentRequest(paymentRequestId, adminId, reason) {
    return await PaymentRequestService.rejectPaymentRequest(paymentRequestId, adminId, reason);
  }

  /**
   * Mark as paid
   */
  static async markAsPaid(paymentRequestId, adminId, transactionReference, paymentAccountId, notes = null) {
    return await PaymentRequestService.markAsPaid(
      paymentRequestId,
      adminId,
      transactionReference,
      paymentAccountId,
      notes
    );
  }

  /**
   * Cancel payment request
   */
  static async cancelPaymentRequest(paymentRequestId, userId) {
    return await PaymentRequestService.cancelPaymentRequest(paymentRequestId, userId);
  }

  /**
   * Resubmit payment request
   */
  static async resubmitPaymentRequest(paymentRequestId, userId) {
    return await PaymentRequestService.resubmitPaymentRequest(paymentRequestId, userId);
  }

  /**
   * Get payment request by ID
   */
  static async getPaymentRequestById(paymentRequestId) {
    return await PaymentRequestService.getPaymentRequestById(paymentRequestId);
  }

  /**
   * Get statistics
   */
  static async getStatistics() {
    return await PaymentRequestService.getStatistics();
  }
}

// Export wrapper and error classes
module.exports = {
  PaymentRequestServiceWrapper,
  PaymentValidationError,
  PaymentProcessingError
};
