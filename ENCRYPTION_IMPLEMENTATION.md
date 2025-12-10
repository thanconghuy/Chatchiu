# Bank Account Encryption Implementation Guide

## Overview

This guide explains how to implement and use the bank account encryption system in ChatChiu Cashback. The system uses AES-256-GCM encryption to protect sensitive payment information.

---

## 🔐 Security Features

### What Gets Encrypted

- **Bank account numbers** - Full encryption + masked display
- **Account holder names** - Full encryption + masked display
- **Lookup capability** - PBKDF2 hash for duplicate detection without decryption

### Encryption Details

- **Algorithm**: AES-256-GCM (Authenticated Encryption)
- **Key Size**: 256 bits (32 bytes)
- **IV**: Random 16 bytes per encryption
- **Auth Tag**: 16 bytes for data integrity verification
- **Hash**: PBKDF2-HMAC-SHA512 with 100,000 iterations

---

## 📋 Step-by-Step Implementation

### Step 1: Generate Encryption Key

```bash
node database/generate-encryption-key.js
```

This will generate a secure 64-character hex key. **IMPORTANT:**
- Copy the key to your `.env` file
- Never commit the key to git
- Store backup in secure password manager
- Use different keys for dev/staging/production

**Example `.env`:**
```bash
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Step 2: Apply Database Migration

```bash
node database/apply-encryption-migration.js
```

This adds encrypted columns to `payment_requests` table:
- `bank_account_number_encrypted` (TEXT)
- `bank_account_number_hash` (VARCHAR)
- `bank_account_name_encrypted` (TEXT)
- `encryption_version` (INTEGER)
- Audit columns for access tracking

### Step 3: Migrate Existing Data

```bash
node database/migrate-existing-data.js
```

This encrypts all existing payment requests:
- Reads plain text bank data
- Encrypts with AES-256-GCM
- Creates hash for lookup
- Stores masked version for display
- Updates records in transaction

### Step 4: Verify Implementation

```bash
node database/verify-encryption.js
```

This verifies:
- Encryption/decryption works correctly
- All records are encrypted
- Data integrity is maintained
- Statistics and coverage

---

## 💻 Code Usage

### Creating Payment Request (Encrypted)

```javascript
const PaymentRequestEncrypted = require('./models/PaymentRequestEncrypted');

// Create payment request with auto-encryption
const paymentRequest = await PaymentRequestEncrypted.create({
    userId: 'user-uuid',
    requestedAmount: 500000,
    bankName: 'Vietcombank',
    bankAccountNumber: '1234567890',      // Will be encrypted
    bankAccountName: 'Nguyen Van A',      // Will be encrypted
    bankBranch: 'HCM Branch',
    notes: 'Withdrawal request',
    reconciliationItemIds: ['item-uuid-1', 'item-uuid-2']
});

// Returns masked data:
// {
//   id: 'request-uuid',
//   bank_account_number: '******7890',   // Masked
//   bank_account_name: '******n A',      // Masked
//   ...
// }
```

### Retrieving with Decryption (Admin/Owner Only)

```javascript
// For admin or owner access only
const paymentRequest = await PaymentRequestEncrypted.findByIdWithDecryption(
    requestId,
    currentUserId,
    isAdmin
);

// Returns decrypted data:
// {
//   id: 'request-uuid',
//   bank_account_number_decrypted: '1234567890',  // Full number
//   bank_account_name_decrypted: 'Nguyen Van A',  // Full name
//   last_decrypted_at: '2025-12-06T10:00:00Z',
//   last_decrypted_by: 'user-uuid',
//   decrypt_count: 5,
//   ...
// }
```

### Checking Duplicate Bank Accounts

```javascript
// Check without decryption using hash
const existing = await PaymentRequestEncrypted.findByBankAccountHash(
    userId,
    '1234567890'  // Plain bank account number
);

if (existing) {
    throw new Error('Duplicate payment request with same bank account');
}
```

### Direct Encryption/Decryption

```javascript
const encryption = require('./utils/encryption');

// Encrypt
const encrypted = encryption.encrypt('1234567890');
// Returns: "iv:authTag:encrypted" format

// Decrypt
const decrypted = encryption.decrypt(encrypted);
// Returns: "1234567890"

// Hash for lookup
const hashed = encryption.hash('1234567890');
// Returns: "salt:hash" format

// Verify hash
const isMatch = encryption.verifyHash('1234567890', hashed);
// Returns: true/false

// Mask for display
const masked = encryption.mask('1234567890', 4);
// Returns: "******7890"
```

---

## 🔒 Security Best Practices

### Key Management

1. **Never hardcode keys** in source code
2. **Use environment variables** (`.env` file)
3. **Different keys** for each environment
4. **Rotate keys** periodically (implement key versioning)
5. **Backup keys** in secure vault (AWS Secrets Manager, Azure Key Vault)

### Access Control

```javascript
// Always check authorization before decryption
if (!isAdmin && paymentRequest.user_id !== requestUserId) {
    throw new Error('Unauthorized access');
}
```

### Audit Logging

Every decryption is automatically logged:
- `last_decrypted_at` - Timestamp
- `last_decrypted_by` - User ID
- `decrypt_count` - Total access count

Review audit logs regularly:
```sql
SELECT
    pr.id,
    pr.last_decrypted_at,
    u.username,
    pr.decrypt_count
