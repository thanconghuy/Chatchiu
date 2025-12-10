/**
 * Apply Encryption Migration
 * Adds encrypted fields for bank account information
 */

const { pool } = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    const client = await pool.connect();

    try {
        console.log('🔐 Starting encryption migration...');

        // Read migration SQL
        const migrationPath = path.join(__dirname, 'migrations', '023_add_encrypted_bank_fields.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await client.query(migrationSQL);

        console.log('✅ Encryption migration completed successfully');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Set ENCRYPTION_KEY in .env file (run: node database/generate-encryption-key.js)');
        console.log('2. Run data migration: node database/migrate-existing-data.js');
        console.log('3. Update application code to use encrypted fields');
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
applyMigration()
    .then(() => {
        console.log('Migration process completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration process failed:', error);
        process.exit(1);
    });
