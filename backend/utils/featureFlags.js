/**
 * Feature Flags Utility
 *
 * Manages feature flags for gradual rollout and A/B testing
 */

class FeatureFlags {
  constructor() {
    this.flags = {
      useOptimizedPaymentService: process.env.USE_OPTIMIZED_PAYMENT_SERVICE === 'true',
      optimizedServiceRolloutPercentage: parseInt(process.env.OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE || '100', 10)
    };
  }

  /**
   * Check if optimized payment service should be used
   * Supports percentage-based rollout
   */
  shouldUseOptimizedPaymentService(userId = null) {
    if (!this.flags.useOptimizedPaymentService) {
      return false;
    }

    // If 100% rollout, always use optimized version
    if (this.flags.optimizedServiceRolloutPercentage >= 100) {
      return true;
    }

    // If no userId provided, use random rollout
    if (!userId) {
      return Math.random() * 100 < this.flags.optimizedServiceRolloutPercentage;
    }

    // Deterministic rollout based on userId hash
    // This ensures same user always gets same experience
    const hash = this._hashCode(userId.toString());
    const bucket = Math.abs(hash) % 100;

    return bucket < this.flags.optimizedServiceRolloutPercentage;
  }

  /**
   * Simple hash function for deterministic rollout
   */
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Get all feature flags
   */
  getAllFlags() {
    return { ...this.flags };
  }

  /**
   * Check specific flag
   */
  isEnabled(flagName) {
    return this.flags[flagName] === true;
  }

  /**
   * Reload flags from environment (useful after config changes)
   */
  reload() {
    this.flags.useOptimizedPaymentService = process.env.USE_OPTIMIZED_PAYMENT_SERVICE === 'true';
    this.flags.optimizedServiceRolloutPercentage = parseInt(
      process.env.OPTIMIZED_SERVICE_ROLLOUT_PERCENTAGE || '100',
      10
    );
  }
}

// Export singleton instance
const featureFlags = new FeatureFlags();

module.exports = featureFlags;