FROM payment_requests pr
LEFT JOIN users u ON u.id = pr.last_decrypted_by
WHERE pr.last_decrypted_at > NOW() - INTERVAL '7 days'
ORDER BY pr.last_decrypted_at DESC;
```

### Data Masking

Always display masked data in UI:
```javascript
// ✅ Good - masked
<td>{paymentRequest.bank_account_number}</td>
// Shows: ******7890

// ❌ Bad - full number
<td>{paymentRequest.bank_account_number_decrypted}</td>
// Shows: 1234567890 (security risk!)
```

---

## 🧪 Testing

### Unit Tests

```javascript
const encryption = require('./utils/encryption');

describe('Encryption', () => {
    test('should encrypt and decrypt correctly', () => {
        const original = '1234567890';
        const encrypted = encryption.encrypt(original);
        const decrypted = encryption.decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    test('should create verifiable hash', () => {
        const data = '1234567890';
        const hash = encryption.hash(data);
        expect(encryption.verifyHash(data, hash)).toBe(true);
        expect(encryption.verifyHash('wrong', hash)).toBe(false);
    });

    test('should mask data correctly', () => {
        expect(encryption.mask('1234567890', 4)).toBe('******7890');
        expect(encryption.mask('123', 4)).toBe('123');
    });
});
```

### Integration Tests

```javascript
describe('PaymentRequestEncrypted', () => {
    test('should create with encrypted data', async () => {
        const request = await PaymentRequestEncrypted.create({
            userId: testUserId,
            requestedAmount: 100000,
            bankAccountNumber: '1234567890',
            // ...
        });

        // Should be masked
        expect(request.bank_account_number).toBe('******7890');
        expect(request.bank_account_number).not.toBe('1234567890');
    });

    test('should decrypt for authorized user', async () => {
        const request = await PaymentRequestEncrypted.findByIdWithDecryption(
            requestId,
            ownerId,
            false
        );

        expect(request.bank_account_number_decrypted).toBe('1234567890');
    });

    test('should reject unauthorized decryption', async () => {
        await expect(
            PaymentRequestEncrypted.findByIdWithDecryption(
                requestId,
                otherUserId,
                false
            )
        ).rejects.toThrow('Unauthorized access');
    });
});
```

---

## 🔄 Key Rotation

When rotating encryption keys:

1. **Prepare new key**:
   ```bash
   node database/generate-encryption-key.js
   ```

2. **Update environment** with new key as `ENCRYPTION_KEY_V2`

3. **Create migration script**:
   ```javascript
   // Re-encrypt with new key
   for each payment_request:
       decrypt with old key
       encrypt with new key
       update encryption_version = 2
   ```

4. **Verify** all data re-encrypted

5. **Remove old key** from environment

---

## 📊 Monitoring

### Check Encryption Coverage

```sql
SELECT
    COUNT(*) as total,
    COUNT(bank_account_number_encrypted) as encrypted,
    ROUND(COUNT(bank_account_number_encrypted) * 100.0 / COUNT(*), 2) as coverage_percent
FROM payment_requests;
```

### Audit Decryption Activity

```sql
SELECT
    DATE(last_decrypted_at) as date,
    COUNT(*) as decrypt_count,
    COUNT(DISTINCT last_decrypted_by) as unique_users
FROM payment_requests
WHERE last_decrypted_at IS NOT NULL
GROUP BY DATE(last_decrypted_at)
ORDER BY date DESC
LIMIT 30;
```

### Find High-Access Records

```sql
SELECT
    pr.id,
    pr.decrypt_count,
    pr.last_decrypted_at,
    u.username
FROM payment_requests pr
LEFT JOIN users u ON u.id = pr.last_decrypted_by
WHERE pr.decrypt_count > 10
ORDER BY pr.decrypt_count DESC;
```

---

## 🚨 Incident Response

### If Encryption Key is Compromised

1. **Generate new key immediately**
2. **Rotate all encrypted data** to new key
3. **Audit access logs** for suspicious activity
4. **Notify affected users** if breach confirmed
5. **Update security procedures**

### If Decryption Fails

1. **Check `ENCRYPTION_KEY` in environment**
2. **Verify `encryption_version` field**
3. **Check error logs** for details
4. **Test with known encrypted value**
5. **Contact security team** if persistent

---

## 📖 Additional Resources

- [AES-GCM Encryption](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [PBKDF2 Hashing](https://en.wikipedia.org/wiki/PBKDF2)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)

---

## ✅ Checklist

Before deploying to production:

- [ ] Encryption key generated and stored securely
- [ ] Migration applied to database
- [ ] Existing data encrypted
- [ ] Verification tests passed
- [ ] Application code updated to use encrypted model
- [ ] Frontend displays masked data only
- [ ] Audit logging enabled
- [ ] Monitoring dashboards created
- [ ] Incident response plan documented
- [ ] Team trained on encryption procedures

---

**Last Updated**: 2025-12-06
**Version**: 1.0
**Maintainer**: ChatChiu Security Team
