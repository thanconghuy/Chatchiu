/**
 * Payment Account Routes
 * Handles user payment account management for cashback payouts
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const PaymentAccount = require('../models/PaymentAccount');

/**
 * GET /api/user/payment-accounts
 * Get all payment accounts for logged-in user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const accounts = await PaymentAccount.findByUserId(req.userId);

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Get payment accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment accounts'
    });
  }
});

/**
 * GET /api/user/payment-accounts/default
 * Get default payment account for logged-in user
 */
router.get('/default', authenticateToken, async (req, res) => {
  try {
    const account = await PaymentAccount.getDefault(req.userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'No default payment account found'
      });
    }

    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    console.error('Get default payment account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get default payment account'
    });
  }
});

/**
 * GET /api/user/payment-accounts/:id/decrypt
 * Get payment account with decrypted data (for creating payment requests)
 */
router.get('/:id/decrypt', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔓 [PaymentAccount] Decrypt request:', { id, userId: req.userId });

    const account = await PaymentAccount.getWithDecryption(parseInt(id), req.userId);

    if (!account) {
      console.log('❌ [PaymentAccount] Account not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Payment account not found'
      });
    }

    console.log('✅ [PaymentAccount] Decrypted account:', {
      id: account.id,
      hasDecryptedName: !!account.account_holder_name_decrypted,
      hasDecryptedNumber: !!account.account_number_decrypted,
      maskedName: account.account_holder_name,
      maskedNumber: account.account_number
    });

    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    console.error('❌ [PaymentAccount] Get decrypted payment account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment account'
    });
  }
});

/**
 * POST /api/user/payment-accounts
 * Create a new payment account
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      accountType,
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      isDefault
    } = req.body;

    console.log('Creating payment account:', {
      accountType,
      accountHolderName: accountHolderName ? '***' : undefined,
      accountNumber: accountNumber ? '***' : undefined,
      bankName,
      userId: req.userId
    });

    // Validation
    if (!accountType || !accountHolderName || !accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account type, holder name, and account number are required'
      });
    }

    // Validate account type
    const validTypes = ['bank', 'momo', 'zalopay', 'other'];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account type. Must be: bank, momo, zalopay, or other'
      });
    }

    // Bank account requires bank name
    if (accountType === 'bank' && !bankName) {
      return res.status(400).json({
        success: false,
        message: 'Bank name is required for bank account'
      });
    }

    // Check if user already has 5+ accounts (limit)
    const accountCount = await PaymentAccount.count(req.userId);
    if (accountCount >= 5) {
      return res.status(400).json({
        success: false,
        message: 'You can only have up to 5 payment accounts'
      });
    }

    const account = await PaymentAccount.create({
      userId: req.userId,
      accountType,
      accountHolderName,
      accountNumber,
      bankName: bankName || null,
      bankBranch: bankBranch || null,
      isDefault: isDefault || false,
      notes: null  // Always null - field removed from UI
    });

    console.log('Payment account created successfully:', { accountId: account.id });

    res.status(201).json({
      success: true,
      message: 'Payment account created successfully',
      data: account
    });
  } catch (error) {
    console.error('Create payment account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment account'
    });
  }
});

/**
 * PUT /api/user/payment-accounts/:id
 * Update a payment account
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      notes
    } = req.body;

    // Check if account exists and belongs to user
    const existingAccount = await PaymentAccount.findById(id, req.userId);
    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: 'Payment account not found'
      });
    }

    const account = await PaymentAccount.update(id, req.userId, {
      accountHolderName,
      accountNumber,
      bankName,
      bankBranch,
      notes
    });

    res.json({
      success: true,
      message: 'Payment account updated successfully',
      data: account
    });
  } catch (error) {
    console.error('Update payment account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment account'
    });
  }
});

/**
 * PUT /api/user/payment-accounts/:id/set-default
 * Set a payment account as default
 */
router.put('/:id/set-default', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if account exists and belongs to user
    const existingAccount = await PaymentAccount.findById(id, req.userId);
    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: 'Payment account not found'
      });
    }

    const account = await PaymentAccount.setAsDefault(id, req.userId);

    res.json({
      success: true,
      message: 'Default payment account updated successfully',
      data: account
    });
  } catch (error) {
    console.error('Set default payment account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default payment account'
    });
  }
});

/**
 * DELETE /api/user/payment-accounts/:id
 * Delete a payment account
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if account exists and belongs to user
    const existingAccount = await PaymentAccount.findById(id, req.userId);
    if (!existingAccount) {
      return res.status(404).json({
        success: false,
        message: 'Payment account not found'
      });
    }

    // Prevent deleting if it's the default and user has other accounts
    if (existingAccount.is_default) {
      const accountCount = await PaymentAccount.count(req.userId);
      if (accountCount > 1) {
        return res.status(400).json({
          success: false,
          message: 'Please set another account as default before deleting this one'
        });
      }
    }

    const deleted = await PaymentAccount.delete(id, req.userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Payment account not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment account deleted successfully'
    });
  } catch (error) {
    console.error('Delete payment account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment account'
    });
  }
});

module.exports = router;
