/**
 * Browser Console Script to Check and Fix Balance
 *
 * HOW TO USE:
 * 1. Open browser and login to the app
 * 2. Open Developer Console (F12)
 * 3. Copy and paste this entire script
 * 4. Run: await checkBalance()
 * 5. If needed, run: await syncBalance()
 */

async function checkBalance() {
  try {
    console.log('🔍 Checking balance chi tiết...\n');

    const response = await fetch('http://localhost:3007/api/dashboard/debug-balance', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      }
    });

    const data = await response.json();

    if (!data.success) {
      console.error('❌ Error:', data.message);
      return;
    }

    const { currentBalance, calculations, payments, needsSync } = data.debug;

    console.log('📊 user_system_balance:');
    console.log('   available_balance:', currentBalance.available?.toLocaleString('vi-VN') + 'đ');
    console.log('   total_earned:', currentBalance.totalEarned?.toLocaleString('vi-VN') + 'đ');
    console.log('   total_withdrawn:', currentBalance.totalWithdrawn?.toLocaleString('vi-VN') + 'đ');
    console.log('');

    console.log('💰 Total Approved Cashback:', calculations.totalApproved?.toLocaleString('vi-VN') + 'đ');
    console.log('   Số conversions đã duyệt:', calculations.approvedCount);
    console.log('');

    console.log('💳 Payment Requests CHI TIẾT:');
    let totalPending = 0, totalConfirmed = 0, totalPaid = 0;

    payments.forEach(p => {
      console.log(`\n   📄 ${p.id.substring(0, 13)}...`);
      console.log(`      Số tiền: ${p.amount.toLocaleString('vi-VN')}đ`);
      console.log(`      Trạng thái: ${p.status}`);
      console.log(`      Tạo lúc: ${new Date(p.createdAt).toLocaleString('vi-VN')}`);

      if (p.status === 'pending') totalPending += p.amount;
      else if (p.status === 'confirmed') totalConfirmed += p.amount;
      else if (p.status === 'paid') totalPaid += p.amount;
    });

    console.log('\n📊 Tổng kết payment requests:');
    console.log('   Pending:', totalPending.toLocaleString('vi-VN') + 'đ');
    console.log('   Confirmed:', totalConfirmed.toLocaleString('vi-VN') + 'đ');
    console.log('   Paid:', totalPaid.toLocaleString('vi-VN') + 'đ');
    console.log('');

    console.log('🧮 Tính toán số dư khả dụng:');
    console.log(`   ${calculations.totalApproved?.toLocaleString('vi-VN')} - ${totalPending.toLocaleString('vi-VN')} - ${totalConfirmed.toLocaleString('vi-VN')} - ${totalPaid.toLocaleString('vi-VN')}`);
    console.log(`   = ${(calculations.totalApproved - totalPending - totalConfirmed - totalPaid).toLocaleString('vi-VN')}đ`);
    console.log('');

    if (needsSync) {
      console.log('⚠️  CÓ SAI LỆCH!');
      console.log('   Expected:', calculations.expectedBalance?.toLocaleString('vi-VN') + 'đ');
      console.log('   Actual:', calculations.actualBalance?.toLocaleString('vi-VN') + 'đ');
      console.log('   Chênh lệch:', calculations.discrepancy?.toLocaleString('vi-VN') + 'đ');
    } else {
      console.log('✅ Số dư chính xác!');
    }

    return data.debug;

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function syncBalance() {
  try {
    console.log('🔧 Syncing balance...\n');

    const response = await fetch('http://localhost:3007/api/dashboard/sync-balance', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token'),
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!data.success) {
      console.error('❌ Error:', data.message);
      return;
    }

    console.log('✅ Balance synced successfully!');
    console.log('');
    console.log('📊 New Balance:');
    console.log('   Available:', data.balance.available);
    console.log('   Total Earned:', data.balance.totalEarned);
    console.log('   Total Withdrawn:', data.balance.totalWithdrawn);
    console.log('');
    console.log('🔄 Refresh the page to see updated balance');

    return data.balance;

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

console.log('✅ Balance fix script loaded!');
console.log('');
console.log('Commands:');
console.log('  await checkBalance()  - Check balance discrepancy');
console.log('  await syncBalance()   - Fix balance');
console.log('');
