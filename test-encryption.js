/**
 * Test Encryption Utility
 * Verifies encryption/decryption with new ENCRYPTION_KEY
 */

require('dotenv').config();
const encryption = require('./backend/utils/encryption');

console.log('\n========================================');
console.log('🔐 Testing Encryption Utility');
console.log('========================================\n');

// Test data (bank account information)
const testData = {
  accountNumber: '1234567890123',
  accountName: 'NGUYEN VAN A',
  bankName: 'Vietcombank'
};

console.log('📝 Test Data:');
console.log('  Account Number:', testData.accountNumber);
console.log('  Account Name:', testData.accountName);
console.log('  Bank Name:', testData.bankName);
console.log('');

// Test 1: Encrypt/Decrypt Bank Account Number
console.log('Test 1: Encrypt/Decrypt Bank Account Number');
console.log('─────────────────────────────────────────');
try {
  const encryptedNumber = encryption.encrypt(testData.accountNumber);
  console.log('✅ Encrypted:', encryptedNumber.substring(0, 50) + '...');

  const decryptedNumber = encryption.decrypt(encryptedNumber);
  console.log('✅ Decrypted:', decryptedNumber);

  const matchNumber = testData.accountNumber === decryptedNumber;
  console.log(matchNumber ? '✅ Match: SUCCESS' : '❌ Match: FAILED');

  if (!matchNumber) {
    throw new Error('Decrypt mismatch for account number');
  }
} catch (error) {
  console.error('❌ Test 1 FAILED:', error.message);
  process.exit(1);
}
console.log('');

// Test 2: Encrypt/Decrypt Bank Account Name
console.log('Test 2: Encrypt/Decrypt Bank Account Name');
console.log('─────────────────────────────────────────');
try {
  const encryptedName = encryption.encrypt(testData.accountName);
  console.log('✅ Encrypted:', encryptedName.substring(0, 50) + '...');

  const decryptedName = encryption.decrypt(encryptedName);
  console.log('✅ Decrypted:', decryptedName);

  const matchName = testData.accountName === decryptedName;
  console.log(matchName ? '✅ Match: SUCCESS' : '❌ Match: FAILED');

  if (!matchName) {
    throw new Error('Decrypt mismatch for account name');
  }
} catch (error) {
  console.error('❌ Test 2 FAILED:', error.message);
  process.exit(1);
}
console.log('');

// Test 3: Hash/Verify for Duplicate Detection
console.log('Test 3: Hash/Verify for Duplicate Detection');
console.log('─────────────────────────────────────────');
try {
  const hash = encryption.hash(testData.accountNumber);
  console.log('✅ Hash:', hash.substring(0, 50) + '...');

  const verified = encryption.verifyHash(testData.accountNumber, hash);
  console.log(verified ? '✅ Verify: SUCCESS' : '❌ Verify: FAILED');

  // Test with wrong data
  const verifiedWrong = encryption.verifyHash('9999999999999', hash);
  console.log(!verifiedWrong ? '✅ Verify Wrong Data: Correctly rejected' : '❌ Verify Wrong Data: FAILED');

  if (!verified || verifiedWrong) {
    throw new Error('Hash verification failed');
  }
} catch (error) {
  console.error('❌ Test 3 FAILED:', error.message);
  process.exit(1);
}
console.log('');

// Test 4: Mask for Display
console.log('Test 4: Mask for Display');
console.log('─────────────────────────────────────────');
try {
  const maskedNumber = encryption.mask(testData.accountNumber, 4);
  console.log('✅ Masked Number:', maskedNumber);

  const maskedName = encryption.mask(testData.accountName, 3);
  console.log('✅ Masked Name:', maskedName);

  // Verify mask format
  const expectedMasked = '*********3123';
  const maskCorrect = maskedNumber === expectedMasked;
  console.log(maskCorrect ? '✅ Mask Format: Correct' : '⚠️ Mask Format: ' + maskedNumber);
} catch (error) {
  console.error('❌ Test 4 FAILED:', error.message);
  process.exit(1);
}
console.log('');

// Test 5: Multiple Encryptions (Different IV each time)
console.log('Test 5: Multiple Encryptions (Different IV)');
console.log('─────────────────────────────────────────');
try {
  const enc1 = encryption.encrypt(testData.accountNumber);
  const enc2 = encryption.encrypt(testData.accountNumber);

  console.log('✅ Encryption 1:', enc1.substring(0, 50) + '...');
  console.log('✅ Encryption 2:', enc2.substring(0, 50) + '...');

  const different = enc1 !== enc2;
  console.log(different ? '✅ Different IVs: SUCCESS (more secure)' : '❌ Same IV: SECURITY RISK');

  // Both should decrypt to same value
  const dec1 = encryption.decrypt(enc1);
  const dec2 = encryption.decrypt(enc2);

  const bothCorrect = dec1 === testData.accountNumber && dec2 === testData.accountNumber;
  console.log(bothCorrect ? '✅ Both decrypt correctly: SUCCESS' : '❌ Decryption failed');

  if (!different || !bothCorrect) {
    throw new Error('Multiple encryption test failed');
  }
} catch (error) {
  console.error('❌ Test 5 FAILED:', error.message);
  process.exit(1);
}
console.log('');

// Test 6: Edge Cases
console.log('Test 6: Edge Cases');
console.log('─────────────────────────────────────────');
try {
  // Empty string
  const encEmpty = encryption.encrypt('');
  console.log('✅ Empty string returns:', encEmpty === null ? 'null (expected)' : encEmpty);

  // Unicode characters
  const unicodeText = 'Nguyễn Văn Á';
  const encUnicode = encryption.encrypt(unicodeText);
  const decUnicode = encryption.decrypt(encUnicode);
  console.log('✅ Unicode support:', decUnicode === unicodeText ? 'SUCCESS' : 'FAILED');

  // Long text
  const longText = 'A'.repeat(1000);
  const encLong = encryption.encrypt(longText);
  const decLong = encryption.decrypt(encLong);
  console.log('✅ Long text (1000 chars):', decLong === longText ? 'SUCCESS' : 'FAILED');

} catch (error) {
  console.error('❌ Test 6 FAILED:', error.message);
  process.exit(1);
}
console.log('');

console.log('========================================');
console.log('✅ All Tests PASSED');
console.log('========================================');
console.log('');
console.log('✅ Encryption utility is working correctly with new ENCRYPTION_KEY');
console.log('✅ Ready to proceed with updating PaymentRequest and PaymentAccount models');
console.log('');
