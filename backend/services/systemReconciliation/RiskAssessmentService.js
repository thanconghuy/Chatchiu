/**
 * Risk Assessment Service
 *
 * Purpose: Calculate risk score for conversions in system reconciliation
 * Used to determine reserved amount for each order
 */

const pool = require('../../config/database');

// Risk assessment rules
const RISK_RULES = {
  // User-based risks
  NEW_USER_DAYS: 30,              // Account age < 30 days = risky
  HIGH_REJECTION_RATE: 0.2,       // User has > 20% rejection rate

  // Order-based risks
  HIGH_VALUE_THRESHOLD: 5000000,  // Order > 5M VND = risky
  QUICK_ORDER_SECONDS: 300,       // Order < 5min after click = suspicious

  // Pattern-based risks
  MULTIPLE_ORDERS_HOURS: 24,      // > 3 orders in 24h = suspicious
  SUSPICIOUS_MERCHANT_COUNT: 5,   // First N orders from new merchant

  // Score weights
  WEIGHTS: {
    NEW_USER: 20,
    HIGH_VALUE: 15,
    QUICK_ORDER: 30,
    HIGH_REJECTION: 25,
    MULTIPLE_ORDERS: 10,
    NEW_MERCHANT: 10
  }
};

class RiskAssessmentService {
  /**
   * Calculate risk score for a conversion
   *
   * @param {Object} params
   * @param {Object} params.conversion - Conversion data
   * @param {Date} params.userCreatedAt - User account creation date
   * @returns {number} Risk score (0-100)
   */
  static async calculateRiskScore({ conversion, userCreatedAt }) {
    let score = 0;
    const risks = [];

    try {
      // 1. Check if user is new (< 30 days)
      const accountAgeDays = this.getAccountAgeDays(userCreatedAt);
      if (accountAgeDays < RISK_RULES.NEW_USER_DAYS) {
        score += RISK_RULES.WEIGHTS.NEW_USER;
        risks.push(`Tài khoản mới (${accountAgeDays} ngày)`);
      }

      // 2. Check if order value is high
      const orderValue = parseFloat(conversion.order_value || 0);
      if (orderValue > RISK_RULES.HIGH_VALUE_THRESHOLD) {
        score += RISK_RULES.WEIGHTS.HIGH_VALUE;
        risks.push(`Đơn hàng giá trị cao (${this.formatMoney(orderValue)})`);
      }

      // 3. Check user's historical rejection rate
      const rejectionRate = await this.getUserRejectionRate(conversion.user_id);
      if (rejectionRate > RISK_RULES.HIGH_REJECTION_RATE) {
        score += RISK_RULES.WEIGHTS.HIGH_REJECTION;
        risks.push(`Tỷ lệ reject cao (${(rejectionRate * 100).toFixed(1)}%)`);
      }

      // 4. Check for multiple orders in short time
      const recentOrdersCount = await this.getRecentOrdersCount(
        conversion.user_id,
        conversion.order_time,
        RISK_RULES.MULTIPLE_ORDERS_HOURS
      );

      if (recentOrdersCount >= 3) {
        score += RISK_RULES.WEIGHTS.MULTIPLE_ORDERS;
        risks.push(`${recentOrdersCount} đơn trong 24h`);
      }

      // 5. Check if merchant is new for user
      const merchantOrderCount = await this.getUserMerchantOrderCount(
        conversion.user_id,
        conversion.merchant_id
      );

      if (merchantOrderCount <= RISK_RULES.SUSPICIOUS_MERCHANT_COUNT) {
        score += RISK_RULES.WEIGHTS.NEW_MERCHANT;
        risks.push(`Merchant mới (${merchantOrderCount} đơn)`);
      }

      // Cap score at 100
      score = Math.min(score, 100);

      return score;

    } catch (error) {
      console.error('Error calculating risk score:', error);
      // Return safe score on error
      return 50;
    }
  }

  /**
   * Get account age in days
   */
  static getAccountAgeDays(createdAt) {
    if (!createdAt) return 0;

    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Get user's historical rejection rate
   */
  static async getUserRejectionRate(userId) {
    const query = `
      SELECT
        COUNT(CASE WHEN status = 'rejected' THEN 1 END)::DECIMAL /
        NULLIF(COUNT(*), 0)::DECIMAL as rejection_rate
      FROM conversions
      WHERE user_id = $1
        AND status IN ('approved', 'rejected')
    `;

    const result = await pool.query(query, [userId]);
    return parseFloat(result.rows[0]?.rejection_rate || 0);
  }

  /**
   * Get count of recent orders within hours
   */
  static async getRecentOrdersCount(userId, orderTime, hours) {
    const query = `
      SELECT COUNT(*) as count
      FROM conversions
      WHERE user_id = $1
        AND order_time >= $2::timestamp - INTERVAL '${hours} hours'
        AND order_time <= $2::timestamp
    `;

    const result = await pool.query(query, [userId, orderTime]);
    return parseInt(result.rows[0]?.count || 0);
  }

  /**
   * Get user's order count for specific merchant
   */
  static async getUserMerchantOrderCount(userId, merchantId) {
    const query = `
      SELECT COUNT(*) as count
      FROM conversions
      WHERE user_id = $1
        AND merchant_id = $2
        AND status != 'rejected'
    `;

    const result = await pool.query(query, [userId, merchantId]);
    return parseInt(result.rows[0]?.count || 0);
  }

  /**
   * Format money for display
   */
  static formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Get risk level label from score
   */
  static getRiskLevel(score) {
    if (score >= 70) return 'Rủi ro cao';
    if (score >= 50) return 'Rủi ro trung bình';
    if (score >= 30) return 'Rủi ro thấp';
    return 'An toàn';
  }

  /**
   * Bulk assess risk for multiple conversions
   */
  static async assessBulk(conversions) {
    const results = [];

    for (const conversion of conversions) {
      const score = await this.calculateRiskScore({
        conversion,
        userCreatedAt: conversion.user_created_at
      });

      results.push({
        conversion_id: conversion.id || conversion.conversion_id,
        risk_score: score,
        risk_level: this.getRiskLevel(score),
        is_high_risk: score >= 50
      });
    }

    return results;
  }
}

module.exports = RiskAssessmentService;
