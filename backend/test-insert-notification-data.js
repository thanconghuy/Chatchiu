/**
 * Test script to insert sample notification data
 * This will populate the cashback_notifications table with test data
 */

const { pool } = require('./config/database');

async function insertSampleNotifications() {
  try {
    console.log('🔄 Starting to insert sample notification data...');

    // Get a test user
    const userResult = await pool.query(`
      SELECT id, email, full_name
      FROM users
      WHERE email = 'vtphong91@gmail.com' OR email LIKE '%@gmail.com'
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.error('❌ No user found. Please create a user first.');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log('✅ Found user:', user.email);

    // Insert sample notifications
    const notifications = [
      {
        user_id: user.id,
        notification_type: 'instant',
        available_balance: 150000,
        email_status: 'sent',
        email_sent_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        user_id: user.id,
        notification_type: 'instant',
        available_balance: 200000,
        email_status: 'sent',
        email_sent_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      },
      {
        user_id: user.id,
        notification_type: 'periodic',
        available_balance: 180000,
        email_status: 'sent',
        email_sent_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      },
      {
        user_id: user.id,
        notification_type: 'periodic',
        available_balance: 220000,
        email_status: 'sent',
        email_sent_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
      },
      {
        user_id: user.id,
        notification_type: 'urgent',
        available_balance: 250000,
        email_status: 'sent',
        email_sent_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        user_id: user.id,
        notification_type: 'instant',
        available_balance: 100000,
        email_status: 'failed',
        email_sent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      }
    ];

    for (const notif of notifications) {
      const query = `
        INSERT INTO cashback_notifications
        (user_id, notification_type, available_balance, email_status, email_sent_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `;

      const result = await pool.query(query, [
        notif.user_id,
        notif.notification_type,
        notif.available_balance,
        notif.email_status,
        notif.email_sent_at
      ]);

      console.log(`✅ Inserted notification ID: ${result.rows[0].id} - Type: ${notif.notification_type} - Status: ${notif.email_status}`);
    }

    console.log('\n✅ All sample notifications inserted successfully!');
    console.log('\n📊 Statistics Summary:');

    // Get statistics
    const statsQuery = `
      SELECT
        notification_type,
        COUNT(*) as total_sent,
        COUNT(CASE WHEN email_status = 'sent' THEN 1 END) as successful,
        COUNT(CASE WHEN email_status = 'failed' THEN 1 END) as failed
      FROM cashback_notifications
      WHERE email_sent_at >= NOW() - INTERVAL '30 days'
      GROUP BY notification_type
      ORDER BY notification_type
    `;

    const statsResult = await pool.query(statsQuery);
    console.table(statsResult.rows);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error inserting sample data:', error);
    process.exit(1);
  }
}

insertSampleNotifications();
