/**
 * Migrate Existing Payment Request Data to Encrypted Format
 * Encrypts all existing bank account information
 */

const { pool } = require('../backend/config/database');
const encryption = require('../backend/utils/encryption');

async function migrateExistingData() {
    console.log('🔐 Starting data encryption migration...\n');

    // Validate encryption key exists
    try {
        encryption.validateEncryptionKey();
        console.log('✅ Encryption key validated\n');
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n📝 Please run: node database/generate-encryption-key.js');
        process.exit(1);
    }

    const client = await pool.connect();

    try {
        // Get all payment requests that haven't been encrypted yet
        const selectQuery = `
            SELECT
                id,
                bank_account_number,
                bank_account_name
            FROM payment_requests
            WHERE bank_account_number_encrypted IS NULL
              AND bank_account_number IS NOT NULL
            ORDER BY created_at DESC
        `;

        const result = await client.query(selectQuery);
        const requests = result.rows;

        console.log(`📊 Found ${requests.length} payment requests to encrypt\n`);

        if (requests.length === 0) {
            console.log('✅ No data to migrate. All payment requests are already encrypted.\n');
            return;
        }

        console.log('🔄 Starting encryption process...\n');

        let successCount = 0;
        let errorCount = 0;

        for (const request of requests) {
            try {
                // Skip if already masked (indicates potential previous encryption)
                if (request.bank_account_number.includes('*')) {
                    console.log(`⚠️  Skipping ${request.id} - appears to be already masked`);
                    continue;
                }

                // Encrypt bank account number
                const bankAccountNumberEncrypted = encryption.encrypt(request.bank_account_number);
                const bankAccountNumberHash = encryption.hash(request.bank_account_number);
                const bankAccountNumberMasked = encryption.mask(request.bank_account_number);

                // Encrypt bank account name
                const bankAccountNameEncrypted = encryption.encrypt(request.bank_account_name);
                const bankAccountNameMasked = encryption.mask(request.bank_account_name);

                // Update record
                const updateQuery = `
                    UPDATE payment_requests
                    SET
                        bank_account_number_encrypted = $1,
                        bank_account_number_hash = $2,
                        bank_account_name_encrypted = $3,
                        bank_account_number = $4,
                        bank_account_name = $5,
                        encryption_version = 1,
                        updated_at = NOW()
                    WHERE id = $6
                `;

                await client.query(updateQuery, [
                    bankAccountNumberEncrypted,
                    bankAccountNumberHash,
                    bankAccountNameEncrypted,
                    bankAccountNumberMasked,
                    bankAccountNameMasked,
                    request.id
                ]);

                successCount++;
                console.log(`✅ Encrypted payment request ${request.id.substring(0, 8)}...`);

            } catch (error) {
                errorCount++;
                console.error(`❌ Failed to encrypt ${request.id}:`, error.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Migration Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`✅ Successfully encrypted: ${successCount} records`);
        console.log(`❌ Failed: ${errorCount} records`);
        console.log(`📦 Total processed: ${requests.length} records\n`);

        if (successCount > 0) {
            console.log('🔐 Verification:');
            console.log('   - Original data has been encrypted');
            console.log('   - Masked versions stored for display');
            console.log('   - Hashes created for lookup/verification\n');
        }

        if (errorCount === 0) {
            console.log('✅ All payment requests encrypted successfully!\n');
        } else {
            console.log('⚠️  Some records failed to encrypt. Please review errors above.\n');
        }

        console.log('📋 Next steps:');
        console.log('1. Verify encrypted data: node database/verify-encryption.js');
        console.log('2. Update application to use PaymentRequestEncrypted model');
        console.log('3. Test decryption in admin panel');
        console.log('');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
migrateExistingData()
    .then(() => {
        console.log('Migration process completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration process failed:', error);
        process.exit(1);
    });
