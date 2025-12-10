/**
 * Verify Encryption Implementation
 * Tests encryption/decryption and verifies data integrity
 */

const { pool } = require('../backend/config/database');
const encryption = require('../backend/utils/encryption');

async function verifyEncryption() {
    console.log('🔍 Verifying encryption implementation...\n');

    // Test 1: Encryption utility functions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 1: Encryption Utility Functions');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        const testData = '1234567890';

        // Test encryption/decryption
        const encrypted = encryption.encrypt(testData);
        console.log(`Original:  ${testData}`);
        console.log(`Encrypted: ${encrypted.substring(0, 50)}...`);

        const decrypted = encryption.decrypt(encrypted);
        console.log(`Decrypted: ${decrypted}`);

        if (decrypted === testData) {
            console.log('✅ Encryption/Decryption works correctly\n');
        } else {
            console.log('❌ Encryption/Decryption FAILED\n');
            return;
        }

        // Test hashing
        const hashed = encryption.hash(testData);
        console.log(`Hash: ${hashed.substring(0, 50)}...`);

        const isValid = encryption.verifyHash(testData, hashed);
        console.log(`Hash verification: ${isValid ? '✅ Valid' : '❌ Invalid'}\n`);

        // Test masking
        const masked = encryption.mask(testData, 4);
        console.log(`Masked: ${masked}`);
        console.log(`Expected: ******7890`);
        console.log(masked === '******7890' ? '✅ Masking works\n' : '❌ Masking FAILED\n');

    } catch (error) {
        console.error('❌ Utility test failed:', error.message);
        return;
    }

    // Test 2: Database encryption
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 2: Database Encryption');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const client = await pool.connect();

    try {
        // Check encrypted fields exist
        const schemaQuery = `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'payment_requests'
              AND column_name LIKE '%encrypted%'
              OR column_name LIKE '%hash%'
            ORDER BY column_name
        `;

        const schemaResult = await client.query(schemaQuery);
        console.log('Encrypted columns in payment_requests:');
        schemaResult.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });
        console.log('');

        // Get sample encrypted data
        const dataQuery = `
            SELECT
                id,
                bank_account_number,
                bank_account_number_encrypted,
                bank_account_number_hash,
                encryption_version
            FROM payment_requests
            WHERE bank_account_number_encrypted IS NOT NULL
            LIMIT 3
        `;

        const dataResult = await client.query(dataQuery);

        if (dataResult.rows.length === 0) {
            console.log('⚠️  No encrypted payment requests found');
            console.log('   Run: node database/migrate-existing-data.js\n');
            return;
        }

        console.log(`Found ${dataResult.rows.length} encrypted payment requests\n`);

        // Test decryption
        let decryptionSuccess = 0;
        let decryptionFailed = 0;

        for (const row of dataResult.rows) {
            try {
                const decrypted = encryption.decrypt(row.bank_account_number_encrypted);
                console.log(`✅ Request ${row.id.substring(0, 8)}...`);
                console.log(`   Masked:    ${row.bank_account_number}`);
                console.log(`   Decrypted: ${encryption.mask(decrypted)}`);
                decryptionSuccess++;
            } catch (error) {
                console.log(`❌ Failed to decrypt ${row.id}:`, error.message);
                decryptionFailed++;
            }
        }

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Verification Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`✅ Successful decryptions: ${decryptionSuccess}`);
        console.log(`❌ Failed decryptions: ${decryptionFailed}\n`);

        // Check statistics
        const statsQuery = `
            SELECT
                COUNT(*) as total_requests,
                COUNT(bank_account_number_encrypted) as encrypted_requests,
                COUNT(bank_account_number_hash) as hashed_requests,
                AVG(decrypt_count) as avg_decrypt_count
            FROM payment_requests
        `;

        const statsResult = await client.query(statsQuery);
        const stats = statsResult.rows[0];

        console.log('Database Statistics:');
        console.log(`  Total payment requests: ${stats.total_requests}`);
        console.log(`  Encrypted: ${stats.encrypted_requests}`);
        console.log(`  With hash: ${stats.hashed_requests}`);
        console.log(`  Avg decrypt count: ${parseFloat(stats.avg_decrypt_count || 0).toFixed(2)}\n`);

        const encryptionRate = (stats.encrypted_requests / stats.total_requests * 100).toFixed(1);
        if (encryptionRate === '100.0') {
            console.log('✅ All payment requests are encrypted (100%)\n');
        } else {
            console.log(`⚠️  Encryption coverage: ${encryptionRate}%`);
            console.log('   Run migration to encrypt remaining records\n');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (decryptionFailed === 0 && encryptionRate === '100.0') {
            console.log('✅ ALL TESTS PASSED - Encryption is working correctly!\n');
        } else {
            console.log('⚠️  Some issues detected - please review above\n');
        }

    } catch (error) {
        console.error('❌ Database verification failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Run verification
verifyEncryption()
    .then(() => {
        console.log('Verification completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Verification failed:', error);
        process.exit(1);
    });
