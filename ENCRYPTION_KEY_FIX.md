# Fix: "Encryption failed" Error in Production

## Problem Summary

When deploying to production, users encounter an error when trying to create payment accounts:

```
Create payment account error: Error: Encryption failed
```

This error appears in the browser console and prevents users from adding payment methods (Bank, Momo, ZaloPay).

## Root Cause

The `ENCRYPTION_KEY` environment variable is **missing** from the production environment. This key is required for encrypting sensitive payment account data (account numbers, account holder names).

### Why This Happened

The `.env.example` file did not include the `ENCRYPTION_KEY` variable, so it was not added during production deployment.

## Solution

### Step 1: Generate Encryption Key

Run this command to generate a secure 64-character hex key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
a338b2cf79179c1c22ba062299b2a5a32a6b5ccd2df48bad53234e31e93fdc64
```

### Step 2: Add to Production Environment

#### For hosting platforms (Render, Railway, Vercel, etc.):

1. Go to your hosting platform's dashboard
2. Navigate to Environment Variables settings
3. Add a new variable:
   - **Name:** `ENCRYPTION_KEY`
   - **Value:** Your generated 64-character hex key

#### For .env file deployment:

Add this line to your production `.env` file:

```bash
ENCRYPTION_KEY=your_generated_64_character_hex_key_here
```

### Step 3: Restart Application

After adding the environment variable, restart your application for changes to take effect.

### Step 4: Verify

Test creating a payment account:

1. Log in to your application
2. Go to Profile page
3. Click "Thêm Tài Khoản Thanh Toán"
4. Fill in account details (Momo/ZaloPay/Bank)
5. Click "Lưu tài khoản"

You should see: ✅ "Tài khoản thanh toán đã được tạo thành công"

## What Was Fixed

### 1. Updated `.env.example`

Added the `ENCRYPTION_KEY` variable with documentation:

```bash
# CRITICAL: ENCRYPTION_KEY is REQUIRED for payment account encryption
# Must be 64 hex characters (32 bytes)
# Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# NEVER use the example value below in production!
# NEVER share or commit this key!
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
```

### 2. Improved Error Messages

Updated `backend/utils/encryption.js` to provide clearer error messages when `ENCRYPTION_KEY` is missing:

**Before:**
```
ENCRYPTION_KEY environment variable is required
```

**After:**
```
ENCRYPTION_KEY environment variable is required.
Generate one using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
and add it to your .env file
```

### 3. Created Production Setup Guide

Created [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) with comprehensive deployment instructions including:
- All required environment variables
- Key generation commands
- Security best practices
- Troubleshooting guide
- Production health checklist

## Important Security Notes

⚠️ **CRITICAL WARNINGS:**

1. **NEVER commit `ENCRYPTION_KEY` to git**
   - Add `.env` to `.gitignore` (already done)
   - Don't share screenshots showing the key

2. **NEVER change `ENCRYPTION_KEY` after data is encrypted**
   - All existing encrypted data will become unrecoverable
   - If you must change it, contact support for migration process

3. **Backup your `ENCRYPTION_KEY`**
   - Store in password manager (1Password, Bitwarden, etc.)
   - Keep in secure vault
   - Without this key, encrypted data cannot be recovered

4. **Use different keys for different environments**
   - Development: One key
   - Production: Different key
   - Never use the same key across environments

## Testing

### Local Testing (Development)

```bash
# 1. Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Add to .env
echo "ENCRYPTION_KEY=your_generated_key" >> .env

# 3. Restart server
npm run dev

# 4. Test payment account creation
# Go to http://localhost:3007/profile
```

### Production Testing

After deploying to production:

1. **Test Account Creation:**
   - Create Bank account
   - Create Momo account
   - Create ZaloPay account

2. **Test Account Display:**
   - Verify masked data shows correctly
   - Click to reveal full account details
   - Check decryption works

3. **Test Set Default:**
   - Set different accounts as default
   - Verify default badge appears

4. **Test Account Deletion:**
   - Delete a test account
   - Verify it's removed from list

## Monitoring

Watch for these errors in production logs:

```bash
# Missing encryption key
grep "ENCRYPTION_KEY environment variable is required" logs/*.log

# Encryption failures
grep "Encryption failed" logs/*.log

# Decryption failures
grep "Decryption failed" logs/*.log
```

## Quick Reference

### Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Validate Key Format
A valid `ENCRYPTION_KEY` must:
- Be exactly 64 characters long
- Contain only hexadecimal characters (0-9, a-f, A-F)
- Example: `a338b2cf79179c1c22ba062299b2a5a32a6b5ccd2df48bad53234e31e93fdc64`

### Check if Key is Set (Node.js)
```javascript
if (process.env.ENCRYPTION_KEY) {
  console.log('✅ ENCRYPTION_KEY is set');
  console.log('Length:', process.env.ENCRYPTION_KEY.length);
} else {
  console.log('❌ ENCRYPTION_KEY is NOT set');
}
```

## Related Files

- [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) - Complete production deployment guide
- [.env.example](./.env.example) - Environment variable template
- [backend/utils/encryption.js](./backend/utils/encryption.js) - Encryption utilities
- [backend/models/PaymentAccount.js](./backend/models/PaymentAccount.js) - Payment account model

## Support

If you still encounter issues after following this guide:

1. Check that `ENCRYPTION_KEY` is exactly 64 hex characters
2. Verify the key is set in your hosting platform
3. Restart the application after adding the key
4. Check application logs for detailed error messages
5. Review [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) for additional troubleshooting

## Changelog

**2025-12-27:**
- Added `ENCRYPTION_KEY` to `.env.example`
- Improved error messages in `encryption.js`
- Created `PRODUCTION_SETUP.md`
- Created `ENCRYPTION_KEY_FIX.md` (this file)
- Fixed "Encryption failed" error in production
