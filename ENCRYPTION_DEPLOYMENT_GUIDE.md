# Encryption Deployment Guide

## ✅ Phase 1 Complete - Local Testing Successful

All encryption tests have passed successfully:
- ✅ PaymentAccount encryption/decryption working
- ✅ PaymentRequest encryption/decryption working
- ✅ Hash-based duplicate detection working
- ✅ Data masked correctly in database
- ✅ Encrypted data stored securely

## 🚀 Next Step: Deploy to Vercel Production

### Step 1: Add ENCRYPTION_KEY to Vercel Environment Variables

**CRITICAL:** Use a DIFFERENT encryption key for production (not the local one)

1. Generate a new production encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Add to Vercel:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add new variable:
     - **Name:** `ENCRYPTION_KEY`
     - **Value:** [paste the generated key]
     - **Environments:** Production, Preview
   - Click "Save"

### Step 2: Verify Database Columns Exist

The following columns must exist in your Neon production database:

**payment_requests table:**
- `bank_account_number_encrypted` (TEXT)
- `bank_account_number_hash` (TEXT)
- `bank_account_name_encrypted` (TEXT)
- `encryption_version` (INTEGER)

**payment_accounts table:**
- `account_number_encrypted` (TEXT)
- `account_number_hash` (TEXT)
- `account_holder_name_encrypted` (TEXT)
- `encryption_version` (INTEGER)

Check migrations:
- `backend/migrations/029_add_encryption_columns_to_payment_requests.sql`
- `backend/migrations/032_add_encryption_to_payment_accounts.sql`

Run these migrations on production if not already applied.

### Step 3: Deploy Code to Vercel

**Files Modified (Ready to Deploy):**
1. `backend/models/PaymentRequestEncrypted.js` - Encryption enabled
2. `backend/models/PaymentAccount.js` - Encryption enabled
3. `backend/utils/encryption.js` - Encryption utility (already existed)
4. `.env` - Local ENCRYPTION_KEY updated

**Commit changes:**
```bash
git add backend/models/PaymentRequestEncrypted.js
git add backend/models/PaymentAccount.js
git commit -m "Enable encryption for payment account data

- Re-enable AES-256-GCM encryption for bank account numbers
- Re-enable encryption for account holder names
- Use encryption.mask() for display (show last 4 digits)
- Hash bank account numbers for duplicate detection
- Backward compatible with existing plaintext data
- All local tests passed (3/3)

Security improvements:
- Sensitive data encrypted at rest in database
- Decryption only for authorized access (owner or admin)
- Different IV per encryption (more secure)
- PBKDF2 hash for duplicate detection without decryption

🔐 Generated with Claude Code"
```

**Push to production:**
```bash
git push origin main
```

Vercel will automatically deploy the changes.

### Step 4: Verify Production Deployment

After deployment completes:

1. **Check Vercel deployment logs:**
   - Look for successful build
   - No errors related to ENCRYPTION_KEY

2. **Test creating a payment account:**
   - Log in to your app
   - Create a new payment account
   - Verify account number shows as `*********1234` (masked)

3. **Verify database encryption:**
   - Check Neon database
   - Query: `SELECT account_number, account_number_encrypted FROM payment_accounts ORDER BY created_at DESC LIMIT 1`
   - Verify `account_number` is masked
   - Verify `account_number_encrypted` contains encrypted data (format: `iv:tag:encrypted`)

4. **Test payment request creation:**
   - Create a payment request
   - Verify bank account shows masked
   - Admin should be able to see decrypted data

## ⚠️ Important Security Notes

### DO NOT Commit ENCRYPTION_KEY to Git

The `.env` file is already in `.gitignore`. Ensure it stays there.

**Local `.env`:**
```bash
ENCRYPTION_KEY=23f74327e935af4296a733a31babd1499a488578632fa24ab56ae360ea1ba1a5
```

**Production Vercel:**
```bash
ENCRYPTION_KEY=[different key - stored in Vercel dashboard]
```

### Backward Compatibility

The code supports BOTH encrypted and plaintext data:
- New data → always encrypted
- Old plaintext data → still readable
- Gradual migration can happen later (Phase 3)

### Data Migration (Optional - Phase 3)

If you want to encrypt existing plaintext data:

1. Create migration script: `backend/scripts/encrypt-existing-data.js`
2. Use cron job to encrypt 100 records/hour
3. Monitor progress via logs
4. Zero downtime migration

This can be done AFTER production deployment is stable.

## 🔍 Troubleshooting

### Issue: "ENCRYPTION_KEY environment variable is required"

**Solution:**
- Verify ENCRYPTION_KEY is set in Vercel environment variables
- Redeploy after adding the variable

### Issue: "Encryption failed" or "Decryption failed"

**Solution:**
- Verify ENCRYPTION_KEY format (64 hex characters)
- Check encryption utility logs
- Verify database columns exist

### Issue: "Invalid encrypted data format"

**Solution:**
- Old data might be plaintext (expected)
- Code has fallback to plaintext
- No action needed unless data should be encrypted

### Issue: Account number shows plaintext instead of masked

**Solution:**
- Check that `encryption.mask()` is being called
- Verify VALUES array uses `accountNumberMasked` not `accountNumber`
- Check PaymentAccount.create() line 251-252

## 📊 Monitoring After Deployment

Monitor these metrics:

1. **New payment accounts:**
   - All should have `account_number_encrypted` populated
   - All should have `account_number` masked (contains `*`)

2. **New payment requests:**
   - All should have `bank_account_number_encrypted` populated
   - All should have `bank_account_number` masked

3. **Error logs:**
   - Watch for encryption/decryption errors
   - Check Vercel logs and Neon logs

4. **Performance:**
   - Encryption adds minimal overhead (~1-2ms per operation)
   - Monitor response times for payment creation

## ✅ Success Criteria

Deployment is successful when:
- ✅ No errors in Vercel deployment logs
- ✅ Can create new payment accounts (data encrypted)
- ✅ Can create new payment requests (data encrypted)
- ✅ Admin can view decrypted bank info
- ✅ Users see masked bank info
- ✅ Hash-based duplicate detection works
- ✅ No plaintext sensitive data in new records

## 🎯 Next Steps (Future Enhancements)

After stable production deployment:

1. **Phase 2: Encrypt Existing Data** (Optional)
   - Create migration script
   - Run gradual background encryption
   - Monitor progress

2. **Phase 3: Hybrid Security** (Long-term)
   - Implement tokenization
   - Add external vault (HashiCorp/AWS Secrets Manager)
   - Separate data vault table
   - Key rotation strategy

3. **Phase 4: Compliance** (If needed)
   - PCI-DSS compliance audit
   - GDPR data protection review
   - Security audit trail
   - Data retention policies

## 📝 Summary

**Status:** Phase 1 Complete ✅

**Achievements:**
- Encryption utility tested and verified
- PaymentAccount model encryption enabled
- PaymentRequest model encryption enabled
- All tests passing (3/3)
- Backward compatible with existing data
- Ready for production deployment

**Next Action:** Deploy to Vercel with ENCRYPTION_KEY environment variable

**Timeline:**
- Phase 1 (Encryption Setup): ✅ Complete
- Deployment to Vercel: ⏳ Ready (5-10 minutes)
- Verification: ⏳ Pending (after deployment)
- Phase 2 (Data Migration): 📅 Future (optional)
- Phase 3 (Hybrid Security): 📅 Future (long-term)
