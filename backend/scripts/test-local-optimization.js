/**
 * Local Testing Script for Payment Optimization
 *
 * Tests both original and optimized services side-by-side
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const { pool } = require('../config/database');
const PaymentRequestService = require('../services/paymentRequestService');
const {
  PaymentRequestServiceOptimized,
  PaymentValidationError
} = require('../services/paymentRequestService.optimized');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  test: (msg) => console.log(`${colors.cyan}[TEST]${colors.reset} ${msg}`)
};

class LocalTester {
  constructor() {
    this.testUserId = null;
    this.results = {
      original: [],
      optimized: [],
      comparison: {}
    };
  }

  async setup() {
    log.info('Setting up test environment...');

    // Get test user
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = 'testuser1@example.com' LIMIT 1"
    );

    if (userResult.rows.length === 0) {
      log.error('Test user not found. Run setup-test-db.sh first!');
      process.exit(1);
    }

    this.testUserId = userResult.rows[0].id;
    log.success(`Test user ID: ${this.testUserId}`);

    // Create test reconciliation items
    await this.createTestData();
  }

  async createTestData() {
    log.info('Creating test reconciliation data...');

    // Create system reconciliation
    const reconResult = await pool.query(`
      INSERT INTO system_reconciliations (period_label, period_start, period_end, status)
      VALUES ('Test Period', NOW() - INTERVAL '30 days', NOW(), 'finalized')
      RETURNING id
    `);

    const reconId = reconResult.rows[0].id;

    // Create test conversions and items
    const amounts = [50000, 75000, 100000, 125000, 150000];
    const merchants = ['Shopee', 'Lazada', 'Tiki', 'Sendo', 'Shopee'];

    for (let i = 0; i < amounts.length; i++) {
      // Create conversion
      const conversionResult = await pool.query(`
        INSERT INTO system_conversions (
          user_id, merchant_name, order_code, order_time,
          cashback_amount, payment_status
        ) VALUES ($1, $2, $3, NOW() - INTERVAL '${i} days', $4, 'finalized')
        RETURNING conversion_id
      `, [this.testUserId, merchants[i], `TEST_ORDER_${Date.now()}_${i}`, amounts[i]]);

      const conversionId = conversionResult.rows[0].conversion_id;

      // Create reconciliation item
      await pool.query(`
        INSERT INTO system_reconciliation_items (
          system_reconciliation_id, user_id, conversion_id,
          cashback_amount, merchant_name, order_time,
          payment_status, linked_to_payment_request
        ) VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${i} days', 'finalized', false)
      `, [reconId, this.testUserId, conversionId, amounts[i], merchants[i]]);
    }

    log.success(`Created ${amounts.length} test reconciliation items`);
  }

  async cleanup() {
    log.info('Cleaning up test data...');

    await pool.query('DELETE FROM payment_system_reconciliation_mapping WHERE user_id = $1', [this.testUserId]);
    await pool.query('DELETE FROM payment_requests WHERE user_id = $1', [this.testUserId]);
    await pool.query('DELETE FROM system_reconciliation_items WHERE user_id = $1', [this.testUserId]);
    await pool.query('DELETE FROM system_conversions WHERE user_id = $1', [this.testUserId]);

    log.success('Cleanup complete');
  }

  async testOriginalService() {
    log.test('Testing ORIGINAL service...');

    const startTime = Date.now();

    try {
      // Test eligibility check
      const eligibility = await PaymentRequestService.checkEligibility(this.testUserId);
      log.info(`Available balance: ${eligibility.availableBalance.toLocaleString('vi-VN')} VND`);

      // Test payment creation
      const result = await PaymentRequestService.createPaymentRequest({
        userId: this.testUserId,
        requestedAmount: 200000,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        bankBranch: 'HCM'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.original.push({
        test: 'create_payment',
        duration,
        success: true,
        paymentId: result.id
      });

      log.success(`Original service - Payment created in ${duration}ms`);
      return result;

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.original.push({
        test: 'create_payment',
        duration,
        success: false,
        error: error.message
      });

      log.error(`Original service failed: ${error.message}`);
      throw error;
    }
  }

  async testOptimizedService() {
    log.test('Testing OPTIMIZED service...');

    const startTime = Date.now();

    try {
      // Test payment creation (includes validation)
      const result = await PaymentRequestServiceOptimized.createPaymentRequest({
        userId: this.testUserId,
        requestedAmount: 200000,
        bankName: 'Vietcombank',
        bankAccountNumber: '0987654321',
        bankAccountName: 'Test User',
        bankBranch: 'HCM'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.optimized.push({
        test: 'create_payment',
        duration,
        success: true,
        paymentId: result.paymentRequest.id,
        itemsCount: result.itemsCount,
        totalAmount: result.totalAmount
      });

      log.success(`Optimized service - Payment created in ${duration}ms`);
      log.info(`  Items linked: ${result.itemsCount}`);
      log.info(`  Total amount: ${result.totalAmount.toLocaleString('vi-VN')} VND`);

      return result;

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.optimized.push({
        test: 'create_payment',
        duration,
        success: false,
        error: error.message,
        errorCode: error.code
      });

      log.error(`Optimized service failed: ${error.message}`);
      throw error;
    }
  }

  async testValidationErrors() {
    log.test('Testing validation error handling...');

    const testCases = [
      {
        name: 'Amount too low',
        data: { requestedAmount: 1000 },
        expectedError: 'BELOW_MIN_AMOUNT'
      },
      {
        name: 'Amount too high',
        data: { requestedAmount: 999999999 },
        expectedError: 'ABOVE_MAX_AMOUNT'
      },
      {
        name: 'Insufficient balance',
        data: { requestedAmount: 50000000 },
        expectedError: 'INSUFFICIENT_BALANCE'
      }
    ];

    for (const testCase of testCases) {
      try {
        await PaymentRequestServiceOptimized.createPaymentRequest({
          userId: this.testUserId,
          bankName: 'Vietcombank',
          bankAccountNumber: '1111111111',
          bankAccountName: 'Test User',
          ...testCase.data
        });

        log.error(`${testCase.name} - Should have thrown error!`);

      } catch (error) {
        if (error instanceof PaymentValidationError) {
          if (error.code === testCase.expectedError) {
            log.success(`${testCase.name} - Correct error: ${error.code}`);
          } else {
            log.warning(`${testCase.name} - Wrong error code: ${error.code} (expected: ${testCase.expectedError})`);
          }
        } else {
          log.error(`${testCase.name} - Unexpected error type: ${error.constructor.name}`);
        }
      }
    }
  }

  async testQueryPerformance() {
    log.test('Testing query performance...');

    // Test user payment list
    const tests = [
      {
        name: 'Get user payment list',
        fn: async () => {
          return await PaymentRequestServiceOptimized.getPaymentRequestsForUser(
            this.testUserId,
            { limit: 20 }
          );
        }
      },
      {
        name: 'Get payment details',
        fn: async () => {
          const list = await PaymentRequestServiceOptimized.getPaymentRequestsForUser(
            this.testUserId,
            { limit: 1 }
          );
          if (list.length > 0) {
            return await PaymentRequestServiceOptimized.getPaymentRequestDetails(
              list[0].id,
              this.testUserId
            );
          }
        }
      },
      {
        name: 'Settings cache test',
        fn: async () => {
          // First call - hits DB
          const start1 = Date.now();
          await PaymentRequestServiceOptimized.getSetting('min_withdrawal_amount', 50000);
          const time1 = Date.now() - start1;

          // Second call - hits cache
          const start2 = Date.now();
          await PaymentRequestServiceOptimized.getSetting('min_withdrawal_amount', 50000);
          const time2 = Date.now() - start2;

          log.info(`  First call (DB): ${time1}ms`);
          log.info(`  Second call (cache): ${time2}ms`);
          log.success(`  Cache speedup: ${Math.round(time1/time2)}x faster`);
        }
      }
    ];

    for (const test of tests) {
      const start = Date.now();
      await test.fn();
      const duration = Date.now() - start;
      log.success(`${test.name} - ${duration}ms`);
    }
  }

  async checkDatabaseIndexes() {
    log.test('Checking database indexes...');

    const result = await pool.query(`
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_payment%'
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      log.warning('No payment indexes found! Run optimize-payment-indexes.sql first.');
    } else {
      log.success(`Found ${result.rows.length} payment indexes:`);
      result.rows.forEach(row => {
        log.info(`  ${row.indexname} (${row.size})`);
      });
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    // Original service results
    console.log('\n📊 Original Service:');
    this.results.original.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(`  ${status} ${r.test}: ${r.duration}ms`);
    });

    // Optimized service results
    console.log('\n⚡ Optimized Service:');
    this.results.optimized.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(`  ${status} ${r.test}: ${r.duration}ms`);
      if (r.itemsCount) {
        console.log(`     Items: ${r.itemsCount}, Total: ${r.totalAmount.toLocaleString('vi-VN')} VND`);
      }
    });

    // Comparison
    if (this.results.original.length > 0 && this.results.optimized.length > 0) {
      const origDuration = this.results.original[0].duration;
      const optDuration = this.results.optimized[0].duration;
      const improvement = ((origDuration - optDuration) / origDuration * 100).toFixed(1);

      console.log('\n📈 Performance Comparison:');
      console.log(`  Original: ${origDuration}ms`);
      console.log(`  Optimized: ${optDuration}ms`);
      console.log(`  Improvement: ${improvement}% faster`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  async run() {
    try {
      await this.setup();

      // Check indexes
      await this.checkDatabaseIndexes();

      // Test both services
      await this.testOriginalService();
      await this.cleanup(); // Clean between tests

      await this.setup(); // Re-create test data
      await this.testOptimizedService();

      // Additional tests
      await this.testValidationErrors();
      await this.testQueryPerformance();

      // Print summary
      this.printSummary();

      log.success('All tests completed!');

    } catch (error) {
      log.error(`Test failed: ${error.message}`);
      console.error(error);
      process.exit(1);

    } finally {
      await this.cleanup();
      await pool.end();
    }
  }
}

// Run tests
const tester = new LocalTester();
tester.run();
