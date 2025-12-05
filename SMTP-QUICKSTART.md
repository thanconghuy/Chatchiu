# 🚀 SMTP Quick Start - Enable Email Sending

## Current Status
Server is running in **Development Mode** - Reset links are logged to console instead of being emailed.

## To Enable Email Sending

### Option 1: Use Gmail (5 minutes)

1. **Create Gmail App Password**:
   - Visit: https://myaccount.google.com/apppasswords
   - (Requires 2-Step Verification enabled first)
   - Create password for "Mail" app
   - Copy the 16-character password

2. **Update `.env` file**:

Uncomment and fill these lines in `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-actual-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=ChatChiu Cashback <noreply@chatchiu.com>
```

3. **Restart server**:
```bash
npm start
```

4. **Test**:
- Go to: http://localhost:3007/forgot-password
- Enter your email
- Check inbox (and spam folder)

### Option 2: Use Neon's SMTP (Production)

Neon SMTP is already configured for **production deployment**.

When you deploy to production:
- Environment variables automatically set
- Emails will be sent via Neon's SMTP
- No additional configuration needed

### Option 3: Keep Development Mode (Current)

If you don't need to test actual email sending:
- Leave SMTP config commented out
- Reset links will be logged to server console
- Copy link from console → Test password reset
- Faster for development/testing

## Recommendation

For **local development**: Keep Development Mode (faster, no email spam)

For **testing email templates**: Enable Gmail SMTP temporarily

For **production**: Use Neon SMTP (already configured)

---

See full documentation: [docs/SMTP-SETUP.md](docs/SMTP-SETUP.md)
