/**
 * Test Suite for Optimized Payment Request Service
 *
 * Tests cover:
 * - Atomic payment creation
 * - Validation error handling
 * - Settings cache
 * - Query optimization
 * - Error recovery
 */

const {
  PaymentRequestServiceOptimized,
  PaymentValidationError,
  PaymentProcessingError,
  settingsCache
} = require('../services/paymentRequestService.optimized');
const { pool } = require('../config/database');

describe('PaymentRequestServiceOptimized', () => {

  let testUserId;
  let testUserEmail = `test_${Date.now()}@example.com`;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [testUserEmail, `testuser_${Date.now()}`, 'hashedpassword', 'Test User']
    );
    testUserId = userResult.rows[0].id;

    // Create test system reconciliation items for user
    await createTestReconciliationItems(testUserId);
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM payment_requests WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM system_reconciliation_items WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(() => {
    // Clear cache before each test
    settingsCache.invalidate();
  });

  describe('createPaymentRequest - Atomic Transaction', () => {

    test('should create payment request in single atomic transaction', async () => {
      const requestData = {
        userId: testUserId,
        requestedAmount: 100000,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        bankBranch: 'HCM',
        notes: 'Test payment request'
      };

      const result = await PaymentRequestServiceOptimized.createPaymentRequest(requestData);

      expect(result).toBeDefined();
      expect(result.paymentRequest).toBeDefined();
      expect(result.paymentRequest.status).toBe('pending');
      expect(result.selectedItems).toBeDefined();
      expect(result.selectedItems.length).toBeGreaterThan(0);
      expect(result.totalAmount).toBeGreaterThanOrEqual(requestData.requestedAmount);

      // Verify items are linked
      const linkedItems = await pool.query(
        'SELECT * FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1',
        [result.paymentRequest.id]
      );

      expect(linkedItems.rows.length).toBe(result.selectedItems.length);
    });

    test('should rollback transaction on validation failure', async () => {
      const requestData = {
        userId: testUserId,
        requestedAmount: 999999999, // Amount too high
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      await expect(
        PaymentRequestServiceOptimized.createPaymentRequest(requestData)
      ).rejects.toThrow(PaymentValidationError);

      // Verify no payment request was created
      const requests = await pool.query(
        'SELECT * FROM payment_requests WHERE user_id = $1 AND requested_amount = $2',
        [testUserId, requestData.requestedAmount]
      );

      expect(requests.rows.length).toBe(0);
    });

    test('should handle insufficient balance gracefully', async () => {
      const requestData = {
        userId: testUserId,
        requestedAmount: 50000000, // 50M VND - more than available
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      try {
        await PaymentRequestServiceOptimized.createPaymentRequest(requestData);
        fail('Should have thrown PaymentValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentValidationError);
        expect(error.code).toBe('INSUFFICIENT_BALANCE');
        expect(error.details).toBeDefined();
        expect(error.details.availableBalance).toBeDefined();
      }
    });

    test('should prevent duplicate pending requests', async () => {
      // Create first request
      const requestData = {
        userId: testUserId,
        requestedAmount: 100000,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      const firstRequest = await PaymentRequestServiceOptimized.createPaymentRequest(requestData);
      expect(firstRequest.paymentRequest).toBeDefined();

      // Try to create second request (should fail)
      try {
        await PaymentRequestServiceOptimized.createPaymentRequest(requestData);
        fail('Should have thrown PaymentValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentValidationError);
        expect(error.code).toBe('HAS_PENDING_REQUEST');
      }

      // Cleanup
      await pool.query('UPDATE payment_requests SET status = $1 WHERE id = $2',
        ['cancelled', firstRequest.paymentRequest.id]);
    });
  });

  describe('Settings Cache', () => {

    test('should cache settings on first access', async () => {
      const key = 'min_withdrawal_amount';

      // First call - should hit database
      const value1 = await PaymentRequestServiceOptimized.getSetting(key, 50000);
      expect(value1).toBeDefined();

      // Second call - should hit cache
      const value2 = await PaymentRequestServiceOptimized.getSetting(key, 50000);
      expect(value2).toBe(value1);
    });

    test('should invalidate cache when requested', async () => {
      const key = 'min_withdrawal_amount';

      const value1 = await PaymentRequestServiceOptimized.getSetting(key, 50000);

      // Invalidate cache
      PaymentRequestServiceOptimized.invalidateSettingsCache(key);

      // Should fetch from database again
      const value2 = await PaymentRequestServiceOptimized.getSetting(key, 50000);
      expect(value2).toBeDefined();
    });

    test('should return default value if setting not found', async () => {
      const value = await PaymentRequestServiceOptimized.getSetting('non_existent_key', 12345);
      expect(value).toBe(12345);
    });
  });

  describe('Optimized List Queries', () => {

    test('should fetch user payment requests with single query', async () => {
      // Create test payment request first
      const requestData = {
        userId: testUserId,
        requestedAmount: 100000,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      await PaymentRequestServiceOptimized.createPaymentRequest(requestData);

      // Fetch list
      const requests = await PaymentRequestServiceOptimized.getPaymentRequestsForUser(testUserId);

      expect(requests).toBeDefined();
      expect(Array.isArray(requests)).toBe(true);
      expect(requests.length).toBeGreaterThan(0);

      // Check aggregated fields are included
      expect(requests[0].items_count).toBeDefined();
      expect(requests[0].total_from_items).toBeDefined();
    });

    test('should filter by status', async () => {
      const requests = await PaymentRequestServiceOptimized.getPaymentRequestsForUser(
        testUserId,
        { status: 'pending' }
      );

      expect(requests).toBeDefined();
      requests.forEach(req => {
        expect(req.status).toBe('pending');
      });
    });

    test('should support pagination', async () => {
      const page1 = await PaymentRequestServiceOptimized.getPaymentRequestsForUser(
        testUserId,
        { limit: 1, offset: 0 }
      );

      const page2 = await PaymentRequestServiceOptimized.getPaymentRequestsForUser(
        testUserId,
        { limit: 1, offset: 1 }
      );

      expect(page1.length).toBeLessThanOrEqual(1);
      expect(page2.length).toBeLessThanOrEqual(1);

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id);
      }
    });
  });

  describe('Payment Request Details', () => {

    test('should fetch payment details with all related data in single query', async () => {
      // Create payment request
      const requestData = {
        userId: testUserId,
        requestedAmount: 100000,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      const created = await PaymentRequestServiceOptimized.createPaymentRequest(requestData);

      // Fetch details
      const details = await PaymentRequestServiceOptimized.getPaymentRequestDetails(
        created.paymentRequest.id,
        testUserId
      );

      expect(details).toBeDefined();
      expect(details.id).toBe(created.paymentRequest.id);
      expect(details.username).toBeDefined();
      expect(details.email).toBeDefined();
      expect(details.items).toBeDefined();
      expect(details.items_count).toBe(created.selectedItems.length);
    });

    test('should return null for non-existent payment request', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const details = await PaymentRequestServiceOptimized.getPaymentRequestDetails(
        fakeId,
        testUserId
      );

      expect(details).toBeNull();
    });
  });

  describe('Error Handling', () => {

    test('should throw PaymentValidationError with correct structure', async () => {
      const requestData = {
        userId: testUserId,
        requestedAmount: 10000, // Below minimum
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      try {
        await PaymentRequestServiceOptimized.createPaymentRequest(requestData);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentValidationError);
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.details).toBeDefined();
        expect(error.statusCode).toBe(400);
      }
    });

    test('should log validation attempts to audit log', async () => {
      const requestData = {
        userId: testUserId,
        requestedAmount: 999999999,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User'
      };

      try {
        await PaymentRequestServiceOptimized.createPaymentRequest(requestData);
      } catch (error) {
        // Expected to fail
      }

      // Check audit log
      const auditLogs = await pool.query(
        'SELECT * FROM payment_validation_audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [testUserId]
      );

      expect(auditLogs.rows.length).toBeGreaterThan(0);
      expect(auditLogs.rows[0].validation_passed).toBe(false);
      expect(auditLogs.rows[0].error_code).toBeDefined();
    });
  });

  describe('Admin List Queries', () => {

    test('should fetch admin payment list with user info', async () => {
      const requests = await PaymentRequestServiceOptimized.getAdminPaymentRequests({
        limit: 10
      });

      expect(requests).toBeDefined();
      expect(Array.isArray(requests)).toBe(true);

      if (requests.length > 0) {
        expect(requests[0].user_name).toBeDefined();
        expect(requests[0].user_email).toBeDefined();
        expect(requests[0].items_count).toBeDefined();
      }
    });

    test('should filter admin list by user', async () => {
      const requests = await PaymentRequestServiceOptimized.getAdminPaymentRequests({
        userId: testUserId
      });

      expect(requests).toBeDefined();
      requests.forEach(req => {
        expect(req.user_id).toBe(testUserId);
      });
    });

    test('should filter by date range', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const requests = await PaymentRequestServiceOptimized.getAdminPaymentRequests({
        fromDate: yesterday.toISOString(),
        toDate: today.toISOString()
      });

      expect(requests).toBeDefined();
      expect(Array.isArray(requests)).toBe(true);
    });
  });
});

// Helper function to create test reconciliation items
async function createTestReconciliationItems(userId) {
  // Create test system reconciliation period
  const reconciliationResult = await pool.query(
    `INSERT INTO system_reconciliations (period_label, period_start, period_end, status)
     VALUES ($1, $2, $3, 'finalized')
     RETURNING id`,
    ['Test Period', new Date(), new Date(), ]
  );

  const reconciliationId = reconciliationResult.rows[0].id;

  // Create test items
  const items = [
    { amount: 50000, merchant: 'Shopee' },
    { amount: 75000, merchant: 'Lazada' },
    { amount: 100000, merchant: 'Tiki' },
    { amount: 125000, merchant: 'Sendo' }
  ];

  for (const item of items) {
    // Create conversion first
    const conversionResult = await pool.query(
      `INSERT INTO system_conversions (
        user_id, merchant_name, order_code, order_time,
        cashback_amount, payment_status
      ) VALUES ($1, $2, $3, $4, $5, 'finalized')
      RETURNING conversion_id`,
      [userId, item.merchant, `ORDER_${Date.now()}`, new Date(), item.amount]
    );

    const conversionId = conversionResult.rows[0].conversion_id;

    // Create reconciliation item
    await pool.query(
      `INSERT INTO system_reconciliation_items (
        system_reconciliation_id, user_id, conversion_id,
        cashback_amount, merchant_name, order_time,
        payment_status, linked_to_payment_request
      ) VALUES ($1, $2, $3, $4, $5, $6, 'finalized', false)`,
      [reconciliationId, userId, conversionId, item.amount, item.merchant, new Date()]
    );
  }
}

module.exports = {
  createTestReconciliationItems
};
