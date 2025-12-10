/**
 * Generate Encryption Key
 * Generates a secure 32-byte (256-bit) encryption key for AES-256-GCM
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateEncryptionKey() {
    console.log('🔐 Generating encryption key...\n');

    // Generate 32 random bytes (256 bits)
    const key = crypto.randomBytes(32).toString('hex');

    console.log('✅ Encryption key generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Your encryption key (keep this secret!):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(key);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check if .env exists
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');

    console.log('📝 Instructions:');
    console.log('');
    console.log('1. Add this line to your .env file:');
    console.log(`   ENCRYPTION_KEY=${key}`);
    console.log('');
    console.log('2. IMPORTANT SECURITY NOTES:');
    console.log('   ⚠️  NEVER commit this key to git');
    console.log('   ⚠️  Store backup in secure password manager');
    console.log('   ⚠️  If key is lost, encrypted data cannot be recovered');
    console.log('   ⚠️  Different keys for dev/staging/production environments');
    console.log('');
    console.log('3. For production:');
    console.log('   - Store in secure vault (AWS Secrets Manager, Azure Key Vault, etc.)');
    console.log('   - Implement key rotation policy');
    console.log('   - Never store in code or version control');
    console.log('');

    // Add to .env.example (with placeholder)
    try {
        let envExampleContent = '';
        if (fs.existsSync(envExamplePath)) {
            envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
        }

        if (!envExampleContent.includes('ENCRYPTION_KEY')) {
            envExampleContent += '\n# Encryption key for sensitive data (32 bytes, 64 hex chars)\n';
            envExampleContent += '# Generate with: node database/generate-encryption-key.js\n';
            envExampleContent += 'ENCRYPTION_KEY=your_64_character_hex_encryption_key_here\n';

            fs.writeFileSync(envExamplePath, envExampleContent);
            console.log('✅ Updated .env.example with ENCRYPTION_KEY placeholder');
        }
    } catch (error) {
        console.log('⚠️  Could not update .env.example:', error.message);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return key;
}

// Run if called directly
if (require.main === module) {
    generateEncryptionKey();
}

module.exports = { generateEncryptionKey };
