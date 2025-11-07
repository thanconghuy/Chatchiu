const { pool } = require('../config/database');

/**
 * SystemConversion Model
 * Fast lookup table for conversions that are matched with clicks
 * This is the "real" conversions that users see in Conversions Management
 */

class SystemConversion {
  /**
   * Create a system conversion record
   * This is called when a conversion is matched with a click
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const {
      atConversionId,
      userId,
      clickId,
      merchantId,
      merchantName,
      orderCode,
      orderAmount,
      commission,
      cashbackAmount,
      status,
      orderTime,
      approvalTime
    } = data;

    const query = `
      INSERT INTO system_conversions (
        at_conversion_id, user_id, click_id, merchant_id, merchant_name,
        order_code, order_amount, commission, cashback_amount,
        status, order_time, approval_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (at_conversion_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        click_id = EXCLUDED.click_id,
        merchant_id = EXCLUDED.merchant_id,
        merchant_name = EXCLUDED.merchant_name,
        order_code = EXCLUDED.order_code,
        order_amount = EXCLUDED.order_amount,
        commission = EXCLUDED.commission,
        cashback_amount = EXCLUDED.cashback_amount,
        status = EXCLUDED.status,
        order_time = EXCLUDED.order_time,
        approval_time = EXCLUDED.approval_time,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      atConversionId,
      userId,
      clickId,
      merchantId,
      merchantName,
      orderCode,
      orderAmount,
      commission,
      cashbackAmount,
      status,
      orderTime,
      approvalTime
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Create system conversion from AT conversion
   * @param {Object} conversion - Conversion object from conversions table
   * @returns {Promise<Object>}
   */
  static async createFromATConversion(conversion) {
    if (!conversion.click_id || !conversion.user_id) {
      throw new Error('Cannot create system conversion without click_id and user_id');
    }

    return this.create({
      atConversionId: conversion.id,
      userId: conversion.user_id,
      clickId: conversion.click_id,
      merchantId: conversion.merchant_id,
      merchantName: conversion.merchant_name,
      orderCode: conversion.order_code,
      orderAmount: conversion.order_amount,
      commission: conversion.commission,
      cashbackAmount: conversion.cashback_amount,
      status: conversion.status,
      orderTime: conversion.order_time,
      approvalTime: conversion.approval_time
    });
  }

  /**
   * Get system conversions for a user
   * @param {string} userId
   * @param {Object} options - Filter options
   * @returns {Promise<Array>}
   */
  static async getUserConversions(userId, options = {}) {
    const {
      status = null,
      limit = 50,
      offset = 0
    } = options;

    let query = `
      SELECT
        sc.*,
        m.logo_url as merchant_logo
      FROM system_conversions sc
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      WHERE sc.user_id = $1
    `;

    const values = [userId];

    if (status) {
      query += ` AND sc.status = $2`;
      values.push(status);
    }

    query += ` ORDER BY sc.matched_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get all system conversions with filters (for admin)
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - { conversions, total }
   */
  static async getAll(options = {}) {
    const {
      status = null,
      userId = null,
      limit = 50,
      offset = 0
    } = options;

    let query = `
      SELECT
        sc.*,
        u.email as user_email,
        u.username as user_username,
        u.full_name as user_full_name,
        m.logo_url as merchant_logo
      FROM system_conversions sc
      INNER JOIN users u ON sc.user_id = u.id
      LEFT JOIN merchants m ON sc.merchant_id = m.id
      WHERE 1=1
    `;

    const values = [];

    if (status) {
      values.push(status);
      query += ` AND sc.status = $${values.length}`;
    }

    if (userId) {
      values.push(userId);
      query += ` AND sc.user_id = $${values.length}`;
    }

    query += ` ORDER BY sc.matched_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM system_conversions sc
      WHERE 1=1
    `;

    const countValues = [];

    if (status) {
      countValues.push(status);
      countQuery += ` AND sc.status = $${countValues.length}`;
    }

    if (userId) {
      countValues.push(userId);
      countQuery += ` AND sc.user_id = $${countValues.length}`;
    }

    const countResult = await pool.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].total);

    return {
      conversions: result.rows,
      total
    };
  }

  /**
   * Update status of a system conversion
   * @param {string} id - System conversion ID or AT conversion ID
   * @param {string} status
   * @param {Date} approvalTime
   * @returns {Promise<Object>}
   */
  static async updateStatus(id, status, approvalTime = null) {
    const query = `
      UPDATE system_conversions
      SET status = $1,
          approval_time = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [status, approvalTime, id]);
    return result.rows[0];
  }

  /**
   * Update status by AT conversion ID
   * @param {string} atConversionId - Conversion ID from conversions table
   * @param {string} status
   * @param {Date} approvalTime
   * @returns {Promise<Object|null>}
   */
  static async updateStatusByATConversionId(atConversionId, status, approvalTime = null) {
    const query = `
      UPDATE system_conversions
      SET status = $1,
          approval_time = $2,
          updated_at = NOW()
      WHERE at_conversion_id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [status, approvalTime, atConversionId]);
    return result.rows[0] || null;
  }

  /**
   * Delete a system conversion
   * This happens when a conversion is unmatched from a click
   * @param {string} atConversionId
   * @returns {Promise<void>}
   */
  static async deleteByATConversionId(atConversionId) {
    const query = 'DELETE FROM system_conversions WHERE at_conversion_id = $1';
    await pool.query(query, [atConversionId]);
  }

  /**
   * Get user statistics from system conversions
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async getUserStats(userId) {
    const query = `
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_conversions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_conversions,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_conversions,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as total_pending_cashback,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN order_amount ELSE 0 END), 0) as total_approved_order_value,
        COALESCE(SUM(order_amount), 0) as total_order_value
      FROM system_conversions
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Check if system conversion exists for AT conversion
   * @param {string} atConversionId
   * @returns {Promise<boolean>}
   */
  static async existsByATConversionId(atConversionId) {
    const query = 'SELECT id FROM system_conversions WHERE at_conversion_id = $1';
    const result = await pool.query(query, [atConversionId]);
    return result.rows.length > 0;
  }
}

module.exports = SystemConversion;
