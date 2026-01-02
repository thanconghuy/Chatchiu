/**
 * Test Encryption Implementation in Models
 * Verifies PaymentAccount and PaymentRequest encryption works correctly
 */

require('dotenv').config();
const PaymentAccount = require('./backend/models/PaymentAccount');
const PaymentRequestEncrypted = require('./backend/models/PaymentRequestEncrypted');
const { pool } = require('./backend/config/database');

console.log('\n========================================');
console.log('🔐 Testing Encryption in Models');
console.log('========================================\n');

// Test user (will be set dynamically)
let TEST_USER_ID = 'test-user-id'; // Will be replaced with actual user ID

// Test data
let testBankAccount = {
  userId: TEST_USER_ID,
  accountType: 'bank',
  accountHolderName: 'NGUYEN VAN TEST',
  accountNumber: '9876543210123',
  bankName: 'Vietcombank',
  bankBranch: 'Ho Chi Minh Branch',
  isDefault: true,
  notes: 'Test account for encryption'
};

let testPaymentRequest = {
  userId: TEST_USER_ID,
  requestedAmount: 500000,
  bankName: 'Techcombank',
  bankAccountNumber: '1234567890123',
  bankAccountName: 'TRAN THI TEST',
  bankBranch: 'Hanoi Branch',
  notes: 'Test payment request',
  reconciliationItemIds: []
};

async function testPaymentAccountEncryption() {
  console.log('Test 1: PaymentAccount Encryption');
  console.log('─────────────────────────────────────────');

  try {
    console.log('📝 Creating payment account with encryption...');
    console.log('  Account Number:', testBankAccount.accountNumber);
    console.log('  Account Name:', testBankAccount.accountHolderName);

    // Create payment account
    const account = await PaymentAccount.create(testBankAccount);

    console.log('✅ Account created:', {
      id: account.id,
      maskedNumber: account.account_number,
      maskedName: account.account_holder_name
    });

    // Verify data is masked in response
    const isMasked = account.account_number.includes('*') &&
                     !account.account_number.includes(testBankAccount.accountNumber);

    if (isMasked) {
      console.log('✅ Account number is masked correctly');
    } else {
      console.log('❌ Account number is NOT masked (SECURITY RISK)');
      throw new Error('Masking failed');
    }

    // Retrieve with decryption
    console.log('\n📖 Retrieving account with decryption...');
    const decryptedAccount = await PaymentAccount.getWithDecryption(account.id, TEST_USER_ID);

    if (!decryptedAccount) {
      throw new Error('Failed to retrieve account');
    }

    console.log('✅ Retrieved:', {
      id: decryptedAccount.id,
      decryptedNumber: decryptedAccount.account_number_decrypted,
      decryptedName: decryptedAccount.account_holder_name_decrypted
    });

    // Verify decryption matches original
    const decryptionMatch =
      decryptedAccount.account_number_decrypted === testBankAccount.accountNumber &&
      decryptedAccount.account_holder_name_decrypted === testBankAccount.accountHolderName;

    if (decryptionMatch) {
      console.log('✅ Decryption matches original data');
    } else {
      console.log('❌ Decryption MISMATCH');
      console.log('  Expected:', testBankAccount.accountNumber, testBankAccount.accountHolderName);
      console.log('  Got:', decryptedAccount.account_number_decrypted, decryptedAccount.account_holder_name_decrypted);
      throw new Error('Decryption mismatch');
    }

    // Verify encrypted data exists in database
    console.log('\n🔍 Verifying encrypted data in database...');
    const dbQuery = await pool.query(
      'SELECT account_number_encrypted, account_number_hash, account_holder_name_encrypted, encryption_version FROM payment_accounts WHERE id = $1',
      [account.id]
    );

    const dbRow = dbQuery.rows[0];
    console.log('✅ Database contains encrypted data:', {
      hasEncryptedNumber: !!dbRow.account_number_encrypted,
      hasHash: !!dbRow.account_number_hash,
      hasEncryptedName: !!dbRow.account_holder_name_encrypted,
      encryptionVersion: dbRow.encryption_version
    });

    if (!dbRow.account_number_encrypted || !dbRow.account_number_hash || !dbRow.account_holder_name_encrypted) {
      throw new Error('Missing encrypted data in database');
    }

    // Clean up
    await PaymentAccount.delete(account.id, TEST_USER_ID);
    console.log('🧹 Test account deleted\n');

    return true;

  } catch (error) {
    console.error('❌ Test 1 FAILED:', error.message);
    return false;
  }
}

