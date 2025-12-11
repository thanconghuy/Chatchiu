/**
 * Migrate Existing Payment Accounts to Encrypted Format
 * Encrypts all existing bank account information
 */

const { pool } = require('../backend/config/database');
const encryption = require('../backend/utils/encryption');

async function migratePaymentAccounts() {
    console.log('🔐 Starting payment accounts encryption migration...\n');

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
        // Get all payment accounts that haven't been encrypted yet
        const selectQuery = `
            SELECT
                id,
                account_number,
                account_holder_name
            FROM payment_accounts
            WHERE account_number_encrypted IS NULL
              AND account_number IS NOT NULL
            ORDER BY created_at DESC
        `;

        const result = await client.query(selectQuery);
        const accounts = result.rows;

        console.log(`📊 Found ${accounts.length} payment accounts to encrypt\n`);

        if (accounts.length === 0) {
            console.log('✅ No data to migrate. All payment accounts are already encrypted.\n');
            return;
        }

        console.log('🔄 Starting encryption process...\n');

        let successCount = 0;
        let errorCount = 0;

        for (const account of accounts) {
            try {
                // Skip if already masked (indicates potential previous encryption)
                if (account.account_number.includes('*')) {
                    console.log(`⚠️  Skipping ${account.id} - appears to be already masked`);
                    continue;
                }

                // Encrypt account number
                const accountNumberEncrypted = encryption.encrypt(account.account_number);
                const accountNumberHash = encryption.hash(account.account_number);
                const accountNumberMasked = encryption.mask(account.account_number);

                // Encrypt account holder name
                const accountHolderNameEncrypted = encryption.encrypt(account.account_holder_name);
                const accountHolderNameMasked = encryption.mask(account.account_holder_name);

                // Update record
                const updateQuery = `
                    UPDATE payment_accounts
                    SET
                        account_number_encrypted = $1,
                        account_number_hash = $2,
                        account_holder_name_encrypted = $3,
                        account_number = $4,
                        account_holder_name = $5,
                        encryption_version = 1,
                        updated_at = NOW()
                    WHERE id = $6
                `;

                await client.query(updateQuery, [
                    accountNumberEncrypted,
                    accountNumberHash,
                    accountHolderNameEncrypted,
                    accountNumberMasked,
                    accountHolderNameMasked,
                    account.id
                ]);

                successCount++;
                console.log(`✅ Encrypted payment account ID ${account.id}`);

            } catch (error) {
                errorCount++;
                console.error(`❌ Failed to encrypt ${account.id}:`, error.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Migration Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`✅ Successfully encrypted: ${successCount} records`);
        console.log(`❌ Failed: ${errorCount} records`);
        console.log(`📦 Total processed: ${accounts.length} records\n`);

        if (successCount > 0) {
            console.log('🔐 Verification:');
            console.log('   - Original data has been encrypted');
            console.log('   - Masked versions stored for display');
            console.log('   - Hashes created for lookup/verification\n');
        }

        if (errorCount === 0) {
            console.log('✅ All payment accounts encrypted successfully!\n');
        } else {
            console.log('⚠️  Some records failed to encrypt. Please review errors above.\n');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration
migratePaymentAccounts()
    .then(() => {
        console.log('Migration process completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration process failed:', error);
        process.exit(1);
    });
