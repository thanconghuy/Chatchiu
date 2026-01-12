/**
 * BƯỚC 7: Check Test Data Availability
 * Kiểm tra xem có user và data phù hợp để test E2E không
 */

const db = require('../config/database');

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 BƯỚC 7: Kiểm tra dữ liệu test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

async function checkTestData() {
  try {
    console.log('\n📋 TEST DATA CHECK 1: Tìm user phù hợp để test\n');

    // Find users with good balance and no pending requests
    const userQuery = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        usb.available_balance,
        usb.total_withdrawn,
        usb.total_earned,
        COUNT(pr.id) as pending_requests
      FROM users u
      INNER JOIN user_system_balance usb ON usb.user_id = u.id
      LEFT JOIN payment_requests pr ON pr.user_id = u.id AND pr.status IN ('pending', 'confirmed')
      WHERE usb.available_balance >= 50000
      GROUP BY u.id, u.email, u.full_name, usb.available_balance, usb.total_withdrawn, usb.total_earned
      HAVING COUNT(pr.id) = 0
      ORDER BY usb.available_balance DESC
      LIMIT 5
    `;

    const users = await db.pool.query(userQuery);

    if (users.rows.length === 0) {
      console.log('❌ Không tìm thấy user phù hợp để test!');
      console.log('   Cần: Balance >= 50,000đ và không có pending payment request\n');

      // Show users with balance
      const allUsersQuery = `
        SELECT
          u.id,
          u.email,
          usb.available_balance,
          COUNT(pr.id) as pending_requests
        FROM users u
        INNER JOIN user_system_balance usb ON usb.user_id = u.id
        LEFT JOIN payment_requests pr ON pr.user_id = u.id AND pr.status IN ('pending', 'confirmed')
        GROUP BY u.id, u.email, usb.available_balance
        ORDER BY usb.available_balance DESC
        LIMIT 5
      `;
      const allUsers = await db.pool.query(allUsersQuery);
      console.log('   Top 5 users by balance:');
      console.table(allUsers.rows);
    } else {
      console.log('✅ Tìm thấy user phù hợp để test:');
      console.table(users.rows);
      console.log(`\n💡 Recommendation: Use user ${users.rows[0].email} (Balance: ${parseFloat(users.rows[0].available_balance).toLocaleString('vi-VN')}đ)\n`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 TEST DATA CHECK 2: Kiểm tra system_conversions\n');

    // Check available conversions for reconciliation
    const conversionsQuery = `
      SELECT
        COUNT(*) as total_approved,
        COUNT(CASE WHEN payment_status IS NULL THEN 1 END) as unpaid,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid
      FROM system_conversions
      WHERE status = 'approved'
    `;

    const conversions = await db.pool.query(conversionsQuery);
    console.log('System Conversions Status:');
    console.table(conversions.rows);

    if (conversions.rows[0].unpaid >= 2) {
      console.log(`✅ Có ${conversions.rows[0].unpaid} conversions chưa paid (đủ để test)\n`);
    } else {
      console.log('⚠️  Ít hơn 2 conversions chưa paid. Có thể cần thêm data để test.\n');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 TEST DATA CHECK 3: Kiểm tra payment requests history\n');

    const paymentsQuery = `
      SELECT
        status,
        COUNT(*) as count,
        SUM(requested_amount) as total_amount
      FROM payment_requests
      GROUP BY status
      ORDER BY status
    `;

    const payments = await db.pool.query(paymentsQuery);
    console.log('Payment Requests by Status:');
    console.table(payments.rows);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 TEST DATA CHECK 4: Kiểm tra old paid requests\n');

    const oldPaidQuery = `
      SELECT
        pr.id,
        pr.user_id,
        u.email,
        pr.requested_amount,
        pr.paid_at,
        COUNT(ubt.id) as has_transaction_log,
        COUNT(DISTINCT sc.id) as linked_conversions,
        COUNT(CASE WHEN sc.payment_status = 'paid' THEN 1 END) as conversions_marked_paid
      FROM payment_requests pr
      INNER JOIN users u ON u.id = pr.user_id
      LEFT JOIN user_balance_transactions ubt ON ubt.payment_request_id = pr.id
      LEFT JOIN payment_reconciliation_mapping prm ON prm.payment_request_id = pr.id
      LEFT JOIN system_reconciliation_items sri ON sri.id = prm.reconciliation_item_id
      LEFT JOIN system_conversions sc ON sc.id = sri.system_conversion_id
      WHERE pr.status = 'paid'
        AND pr.paid_at IS NOT NULL
      GROUP BY pr.id, pr.user_id, u.email, pr.requested_amount, pr.paid_at
      ORDER BY pr.paid_at DESC
      LIMIT 5
    `;

    const oldPaid = await db.pool.query(oldPaidQuery);

    if (oldPaid.rows.length === 0) {
      console.log('✅ Không có payment requests đã paid từ trước (hệ thống mới)\n');
    } else {
      console.log('Paid Payment Requests (latest 5):');
      console.table(oldPaid.rows);

      const needsFix = oldPaid.rows.filter(r =>
        r.has_transaction_log === '0' || r.conversions_marked_paid === '0'
      );

      if (needsFix.length > 0) {
        console.log(`\n⚠️  Tìm thấy ${needsFix.length} payment requests cần fix trong BƯỚC 8:`);
        needsFix.forEach(r => {
          console.log(`   - ${r.id}: Missing transaction log: ${r.has_transaction_log === '0'}, Unmarked conversions: ${parseInt(r.linked_conversions) - parseInt(r.conversions_marked_paid)}`);
        });
        console.log('');
      } else {
        console.log('\n✅ Tất cả paid requests đều đã có transaction log và conversions marked\n');
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 SUMMARY & RECOMMENDATIONS\n');

    const summary = {
      usersAvailable: users.rows.length > 0,
      conversionsAvailable: conversions.rows[0].unpaid >= 2,
      historyNeedsFix: oldPaid.rows.length > 0 && oldPaid.rows.some(r => r.has_transaction_log === '0' || r.conversions_marked_paid === '0')
    };

    if (summary.usersAvailable && summary.conversionsAvailable) {
      console.log('✅ SẴN SÀNG TEST E2E!');
      console.log('\nRECOMMENDED TEST FLOW:');
      console.log(`1. Login as: ${users.rows[0].email}`);
      console.log(`2. Current balance: ${parseFloat(users.rows[0].available_balance).toLocaleString('vi-VN')}đ`);
      console.log('3. Tạo payment request: 50,000đ');
      console.log('4. Admin confirm → Mark as paid');
      console.log('5. Verify balance deducted');
      console.log('6. Verify conversions marked as paid');
      console.log('7. Verify excluded from next reconciliation\n');
    } else {
      console.log('⚠️  CHƯA ĐỦ DỮ LIỆU ĐỂ TEST E2E');
      if (!summary.usersAvailable) {
        console.log('   - Missing: User với balance >= 50,000đ');
      }
      if (!summary.conversionsAvailable) {
        console.log('   - Missing: System conversions chưa paid');
      }
      console.log('\n💡 Suggestion: Tạo test data hoặc chờ reconciliation tiếp theo\n');
    }

    if (summary.historyNeedsFix) {
      console.log('⚠️  NOTE: Có dữ liệu cũ cần fix trong BƯỚC 8\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

checkTestData();