async function testPaymentRequestEncryption() {
  console.log('Test 2: PaymentRequest Encryption');
  console.log('─────────────────────────────────────────');

  try {
    console.log('📝 Creating payment request with encryption...');
    console.log('  Account Number:', testPaymentRequest.bankAccountNumber);
    console.log('  Account Name:', testPaymentRequest.bankAccountName);

    // Create payment request
    const paymentRequest = await PaymentRequestEncrypted.create(testPaymentRequest);

    console.log('✅ Payment request created:', {
      id: paymentRequest.id,
      maskedNumber: paymentRequest.bank_account_number,
      maskedName: paymentRequest.bank_account_name
    });

    // Verify data is masked
    const isMasked = paymentRequest.bank_account_number.includes('*') &&
                     !paymentRequest.bank_account_number.includes(testPaymentRequest.bankAccountNumber);

    if (isMasked) {
      console.log('✅ Bank account number is masked correctly');
    } else {
      console.log('❌ Bank account number is NOT masked (SECURITY RISK)');
      throw new Error('Masking failed');
    }

    // Retrieve with decryption (admin access)
    console.log('\n📖 Retrieving payment request with decryption...');
    const decryptedRequest = await PaymentRequestEncrypted.findByIdWithDecryption(
      paymentRequest.id,
      TEST_USER_ID,
      true // isAdmin
    );

    if (!decryptedRequest) {
      throw new Error('Failed to retrieve payment request');
    }

    console.log('✅ Retrieved:', {
      id: decryptedRequest.id,
      decryptedNumber: decryptedRequest.bank_account_number_decrypted,
      decryptedName: decryptedRequest.bank_account_name_decrypted
    });

    // Verify decryption matches original
    const decryptionMatch =
      decryptedRequest.bank_account_number_decrypted === testPaymentRequest.bankAccountNumber &&
      decryptedRequest.bank_account_name_decrypted === testPaymentRequest.bankAccountName;

    if (decryptionMatch) {
      console.log('✅ Decryption matches original data');
    } else {
      console.log('❌ Decryption MISMATCH');
      console.log('  Expected:', testPaymentRequest.bankAccountNumber, testPaymentRequest.bankAccountName);
      console.log('  Got:', decryptedRequest.bank_account_number_decrypted, decryptedRequest.bank_account_name_decrypted);
      throw new Error('Decryption mismatch');
    }

    // Verify encrypted data exists in database
    console.log('\n🔍 Verifying encrypted data in database...');
    const dbQuery = await pool.query(
      'SELECT bank_account_number_encrypted, bank_account_number_hash, bank_account_name_encrypted, encryption_version FROM payment_requests WHERE id = $1',
      [paymentRequest.id]
    );

    const dbRow = dbQuery.rows[0];
    console.log('✅ Database contains encrypted data:', {
      hasEncryptedNumber: !!dbRow.bank_account_number_encrypted,
      hasHash: !!dbRow.bank_account_number_hash,
      hasEncryptedName: !!dbRow.bank_account_name_encrypted,
      encryptionVersion: dbRow.encryption_version
    });

    if (!dbRow.bank_account_number_encrypted || !dbRow.bank_account_number_hash || !dbRow.bank_account_name_encrypted) {
      throw new Error('Missing encrypted data in database');
    }

    // Clean up
    await pool.query('DELETE FROM payment_requests WHERE id = $1', [paymentRequest.id]);
    console.log('🧹 Test payment request deleted\n');

    return true;

  } catch (error) {
    console.error('❌ Test 2 FAILED:', error.message);
    return false;
  }
}

async function testHashDuplicateDetection() {
  console.log('Test 3: Hash-based Duplicate Detection');
  console.log('─────────────────────────────────────────');

  try {
    console.log('📝 Creating first payment request...');
    const request1 = await PaymentRequestEncrypted.create(testPaymentRequest);
    console.log('✅ First request created:', request1.id);

    console.log('\n🔍 Checking for duplicate bank account...');
    const duplicate = await PaymentRequestEncrypted.findByBankAccountHash(
      TEST_USER_ID,
      testPaymentRequest.bankAccountNumber
    );

    if (duplicate) {
      console.log('✅ Duplicate detection works - found matching account');
      console.log('  Existing request:', duplicate.id);
    } else {
      console.log('❌ Duplicate detection FAILED - no match found');
      throw new Error('Hash-based duplicate detection failed');
    }

    // Clean up
    await pool.query('DELETE FROM payment_requests WHERE id = $1', [request1.id]);
    console.log('🧹 Test data cleaned up\n');

    return true;

  } catch (error) {
    console.error('❌ Test 3 FAILED:', error.message);
    return false;
  }
}

async function runTests() {
  try {
    // Get a valid user ID for testing
    const userQuery = await pool.query('SELECT id FROM users LIMIT 1');
    if (userQuery.rows.length === 0) {
      console.error('❌ No users found in database. Please create a user first.');
      process.exit(1);
    }

    const userId = userQuery.rows[0].id;
    console.log('📌 Using test user ID:', userId);
    console.log('');

    // Update test data with actual user ID
    TEST_USER_ID = userId;
    testBankAccount.userId = userId;
    testPaymentRequest.userId = userId;

    const results = [];

    // Run tests
    results.push(await testPaymentAccountEncryption());
    results.push(await testPaymentRequestEncryption());
    results.push(await testHashDuplicateDetection());

    // Summary
    console.log('========================================');
    const passed = results.filter(r => r).length;
    const total = results.length;

    if (passed === total) {
      console.log(`✅ All Tests PASSED (${passed}/${total})`);
      console.log('========================================');
      console.log('');
      console.log('✅ Encryption implementation is working correctly!');
      console.log('✅ Bank account data is encrypted in database');
      console.log('✅ Decryption works correctly for authorized access');
      console.log('✅ Hash-based duplicate detection works');
      console.log('');
      console.log('🚀 Ready to deploy to production with ENCRYPTION_KEY on Vercel');
      process.exit(0);
    } else {
      console.log(`❌ Some Tests FAILED (${passed}/${total} passed)`);
      console.log('========================================');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run tests
runTests();
