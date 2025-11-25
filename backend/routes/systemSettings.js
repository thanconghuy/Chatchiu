const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/adminAuth');
const SystemSettingsService = require('../services/systemSettingsService');
const logger = require('../utils/logger');

/**
 * GET /api/system-settings
 * Get all system settings grouped by category
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const settings = await SystemSettingsService.getAllSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Get all settings failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải cấu hình hệ thống'
    });
  }
});

/**
 * GET /api/system-settings/category/:category
 * Get settings by category
 */
router.get('/category/:category', authenticateAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await SystemSettingsService.getSettingsByCategory(category);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Get settings by category failed', {
      category: req.params.category,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Không thể tải cấu hình'
    });
  }
});

/**
 * GET /api/system-settings/:key
 * Get a single setting by key
 */
router.get('/:key', authenticateAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const value = await SystemSettingsService.getSetting(key);

    if (value === null) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cấu hình'
      });
    }

    res.json({
      success: true,
      data: { key, value }
    });
  } catch (error) {
    logger.error('Get setting failed', {
      key: req.params.key,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Không thể tải cấu hình'
    });
  }
});

/**
 * PUT /api/system-settings/:key
 * Update a setting value
 */
router.put('/:key', authenticateAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, reason } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu giá trị cấu hình'
      });
    }

    await SystemSettingsService.updateSetting(
      key,
      value,
      req.user.id,
      reason
    );

    res.json({
      success: true,
      message: 'Cập nhật cấu hình thành công'
    });
  } catch (error) {
    logger.error('Update setting failed', {
      key: req.params.key,
      value: req.body.value,
      error: error.message
    });

    // Check for specific error messages
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cấu hình'
      });
    }

    if (error.message.includes('not editable')) {
      return res.status(403).json({
        success: false,
        message: 'Cấu hình này không thể chỉnh sửa'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật cấu hình'
    });
  }
});

/**
 * GET /api/system-settings/:key/audit
 * Get audit log for a setting
 */
router.get('/:key/audit', authenticateAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const auditLog = await SystemSettingsService.getAuditLog(key, limit);

    res.json({
      success: true,
      data: auditLog
    });
  } catch (error) {
    logger.error('Get audit log failed', {
      key: req.params.key,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Không thể tải lịch sử thay đổi'
    });
  }
});

/**
 * GET /api/system-settings/payment/settings
 * Get payment-related settings (convenience endpoint)
 */
router.get('/payment/settings', authenticateAdmin, async (req, res) => {
  try {
    const settings = await SystemSettingsService.getPaymentSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Get payment settings failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Không thể tải cấu hình thanh toán'
    });
  }
});

module.exports = router;
