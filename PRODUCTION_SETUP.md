# Production Setup Guide

## Critical Security Configuration

### 1. ENCRYPTION_KEY (REQUIRED)

The `ENCRYPTION_KEY` is **CRITICAL** for encrypting sensitive payment account data (account numbers, holder names). Without this key, users cannot create payment accounts.

#### Generate Encryption Key

```bash
# Generate a secure 64-character hex key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Add to Production Environment

Add this to your production `.env` file or hosting platform environment variables:

```bash
ENCRYPTION_KEY=your_generated_64_character_hex_key_here
```

**IMPORTANT:**
- ⚠️ **NEVER commit this key to git**
- ⚠️ **NEVER share this key publicly**
- ⚠️ **Store it securely** (password manager, secure vault)
- ⚠️ **If you lose this key, all encrypted data becomes unrecoverable**
- ⚠️ **Backup this key securely** before deploying to production

### 2. JWT_SECRET (REQUIRED)

```bash
# Generate JWT secret
openssl rand -base64 32
```

Add to `.env`:
```bash
JWT_SECRET=your_generated_jwt_secret_here
```

### 3. Database URL (REQUIRED)

Get your Neon PostgreSQL connection string from [console.neon.tech](https://console.neon.tech)

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

## Environment Variables Checklist

### Required for Production

- [ ] `NODE_ENV=production`
- [ ] `PORT=3007` (or your preferred port)
- [ ] `JWT_SECRET` - Generate using: `openssl rand -base64 32`
- [ ] `JWT_EXPIRES_IN=7d`
- [ ] `ENCRYPTION_KEY` - Generate using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `ACCESSTRADE_API_TOKEN` - Get from AccessTrade
- [ ] `ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1`
- [ ] `COMMISSION_SPLIT=0.7`
- [ ] `ALLOWED_ORIGINS` - Your production domain(s)
- [ ] `FRONTEND_URL` - Your production frontend URL

### Email Configuration (Required for password reset)

- [ ] `SMTP_HOST` - SMTP server hostname
- [ ] `SMTP_PORT` - SMTP port (usually 587)
- [ ] `SMTP_USER` - SMTP username/email
- [ ] `SMTP_PASS` - SMTP password (Gmail App Password if using Gmail)
- [ ] `SMTP_FROM` - From email address

### Optional (but recommended)

- [ ] `GOOGLE_CLIENT_ID` - For Google OAuth login
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_CALLBACK_URL`

## Deployment Steps

### 1. Prepare Environment

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env with your production values
nano .env  # or use your preferred editor
```

### 2. Generate Required Keys

```bash
# Generate ENCRYPTION_KEY (CRITICAL!)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to ENCRYPTION_KEY in .env

# Generate JWT_SECRET
openssl rand -base64 32
# Copy output to JWT_SECRET in .env
```

### 3. Verify Configuration

```bash
# Test database connection
npm run test-db  # If you have this script

# Verify all required env vars are set
node -e "
const required = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL', 'ACCESSTRADE_API_TOKEN'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing);
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set');
}
"
```

### 4. Deploy Application

```bash
# Install dependencies
npm install --production

# Run database migrations (if any)
npm run migrate  # If you have migrations

# Start the application
npm start
```

## Common Issues

### Issue: "Encryption failed" error when creating payment accounts

**Cause:** `ENCRYPTION_KEY` is not set or invalid

**Solution:**
1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Add to `.env`: `ENCRYPTION_KEY=your_generated_key`
3. Restart the server

### Issue: "Decryption failed" error

**Cause:** `ENCRYPTION_KEY` changed after data was encrypted

**Solution:**
- ⚠️ **DO NOT change ENCRYPTION_KEY after data is encrypted**
- If you must change it, you'll need to:
  1. Decrypt all existing data with old key
  2. Re-encrypt with new key
  3. This is complex - avoid if possible

### Issue: Token authentication errors

**Cause:** `JWT_SECRET` is not set or changed

**Solution:**
1. Set `JWT_SECRET` in `.env`
2. If changed, all users will need to log in again

## Security Best Practices

### 1. Key Management

- Store `ENCRYPTION_KEY` and `JWT_SECRET` in:
  - Production: Environment variables (Render, Railway, Vercel, etc.)
  - Backup: Secure password manager (1Password, Bitwarden, etc.)
  - Team: Secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)

### 2. CORS Configuration

```bash
# Single domain
ALLOWED_ORIGINS=https://yourdomain.com

# Multiple domains (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

**NEVER use `ALLOWED_ORIGINS=*` in production!**

### 3. Database Security

- Use SSL/TLS connection (`?sslmode=require` in DATABASE_URL)
- Use strong database passwords
- Restrict database access by IP if possible
- Regular backups

### 4. SMTP Security

- Use App Passwords (Gmail) instead of account password
- Enable 2-factor authentication on email account
- Monitor for suspicious email activity

## Monitoring

### Key Metrics to Monitor

1. Payment account creation errors
2. Encryption/decryption failures
3. Database connection issues
4. API token expiration
5. Email sending failures

### Logs to Watch

```bash
# Check for encryption errors
grep "Encryption failed" logs/*.log

# Check for missing environment variables
grep "environment variable is required" logs/*.log

# Check for database errors
grep "database" logs/*.log
```

## Backup Strategy

### Critical Data to Backup

1. **ENCRYPTION_KEY** - Store in multiple secure locations
2. **JWT_SECRET** - Store securely
3. **Database** - Regular automated backups
4. **Environment configuration** - Document all settings (without secrets)

### Backup Schedule

- Database: Daily automated backups (Neon provides this)
- Keys: Store in 2+ secure locations
- Configuration: Version control (without secrets)

## Rollback Plan

If deployment fails:

1. **Revert to previous version**
   ```bash
   git revert HEAD
   git push
   ```

2. **Restore environment variables** from backup

3. **Check database state** - may need to rollback migrations

4. **Monitor logs** for errors

5. **Notify users** if there's downtime

## Support

If you encounter issues:

1. Check logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test encryption key generation: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Check database connectivity
5. Review this guide's "Common Issues" section

## Production Health Check

After deployment, verify:

- [ ] Server starts without errors
- [ ] Database connection works
- [ ] Login/authentication works
- [ ] Payment account creation works (test with dummy data)
- [ ] Email sending works
- [ ] API endpoints respond correctly
- [ ] CORS is properly configured
- [ ] SSL/HTTPS is working

## Next Steps

After successful deployment:

1. Test all critical features
2. Monitor logs for 24-48 hours
3. Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
4. Configure backup alerts
5. Document your specific deployment configuration
6. Share access with team members (securely)
