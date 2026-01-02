# Các Chiến Lược Bảo Mật Thông Tin Thanh Toán

**So sánh các phương pháp bảo vệ dữ liệu thanh toán: Encryption vs Hashing vs Tokenization vs Vault**

---

## 📋 Mục lục

1. [Tổng quan các phương pháp](#1-tổng-quan-các-phương-pháp)
2. [Method 1: Symmetric Encryption (Hiện tại)](#2-method-1-symmetric-encryption-hiện-tại)
3. [Method 2: Asymmetric Encryption (RSA)](#3-method-2-asymmetric-encryption-rsa)
4. [Method 3: Hashing Only (One-way)](#4-method-3-hashing-only-one-way)
5. [Method 4: Tokenization](#5-method-4-tokenization)
6. [Method 5: Vault Service (External)](#6-method-5-vault-service-external)
7. [Method 6: Hybrid Approach](#7-method-6-hybrid-approach)
8. [So sánh và Khuyến nghị](#8-so-sánh-và-khuyến-nghị)

---

## 1. Tổng quan các phương pháp

### 1.1. Phân loại

```
┌─────────────────────────────────────────────────────────┐
│           PHƯƠNG PHÁP BẢO MẬT DỮ LIỆU                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. ENCRYPTION (Mã hóa - 2 chiều)                      │
│     ├── Symmetric (AES-256-GCM) ← Đang dùng           │
│     └── Asymmetric (RSA, ECC)                          │
│                                                         │
│  2. HASHING (Băm - 1 chiều)                            │
│     ├── PBKDF2 (Password-based)                        │
│     ├── bcrypt                                         │
│     └── Argon2                                         │
│                                                         │
│  3. TOKENIZATION (Thay thế)                            │
│     ├── Random token mapping                           │
│     └── Format-preserving encryption                   │
│                                                         │
│  4. VAULT (Lưu trữ riêng)                              │
│     ├── HashiCorp Vault                                │
│     ├── AWS Secrets Manager                            │
│     └── Azure Key Vault                                │
│                                                         │
│  5. HYBRID (Kết hợp)                                   │
│     └── Encryption + Tokenization + Vault              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.2. Use Cases

| Phương pháp | Có thể khôi phục? | Use Case | Ví dụ |
|-------------|-------------------|----------|-------|
| **Symmetric Encryption** | ✅ Yes | Cần decrypt để sử dụng | Số tài khoản ngân hàng |
| **Asymmetric Encryption** | ✅ Yes | Nhiều bên encrypt/decrypt | Payment gateway |
| **Hashing** | ❌ No | Chỉ cần verify | Password, OTP |
| **Tokenization** | ✅ Yes (via mapping) | PCI compliance | Credit card |
| **Vault** | ✅ Yes | Quản lý secrets tập trung | API keys, certificates |

---

## 2. Method 1: Symmetric Encryption (Hiện tại)

### 2.1. Cách hoạt động

```javascript
// Đang sử dụng: AES-256-GCM

// ENCRYPT
const plaintext = "1234567890";
const key = "a1b2c3d4..."; // 32 bytes
const iv = crypto.randomBytes(16);

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = cipher.update(plaintext, 'utf8', 'hex');
const authTag = cipher.getAuthTag();

const result = `${iv}:${authTag}:${encrypted}`;
// Output: "iv:authTag:encryptedData"

// DECRYPT (ngược lại)
const [iv, authTag, encrypted] = result.split(':');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
const plaintext = decipher.update(encrypted, 'hex', 'utf8');
```

### 2.2. Ưu điểm

✅ **Fast:** AES-256 rất nhanh (hardware acceleration)
✅ **Secure:** NIST approved, FIPS 140-2 compliant
✅ **Authenticated:** GCM mode có built-in authentication
✅ **Reversible:** Có thể decrypt khi cần
✅ **Small output:** Kích thước output nhỏ

### 2.3. Nhược điểm

❌ **Key management:** Phải bảo vệ ENCRYPTION_KEY
❌ **Single point of failure:** Key bị lộ = tất cả data bị lộ
❌ **Key rotation:** Phức tạp khi đổi key
❌ **Access control:** Ai có key đều decrypt được

### 2.4. Khi nào dùng?

✅ **Tốt cho:**
- Số tài khoản ngân hàng (cần hiển thị đầy đủ cho admin)
- Tên người thụ hưởng
- Địa chỉ giao hàng

❌ **KHÔNG tốt cho:**
- Password (dùng hash)
- OTP codes (dùng hash)
- Credit card CVV (không nên lưu)

---

## 3. Method 2: Asymmetric Encryption (RSA)

### 3.1. Cách hoạt động

```javascript
const crypto = require('crypto');

// Generate key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// ENCRYPT (với public key)
function encrypt(plaintext) {
  return crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(plaintext)
  ).toString('base64');
}

// DECRYPT (với private key)
function decrypt(encrypted) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(encrypted, 'base64')
  ).toString('utf8');
}

// Usage
const encrypted = encrypt("1234567890");
const decrypted = decrypt(encrypted);
```

### 3.2. Key Management

```
┌─────────────────────────────────────────────┐
│  APPLICATION SERVER                         │
│  - Có PUBLIC KEY                            │
│  - Encrypt dữ liệu                          │
│  - KHÔNG thể decrypt                        │
└──────────────┬──────────────────────────────┘
               │
               │ Encrypted data
               │
               ▼
┌─────────────────────────────────────────────┐
│  ADMIN/SECURE SERVER                        │
│  - Có PRIVATE KEY                           │
│  - Decrypt khi cần                          │
│  - Key được bảo vệ chặt chẽ                 │
└─────────────────────────────────────────────┘
```

### 3.3. Implementation cho Payment Data

```javascript
// backend/utils/asymmetricEncryption.js

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

class AsymmetricEncryption {
  constructor() {
    // Load keys from files (NOT from .env - too large)
    this.publicKey = fs.readFileSync(
      path.join(__dirname, '../keys/public.pem'),
      'utf8'
    );

    // Private key chỉ có trên admin server
    // Hoặc stored in secure vault
    this.privateKey = process.env.PRIVATE_KEY_PATH
      ? fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8')
      : null;
  }

  /**
   * Encrypt bank account (anyone with public key can do this)
   */
  encrypt(plaintext) {
    if (!plaintext) return null;

    try {
      const encrypted = crypto.publicEncrypt(
        {
          key: this.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(plaintext, 'utf8')
      );

      return encrypted.toString('base64');
    } catch (error) {
      throw new Error('Encryption failed: ' + error.message);
    }
  }

  /**
   * Decrypt bank account (ONLY admin server with private key)
   */
  decrypt(encrypted) {
    if (!encrypted) return null;

    if (!this.privateKey) {
      throw new Error('Private key not available on this server');
    }

    try {
      const decrypted = crypto.privateDecrypt(
        {
          key: this.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(encrypted, 'base64')
      );

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  }
}

module.exports = new AsymmetricEncryption();
```

### 3.4. Ưu điểm

✅ **Separation of concerns:** App server không thể decrypt
✅ **Better security:** Private key chỉ ở 1 nơi an toàn
✅ **Access control:** Chỉ admin server có private key
✅ **Key rotation easier:** Chỉ rotate trên admin server

### 3.5. Nhược điểm

❌ **Slower:** RSA chậm hơn AES rất nhiều
❌ **Larger output:** Encrypted data lớn hơn (~256 bytes cho RSA-2048)
❌ **Size limit:** RSA-2048 chỉ encrypt max 190 bytes
❌ **Complex setup:** Cần quản lý 2 keys

### 3.6. Giải pháp Hybrid: RSA + AES

```javascript
/**
 * Hybrid encryption:
 * - Dùng AES encrypt data (nhanh)
 * - Dùng RSA encrypt AES key (nhỏ)
 */

function hybridEncrypt(plaintext) {
  // 1. Generate random AES key
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  // 2. Encrypt data with AES
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // 3. Encrypt AES key with RSA
  const encryptedKey = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    aesKey
  );

  // 4. Return combined
  return {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encrypted
  };
}

function hybridDecrypt(data) {
  // 1. Decrypt AES key with RSA
  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(data.encryptedKey, 'base64')
  );

  // 2. Decrypt data with AES
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    aesKey,
    Buffer.from(data.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

---

## 4. Method 3: Hashing Only (One-way)

### 4.1. Cách hoạt động

```javascript
const crypto = require('crypto');

/**
 * Hash bank account number (CANNOT be reversed)
 */
function hashBankAccount(accountNumber) {
  const salt = crypto.randomBytes(64);

  const hash = crypto.pbkdf2Sync(
    accountNumber,
    salt,
    100000,      // iterations
    64,          // key length
    'sha512'
  );

  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify bank account
 */
function verifyBankAccount(accountNumber, storedHash) {
  const [salt, originalHash] = storedHash.split(':');

  const hash = crypto.pbkdf2Sync(
    accountNumber,
    Buffer.from(salt, 'hex'),
    100000,
    64,
    'sha512'
  );

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    hash
  );
}
```

### 4.2. Use Case: Duplicate Detection KHÔNG CẦN Decrypt

**Scenario:** Check xem user đã có payment request với tài khoản này chưa?

```javascript
// Khi user tạo payment request
const newAccountHash = hashBankAccount("1234567890");

// Store in database
await db.query(`
  INSERT INTO payment_requests (
    user_id,
    bank_account_hash,       -- ✅ Store hash
    requested_amount
  ) VALUES ($1, $2, $3)
`, [userId, newAccountHash, amount]);

// Later: Check duplicate
const existingRequests = await db.query(`
  SELECT bank_account_hash
  FROM payment_requests
  WHERE user_id = $1 AND status = 'pending'
`, [userId]);

for (const request of existingRequests.rows) {
  if (verifyBankAccount("1234567890", request.bank_account_hash)) {
    throw new Error('Bạn đã có yêu cầu thanh toán với tài khoản này');
  }
}
```

### 4.3. Ưu điểm

✅ **Cannot be reversed:** Không thể decrypt
✅ **No key management:** Không cần ENCRYPTION_KEY
✅ **Fast verification:** Timing-safe comparison
✅ **Duplicate detection:** Tìm duplicate mà không cần decrypt

### 4.4. Nhược điểm

❌ **Cannot retrieve:** Không thể lấy lại số tài khoản gốc
❌ **Not useful alone:** Phải kết hợp với encryption
❌ **Rainbow table:** Cần salt để chống

### 4.5. Khi nào dùng?

✅ **Tốt cho:**
- Duplicate detection
- Fraud detection (same account, different users)
- Password verification
- OTP verification

❌ **KHÔNG đủ cho:**
- Lưu trữ số tài khoản (cần hiển thị lại)
- Admin dashboard (cần xem full account)

---

## 5. Method 4: Tokenization

### 5.1. Cách hoạt động

```
ORIGINAL DATA         →  TOKENIZATION  →  TOKEN
1234567890           →   Service       →  TKN_a1b2c3d4e5f6
NGUYEN VAN A         →   Service       →  TKN_x9y8z7w6v5u4

DATABASE stores:
- Token: TKN_a1b2c3d4e5f6
- Original data: Lưu ở vault riêng

TOKEN MAPPING (in vault):
TKN_a1b2c3d4e5f6 → 1234567890
TKN_x9y8z7w6v5u4 → NGUYEN VAN A
```

### 5.2. Implementation

```javascript
// backend/services/tokenization.js

const crypto = require('crypto');
const { pool } = require('../config/database');

class TokenizationService {
  /**
   * Tokenize sensitive data
   * Returns a token that can be used to retrieve original data
   */
  static async tokenize(plaintext, userId, dataType = 'bank_account') {
    // Generate random token
    const token = `TKN_${crypto.randomBytes(16).toString('hex')}`;

    // Store mapping in separate vault table
    await pool.query(`
      INSERT INTO data_vault (
        token,
        encrypted_value,
        user_id,
        data_type,
        created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      token,
      this.encryptForVault(plaintext),  // Still encrypt in vault
      userId,
      dataType
    ]);

    return token;
  }

  /**
   * Detokenize - retrieve original data
   */
  static async detokenize(token, userId = null) {
    const query = userId
      ? 'SELECT encrypted_value FROM data_vault WHERE token = $1 AND user_id = $2'
      : 'SELECT encrypted_value FROM data_vault WHERE token = $1';

    const params = userId ? [token, userId] : [token];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Token not found or unauthorized');
    }

    return this.decryptFromVault(result.rows[0].encrypted_value);
  }

  /**
   * Encrypt for vault (using vault-specific key)
   */
  static encryptForVault(plaintext) {
    const vaultKey = process.env.VAULT_ENCRYPTION_KEY;
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm',
      Buffer.from(vaultKey, 'hex'), iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt from vault
   */
  static decryptFromVault(encryptedData) {
    const vaultKey = process.env.VAULT_ENCRYPTION_KEY;
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const decipher = crypto.createDecipheriv('aes-256-gcm',
      Buffer.from(vaultKey, 'hex'),
      Buffer.from(ivHex, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Batch detokenize (for admin reports)
   */
  static async batchDetokenize(tokens) {
    const query = `
      SELECT token, encrypted_value
      FROM data_vault
      WHERE token = ANY($1)
    `;

    const result = await pool.query(query, [tokens]);

    return result.rows.reduce((acc, row) => {
      acc[row.token] = this.decryptFromVault(row.encrypted_value);
      return acc;
    }, {});
  }
}

module.exports = TokenizationService;
```

### 5.3. Database Schema

```sql
-- Separate vault table
CREATE TABLE data_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) UNIQUE NOT NULL,        -- TKN_xxx
  encrypted_value TEXT NOT NULL,             -- Still encrypted
  user_id UUID REFERENCES users(id),
  data_type VARCHAR(50),                     -- bank_account, address, etc
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_at TIMESTAMP,                     -- Last access
  access_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP                       -- Optional TTL
);

CREATE INDEX idx_data_vault_token ON data_vault(token);
CREATE INDEX idx_data_vault_user ON data_vault(user_id);

-- Main table stores tokens only
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY,
  user_id UUID,
  bank_account_token VARCHAR(255),           -- TKN_xxx (not encrypted data)
  bank_account_name_token VARCHAR(255),      -- TKN_yyy
  requested_amount DECIMAL,
  status VARCHAR(50)
);
```

### 5.4. Usage

```javascript
// When creating payment request
const accountToken = await TokenizationService.tokenize(
  "1234567890",
  userId,
  'bank_account_number'
);

const nameToken = await TokenizationService.tokenize(
  "NGUYEN VAN A",
  userId,
  'bank_account_name'
);

await db.query(`
  INSERT INTO payment_requests (
    user_id,
    bank_account_token,        -- Store token, not data
    bank_account_name_token,
    requested_amount
  ) VALUES ($1, $2, $3, $4)
`, [userId, accountToken, nameToken, amount]);

// When admin needs to view
const paymentRequest = await db.query(
  'SELECT * FROM payment_requests WHERE id = $1',
  [requestId]
);

const accountNumber = await TokenizationService.detokenize(
  paymentRequest.bank_account_token,
  userId  // Authorization check
);

const accountName = await TokenizationService.detokenize(
  paymentRequest.bank_account_name_token,
  userId
);
```

### 5.5. Ưu điểm

✅ **Separation:** Data vault riêng biệt với business database
✅ **Easier compliance:** PCI-DSS, GDPR compliant
✅ **Scope reduction:** Business DB không chứa sensitive data
✅ **Centralized control:** Tất cả sensitive data ở 1 nơi
✅ **Easier key rotation:** Chỉ rotate vault key
✅ **TTL support:** Token có thể expire
✅ **Access logging:** Track mọi access vào vault

### 5.6. Nhược điểm

❌ **Extra database queries:** 2 queries thay vì 1
❌ **Complex setup:** Cần vault table riêng
❌ **Performance:** Slower vì join/lookup
❌ **Token management:** Phải quản lý tokens

---

## 6. Method 5: Vault Service (External)

### 6.1. HashiCorp Vault

**Architecture:**

```
┌─────────────────────────────────────────────────┐
│  APPLICATION                                    │
│  - Request vault token                          │
│  - Send data to vault                           │
│  - Receive encrypted reference                  │
└──────────────┬──────────────────────────────────┘
               │ HTTPS + Auth Token
               ▼
┌─────────────────────────────────────────────────┐
│  HASHICORP VAULT                                │
│  - Transit secrets engine (encryption as a service)
│  - Key management                               │
│  - Access policies                              │
│  - Audit logging                                │
└─────────────────────────────────────────────────┘
```

**Implementation:**

```javascript
// backend/services/vaultService.js

const vault = require('node-vault')({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

class VaultService {
  /**
   * Encrypt using Vault Transit engine
   */
  static async encrypt(plaintext, keyName = 'payment-data') {
    try {
      const result = await vault.write(
        `transit/encrypt/${keyName}`,
        {
          plaintext: Buffer.from(plaintext).toString('base64')
        }
      );

      // Returns: vault:v1:ciphertext...
      return result.data.ciphertext;

    } catch (error) {
      throw new Error('Vault encryption failed: ' + error.message);
    }
  }

  /**
   * Decrypt using Vault Transit engine
   */
  static async decrypt(ciphertext, keyName = 'payment-data') {
    try {
      const result = await vault.write(
        `transit/decrypt/${keyName}`,
        { ciphertext }
      );

      return Buffer.from(result.data.plaintext, 'base64').toString('utf8');

    } catch (error) {
      throw new Error('Vault decryption failed: ' + error.message);
    }
  }

  /**
   * Rotate encryption key (automatic re-encryption)
   */
  static async rotateKey(keyName = 'payment-data') {
    await vault.write(`transit/keys/${keyName}/rotate`);
  }

  /**
   * Batch encrypt
   */
  static async batchEncrypt(plaintexts, keyName = 'payment-data') {
    const batch = plaintexts.map(text => ({
      plaintext: Buffer.from(text).toString('base64')
    }));

    const result = await vault.write(
      `transit/encrypt/${keyName}`,
      { batch_input: batch }
    );

    return result.data.batch_results.map(r => r.ciphertext);
  }
}

module.exports = VaultService;
```

**Usage:**

```javascript
// Encrypt bank account
const encrypted = await VaultService.encrypt("1234567890", "bank-accounts");

await db.query(`
  INSERT INTO payment_requests (
    bank_account_encrypted,
    requested_amount
  ) VALUES ($1, $2)
`, [encrypted, amount]);

// Decrypt when needed
const paymentRequest = await db.query(
  'SELECT * FROM payment_requests WHERE id = $1',
  [requestId]
);

const accountNumber = await VaultService.decrypt(
  paymentRequest.bank_account_encrypted,
  "bank-accounts"
);
```

### 6.2. AWS Secrets Manager

```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({ region: 'ap-southeast-1' });

class AWSSecretsService {
  /**
   * Store sensitive data in AWS Secrets Manager
   */
  static async storeSecret(secretName, secretValue) {
    const params = {
      Name: secretName,
      SecretString: JSON.stringify(secretValue)
    };

    return await secretsManager.createSecret(params).promise();
  }

  /**
   * Retrieve secret
   */
  static async getSecret(secretName) {
    const params = { SecretId: secretName };
    const data = await secretsManager.getSecretValue(params).promise();

    return JSON.parse(data.SecretString);
  }

  /**
   * Store bank account (using unique secret name)
   */
  static async storeBankAccount(userId, paymentRequestId, accountData) {
    const secretName = `chatchiu/payment/${userId}/${paymentRequestId}`;

    await this.storeSecret(secretName, {
      accountNumber: accountData.accountNumber,
      accountName: accountData.accountName,
      bankName: accountData.bankName
    });

    return secretName;  // Store this in database
  }

  /**
   * Retrieve bank account
   */
  static async getBankAccount(secretName) {
    return await this.getSecret(secretName);
  }
}
```

### 6.3. Ưu điểm External Vault

✅ **No key management:** Vault quản lý keys
✅ **Automatic rotation:** Keys tự động rotate
✅ **Centralized:** Tất cả secrets ở 1 nơi
✅ **Audit trail:** Built-in logging
✅ **Compliance:** SOC 2, PCI-DSS certified
✅ **High availability:** Managed service
✅ **Access policies:** Fine-grained permissions

### 6.4. Nhược điểm

❌ **Cost:** AWS/Vault có phí
❌ **External dependency:** Phụ thuộc service bên ngoài
❌ **Latency:** Network call mỗi lần encrypt/decrypt
❌ **Complex setup:** Cần config Vault cluster
❌ **Learning curve:** Cần học Vault/AWS API

---

## 7. Method 6: Hybrid Approach (KHUYẾN NGHỊ)

### 7.1. Kiến trúc tổng thể

```
┌───────────────────────────────────────────────────────┐
│  LAYER 1: Application (User creates payment)         │
│  - Hash for duplicate detection                      │
│  - Tokenize for storage                              │
└────────────────┬──────────────────────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────────────────────┐
│  LAYER 2: Token Storage (Main Database)              │
│  - Store tokens only                                 │
│  - No sensitive data                                 │
│  - Fast queries                                      │
└────────────────┬──────────────────────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────────────────────┐
│  LAYER 3: Data Vault (Separate DB/Service)           │
│  - Token → Encrypted data mapping                    │
│  - AES-256-GCM encryption                            │
│  - Access logging                                    │
└────────────────┬──────────────────────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────────────────────┐
│  LAYER 4: Key Management (Vault/KMS)                 │
│  - Encryption keys stored separately                 │
│  - Automatic rotation                                │
│  - Access policies                                   │
└───────────────────────────────────────────────────────┘
```

### 7.2. Implementation

```javascript
// backend/services/hybridSecurity.js

const crypto = require('crypto');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

class HybridSecurityService {
  /**
   * LAYER 1: Hash for duplicate detection
   */
  static hash(plaintext) {
    const salt = crypto.randomBytes(64);
    const hash = crypto.pbkdf2Sync(plaintext, salt, 100000, 64, 'sha512');
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  static verifyHash(plaintext, storedHash) {
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.pbkdf2Sync(
      plaintext,
      Buffer.from(salt, 'hex'),
      100000, 64, 'sha512'
    );
    return crypto.timingSafeEqual(
      Buffer.from(originalHash, 'hex'),
      hash
    );
  }

  /**
   * LAYER 2: Tokenization
   */
  static generateToken() {
    return `TKN_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * LAYER 3: Encryption for vault
   */
  static encrypt(plaintext) {
    const key = Buffer.from(process.env.VAULT_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedData) {
    const key = Buffer.from(process.env.VAULT_ENCRYPTION_KEY, 'hex');
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key,
      Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * HIGH-LEVEL: Secure store
   */
  static async secureStore(plaintext, userId, dataType) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Generate token
      const token = this.generateToken();

      // 2. Generate hash (for duplicate detection)
      const hash = this.hash(plaintext);

      // 3. Encrypt data
      const encrypted = this.encrypt(plaintext);

      // 4. Store in vault
      await client.query(`
        INSERT INTO data_vault (
          token,
          encrypted_value,
          data_hash,
          user_id,
          data_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [token, encrypted, hash, userId, dataType]);

      await client.query('COMMIT');

      logger.info('[HybridSecurity] Data stored securely', {
        token,
        userId,
        dataType
      });

      return { token, hash };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[HybridSecurity] Secure store failed', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * HIGH-LEVEL: Secure retrieve
   */
  static async secureRetrieve(token, userId = null) {
    const query = userId
      ? 'SELECT encrypted_value, access_count FROM data_vault WHERE token = $1 AND user_id = $2'
      : 'SELECT encrypted_value, access_count FROM data_vault WHERE token = $1';

    const params = userId ? [token, userId] : [token];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Token not found or unauthorized');
    }

    // Update access tracking
    await pool.query(`
      UPDATE data_vault
      SET
        accessed_at = NOW(),
        access_count = access_count + 1
      WHERE token = $1
    `, [token]);

    // Decrypt and return
    return this.decrypt(result.rows[0].encrypted_value);
  }

  /**
   * HIGH-LEVEL: Check duplicate (without decryption)
   */
  static async checkDuplicate(plaintext, userId, dataType) {
    const inputHash = this.hash(plaintext);

    const result = await pool.query(`
      SELECT token, data_hash
      FROM data_vault
      WHERE user_id = $1 AND data_type = $2
    `, [userId, dataType]);

    for (const row of result.rows) {
      if (this.verifyHash(plaintext, row.data_hash)) {
        return row.token;  // Found duplicate
      }
    }

    return null;  // No duplicate
  }
}

module.exports = HybridSecurityService;
```

### 7.3. Usage Example

```javascript
// Create payment request với hybrid security
async function createPaymentRequest(data) {
  const { userId, bankAccountNumber, bankAccountName, amount } = data;

  // 1. Check duplicate (using hash, no decryption needed)
  const existingToken = await HybridSecurityService.checkDuplicate(
    bankAccountNumber,
    userId,
    'bank_account_number'
  );

  if (existingToken) {
    throw new Error('Bạn đã có yêu cầu thanh toán với tài khoản này');
  }

  // 2. Securely store data (tokenize + encrypt + hash)
  const accountToken = await HybridSecurityService.secureStore(
    bankAccountNumber,
    userId,
    'bank_account_number'
  );

  const nameToken = await HybridSecurityService.secureStore(
    bankAccountName,
    userId,
    'bank_account_name'
  );

  // 3. Store only tokens in main database
  await pool.query(`
    INSERT INTO payment_requests (
      user_id,
      bank_account_token,
      bank_account_name_token,
      bank_account_hash,        -- For quick duplicate check
      requested_amount,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    userId,
    accountToken.token,
    nameToken.token,
    accountToken.hash,
    amount,
    'pending'
  ]);
}

// Admin views payment request
async function viewPaymentRequest(requestId, adminUserId) {
  // 1. Get payment request (only has tokens)
  const request = await pool.query(
    'SELECT * FROM payment_requests WHERE id = $1',
    [requestId]
  );

  // 2. Retrieve sensitive data from vault (decrypted)
  const accountNumber = await HybridSecurityService.secureRetrieve(
    request.bank_account_token
  );

  const accountName = await HybridSecurityService.secureRetrieve(
    request.bank_account_name_token
  );

  // 3. Return with decrypted data
  return {
    ...request,
    bank_account_number: accountNumber,
    bank_account_name: accountName
  };
}
```

---

## 8. So sánh và Khuyến nghị

### 8.1. Comparison Matrix

| Tiêu chí | Symmetric Encryption | Asymmetric | Hashing | Tokenization | External Vault | **Hybrid** |
|----------|---------------------|-----------|---------|--------------|----------------|------------|
| **Security** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Cost** | FREE | FREE | FREE | FREE | $$$ | $ |
| **Complexity** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Key Management** | ⭐⭐ | ⭐⭐⭐ | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Compliance** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

### 8.2. Khuyến nghị theo Use Case

#### **🥇 KHUYẾN NGHỊ: Hybrid Approach**

**Lý do:**
- ✅ Kết hợp ưu điểm của tất cả methods
- ✅ Separation of concerns (token vs data vs keys)
- ✅ PCI-DSS compliant
- ✅ Performance tốt (hash cho duplicate check)
- ✅ Chi phí hợp lý (không cần external service)
- ✅ Dễ scale

**Implementation:**

```javascript
// 1. Hash for duplicate detection
const hash = HybridSecurityService.hash("1234567890");

// 2. Tokenization for main DB
const token = await HybridSecurityService.secureStore(
  "1234567890",
  userId,
  'bank_account'
);

// 3. Encryption trong vault
// (Tự động trong secureStore)

// 4. Store token in main DB
await db.query(`
  INSERT INTO payment_requests (
    bank_account_token,      -- Token (safe to query)
    bank_account_hash        -- Hash (for duplicate check)
  ) VALUES ($1, $2)
`, [token.token, token.hash]);
```

#### **🥈 Plan B: Symmetric Encryption (đang dùng)**

**Khi nào:**
- Budget hạn chế
- Team nhỏ, ít resources
- Cần implement nhanh

**Improvement suggestions:**
1. Add separate VAULT_ENCRYPTION_KEY
2. Implement key rotation script
3. Add audit logging
4. Separate vault table

#### **🥉 Plan C: External Vault (nếu có budget)**

**Khi nào:**
- Công ty lớn, nhiều apps
- Cần centralized secrets management
- Budget cho AWS/HashiCorp Vault
- Team có expertise

### 8.3. Implementation Roadmap

#### **Phase 1: Immediate (1 tuần)**
```
✅ Enable symmetric encryption (đã có code)
✅ Generate ENCRYPTION_KEY
✅ Deploy to production
✅ Monitor
```

#### **Phase 2: Enhancement (2-4 tuần)**
```
✅ Implement tokenization layer
✅ Separate data_vault table
✅ Add hash-based duplicate detection
✅ Implement audit logging
✅ Add access tracking
```

#### **Phase 3: Advanced (2-3 tháng)**
```
✅ Implement hybrid approach
✅ Add key rotation mechanism
✅ Performance optimization
✅ Compliance audit
✅ Penetration testing
```

#### **Phase 4: Enterprise (6 tháng+)**
```
✅ Integrate HashiCorp Vault
✅ Implement asymmetric encryption
✅ Multi-region deployment
✅ Disaster recovery plan
```

---

## 📊 Tổng kết

### ✅ Khuyến nghị CUỐI CÙNG:

**Cho Chatchiu project:**

1. **Ngắn hạn (2 tuần):**
   - Implement Symmetric Encryption (AES-256-GCM)
   - Sử dụng code đã có sẵn
   - Add ENCRYPTION_KEY vào .env và Vercel

2. **Trung hạn (1-2 tháng):**
   - Thêm Hash-based duplicate detection
   - Separate data_vault table
   - Implement access logging

3. **Dài hạn (3-6 tháng):**
   - Migrate sang Hybrid approach
   - Tokenization layer
   - Key rotation mechanism

### 🎯 Why Hybrid is BEST:

```
┌────────────────────────────────────────────────┐
│ MAIN DATABASE (payment_requests)              │
│ - Store tokens only (TKN_xxx)                 │
│ - Store hashes for duplicate check            │
│ - NO sensitive data                           │
│ - Fast queries, no security concerns          │
└──────────────┬─────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────┐
│ VAULT DATABASE (data_vault)                   │
│ - Token → Encrypted data mapping              │
│ - Separate database/schema                    │
│ - Access logging and monitoring               │
│ - Can be on different server                  │
└────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Business DB breach → No sensitive data exposed
- ✅ Vault breach → Encrypted data (useless without key)
- ✅ Key breach → Still need to access vault
- ✅ **All 3 must be breached** to get data

---

**Document Version:** 1.0
**Last Updated:** 2026-01-02
**Status:** ✅ Complete Analysis with Recommendations
