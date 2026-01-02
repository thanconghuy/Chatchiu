# Phân Tích và Triển Khai Encryption cho Thông Tin Thanh Toán

**Tài liệu này phân tích chi tiết vấn đề encryption hiện tại và đưa ra giải pháp hoàn chỉnh để bảo mật thông tin thanh toán của user**

---

## 📋 Mục lục

1. [Tình trạng hiện tại](#1-tình-trạng-hiện-tại)
2. [Phân tích vấn đề](#2-phân-tích-vấn-đề)
3. [Kiến trúc Encryption đã có](#3-kiến-trúc-encryption-đã-có)
4. [Giải pháp Re-enable Encryption](#4-giải-pháp-re-enable-encryption)
5. [Implementation Plan](#5-implementation-plan)
6. [Migration Strategy](#6-migration-strategy)
7. [Testing Strategy](#7-testing-strategy)
8. [Security Best Practices](#8-security-best-practices)

---

## 1. Tình trạng hiện tại

### 1.1. Thông tin nhạy cảm cần bảo vệ

**Dữ liệu thanh toán của user:**

```javascript
// Trong payment_requests table
{
  bank_account_number: "1234567890",        // ❌ PLAINTEXT
  bank_account_name: "NGUYEN VAN A",        // ❌ PLAINTEXT
  bank_name: "Vietcombank",                 // ✅ OK (public info)
  bank_branch: "Chi nhánh Hà Nội"          // ✅ OK (public info)
}

// Trong payment_accounts table
{
  account_number: "1234567890",             // ❌ PLAINTEXT
  account_holder_name: "NGUYEN VAN A",      // ❌ PLAINTEXT
  bank_name: "Vietcombank"                  // ✅ OK
}
```

### 1.2. Encryption đã bị disable

**Files bị ảnh hưởng:**

| File | Line | Status | Note |
|------|------|--------|------|
| `backend/models/PaymentRequestEncrypted.js` | 40-46 | ❌ DISABLED | Comment: "ENCRYPTION DISABLED - Store plain text for now" |
| `backend/models/PaymentAccount.js` | 202-212 | ❌ DISABLED | Comment: "TEMPORARILY DISABLED: Encryption" |
| `backend/utils/encryption.js` | - | ✅ READY | Code hoàn chỉnh, chỉ thiếu ENCRYPTION_KEY |

**Lý do disable:**

```javascript
// backend/models/PaymentRequestEncrypted.js:40-41
// ENCRYPTION DISABLED - Store plain text for now
// TODO: Re-enable encryption after fixing key rotation issues
```

```javascript
// backend/models/PaymentAccount.js:202-203
// TEMPORARILY DISABLED: Encryption - store plaintext with masking
// TODO: Re-enable encryption after fixing ENCRYPTION_KEY on production
```

### 1.3. Database Schema (đã sẵn sàng cho encryption)

**Table: `payment_requests`**

```sql
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),

  -- Current plaintext fields (INSECURE)
  bank_account_number VARCHAR(50),              -- ❌ Plaintext
  bank_account_name VARCHAR(255),               -- ❌ Plaintext

  -- Encrypted fields (READY but unused)
  bank_account_number_encrypted TEXT,           -- ✅ Ready for encrypted data
  bank_account_number_hash TEXT,                -- ✅ Ready for hash (lookup)
  bank_account_name_encrypted TEXT,             -- ✅ Ready for encrypted data

  -- Encryption metadata
  encryption_version INTEGER DEFAULT 1,         -- ✅ Version tracking
  last_decrypted_at TIMESTAMP,                  -- ✅ Audit trail
  last_decrypted_by UUID,                       -- ✅ Audit trail
  decrypt_count INTEGER DEFAULT 0,              -- ✅ Audit trail

  -- Other fields...
  bank_name VARCHAR(255),
  bank_branch VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Table: `payment_accounts`**

```sql
CREATE TABLE payment_accounts (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),

  -- Current plaintext fields (INSECURE)
  account_number VARCHAR(50),                   -- ❌ Plaintext
  account_holder_name VARCHAR(255),             -- ❌ Plaintext

  -- Encrypted fields (READY but unused)
  account_number_encrypted TEXT,                -- ✅ Ready
  account_number_hash TEXT,                     -- ✅ Ready for lookup
  account_holder_name_encrypted TEXT,           -- ✅ Ready

  -- Encryption metadata
  encryption_version INTEGER DEFAULT 1,         -- ✅ Version tracking

  -- Other fields...
  bank_name VARCHAR(255),
  bank_branch VARCHAR(255),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Phân tích vấn đề

### 2.1. Security Risks (hiện tại)

#### 🔴 **CRITICAL: Dữ liệu plaintext trong database**

**Risk Level:** CRITICAL (10/10)

**Impact:**
```
┌─────────────────────────────────────────────────────┐
│ Database Breach Scenario                            │
├─────────────────────────────────────────────────────┤
│ Attacker access database → Read payment_requests   │
│ → See ALL bank account numbers in plaintext        │
│ → See ALL account holder names                     │
│ → Can execute fraudulent transactions              │
│                                                     │
│ Data exposed:                                       │
│ - Bank account numbers                             │
│ - Account holder names                             │
│ - Bank names and branches                          │
│ - Transaction amounts                              │
│                                                     │
│ Result: MASSIVE DATA BREACH                         │
└─────────────────────────────────────────────────────┘
```

**Compliance Issues:**
- ❌ **PCI-DSS**: Non-compliant (financial data must be encrypted)
- ❌ **GDPR**: Violation (personal financial data not protected)
- ❌ **Vietnam Law**: Violation of Cybersecurity Law (Article 26)

#### 🟡 **HIGH: SQL Injection exposure**

**Current queries:**

```javascript
// backend/models/PaymentRequest.js
const query = `
  INSERT INTO payment_requests (
    bank_account_number,
    bank_account_name
  ) VALUES ($1, $2)
`;

// ✅ Parameterized queries protect against SQL injection
// ❌ BUT data is stored plaintext - no encryption layer
```

**If attacker bypasses parameterization:**
```sql
-- Malicious query could read all plaintext data
SELECT bank_account_number, bank_account_name
FROM payment_requests
WHERE user_id = 'anything';
-- Returns all bank accounts in plaintext
```

#### 🟡 **HIGH: Logs exposure**

**Current logging:**

```javascript
// backend/models/PaymentRequestEncrypted.js:42-46
logger.info('[PaymentRequest] Creating payment request (encryption disabled)', {
  userId,
  amount: requestedAmount,
  bankName  // ✅ No sensitive data logged
});
```

**Good:** Sensitive data NOT logged currently

**Risk:** Developer might accidentally log sensitive data:

```javascript
// ❌ DANGEROUS - Don't do this
logger.info('Payment request created', {
  userId,
  bankAccountNumber: data.bankAccountNumber  // EXPOSED IN LOGS!
});
```

#### 🟢 **MEDIUM: Backup exposure**

**Database backups:**
- Neon PostgreSQL creates automatic backups
- Backups contain plaintext bank account data
- If backup leaked → all data exposed

**Mitigation needed:** Encrypt data before backup

### 2.2. Tại sao encryption bị disabled?

**Phân tích code comments:**

```javascript
// PaymentRequestEncrypted.js:40-41
// TODO: Re-enable encryption after fixing key rotation issues
```

**Vấn đề xác định:**

1. **Key Rotation chưa implement**
   - Khi ENCRYPTION_KEY thay đổi
   - Dữ liệu cũ encrypted với key cũ không decrypt được với key mới
   - Cần migration strategy

2. **ENCRYPTION_KEY environment variable**
   - Development có key khác Production
   - Vercel deployment cần configure key
   - Key phải 64 hex characters (32 bytes)

3. **Migration từ plaintext sang encrypted**
   - Dữ liệu cũ đang plaintext
   - Cần encrypt dần dần (gradual migration)
   - Backward compatibility với data cũ

---

## 3. Kiến trúc Encryption đã có

### 3.1. Encryption Utility (READY TO USE)

**File:** `backend/utils/encryption.js`

**Algorithm:** AES-256-GCM (Authenticated Encryption)

**Features:**
- ✅ Encryption với authentication tag
- ✅ Random IV (Initialization Vector) mỗi lần encrypt
- ✅ Hash function cho lookup (PBKDF2 with salt)
- ✅ Masking function cho display
- ✅ Timing-safe comparison

**Encryption Format:**

```
Encrypted data format: "iv:authTag:encrypted"

Example:
"a1b2c3d4e5f6....:1234567890abcdef:9f8e7d6c5b4a3210"
 \_____________/  \______________/  \______________/
      IV (16B)      Auth Tag (16B)    Encrypted Data
```

### 3.2. Core Functions

#### **encrypt(plaintext)**

```javascript
const encryption = require('../utils/encryption');

// Input: "1234567890" (bank account number)
const encrypted = encryption.encrypt("1234567890");

// Output: "a1b2c3d4...:1234567890ab:9f8e7d6c..."
//         (iv:authTag:encrypted)
```

**Process:**

```
1. Validate ENCRYPTION_KEY exists
2. Generate random IV (16 bytes)
3. Create AES-256-GCM cipher
4. Encrypt plaintext
5. Get authentication tag
6. Return "iv:authTag:encrypted"
```

**Security:**
- ✅ IV is random (no reuse)
- ✅ Authentication tag prevents tampering
- ✅ AES-256 is FIPS 140-2 compliant

#### **decrypt(encryptedData)**

```javascript
const encrypted = "a1b2c3d4...:1234567890ab:9f8e7d6c...";
const plaintext = encryption.decrypt(encrypted);

// Output: "1234567890"
```

**Process:**

```
1. Validate ENCRYPTION_KEY exists
2. Parse "iv:authTag:encrypted"
3. Create AES-256-GCM decipher
4. Set authentication tag
5. Decrypt data
6. Return plaintext
```

**Security:**
- ✅ Auth tag verification (prevents tampering)
- ✅ Constant-time comparison
- ✅ Error handling (invalid data → exception)

#### **hash(data)**

```javascript
// For duplicate detection without decryption
const hash = encryption.hash("1234567890");

// Output: "salt:hash"
//         "a1b2c3...:9f8e7d6c..."
```

**Use case:** Check if bank account already exists WITHOUT decrypting all records

```javascript
// Check duplicate payment request
const existingHash = await PaymentRequest.getBankAccountHash(userId);
const isMatch = encryption.verifyHash(newBankAccount, existingHash);

if (isMatch) {
  throw new Error('You already have a pending request with this bank account');
}
```

**Security:**
- ✅ PBKDF2 with 100,000 iterations
- ✅ 64-byte salt (random per hash)
- ✅ SHA-512 hash function
- ✅ One-way (cannot reverse)

#### **mask(data, visibleChars = 4)**

```javascript
const masked = encryption.mask("1234567890", 4);

// Output: "******7890"
```

**Use case:** Display in UI without exposing full number

```html
<!-- Frontend display -->
<div>Tài khoản: ******7890</div>
```

### 3.3. Database Support (READY)

**Schema already includes:**

```sql
-- Encrypted storage
bank_account_number_encrypted TEXT,      -- Store encrypted data
bank_account_name_encrypted TEXT,

-- Hash for lookup (without decryption)
bank_account_number_hash TEXT,

-- Audit trail
encryption_version INTEGER DEFAULT 1,   -- Track encryption method
last_decrypted_at TIMESTAMP,            -- Who accessed plaintext
last_decrypted_by UUID,                 -- Security audit
decrypt_count INTEGER DEFAULT 0         -- Access frequency
```

---

## 4. Giải pháp Re-enable Encryption

### 4.1. Strategy: Hybrid Approach

**Vấn đề:**
- Dữ liệu cũ: plaintext
- Dữ liệu mới: cần encrypt
- Không thể encrypt hết 1 lúc (downtime)

**Giải pháp: Gradual Migration**

```
┌──────────────────────────────────────────────────┐
│ Phase 1: Enable encryption for NEW data         │
│ - All new payment requests → encrypted          │
│ - All new payment accounts → encrypted          │
│ - Old data stays plaintext (temporary)          │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│ Phase 2: Background migration of OLD data       │
│ - Cron job encrypts 100 records/hour            │
│ - Zero downtime                                  │
│ - Logs migration progress                       │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│ Phase 3: Drop plaintext columns                 │
│ - All data encrypted                             │
│ - Remove bank_account_number column             │
│ - Only encrypted columns remain                 │
└──────────────────────────────────────────────────┘
```

### 4.2. Backward Compatibility

**Read logic:**

```javascript
static async findByIdWithDecryption(id, requestUserId, isAdmin = false) {
  const paymentRequest = await db.query('SELECT * FROM payment_requests WHERE id = $1', [id]);

  // Authorization check
  if (!isAdmin && paymentRequest.user_id !== requestUserId) {
    throw new Error('Unauthorized');
  }

  // ✅ Backward compatible read
  if (paymentRequest.bank_account_number_encrypted) {
    // New data: decrypt
    paymentRequest.bank_account_number_decrypted = encryption.decrypt(
      paymentRequest.bank_account_number_encrypted
    );
    paymentRequest.bank_account_name_decrypted = encryption.decrypt(
      paymentRequest.bank_account_name_encrypted
    );
  } else {
    // Old data: use plaintext
    paymentRequest.bank_account_number_decrypted = paymentRequest.bank_account_number;
    paymentRequest.bank_account_name_decrypted = paymentRequest.bank_account_name;
  }

  // Audit trail
  await this.logDecryption(id, requestUserId);

  return paymentRequest;
}
```

**Write logic:**

```javascript
static async create(data) {
  const { bankAccountNumber, bankAccountName, ...rest } = data;

  // ✅ Always encrypt NEW data
  const encrypted_number = encryption.encrypt(bankAccountNumber);
  const encrypted_name = encryption.encrypt(bankAccountName);
  const hashed_number = encryption.hash(bankAccountNumber);

  const query = `
    INSERT INTO payment_requests (
      bank_account_number_encrypted,     -- ✅ Store encrypted
      bank_account_number_hash,          -- ✅ Store hash for lookup
      bank_account_name_encrypted,       -- ✅ Store encrypted
      bank_account_number,               -- ❌ NULL (deprecated)
      bank_account_name,                 -- ❌ NULL (deprecated)
      encryption_version,
      ...
    ) VALUES ($1, $2, $3, NULL, NULL, 1, ...)
  `;

  return await db.query(query, [encrypted_number, hashed_number, encrypted_name, ...]);
}
```

### 4.3. Key Management

**Environment Variables:**

```bash
# .env (Development)
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Vercel (Production)
# Add via Vercel dashboard → Settings → Environment Variables
ENCRYPTION_KEY=<production_key_different_from_dev>
```

**Key Requirements:**
- Length: 64 hex characters (32 bytes)
- Format: `[0-9a-f]{64}`
- Generation: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Key Rotation Strategy:**

```javascript
// Support multiple keys for rotation
const ENCRYPTION_KEYS = {
  v1: process.env.ENCRYPTION_KEY_V1,  // Old key
  v2: process.env.ENCRYPTION_KEY_V2,  // New key (current)
};

function decrypt(encryptedData, version = 2) {
  const key = ENCRYPTION_KEYS[`v${version}`];
  // Decrypt with appropriate key
}

// When rotating:
// 1. Add ENCRYPTION_KEY_V2 to .env
// 2. New encryptions use V2
// 3. Old data still decrypts with V1
// 4. Background job re-encrypts V1 → V2
// 5. Remove V1 key when migration complete
```

---

## 5. Implementation Plan

### 5.1. Phase 1: Setup (1-2 giờ)

#### **Step 1: Generate và configure ENCRYPTION_KEY**

```bash
# 1. Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output example:
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# 2. Add to .env (Development)
echo "ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2" >> .env

# 3. Add to Vercel (Production)
# Go to: Vercel Dashboard → Project → Settings → Environment Variables
# Add: ENCRYPTION_KEY = <different_production_key>
```

#### **Step 2: Test encryption utility**

```javascript
// test-encryption.js
const encryption = require('./backend/utils/encryption');

console.log('Testing encryption...');

// Test 1: Encrypt/Decrypt
const plaintext = '1234567890';
const encrypted = encryption.encrypt(plaintext);
const decrypted = encryption.decrypt(encrypted);

console.log('Plaintext:', plaintext);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', plaintext === decrypted ? '✅' : '❌');

// Test 2: Hash/Verify
const hash = encryption.hash(plaintext);
const verified = encryption.verifyHash(plaintext, hash);

console.log('Hash:', hash);
console.log('Verified:', verified ? '✅' : '❌');

// Test 3: Mask
const masked = encryption.mask(plaintext, 4);
console.log('Masked:', masked);
```

```bash
# Run test
node test-encryption.js

# Expected output:
# Testing encryption...
# Plaintext: 1234567890
# Encrypted: a1b2c3...:1234...:9f8e7d...
# Decrypted: 1234567890
# Match: ✅
# Hash: salt:hash
# Verified: ✅
# Masked: ******7890
```

### 5.2. Phase 2: Enable Encryption cho NEW Data (2-3 giờ)

#### **Step 1: Update PaymentRequest.create()**

**File:** `backend/models/PaymentRequest.js`

```javascript
static async create(data) {
  const {
    userId,
    requestedAmount,
    bankAccountNumber,  // Plain text from user input
    bankAccountName,    // Plain text from user input
    bankName,
    bankBranch,
    notes,
    reconciliationItemIds
  } = data;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ✅ ENCRYPT sensitive data
    const encryptedNumber = encryption.encrypt(bankAccountNumber);
    const encryptedName = encryption.encrypt(bankAccountName);
    const hashedNumber = encryption.hash(bankAccountNumber);

    logger.info('[PaymentRequest] Creating with encryption enabled', {
      userId,
      amount: requestedAmount,
      bankName,
      encryptionVersion: 1
    });

    const insertQuery = `
      INSERT INTO payment_requests (
        user_id,
        requested_amount,
        bank_name,
        bank_account_number_encrypted,    -- ✅ Encrypted
        bank_account_number_hash,         -- ✅ Hash for lookup
        bank_account_name_encrypted,      -- ✅ Encrypted
        encryption_version,               -- ✅ Version tracking
        bank_account_number,              -- ❌ NULL (deprecated)
        bank_account_name,                -- ❌ NULL (deprecated)
        bank_branch,
        notes,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, $10)
      RETURNING id, user_id, requested_amount, bank_name,
                bank_branch, status, created_at
    `;

    const values = [
      userId,
      requestedAmount,
      bankName,
      encryptedNumber,   // ✅ Encrypted
      hashedNumber,      // ✅ Hash
      encryptedName,     // ✅ Encrypted
      1,                 // encryption_version
      bankBranch,
      notes,
      'pending'
    ];

    const result = await client.query(insertQuery, values);
    const paymentRequest = result.rows[0];

    // Map reconciliation items (unchanged)
    if (reconciliationItemIds.length > 0) {
      // ... existing logic
    }

    // Log creation
    await this._logAction(client, {
      paymentRequestId: paymentRequest.id,
      action: 'created',
      oldStatus: null,
      newStatus: 'pending',
      performedBy: userId,
      notes: 'Payment request created with encrypted bank data'
    });

    await client.query('COMMIT');

    logger.info('[PaymentRequest] Created successfully with encryption', {
      id: paymentRequest.id,
      userId,
      amount: requestedAmount,
      encrypted: true
    });

    return paymentRequest;

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[PaymentRequest] Create failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
```

#### **Step 2: Update PaymentAccount.create()**

**File:** `backend/models/PaymentAccount.js`

```javascript
static async create(data) {
  const {
    userId,
    accountType,
    accountHolderName,  // Plain text from user
    accountNumber,      // Plain text from user
    bankName,
    bankBranch,
    isDefault,
    notes
  } = data;

  // If default, unset others
  if (isDefault) {
    await this.unsetAllDefaults(userId);
  }

  // ✅ ENCRYPT sensitive data
  const encryptedNumber = encryption.encrypt(accountNumber);
  const encryptedName = encryption.encrypt(accountHolderName);
  const hashedNumber = encryption.hash(accountNumber);

  logger.info('[PaymentAccount] Creating WITH encryption', {
    userId,
    accountType,
    bankName,
    encrypted: true
  });

  const query = `
    INSERT INTO payment_accounts (
      user_id,
      account_type,
      account_holder_name_encrypted,    -- ✅ Encrypted
      account_number_encrypted,         -- ✅ Encrypted
      account_number_hash,              -- ✅ Hash
      encryption_version,               -- ✅ Version
      account_holder_name,              -- ❌ NULL (deprecated)
      account_number,                   -- ❌ NULL (deprecated)
      bank_name,
      bank_branch,
      is_default,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10)
    RETURNING id, user_id, account_type, bank_name, bank_branch,
              is_default, is_verified, notes, created_at, updated_at
  `;

  const values = [
    userId,
    accountType,
    encryptedName,     // ✅ Encrypted
    encryptedNumber,   // ✅ Encrypted
    hashedNumber,      // ✅ Hash
    1,                 // encryption_version
    bankName || null,
    bankBranch || null,
    isDefault || false,
    notes || null
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}
```

#### **Step 3: Update Read methods (backward compatible)**

**PaymentRequest.findByIdWithDecryption():**

```javascript
static async findByIdWithDecryption(id, requestUserId, isAdmin = false) {
  const query = `
    SELECT * FROM payment_requests WHERE id = $1
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const paymentRequest = result.rows[0];

  // Authorization check
  if (!isAdmin && paymentRequest.user_id !== requestUserId) {
    logger.warn('[PaymentRequest] Unauthorized access attempt', {
      paymentRequestId: id,
      requestUserId,
      ownerId: paymentRequest.user_id
    });
    throw new Error('Unauthorized access');
  }

  // ✅ Backward compatible decryption
  if (paymentRequest.bank_account_number_encrypted) {
    // NEW DATA: Decrypt
    try {
      paymentRequest.bank_account_number_decrypted = encryption.decrypt(
        paymentRequest.bank_account_number_encrypted
      );
      paymentRequest.bank_account_name_decrypted = encryption.decrypt(
        paymentRequest.bank_account_name_encrypted
      );

      logger.info('[PaymentRequest] Decrypted encrypted data', {
        paymentRequestId: id,
        requestUserId,
        isAdmin,
        encryptionVersion: paymentRequest.encryption_version
      });

    } catch (decryptError) {
      logger.error('[PaymentRequest] Decryption failed', {
        paymentRequestId: id,
        error: decryptError.message
      });
      throw new Error('Failed to decrypt payment data');
    }
  } else if (paymentRequest.bank_account_number) {
    // OLD DATA: Use plaintext (backward compatibility)
    logger.warn('[PaymentRequest] Using legacy plaintext data', {
      paymentRequestId: id,
      requestUserId
    });

    paymentRequest.bank_account_number_decrypted = paymentRequest.bank_account_number;
    paymentRequest.bank_account_name_decrypted = paymentRequest.bank_account_name;
  } else {
    // No data available
    paymentRequest.bank_account_number_decrypted = 'N/A';
    paymentRequest.bank_account_name_decrypted = 'N/A';
  }

  // ✅ Audit trail: Log decryption access
  await this._logDecryption(id, requestUserId);

  // Clean up response
  delete paymentRequest.bank_account_number_encrypted;
  delete paymentRequest.bank_account_number_hash;
  delete paymentRequest.bank_account_name_encrypted;
  delete paymentRequest.bank_account_number;  // Hide deprecated field
  delete paymentRequest.bank_account_name;    // Hide deprecated field

  return paymentRequest;
}
```

**Add audit logging:**

```javascript
static async _logDecryption(paymentRequestId, userId) {
  try {
    await pool.query(`
      UPDATE payment_requests
      SET
        last_decrypted_at = NOW(),
        last_decrypted_by = $2,
        decrypt_count = COALESCE(decrypt_count, 0) + 1
      WHERE id = $1
    `, [paymentRequestId, userId]);

    logger.info('[PaymentRequest] Decryption logged', {
      paymentRequestId,
      userId
    });
  } catch (error) {
    // Don't throw - logging failure shouldn't block operation
    logger.error('[PaymentRequest] Failed to log decryption', {
      error: error.message,
      paymentRequestId
    });
  }
}
```

### 5.3. Phase 3: Migration cron job (1-2 giờ)

**File:** `backend/jobs/encryptLegacyData.js`

```javascript
/**
 * Background job to encrypt legacy plaintext payment data
 * Runs hourly, processes 100 records per run
 */

const { pool } = require('../config/database');
const encryption = require('../utils/encryption');
const logger = require('../utils/logger');

class EncryptLegacyDataJob {
  /**
   * Encrypt legacy payment requests
   */
  static async encryptPaymentRequests() {
    const client = await pool.connect();
    const processed = { success: 0, failed: 0, skipped: 0 };

    try {
      await client.query('BEGIN');

      // Find plaintext records (limit 100 per run)
      const query = `
        SELECT id, bank_account_number, bank_account_name
        FROM payment_requests
        WHERE bank_account_number IS NOT NULL
          AND bank_account_number_encrypted IS NULL
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `;

      const result = await client.query(query);

      logger.info('[EncryptLegacyData] Found records to encrypt', {
        count: result.rows.length
      });

      for (const row of result.rows) {
        try {
          // Encrypt
          const encryptedNumber = encryption.encrypt(row.bank_account_number);
          const encryptedName = encryption.encrypt(row.bank_account_name);
          const hashedNumber = encryption.hash(row.bank_account_number);

          // Update record
          await client.query(`
            UPDATE payment_requests
            SET
              bank_account_number_encrypted = $1,
              bank_account_number_hash = $2,
              bank_account_name_encrypted = $3,
              encryption_version = 1,
              updated_at = NOW()
            WHERE id = $4
          `, [encryptedNumber, hashedNumber, encryptedName, row.id]);

          processed.success++;

          logger.info('[EncryptLegacyData] Encrypted payment request', {
            id: row.id
          });

        } catch (encryptError) {
          processed.failed++;

          logger.error('[EncryptLegacyData] Failed to encrypt record', {
            id: row.id,
            error: encryptError.message
          });
        }
      }

      await client.query('COMMIT');

      logger.info('[EncryptLegacyData] Migration batch completed', {
        processed
      });

      return processed;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[EncryptLegacyData] Migration failed', {
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Encrypt legacy payment accounts
   */
  static async encryptPaymentAccounts() {
    const client = await pool.connect();
    const processed = { success: 0, failed: 0 };

    try {
      await client.query('BEGIN');

      const query = `
        SELECT id, account_number, account_holder_name
        FROM payment_accounts
        WHERE account_number IS NOT NULL
          AND account_number_encrypted IS NULL
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `;

      const result = await client.query(query);

      for (const row of result.rows) {
        try {
          const encryptedNumber = encryption.encrypt(row.account_number);
          const encryptedName = encryption.encrypt(row.account_holder_name);
          const hashedNumber = encryption.hash(row.account_number);

          await client.query(`
            UPDATE payment_accounts
            SET
              account_number_encrypted = $1,
              account_number_hash = $2,
              account_holder_name_encrypted = $3,
              encryption_version = 1,
              updated_at = NOW()
            WHERE id = $4
          `, [encryptedNumber, hashedNumber, encryptedName, row.id]);

          processed.success++;

        } catch (encryptError) {
          processed.failed++;
          logger.error('[EncryptLegacyData] Failed to encrypt account', {
            id: row.id,
            error: encryptError.message
          });
        }
      }

      await client.query('COMMIT');

      logger.info('[EncryptLegacyData] Payment accounts encrypted', {
        processed
      });

      return processed;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run full migration job
   */
  static async run() {
    const startTime = Date.now();

    logger.info('[EncryptLegacyData] Starting migration job');

    try {
      const requests = await this.encryptPaymentRequests();
      const accounts = await this.encryptPaymentAccounts();

      const duration = Date.now() - startTime;

      logger.info('[EncryptLegacyData] Migration job completed', {
        paymentRequests: requests,
        paymentAccounts: accounts,
        duration: `${duration}ms`
      });

      return {
        success: true,
        paymentRequests: requests,
        paymentAccounts: accounts,
        duration
      };

    } catch (error) {
      logger.error('[EncryptLegacyData] Migration job failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check migration progress
   */
  static async getProgress() {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM payment_requests
         WHERE bank_account_number_encrypted IS NOT NULL) as encrypted_requests,
        (SELECT COUNT(*) FROM payment_requests
         WHERE bank_account_number IS NOT NULL) as total_requests,
        (SELECT COUNT(*) FROM payment_accounts
         WHERE account_number_encrypted IS NOT NULL) as encrypted_accounts,
        (SELECT COUNT(*) FROM payment_accounts
         WHERE account_number IS NOT NULL) as total_accounts
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    return {
      paymentRequests: {
        encrypted: parseInt(stats.encrypted_requests),
        total: parseInt(stats.total_requests),
        percentage: stats.total_requests > 0
          ? ((stats.encrypted_requests / stats.total_requests) * 100).toFixed(2)
          : 100
      },
      paymentAccounts: {
        encrypted: parseInt(stats.encrypted_accounts),
        total: parseInt(stats.total_accounts),
        percentage: stats.total_accounts > 0
          ? ((stats.encrypted_accounts / stats.total_accounts) * 100).toFixed(2)
          : 100
      }
    };
  }
}

module.exports = EncryptLegacyDataJob;
```

**Add to cron scheduler:**

```javascript
// backend/jobs/cronJobs.js

const EncryptLegacyDataJob = require('./encryptLegacyData');

// Run every hour until migration complete
cron.schedule('0 * * * *', async () => {
  logger.info('[Cron] Running legacy data encryption job');

  try {
    const progress = await EncryptLegacyDataJob.getProgress();

    // Check if migration complete
    if (progress.paymentRequests.percentage >= 100 &&
        progress.paymentAccounts.percentage >= 100) {
      logger.info('[Cron] Legacy data encryption COMPLETE', { progress });
      // Stop job (or keep for verification)
      return;
    }

    // Run migration
    await EncryptLegacyDataJob.run();

    // Log progress
    const newProgress = await EncryptLegacyDataJob.getProgress();
    logger.info('[Cron] Migration progress', { progress: newProgress });

  } catch (error) {
    logger.error('[Cron] Legacy encryption job failed', {
      error: error.message
    });
  }
});
```

### 5.4. Phase 4: Testing (2-3 giờ)

**Test Cases:**

```javascript
// backend/tests/encryption.test.js

const encryption = require('../utils/encryption');
const PaymentRequest = require('../models/PaymentRequest');
const PaymentAccount = require('../models/PaymentAccount');

describe('Encryption Tests', () => {

  test('Encrypt and decrypt bank account number', () => {
    const plaintext = '1234567890';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':'); // Format check
  });

  test('Hash and verify bank account number', () => {
    const plaintext = '1234567890';
    const hash = encryption.hash(plaintext);
    const verified = encryption.verifyHash(plaintext, hash);

    expect(verified).toBe(true);
    expect(encryption.verifyHash('9876543210', hash)).toBe(false);
  });

  test('Mask bank account number', () => {
    const plaintext = '1234567890';
    const masked = encryption.mask(plaintext, 4);

    expect(masked).toBe('******7890');
  });

  test('Create payment request with encryption', async () => {
    const paymentRequest = await PaymentRequest.create({
      userId: 'test-user-id',
      requestedAmount: 1000000,
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN A',
      bankName: 'Vietcombank',
      reconciliationItemIds: []
    });

    expect(paymentRequest.id).toBeDefined();

    // Verify encrypted in database
    const raw = await pool.query(
      'SELECT bank_account_number_encrypted FROM payment_requests WHERE id = $1',
      [paymentRequest.id]
    );

    expect(raw.rows[0].bank_account_number_encrypted).toBeDefined();
    expect(raw.rows[0].bank_account_number_encrypted).toContain(':');
  });

  test('Read payment request with decryption', async () => {
    const created = await PaymentRequest.create({
      userId: 'test-user-id',
      requestedAmount: 1000000,
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN A',
      bankName: 'Vietcombank',
      reconciliationItemIds: []
    });

    const retrieved = await PaymentRequest.findByIdWithDecryption(
      created.id,
      'test-user-id',
      false
    );

    expect(retrieved.bank_account_number_decrypted).toBe('1234567890');
    expect(retrieved.bank_account_name_decrypted).toBe('NGUYEN VAN A');
  });

  test('Backward compatibility with plaintext data', async () => {
    // Insert old plaintext data directly
    await pool.query(`
      INSERT INTO payment_requests (
        user_id, requested_amount,
        bank_account_number, bank_account_name,
        bank_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, ['test-user-id', 1000000, '9876543210', 'TRAN THI B', 'VietinBank', 'pending']);

    const id = result.rows[0].id;

    // Should read plaintext successfully
    const retrieved = await PaymentRequest.findByIdWithDecryption(
      id,
      'test-user-id',
      false
    );

    expect(retrieved.bank_account_number_decrypted).toBe('9876543210');
    expect(retrieved.bank_account_name_decrypted).toBe('TRAN THI B');
  });
});
```

---

## 6. Migration Strategy

### 6.1. Timeline

```
Day 1: Setup (2 hours)
├── Generate ENCRYPTION_KEY
├── Add to .env and Vercel
├── Test encryption utility
└── Review code changes

Day 2: Enable for NEW data (3 hours)
├── Update PaymentRequest.create()
├── Update PaymentAccount.create()
├── Update read methods
├── Test locally
└── Deploy to Vercel

Day 3-7: Background migration (automatic)
├── Cron job runs hourly
├── Encrypts 100 records/hour
├── Monitor progress daily
└── Check for errors

Day 8: Cleanup (2 hours)
├── Verify 100% migration
├── Drop plaintext columns (optional)
└── Update documentation
```

### 6.2. Rollback Plan

**If encryption fails:**

```sql
-- Revert to plaintext temporarily
UPDATE payment_requests
SET
  bank_account_number = (
    -- Decrypt and store as plaintext
    SELECT decrypt(bank_account_number_encrypted)
  ),
  bank_account_name = (
    SELECT decrypt(bank_account_name_encrypted)
  )
WHERE bank_account_number_encrypted IS NOT NULL;

-- Clear encrypted fields
UPDATE payment_requests
SET
  bank_account_number_encrypted = NULL,
  bank_account_number_hash = NULL,
  bank_account_name_encrypted = NULL
WHERE encryption_version = 1;
```

**Code rollback:**

```bash
git revert <commit-hash>
git push
# Vercel auto-deploys previous version
```

---

## 7. Testing Strategy

### 7.1. Unit Tests

```bash
npm install --save-dev jest
npm test
```

### 7.2. Integration Tests

**Test scenarios:**

1. ✅ Create payment request → encrypted in DB
2. ✅ Read payment request → decrypted correctly
3. ✅ Unauthorized access → blocked
4. ✅ Plaintext data → backward compatible
5. ✅ Hash lookup → finds duplicate
6. ✅ Migration job → encrypts 100 records
7. ✅ Audit trail → logs decryption access

### 7.3. Security Tests

**Penetration testing:**

```javascript
// Test 1: SQL Injection
// Try to bypass encryption with SQL injection
// Expected: Blocked by parameterized queries

// Test 2: Direct DB access
// Read encrypted data from database
// Expected: See gibberish, not plaintext

// Test 3: Decryption without auth
// Try to decrypt without authorization
// Expected: Error thrown

// Test 4: Timing attack
// Measure decryption time to guess data
// Expected: Constant-time comparison prevents this
```

---

## 8. Security Best Practices

### 8.1. Key Management

✅ **DO:**
- Store key in environment variables
- Use different keys for dev/prod
- Rotate keys periodically (every 6-12 months)
- Backup keys securely (encrypted vault)

❌ **DON'T:**
- Commit keys to git
- Share keys via email/Slack
- Use same key across environments
- Store keys in code

### 8.2. Access Control

✅ **DO:**
- Log every decryption access
- Require authorization check
- Limit decryption to admins + owners
- Monitor unusual access patterns

❌ **DON'T:**
- Allow public decryption API
- Skip authorization checks
- Expose decrypted data in logs
- Cache decrypted data

### 8.3. Compliance

**PCI-DSS Requirements:**
- ✅ Encrypt cardholder data at rest
- ✅ Use strong cryptography (AES-256)
- ✅ Protect encryption keys
- ✅ Log access to cardholder data

**GDPR Requirements:**
- ✅ Encrypt personal data
- ✅ Implement access controls
- ✅ Maintain audit trail
- ✅ Allow data deletion

---

## 📊 Tổng Kết

### ✅ **Những gì đã có sẵn:**

1. ✅ Encryption utility hoàn chỉnh (`backend/utils/encryption.js`)
2. ✅ Database schema hỗ trợ encryption
3. ✅ Audit trail columns (last_decrypted_at, decrypt_count)
4. ✅ Backward compatibility design
5. ✅ Hash-based lookup (không cần decrypt)

### ⚠️ **Những gì cần làm:**

1. ⚠️ Generate và configure ENCRYPTION_KEY
2. ⚠️ Re-enable encryption trong PaymentRequest.create()
3. ⚠️ Re-enable encryption trong PaymentAccount.create()
4. ⚠️ Implement migration cron job
5. ⚠️ Write tests
6. ⚠️ Deploy và monitor

### 🎯 **Timeline dự kiến:**

- **Setup:** 2 hours
- **Implementation:** 3 hours
- **Testing:** 2 hours
- **Migration:** 5-7 days (automatic)
- **Total active work:** ~7 hours

### 💯 **Security Improvement:**

```
TRƯỚC:
❌ Bank account data = PLAINTEXT
❌ Database breach = FULL EXPOSURE
❌ PCI-DSS = NON-COMPLIANT

SAU:
✅ Bank account data = AES-256-GCM ENCRYPTED
✅ Database breach = GIBBERISH (useless to attacker)
✅ PCI-DSS = COMPLIANT
✅ Audit trail = COMPLETE
✅ Access control = ENFORCED
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-02
**Author:** Claude Code (Analysis & Implementation Guide)
**Status:** ✅ READY TO IMPLEMENT

**Next Steps:** Bắt đầu với Phase 1 - Setup ENCRYPTION_KEY
