require('dotenv').config();
const emailService = require('./backend/services/emailService');

/**
 * Test Email Notification System
 *
 * This script tests the email notification system including:
 * 1. SMTP connection
 * 2. Admin notification
 * 3. User notification (debt notification)
 */

async function testEmailNotification() {
  console.log('='.repeat(60));
  console.log('EMAIL NOTIFICATION SYSTEM TEST');
  console.log('='.repeat(60));
  console.log('');

  // Check SMTP configuration
  console.log('📋 SMTP Configuration:');
  console.log(`  Host: ${process.env.SMTP_HOST || 'NOT SET'}`);
  console.log(`  Port: ${process.env.SMTP_PORT || 'NOT SET'}`);
  console.log(`  User: ${process.env.SMTP_USER || 'NOT SET'}`);
  console.log(`  Pass: ${process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : 'NOT SET'}`);
  console.log(`  From: ${process.env.SMTP_FROM || 'NOT SET'}`);
  console.log(`  Admin Email: ${process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'NOT SET'}`);
  console.log('');

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('ℹ️  SMTP not configured in .env - testing with Neon Database SMTP');
    console.log('');
    console.log('Note: SMTP is configured via Neon Database for production.');
    console.log('For local development testing:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Uncomment and configure SMTP settings');
    console.log('3. Run this test again');
    console.log('');
    console.log('Proceeding with test (will use Neon SMTP if available)...');
    console.log('');
  }

  try {
    // Test 1: Initialize email service
    console.log('Test 1: Initialize Email Service');
    console.log('-'.repeat(40));
    const initialized = await emailService.initialize();
    if (initialized) {
      console.log('✅ SMTP connection successful');
    } else {
      console.log('❌ SMTP connection failed');
      return;
    }
    console.log('');

    // Test 2: Send admin notification (Monthly Reconciliation)
    console.log('Test 2: Send Admin Notification (Monthly Reconciliation)');
    console.log('-'.repeat(40));
    const adminResult = await emailService.sendAdminNotification({
      subject: 'TEST - Kỳ đối soát mới: 11/2024',
      message: `
🔔 Kỳ đối soát mới: 11/2024

📊 Thống kê:
- Tổng đơn hàng: 150
- Người dùng: 25
- Tổng cashback: 15,000,000₫
- Dự trữ: 1,500,000₫

⚠️ Đơn hàng rủi ro cao: 5

📅 Ngày đối soát: 15/12/2024

👉 Vui lòng review và finalize tại Admin Dashboard

[THIS IS A TEST EMAIL - Đây là email test]
      `.trim(),
      data: {
        'Test Type': 'Monthly Reconciliation Notification',
        'Environment': process.env.NODE_ENV || 'development',
        'Timestamp': new Date().toISOString()
      }
    });

    if (adminResult) {
      console.log('✅ Admin notification sent successfully');
    } else {
      console.log('❌ Admin notification failed');
    }
    console.log('');

    // Test 3: Send user notification (Debt Notification)
    console.log('Test 3: Send User Notification (Debt Notification)');
    console.log('-'.repeat(40));

    const testUserEmail = process.env.SMTP_USER; // Send to self for testing

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f44336 0%, #e91e63 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .info-box { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ TEST - Đơn hàng bị từ chối</h1>
          </div>
          <div class="content">
            <p>Xin chào,</p>
            <div class="alert">
              <strong>Đơn hàng #TEST12345</strong> tại <strong>Shopee</strong> đã bị merchant từ chối.
            </div>
            <div class="info-box">
              <p><strong>Số tiền cashback:</strong> 50,000₫</p>
              <p><strong>Lý do từ chối:</strong> Test notification - Đơn hàng không hợp lệ</p>
            </div>
            <p>Số tiền cashback <strong>50,000₫</strong> đã được trừ vào số dư của bạn.</p>
            <p><strong>[THIS IS A TEST EMAIL - Đây là email test]</strong></p>
          </div>
          <div class="footer">
            <p>© 2025 ChatChiu Cashback. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const userResult = await emailService.sendEmail({
      to: testUserEmail,
      subject: 'TEST - Đơn hàng bị từ chối - #TEST12345',
      html: htmlContent
    });

    if (userResult) {
      console.log(`✅ User notification sent successfully to ${testUserEmail}`);
    } else {
      console.log('❌ User notification failed');
    }
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ SMTP Connection: ${initialized ? 'SUCCESS' : 'FAILED'}`);
    console.log(`${adminResult ? '✅' : '❌'} Admin Notification: ${adminResult ? 'SUCCESS' : 'FAILED'}`);
    console.log(`${userResult ? '✅' : '❌'} User Notification: ${userResult ? 'SUCCESS' : 'FAILED'}`);
    console.log('');

    if (initialized && adminResult && userResult) {
      console.log('🎉 All tests passed! Email notification system is working correctly.');
      console.log('');
      console.log('📧 Check your email inbox:');
      console.log(`   - Admin email: ${process.env.ADMIN_EMAIL || process.env.SMTP_USER}`);
      console.log(`   - User email: ${testUserEmail}`);
    } else {
      console.log('⚠️  Some tests failed. Please check SMTP configuration and try again.');
    }
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error during testing:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testEmailNotification()
  .then(() => {
    console.log('Test completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
