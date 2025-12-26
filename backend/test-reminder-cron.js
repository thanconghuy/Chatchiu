// Test script for cashback reminder cron job
// Usage: node backend/test-reminder-cron.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const CashbackNotificationService = require('./services/notifications/CashbackNotificationService');
const SystemSettings = require('./services/systemSettings');
const logger = require('./utils/logger');
const { pool } = require('./config/database');

async function testReminderCron() {
  console.log('🧪 Testing Cashback Reminder Cron Job\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Check settings
    console.log('\n📋 Step 1: Check System Settings');
    console.log('-'.repeat(60));

    const reminderEnabled = await SystemSettings.get('cashback_reminder_enabled', true);
    const reminderFrequency = await SystemSettings.get('cashback_reminder_frequency_days', 7);
    const reminderTime = await SystemSettings.get('cashback_reminder_time', '10:00');
    const instantEnabled = await SystemSettings.get('cashback_instant_enabled', true);

    console.log(`✓ Reminder Enabled: ${reminderEnabled}`);
    console.log(`✓ Reminder Frequency: ${reminderFrequency} days`);
    console.log(`✓ Reminder Time: ${reminderTime}`);
    console.log(`✓ Instant Enabled: ${instantEnabled}`);

    if (!reminderEnabled || reminderEnabled === 'false') {
      console.log('\n⚠️  WARNING: Reminders are DISABLED in settings!');
      console.log('   To enable, run:');
      console.log('   UPDATE system_settings SET setting_value = \'true\' WHERE setting_key = \'cashback_reminder_enabled\';');
      return;
    }

    // Step 2: Check eligible users
    console.log('\n👥 Step 2: Check Eligible Users');
    console.log('-'.repeat(60));

    const minThreshold = await SystemSettings.get('min_withdrawal_amount', 50000);
    console.log(`Min withdrawal threshold: ${minThreshold.toLocaleString('vi-VN')} VND\n`);

    const eligibleQuery = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.available_balance,
        COALESCE(
          EXTRACT(DAY FROM (NOW() - GREATEST(
            unp.last_reminder_sent,
            unp.last_instant_sent,
            u.updated_at
          )))::INTEGER,
          999
        ) as days_since_last
      FROM users u
      LEFT JOIN user_notification_preferences unp ON u.id = unp.user_id
      WHERE u.available_balance >= $1
        AND NOT EXISTS (
          SELECT 1 FROM payment_requests pr
          WHERE pr.user_id = u.id AND pr.status = 'pending'
        )
        AND (unp.unsubscribed_at IS NULL)
        AND (unp.cashback_reminder_email IS NULL OR unp.cashback_reminder_email = TRUE)
        AND (
          unp.last_reminder_sent IS NULL
          OR unp.last_reminder_sent < NOW() - (COALESCE(unp.reminder_frequency_days, $2) || ' days')::INTERVAL
        )
      ORDER BY u.available_balance DESC
      LIMIT 20
    `;

    const eligibleResult = await pool.query(eligibleQuery, [minThreshold, reminderFrequency]);

    console.log(`Found ${eligibleResult.rows.length} eligible users:\n`);

    if (eligibleResult.rows.length === 0) {
      console.log('❌ No eligible users found!');
      console.log('\nPossible reasons:');
      console.log('  - No users with balance >= threshold');
      console.log('  - All users have pending payment requests');
      console.log('  - All users were reminded recently (within frequency days)');
      console.log('  - All users have unsubscribed or disabled reminders');
    } else {
      eligibleResult.rows.slice(0, 10).forEach((user, index) => {
        console.log(`${index + 1}. ${user.email}`);
        console.log(`   Name: ${user.full_name}`);
        console.log(`   Balance: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} VND`);
        console.log(`   Days since last: ${user.days_since_last}`);
        console.log('');
      });

      if (eligibleResult.rows.length > 10) {
        console.log(`   ... and ${eligibleResult.rows.length - 10} more users\n`);
      }
    }

    // Step 3: Ask to send test reminders
    console.log('🚀 Step 3: Send Test Reminders');
    console.log('-'.repeat(60));

    if (eligibleResult.rows.length === 0) {
      console.log('⏭️  Skipping test send (no eligible users)\n');
      return;
    }

    console.log('Would you like to send test reminders? (y/n)');
    console.log('NOTE: This will send REAL emails to users!\n');

    // For automated testing, skip actual sending
    console.log('⏭️  Skipping actual send in test mode');
    console.log('To manually trigger reminders, use one of these methods:\n');
    console.log('1. API Endpoint:');
    console.log('   POST /api/notifications/admin/send-reminders');
    console.log('   Authorization: Bearer {admin_token}\n');
    console.log('2. Node.js:');
    console.log('   const cronJobs = require(\'./backend/jobs/cronJobs\');');
    console.log('   cronJobs.triggerJob(\'cashback-reminders\').then(console.log);\n');

    // Step 4: Verify cron schedule
    console.log('⏰ Step 4: Verify Cron Schedule');
    console.log('-'.repeat(60));

    const [hour, minute] = reminderTime.split(':');
    const cronExpression = `${minute} ${hour} * * *`;

    console.log(`Cron Expression: ${cronExpression}`);
    console.log(`Human Readable: Every day at ${reminderTime} (Asia/Ho_Chi_Minh timezone)`);
    console.log('');

    // Calculate next run time
    const now = new Date();
    const [targetHour, targetMinute] = [parseInt(hour), parseInt(minute)];
    const nextRun = new Date(now);
    nextRun.setHours(targetHour, targetMinute, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    console.log(`Current Time: ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
    console.log(`Next Run: ${nextRun.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);

    const hoursUntil = Math.floor((nextRun - now) / (1000 * 60 * 60));
    const minutesUntil = Math.floor(((nextRun - now) % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`Time Until Next Run: ${hoursUntil}h ${minutesUntil}m`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test Complete!\n');

    console.log('Summary:');
    console.log(`  • Reminders: ${reminderEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  • Frequency: Every ${reminderFrequency} days`);
    console.log(`  • Schedule: Daily at ${reminderTime}`);
    console.log(`  • Eligible Users: ${eligibleResult.rows.length}`);
    console.log(`  • Next Run: ${hoursUntil}h ${minutesUntil}m from now`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('\nError details:', error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run test
testReminderCron();
