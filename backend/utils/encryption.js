const crypto = require('crypto');
const logger = require('./logger');

/**
 * Encryption Utility for Sensitive Data
 * Uses AES-256-GCM for authenticated encryption
 */

// Get encryption key from environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES block size
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Validate encryption key
 */
function validateEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        const errorMsg = 'ENCRYPTION_KEY environment variable is required. ' +
            'Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
            'and add it to your .env file';
        logger.error('[Encryption] Missing ENCRYPTION_KEY', { error: errorMsg });
        throw new Error(errorMsg);
    }

    // Key should be 64 hex characters (32 bytes)
    if (!/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) {
        const errorMsg = 'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
            'Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';
        logger.error('[Encryption] Invalid ENCRYPTION_KEY format', {
            error: errorMsg,
            currentLength: ENCRYPTION_KEY.length
        });
        throw new Error(errorMsg);
    }
}

/**
 * Encrypt sensitive data
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data in format: iv:authTag:encrypted
 */
function encrypt(plaintext) {
    try {
        validateEncryptionKey();

        if (!plaintext || typeof plaintext !== 'string') {
            return null;
        }

        // Generate random IV
        const iv = crypto.randomBytes(IV_LENGTH);

        // Create cipher
        const cipher = crypto.createCipheriv(
            ALGORITHM,
            Buffer.from(ENCRYPTION_KEY, 'hex'),
            iv
        );

        // Encrypt
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Get authentication tag
        const authTag = cipher.getAuthTag();

        // Return format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        logger.error('[Encryption] Encrypt failed:', error.message);
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data in format: iv:authTag:encrypted
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedData) {
    try {
        validateEncryptionKey();

        if (!encryptedData || typeof encryptedData !== 'string') {
            return null;
        }

        // Parse encrypted data
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const [ivHex, authTagHex, encrypted] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        // Create decipher
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            Buffer.from(ENCRYPTION_KEY, 'hex'),
            iv
        );

        // Set auth tag
        decipher.setAuthTag(authTag);

        // Decrypt
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        logger.error('[Encryption] Decrypt failed:', error.message);
        throw new Error('Decryption failed');
    }
}

/**
 * Hash sensitive data for lookup/comparison
 * Uses PBKDF2 with salt for one-way hashing
 * @param {string} data - Data to hash
 * @returns {string} Hash in format: salt:hash
 */
function hash(data) {
    try {
        if (!data || typeof data !== 'string') {
            return null;
        }

        // Generate random salt
        const salt = crypto.randomBytes(SALT_LENGTH);

        // Hash using PBKDF2
        const hash = crypto.pbkdf2Sync(
            data,
            salt,
            100000, // iterations
            64,     // key length
            'sha512'
        );

        // Return format: salt:hash
        return `${salt.toString('hex')}:${hash.toString('hex')}`;
    } catch (error) {
        logger.error('[Encryption] Hash failed:', error.message);
        throw new Error('Hashing failed');
    }
}

/**
 * Verify hashed data
 * @param {string} data - Plain data to verify
 * @param {string} hashedData - Hashed data in format: salt:hash
 * @returns {boolean} True if match
 */
function verifyHash(data, hashedData) {
    try {
        if (!data || !hashedData) {
            return false;
        }

        const parts = hashedData.split(':');
        if (parts.length !== 2) {
            return false;
        }

        const [saltHex, originalHash] = parts;
        const salt = Buffer.from(saltHex, 'hex');

        // Hash the input data with the same salt
        const hash = crypto.pbkdf2Sync(
            data,
            salt,
            100000,
            64,
            'sha512'
        );

        // Compare hashes (timing-safe)
        return crypto.timingSafeEqual(
            Buffer.from(originalHash, 'hex'),
            hash
        );
    } catch (error) {
        logger.error('[Encryption] Verify hash failed:', error.message);
        return false;
    }
}

/**
 * Generate random encryption key
 * @returns {string} 64-character hex string (32 bytes)
 */
function generateKey() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Mask sensitive data for display
 * @param {string} data - Data to mask
 * @param {number} visibleChars - Number of characters to show at end (default: 4)
 * @returns {string} Masked data
 */
function mask(data, visibleChars = 4) {
    if (!data || typeof data !== 'string') {
        return '';
    }

    if (data.length <= visibleChars) {
        return data;
    }

    const maskedLength = data.length - visibleChars;
    return '*'.repeat(maskedLength) + data.slice(-visibleChars);
}

module.exports = {
    encrypt,
    decrypt,
    hash,
    verifyHash,
    generateKey,
    mask,
    validateEncryptionKey
};
