/**
 * SMTP Configuration Test Script
 * Run: node test-smtp.js
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

async function testSMTPConfiguration() {
  console.log('\n🔍 Testing SMTP Configuration...\n');

  // Step 1: Check environment variables
  console.log('📋 Step 1: Checking environment variables...');

  const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.log('\n💡 Please add these to your .env file.');
    console.log('📖 See docs/SMTP-SETUP.md for setup instructions.\n');
    process.exit(1);
  }

  console.log('✅ All required environment variables found:');
  console.log(`   - SMTP_HOST: ${process.env.SMTP_HOST}`);
  console.log(`   - SMTP_PORT: ${process.env.SMTP_PORT}`);
  console.log(`   - SMTP_USER: ${process.env.SMTP_USER}`);
  console.log(`   - SMTP_PASS: ${'*'.repeat(process.env.SMTP_PASS.length)}`);
  console.log(`   - SMTP_FROM: ${process.env.SMTP_FROM || 'Not set (will use default)'}`);

  // Step 2: Create transporter
  console.log('\n📧 Step 2: Creating email transporter...');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  console.log('✅ Transporter created');

  // Step 3: Verify SMTP connection
  console.log('\n🔌 Step 3: Verifying SMTP connection...');

  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful!');
  } catch (error) {
    console.error('❌ SMTP connection failed:');
    console.error(`   Error: ${error.message}`);
    console.log('\n💡 Common issues:');
    console.log('   1. Wrong SMTP_USER or SMTP_PASS');
    console.log('   2. Gmail: Need to create App Password (not regular password)');
    console.log('   3. Gmail: Need to enable 2-Step Verification first');
    console.log('   4. Port blocked by firewall');
    console.log('\n📖 See docs/SMTP-SETUP.md for detailed instructions.\n');
    process.exit(1);
  }

  // Step 4: Send test email
  console.log('\n📨 Step 4: Sending test email...');

  const testEmail = process.env.SMTP_USER; // Send to yourself

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"ChatChiu Test" <${process.env.SMTP_USER}>`,
      to: testEmail,
      subject: '✅ SMTP Test - ChatChiu Cashback',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
            .info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ SMTP Test Successful!</h1>
            </div>
            <div class="content">
              <div class="success">
                <strong>🎉 Congratulations!</strong><br>
                Your SMTP configuration is working correctly.
              </div>

              <h3>📊 Test Details:</h3>
              <ul>
                <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
                <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
                <li><strong>From:</strong> ${process.env.SMTP_FROM || process.env.SMTP_USER}</li>
                <li><strong>To:</strong> ${testEmail}</li>
                <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
              </ul>

              <div class="info">
                <strong>✨ What's Next?</strong><br>
                Your password reset emails will now work!<br>
                Test it at: <a href="http://localhost:3007/forgot-password">http://localhost:3007/forgot-password</a>
              </div>

              <p>If you see this email, your email service is configured correctly and ready for production use.</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Sent to: ${testEmail}`);
    console.log('\n📬 Check your inbox (and spam folder)!');
    console.log('   You should receive a test email with configuration details.\n');

  } catch (error) {
    console.error('❌ Failed to send test email:');
    console.error(`   Error: ${error.message}`);
    console.log('\n💡 The connection works, but email sending failed.');
    console.log('   This might be due to:');
    console.log('   1. Daily email limit reached');
    console.log('   2. Invalid FROM address');
    console.log('   3. Recipient address issues\n');
    process.exit(1);
  }

  console.log('🎉 All tests passed! SMTP is configured correctly.\n');
  process.exit(0);
}

// Run the test
testSMTPConfiguration().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
