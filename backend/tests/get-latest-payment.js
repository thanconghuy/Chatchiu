const db = require('../config/database');

async function getLatestPayment() {
  try {
    // Check for test user first, then real users
    const result = await db.pool.query(`
      SELECT
        pr.id,
        pr.user_id,
        u.email,
        u.full_name,
        pr.requested_amount,
        pr.status,
        pr.created_at,
        pr.bank_name
      FROM payment_requests pr
      INNER JOIN users u ON u.id = pr.user_id
      WHERE u.email IN ('testuser@test.com', 'exccbuy@gmail.com')
      ORDER BY pr.created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('\n⚠️  No payment requests found for test users\n');
      console.log('Create one first by logging in as:');
      console.log('  - testuser@test.com / Test123456 (recommended)');
      console.log('  - exccbuy@gmail.com\n');
      process.exit(0);
    }

    const pr = result.rows[0];

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Latest Payment Request');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Payment Request ID:', pr.id);
    console.log('User:', pr.full_name, `(${pr.email})`);
    console.log('Amount:', parseFloat(pr.requested_amount).toLocaleString('vi-VN') + 'đ');
    console.log('Status:', pr.status);
    console.log('Bank:', pr.bank_name);
    console.log('Created:', pr.created_at);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('💡 To verify this payment, run:');
    console.log(`   node backend/tests/step7-e2e-verify.js ${pr.id}\n`);

    if (pr.status === 'paid') {
      console.log('⚠️  This payment is already PAID. Verification:');
      console.log(`   node backend/tests/step7-e2e-verify.js ${pr.id}\n`);
    } else if (pr.status === 'confirmed') {
      console.log('✅ Status: CONFIRMED - Ready for admin to mark as paid.\n');
    } else if (pr.status === 'pending') {
      console.log('⏳ Status: PENDING - Waiting for admin confirmation.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

getLatestPayment();
